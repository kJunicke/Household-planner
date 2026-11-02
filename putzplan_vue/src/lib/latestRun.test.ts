import { describe, expect, it } from 'vitest'

import { createLatestRunGuard } from './latestRun'

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
