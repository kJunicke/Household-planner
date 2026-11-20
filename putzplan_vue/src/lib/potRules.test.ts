import { describe, expect, it } from 'vitest'

import { currentParticipants, participantNameProblem, sortPots } from './potRules'

type P = {
  pot_id: string
  kind: 'household' | 'event'
  closed_at: string | null
  created_at: string
}

const pot = (pot_id: string, overrides: Partial<P> = {}): P => ({
  pot_id,
  kind: 'event',
  closed_at: null,
  created_at: '2026-11-01T10:00:00Z',
  ...overrides,
})

describe('sortPots', () => {
  it('stellt den Haushaltstopf oben hin, dann laufende, zuletzt abgeschlossene', () => {
    const sorted = sortPots([
      pot('zu', { closed_at: '2026-11-10T10:00:00Z' }),
      pot('laufend'),
      pot('haus', { kind: 'household', created_at: '2025-01-01T00:00:00Z' }),
    ])
    expect(sorted.map((p) => p.pot_id)).toEqual(['haus', 'laufend', 'zu'])
  })

  it('zeigt laufende Töpfe neueste zuerst, abgeschlossene zuletzt abgeschlossen zuerst', () => {
    const sorted = sortPots([
      pot('alt', { created_at: '2026-10-01T10:00:00Z' }),
      pot('neu', { created_at: '2026-11-15T10:00:00Z' }),
      pot('frueh-zu', { created_at: '2026-11-18T10:00:00Z', closed_at: '2026-11-02T10:00:00Z' }),
      pot('spaet-zu', { created_at: '2026-09-01T10:00:00Z', closed_at: '2026-11-19T10:00:00Z' }),
    ])
    expect(sorted.map((p) => p.pot_id)).toEqual(['neu', 'alt', 'spaet-zu', 'frueh-zu'])
  })
})

describe('participantNameProblem', () => {
  const taken = ['Anna', 'Ben']

  it('nimmt einen neuen Namen an', () => {
    expect(participantNameProblem('Cleo', taken)).toBeNull()
  })

  it('weist einen vorhandenen Namen ab, Groß-/Kleinschreibung und Leerzeichen egal', () => {
    expect(participantNameProblem('  anna ', taken)).toBe('duplicate')
    expect(participantNameProblem('BEN', taken)).toBe('duplicate')
  })

  it('weist einen leeren Namen ab', () => {
    expect(participantNameProblem('   ', taken)).toBe('empty')
  })

  it('weist einen zu langen Namen ab', () => {
    expect(participantNameProblem('x'.repeat(50), taken)).toBeNull()
    expect(participantNameProblem('x'.repeat(51), taken)).toBe('too_long')
  })
})

describe('currentParticipants', () => {
  const people = [
    { participant_id: 'p-anna', user_id: 'u-anna' },
    { participant_id: 'p-ex', user_id: 'u-ex' },
    { participant_id: 'p-kim', user_id: null },
  ]

  it('lässt im Haushaltstopf nur heutige Mitglieder mittragen, ehemalige nicht', () => {
    const current = currentParticipants('household', people, ['u-anna'])
    expect(current.map((p) => p.participant_id)).toEqual(['p-anna'])
  })

  it('lässt im Ereignistopf alle Teilnehmer mittragen, auch ehemalige Mitglieder und Gäste', () => {
    const current = currentParticipants('event', people, ['u-anna'])
    expect(current.map((p) => p.participant_id)).toEqual(['p-anna', 'p-ex', 'p-kim'])
  })
})
