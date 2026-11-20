import { describe, expect, it } from 'vitest'

import {
  currentParticipants,
  defaultParticipant,
  participantNameProblem,
  participantNameProblemText,
  parsePotAmount,
  potTitle,
  sortPots,
} from './potRules'

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

describe('parsePotAmount', () => {
  it('liest Euro mit Komma oder Punkt als ganze Cent', () => {
    expect(parsePotAmount('12,34')).toBe(1234)
    expect(parsePotAmount(' 7.5 ')).toBe(750)
    expect(parsePotAmount('3')).toBe(300)
  })

  it('rundet nicht über Fließkomma daneben', () => {
    expect(parsePotAmount('0,29')).toBe(29)
    expect(parsePotAmount('1,15')).toBe(115)
  })

  it('weist leer, null, Unsinn und zu viele Nachkommastellen ab', () => {
    expect(parsePotAmount('')).toBeNull()
    expect(parsePotAmount('0')).toBeNull()
    expect(parsePotAmount('0,00')).toBeNull()
    expect(parsePotAmount('-5')).toBeNull()
    expect(parsePotAmount('abc')).toBeNull()
    expect(parsePotAmount('1,234')).toBeNull()
  })

  it('nimmt höchstens den größten Betrag, den die Datenbank speichert', () => {
    expect(parsePotAmount('999999,99')).toBe(99999999)
    expect(parsePotAmount('1000000')).toBeNull()
  })
})

describe('potTitle', () => {
  it('nennt den Haushaltstopf so, Töpfe für einen Anlass bei ihrem Namen', () => {
    expect(potTitle({ kind: 'household', name: 'egal' })).toBe('Haushaltstopf')
    expect(potTitle({ kind: 'event', name: 'Skiurlaub' })).toBe('Skiurlaub')
  })
})

describe('participantNameProblemText', () => {
  it('sagt nichts zu einem leeren Namen und dasselbe zu einem zu langen', () => {
    expect(participantNameProblemText('empty', 'doppelt')).toBe('')
    expect(participantNameProblemText('too_long', 'doppelt')).toBe('Der Name ist zu lang')
  })

  it('nimmt für einen doppelten Namen den Text der Stelle', () => {
    expect(participantNameProblemText('duplicate', 'Den Namen gibt es schon')).toBe(
      'Den Namen gibt es schon',
    )
  })
})

describe('defaultParticipant', () => {
  const ids = ['p-agent', 'p-gast', 'p-ben']

  it('nimmt die erste Vorgabe, die im Topf zur Auswahl steht', () => {
    expect(defaultParticipant(ids, undefined, 'p-gast')).toBe('p-gast')
    expect(defaultParticipant(ids, 'p-ben', 'p-gast')).toBe('p-ben')
  })

  it('überspringt eine Vorgabe, die nicht zur Auswahl steht', () => {
    expect(defaultParticipant(ids, 'p-weg', 'p-gast')).toBe('p-gast')
  })

  it('fällt ohne passende Vorgabe auf den ersten Teilnehmer zurück, ohne Teilnehmer auf leer', () => {
    expect(defaultParticipant(ids, null, undefined)).toBe('p-agent')
    expect(defaultParticipant([], 'p-gast')).toBe('')
  })
})
