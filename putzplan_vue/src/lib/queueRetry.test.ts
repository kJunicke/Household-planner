import { describe, expect, it } from 'vitest'

import type { PendingMutation } from '@/types/PendingMutation'

import {
  COUNT_GAP_MS,
  MAX_SERVER_RETRIES,
  SERVER_COUNT_GAP_MS,
  dependentsOf,
  judgeFailure,
  pendingCategoryIds,
  runQueuePass,
  type QueuePassIO,
} from './queueRetry'
import { isRetryLater } from './networkError'

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

describe('isRetryLater', () => {
  it('erkennt die Netzfehler-Hülle von supabase-js', () => {
    expect(isRetryLater(fetchFailed)).toBe(true)
    expect(isRetryLater(safariFetchFailed)).toBe(true)
  })

  it('erkennt ein abgelaufenes Token', () => {
    expect(isRetryLater({ code: 'PGRST303', message: 'JWT expired' })).toBe(true)
  })

  it('zählt Server- und Programmfehler nicht als vorübergehend', () => {
    expect(isRetryLater(serverError)).toBe(false)
    expect(isRetryLater(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(
      false,
    )
  })
})

describe('judgeFailure', () => {
  it('Netzfehler verbrauchen keinen Versuch', () => {
    const j = judgeFailure({ retries: 4 }, fetchFailed, 1000, 5)
    expect(j).toMatchObject({ verdict: 'later', retries: 4, lastFailedAt: undefined })
  })

  it('ein Serverfehler zählt', () => {
    expect(judgeFailure({ retries: 0 }, serverError, 1000, 5)).toMatchObject({
      verdict: 'retry',
      retries: 1,
      lastFailedAt: 1000,
    })
  })

  it('schnell aufeinanderfolgende Fehlversuche zählen einmal', () => {
    const j = judgeFailure({ retries: 4, lastFailedAt: 1000 }, serverError, 1000 + 500, 5)
    expect(j).toMatchObject({ verdict: 'retry', retries: 4, lastFailedAt: 1000 })
  })

  it('nach dem letzten gezählten Versuch wird aufgegeben', () => {
    const j = judgeFailure({ retries: 4, lastFailedAt: 0 }, serverError, COUNT_GAP_MS, 5)
    expect(j.verdict).toBe('discard')
    expect(j.retries).toBe(5)
  })

  it('ein erschöpfter Eintrag ohne Zeitstempel bekommt genau einen weiteren Versuch', () => {
    expect(judgeFailure({ retries: 5 }, serverError, 0, 5).verdict).toBe('discard')
    expect(judgeFailure({ retries: 5 }, fetchFailed, 0, 5).verdict).toBe('later')
  })
})

describe('judgeFailure: Serverfehler 5xx', () => {
  const pgError = (code: string, status: number) => ({ message: 'x', code, status })
  const MIN = 60_000

  it.each([
    ['Netz (status 0)', { message: 'TypeError: Failed to fetch', code: '', status: 0 }],
    ['502', pgError('', 502)],
    ['503', pgError('', 503)],
    ['504', pgError('', 504)],
    ['520', pgError('', 520)],
    ['40001 Serialisierung', pgError('40001', 500)],
    ['40P01 Deadlock', pgError('40P01', 500)],
    ['Klasse 08 Verbindung', pgError('08006', 503)],
    ['Klasse 53 Ressourcen', pgError('53300', 503)],
    ['PGRST000', pgError('PGRST000', 503)],
    ['PGRST001', pgError('PGRST001', 503)],
    ['PGRST002', pgError('PGRST002', 503)],
    ['PGRST003', pgError('PGRST003', 504)],
  ])('%s ist vorübergehend und zählt nie', (_label, error) => {
    const j = judgeFailure({ retries: 4, serverRetries: 5 }, error, 100 * MIN, 5)
    expect(j).toMatchObject({ verdict: 'later', retries: 4, serverRetries: 5 })
  })

  it.each([
    ['P0002', pgError('P0002', 500)],
    ['P0003', pgError('P0003', 500)],
    ['P0004', pgError('P0004', 500)],
    ['42P17', pgError('42P17', 500)],
    ['Klasse 54', pgError('54001', 500)],
    ['XX000', pgError('XX000', 500)],
    ['25P02', pgError('25P02', 500)],
    ['Klasse 09', pgError('09000', 500)],
    ['PGRST300', pgError('PGRST300', 500)],
  ])('%s ist dauerhaft und zählt sofort im normalen Budget', (_label, error) => {
    const j = judgeFailure({ retries: 0 }, error, 1000, 5)
    expect(j).toMatchObject({ verdict: 'retry', retries: 1, lastFailedAt: 1000 })
    expect(j.serverRetries ?? 0).toBe(0)
  })

  it('ein anderer 5xx zählt im eigenen Budget und hält die Reihenfolge', () => {
    const j = judgeFailure({ retries: 0 }, pgError('', 500), 1000, 5)
    expect(j).toMatchObject({
      verdict: 'later',
      retries: 0,
      serverRetries: 1,
      lastServerFailedAt: 1000,
      serverNotice: false,
    })
  })

  it('höchstens eine Zählung je Abstand', () => {
    const m = { retries: 0, serverRetries: 1, lastServerFailedAt: 0 }
    const early = judgeFailure(m, pgError('', 500), SERVER_COUNT_GAP_MS - 1, 5)
    expect(early).toMatchObject({ verdict: 'later', serverRetries: 1, lastServerFailedAt: 0 })
    const due = judgeFailure(m, pgError('', 500), SERVER_COUNT_GAP_MS, 5)
    expect(due).toMatchObject({ serverRetries: 2, lastServerFailedAt: SERVER_COUNT_GAP_MS })
  })

  it('der Hinweis kommt genau bei der zweiten Zählung', () => {
    const at = (serverRetries: number, now: number) =>
      judgeFailure({ retries: 0, serverRetries, lastServerFailedAt: 0 }, pgError('', 500), now, 5)
        .serverNotice
    expect(at(1, SERVER_COUNT_GAP_MS)).toBe(true)
    expect(at(1, SERVER_COUNT_GAP_MS - 1)).toBe(false)
    expect(at(2, SERVER_COUNT_GAP_MS)).toBe(false)
  })

  it('nach der letzten Zählung wird verworfen, frühestens nach fast einer Stunde', () => {
    let m: { retries: number; serverRetries?: number; lastServerFailedAt?: number } = {
      retries: 0,
    }
    let verdict = ''
    let now = 0
    for (; now <= 2 * 60 * MIN; now += MIN) {
      const j = judgeFailure(m, pgError('', 500), now, 5)
      m = {
        retries: j.retries,
        serverRetries: j.serverRetries,
        lastServerFailedAt: j.lastServerFailedAt,
      }
      verdict = j.verdict
      if (verdict === 'discard') break
    }
    expect(verdict).toBe('discard')
    expect(m.serverRetries).toBe(MAX_SERVER_RETRIES)
    expect(now).toBe((MAX_SERVER_RETRIES - 1) * SERVER_COUNT_GAP_MS)
    expect(now).toBeGreaterThanOrEqual(50 * MIN)
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
    expect(result).toEqual({ discarded: [], failed: 1, interrupted: false, serverNotice: false })
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

  it('ein dauerhafter 5xx bricht ab und meldet den Hinweis nur einmal', async () => {
    const m = mutation()
    const second = mutation()
    let clock = 0
    const h = harness([m, second], async (x) => {
      if (x === m) throw { message: 'boom', code: '', status: 500 }
      return true
    })
    h.io.now = () => clock
    const notices: boolean[] = []
    for (let i = 0; i < 4; i++) {
      const r = await runQueuePass(h.io)
      expect(r.interrupted).toBe(true)
      notices.push(r.serverNotice)
      clock += SERVER_COUNT_GAP_MS / 2
    }
    expect(notices).toEqual([false, false, true, false])
    expect(h.queue()).toEqual([m, second])
  })

  it('ein erschöpfter 5xx wird samt Folgen verworfen, danach geht es weiter', async () => {
    const create = mutation({
      operation: 'create',
      payload: { tempId: 'temp_a' },
      serverRetries: MAX_SERVER_RETRIES - 1,
      lastServerFailedAt: 0,
    })
    const follow = mutation({ payload: { itemId: 'temp_a' } })
    const unrelated = mutation({ payload: { itemId: 'real_b' } })
    const h = harness([create, follow, unrelated], async (x) => {
      if (x === create) throw { message: 'boom', code: 'XX001', status: 500 }
      return true
    })
    h.io.now = () => SERVER_COUNT_GAP_MS
    const result = await runQueuePass(h.io)
    expect(result.discarded).toEqual([create, follow])
    expect(h.queue()).toEqual([])
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

describe('runQueuePass: direkt (Gäste ohne Offline-Warteschlange)', () => {
  it('verwirft bei einem Netzfehler sofort, statt auf das Netz zu warten', async () => {
    const create = mutation({ operation: 'create', payload: { tempId: 'temp_a' } })
    const follow = mutation({ payload: { itemId: 'temp_a' } })
    const later = mutation({ payload: { itemId: 'real_b' } })
    const processed: string[] = []
    const h = harness([create, follow, later], async (m) => {
      processed.push(m.queueId)
      throw fetchFailed
    })
    const result = await runQueuePass({ ...h.io, direct: true })
    expect(result.interrupted).toBe(false)
    expect(result.discarded).toEqual([create, follow, later])
    expect(processed).toEqual([create.queueId, later.queueId])
    expect(h.queue()).toEqual([])
  })

  it('verwirft einen Serverfehler beim ersten Mal, ohne Wiederholung', async () => {
    const m = mutation()
    const h = harness([m], async () => {
      throw serverError
    })
    const result = await runQueuePass({ ...h.io, direct: true })
    expect(result.discarded).toEqual([m])
    expect(result.failed).toBe(0)
    expect(h.queue()).toEqual([])
  })

  it('verwirft auch einen 5xx sofort', async () => {
    const m = mutation()
    const h = harness([m], async () => {
      throw { message: 'x', code: '', status: 503 }
    })
    const result = await runQueuePass({ ...h.io, direct: true })
    expect(result.discarded).toEqual([m])
    expect(result.serverNotice).toBe(false)
  })
})
