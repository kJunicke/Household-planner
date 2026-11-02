import { describe, expect, it } from 'vitest'

import type { PendingMutation } from '@/types/PendingMutation'

import {
  COUNT_GAP_MS,
  dependentsOf,
  isTransientError,
  judgeFailure,
  pendingCategoryIds,
  runQueuePass,
  type QueuePassIO,
} from './queueRetry'

let nextId = 0
const mutation = (overrides: Partial<PendingMutation> = {}): PendingMutation => ({
  queueId: `q${nextId++}`,
  operation: 'update',
  payload: {},
  timestamp: 0,
  retries: 0,
  ...overrides,
})

// So liefert supabase-js (postgrest-js) einen Netzfehler: kein Wurf, kein Error,
// sondern ein Objekt mit dem fetch-Fehler im Text.
const fetchFailed = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }
const safariFetchFailed = { message: 'TypeError: Load failed', details: '', hint: '', code: '' }
const serverError = { message: 'new row violates check constraint', code: '23514' }

describe('isTransientError', () => {
  it('erkennt die Netzfehler-Hülle von supabase-js', () => {
    expect(isTransientError(fetchFailed)).toBe(true)
    expect(isTransientError(safariFetchFailed)).toBe(true)
  })

  it('erkennt ein abgelaufenes Token', () => {
    expect(isTransientError({ code: 'PGRST303', message: 'JWT expired' })).toBe(true)
  })

  it('zählt Server- und Programmfehler nicht als vorübergehend', () => {
    expect(isTransientError(serverError)).toBe(false)
    expect(
      isTransientError(new TypeError("Cannot read properties of undefined (reading 'x')")),
    ).toBe(false)
  })
})

describe('judgeFailure', () => {
  it('Netzfehler verbrauchen keinen Versuch', () => {
    const j = judgeFailure({ retries: 4 }, fetchFailed, 1000, 5)
    expect(j).toEqual({ verdict: 'later', retries: 4, lastFailedAt: undefined })
  })

  it('ein Serverfehler zählt', () => {
    expect(judgeFailure({ retries: 0 }, serverError, 1000, 5)).toEqual({
      verdict: 'retry',
      retries: 1,
      lastFailedAt: 1000,
    })
  })

  it('schnell aufeinanderfolgende Fehlversuche zählen einmal', () => {
    const j = judgeFailure({ retries: 4, lastFailedAt: 1000 }, serverError, 1000 + 500, 5)
    expect(j).toEqual({ verdict: 'retry', retries: 4, lastFailedAt: 1000 })
  })

  it('nach dem letzten gezählten Versuch wird aufgegeben', () => {
    const j = judgeFailure({ retries: 4, lastFailedAt: 0 }, serverError, COUNT_GAP_MS, 5)
    expect(j.verdict).toBe('discard')
    expect(j.retries).toBe(5)
  })

  it('ein schon erschöpfter Altbestand bekommt genau einen weiteren Versuch', () => {
    // Einträge aus der Zeit, als Netzfehler mitzählten: retries 5, ohne Zeitstempel.
    expect(judgeFailure({ retries: 5 }, serverError, 0, 5).verdict).toBe('discard')
    expect(judgeFailure({ retries: 5 }, fetchFailed, 0, 5).verdict).toBe('later')
  })
})

describe('dependentsOf', () => {
  it('findet Folgemutationen an der temp-ID eines Anlegens', () => {
    const create = mutation({ operation: 'create', payload: { tempId: 'temp_a' } })
    const follow = mutation({ payload: { itemId: 'temp_a' } })
    const other = mutation({ payload: { itemId: 'real_b' } })
    expect(dependentsOf([create, follow, other], create)).toEqual([follow])
  })

  it('auch für Kategorien', () => {
    const create = mutation({
      operation: 'create',
      payload: { entity: 'category', tempCategoryId: 'temp_c' },
    })
    const rename = mutation({ payload: { entity: 'category', categoryId: 'temp_c' } })
    expect(dependentsOf([create, rename], create)).toEqual([rename])
  })

  it('ein Update ohne temp-ID hat keine Abhängigen', () => {
    const update = mutation({ payload: { itemId: 'x' } })
    expect(dependentsOf([update, mutation({ payload: { itemId: 'x' } })], update)).toEqual([])
  })
})

/** Warteschlange im Speicher, wie die Stores sie halten: `remove` ersetzt das Array. */
const harness = (initial: PendingMutation[], process: QueuePassIO['process']) => {
  let queue = [...initial]
  const io: QueuePassIO = {
    current: () => queue,
    process,
    remove: (ids) => {
      queue = queue.filter((m) => !ids.includes(m.queueId))
    },
    maxRetries: 5,
    now: () => 0,
  }
  return {
    io,
    push: (m: PendingMutation) => {
      queue = [...queue, m]
    },
    queue: () => queue,
  }
}

describe('runQueuePass', () => {
  it('arbeitet mit ab, was während des Laufs dazukommt', async () => {
    const late = mutation()
    const processed: string[] = []
    const h = harness([mutation()], async (m) => {
      processed.push(m.queueId)
      // Zweiter Artikel, angelegt während der erste noch unterwegs ist.
      if (processed.length === 1) h.push(late)
      return true
    })
    await runQueuePass(h.io)
    expect(processed).toContain(late.queueId)
    expect(h.queue()).toEqual([])
  })

  it('bricht bei einem Netzfehler ab, ohne einen Versuch zu zählen', async () => {
    const first = mutation()
    const second = mutation()
    const processed: string[] = []
    const h = harness([first, second], async (m) => {
      processed.push(m.queueId)
      throw fetchFailed
    })
    const result = await runQueuePass(h.io)
    expect(result.interrupted).toBe(true)
    expect(processed).toEqual([first.queueId])
    expect(first.retries).toBe(0)
    expect(h.queue()).toEqual([first, second])
  })

  it('verwirft einen erschöpften Eintrag samt seinen temp-ID-Folgen und arbeitet weiter', async () => {
    const create = mutation({ operation: 'create', payload: { tempId: 'temp_a' }, retries: 4 })
    const follow = mutation({ payload: { itemId: 'temp_a' } })
    const unrelated = mutation({ payload: { itemId: 'real_b' } })
    const h = harness([create, follow, unrelated], async (m) => {
      if (m === create) throw serverError
      return true
    })
    const result = await runQueuePass(h.io)
    expect(result.discarded).toEqual([create, follow])
    expect(h.queue()).toEqual([])
  })

  it('ein Serverfehler unter dem Limit bleibt liegen und zählt', async () => {
    const m = mutation()
    const h = harness([m], async () => {
      throw serverError
    })
    const result = await runQueuePass(h.io)
    expect(result).toEqual({ discarded: [], failed: 1, interrupted: false })
    expect(m.retries).toBe(1)
    expect(m.lastError).toBe(serverError.message)
    expect(h.queue()).toEqual([m])
  })

  it('`false` lässt liegen, ohne zu zählen und ohne den Lauf zu wiederholen', async () => {
    const m = mutation()
    let calls = 0
    const h = harness([m], async () => {
      calls++
      return false
    })
    const result = await runQueuePass(h.io)
    expect(calls).toBe(1)
    expect(result.failed).toBe(0)
    expect(h.queue()).toEqual([m])
  })

  it('hört auf, sobald shouldStop greift', async () => {
    let stop = false
    const second = mutation()
    const h = harness([mutation(), second], async () => {
      stop = true
      return true
    })
    h.io.shouldStop = () => stop
    const result = await runQueuePass(h.io)
    expect(result.interrupted).toBe(true)
    expect(h.queue()).toEqual([second])
  })
})

describe('pendingCategoryIds', () => {
  it('nur Kategorie-Mutationen, nur echte und temp-IDs mit Ziel', () => {
    const queue = [
      mutation({ payload: { entity: 'category', categoryId: 'c1', updates: { name: 'Bad' } } }),
      mutation({ operation: 'delete', payload: { entity: 'category', categoryId: 'c2' } }),
      mutation({ operation: 'create', payload: { entity: 'category', tempCategoryId: 'temp_1' } }),
      mutation({ payload: { itemId: 'i1', categoryId: 'c3' } }),
    ]
    expect([...pendingCategoryIds(queue)].sort()).toEqual(['c1', 'c2'])
  })
})
