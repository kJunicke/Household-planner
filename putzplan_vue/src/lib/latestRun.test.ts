import { describe, expect, it } from 'vitest'

import { createLatestRunGuard, createLatestRunner } from './latestRun'

/** Zwei Läufe, deren Antworten in umgekehrter Reihenfolge ankommen. */
async function raceOutOfOrder(guard: ReturnType<typeof createLatestRunGuard> | null) {
  let state = 'leer'
  let releaseFirst: () => void = () => {}
  const firstResponse = new Promise<void>((resolve) => (releaseFirst = resolve))

  const run = async (value: string, response: Promise<void>) => {
    const isLatest = guard?.start() ?? (() => true)
    await response
    if (isLatest()) state = value
  }

  const first = run('alt', firstResponse)
  const second = run('neu', Promise.resolve())
  await second
  releaseFirst()
  await first
  return state
}

describe('createLatestRunGuard', () => {
  it('ohne Schutz gewinnt die zuletzt angekommene, ältere Antwort', async () => {
    expect(await raceOutOfOrder(null)).toBe('alt')
  })

  it('mit Schutz gewinnt der zuletzt gestartete Lauf', async () => {
    expect(await raceOutOfOrder(createLatestRunGuard())).toBe('neu')
  })

  it('ein einzelner Lauf bleibt der jüngste', () => {
    const guard = createLatestRunGuard()
    const isLatest = guard.start()
    expect(isLatest()).toBe(true)
    expect(isLatest()).toBe(true)
  })

  it('invalidate entwertet laufende Läufe, ein neuer Start gilt wieder', () => {
    const guard = createLatestRunGuard()
    const a = guard.start()
    guard.invalidate()
    expect(a()).toBe(false)
    const b = guard.start()
    expect(b()).toBe(true)
    expect(a()).toBe(false)
  })

  it('Wächter sind unabhängig voneinander', () => {
    const one = createLatestRunGuard()
    const two = createLatestRunGuard()
    const a = one.start()
    two.start()
    expect(a()).toBe(true)
  })
})

/** Ein Lauf, dessen Antwort der Test von Hand freigibt. */
const deferred = () => {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createLatestRunner', () => {
  it('wer auf einen überholten Lauf wartet, wartet bis zum Stand des neuesten', async () => {
    let state = 'leer'
    const responses = [deferred(), deferred()]
    let call = 0
    const runner = createLatestRunner(async (isLatest) => {
      const mine = call++
      await responses[mine].promise
      if (isLatest()) state = `lauf ${mine}`
    })

    let firstDone = false
    const first = runner.run().then(() => (firstDone = true))
    void runner.run()

    responses[0].release()
    await flush()
    // Der erste Lauf ist durch, schreibt aber nicht — wer auf ihn wartet,
    // hätte sonst einen Stand ohne Daten vor sich.
    expect(firstDone).toBe(false)
    expect(state).toBe('leer')

    responses[1].release()
    await first
    expect(state).toBe('lauf 1')
  })

  it('ein einzelner Lauf endet mit sich selbst', async () => {
    let state = 'leer'
    const runner = createLatestRunner(async () => {
      state = 'da'
    })
    await runner.run()
    expect(state).toBe('da')
  })

  it('isRunning gilt, bis auch der neueste Lauf fertig ist', async () => {
    const response = deferred()
    const runner = createLatestRunner(() => response.promise)
    expect(runner.isRunning()).toBe(false)
    const done = runner.run()
    expect(runner.isRunning()).toBe(true)
    response.release()
    await done
    expect(runner.isRunning()).toBe(false)
  })

  it('nach invalidate endet der Wartende mit dem eigenen Lauf, ohne zu hängen', async () => {
    let state = 'leer'
    const response = deferred()
    const runner = createLatestRunner(async (isLatest) => {
      await response.promise
      if (isLatest()) state = 'alt'
    })
    const done = runner.run()
    runner.invalidate()
    response.release()
    await done
    expect(state).toBe('leer')
  })

  it('der Fehler eines überholten Laufs erreicht den Wartenden nicht', async () => {
    const responses = [deferred(), deferred()]
    let call = 0
    const runner = createLatestRunner(async () => {
      const mine = call++
      await responses[mine].promise
      if (mine === 0) throw new Error('alt kaputt')
    })
    const first = runner.run()
    void runner.run()
    responses[0].release()
    responses[1].release()
    await expect(first).resolves.toBeUndefined()
  })
})
