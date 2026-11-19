import { describe, expect, it } from 'vitest'

import type { PointBenchmark } from '@/types/PointBenchmark'
import type { Task } from '@/types/Task'

import {
  estimateParentPoints,
  examplesFor,
  isDeviation,
  isUnrated,
  isValidPoints,
  quickOptions,
} from './taskPoints'

const sub = (overrides: Partial<Task>): Task => ({
  task_id: 's',
  household_id: 'h1',
  title: 'Teil',
  effort: 1,
  task_type: 'recurring',
  recurrence_days: 0,
  completed: false,
  last_completed_at: null,
  postponed_until: null,
  assigned_to: null,
  assignment_permanent: false,
  parent_task_id: 'p',
  order_index: 0,
  subtask_points_mode: 'deduct',
  emphasis_level: 0,
  project_saying_index: 0,
  deleted_at: null,
  ...overrides,
})

describe('estimateParentPoints', () => {
  it('ohne Unteraufgaben zählt der volle Aufwand', () => {
    expect(estimateParentPoints(4, [])).toBe(4)
  })

  it('zieht nur erledigte deduct-Unteraufgaben ab', () => {
    const subtasks = [
      sub({ effort: 1, completed: true }),
      sub({ effort: 2, completed: false }),
      sub({ effort: 2, completed: true, subtask_points_mode: 'bonus' }),
      sub({ effort: 2, completed: true, subtask_points_mode: 'checklist' }),
    ]
    expect(estimateParentPoints(4, subtasks)).toBe(3)
  })

  it('fällt nie unter null', () => {
    expect(estimateParentPoints(2, [sub({ effort: 3, completed: true })])).toBe(0)
  })

  it('eine unbewertete deduct-Unteraufgabe zieht nichts ab', () => {
    const subtasks = [sub({ effort: null, completed: true }), sub({ effort: 2, completed: true })]
    expect(estimateParentPoints(5, subtasks)).toBe(3)
  })
})

describe('isUnrated', () => {
  it('ohne Standardpunkte: unbewertet', () => {
    expect(isUnrated(sub({ effort: null }))).toBe(true)
  })

  it('mit Standardpunkten: bewertet, auch bei 1', () => {
    expect(isUnrated(sub({ effort: 1 }))).toBe(false)
    expect(isUnrated(sub({ effort: 12 }))).toBe(false)
  })
})

describe('isValidPoints', () => {
  it('Standardpunkte: 1 bis 999, ganzzahlig', () => {
    expect(isValidPoints(1, 'standard')).toBe(true)
    expect(isValidPoints(7, 'standard')).toBe(true)
    expect(isValidPoints(999, 'standard')).toBe(true)
    expect(isValidPoints(0, 'standard')).toBe(false)
    expect(isValidPoints(1000, 'standard')).toBe(false)
    expect(isValidPoints(2.5, 'standard')).toBe(false)
    expect(isValidPoints(Number.NaN, 'standard')).toBe(false)
  })

  it('Erledigung: 0 ist erlaubt, 1000 nicht', () => {
    expect(isValidPoints(0, 'completion')).toBe(true)
    expect(isValidPoints(999, 'completion')).toBe(true)
    expect(isValidPoints(1000, 'completion')).toBe(false)
    expect(isValidPoints(-1, 'completion')).toBe(false)
  })
})

const benchmark = (overrides: Partial<PointBenchmark>): PointBenchmark => ({
  benchmark_id: `b${overrides.points ?? 0}`,
  household_id: 'h1',
  points: 1,
  is_quick_option: true,
  examples: [],
  created_at: '2026-11-19T00:00:00Z',
  ...overrides,
})

describe('quickOptions', () => {
  it('nur Schnelloptionen, aufsteigend — egal in welcher Reihenfolge sie kommen', () => {
    const list = [
      benchmark({ points: 12 }),
      benchmark({ points: 3 }),
      benchmark({ points: 20, is_quick_option: false }),
      benchmark({ points: 1 }),
      benchmark({ points: 8 }),
    ]
    expect(quickOptions(list)).toEqual([1, 3, 8, 12])
  })

  it('ohne Richtwerte keine Knöpfe', () => {
    expect(quickOptions([])).toEqual([])
  })
})

describe('examplesFor', () => {
  const list = [
    benchmark({ points: 3, examples: ['Spülmaschine ausräumen'] }),
    benchmark({ points: 7, is_quick_option: false, examples: ['Bad putzen', 'Fenster Küche'] }),
  ]

  it('liefert die Beispiele des Richtwerts mit genau dieser Punktzahl', () => {
    expect(examplesFor(list, 3)).toEqual(['Spülmaschine ausräumen'])
  })

  it('auch für einen Richtwert, der keine Schnelloption ist', () => {
    expect(examplesFor(list, 7)).toEqual(['Bad putzen', 'Fenster Küche'])
  })

  it('ohne Richtwert zu dieser Zahl oder ohne Wahl: keine Beispiele', () => {
    expect(examplesFor(list, 4)).toEqual([])
    expect(examplesFor(list, null)).toEqual([])
  })
})

describe('isDeviation (braucht Begründung?)', () => {
  it('andere Punkte als die Standardpunkte einer Aufgabe: ja', () => {
    expect(isDeviation({ standardPoints: 3, chosenPoints: 5, kind: 'task' })).toBe(true)
    expect(isDeviation({ standardPoints: 3, chosenPoints: 0, kind: 'task' })).toBe(true)
  })

  it('gleiche Punkte wie die Standardpunkte: nein', () => {
    expect(isDeviation({ standardPoints: 3, chosenPoints: 3, kind: 'task' })).toBe(false)
  })

  it('Arbeit am Projekt: nie, es gibt keinen Standard', () => {
    expect(isDeviation({ standardPoints: 3, chosenPoints: 8, kind: 'project' })).toBe(false)
  })

  it('Quick-Aufgabe: nie, ihre Punkte sind die Standardpunkte', () => {
    expect(isDeviation({ standardPoints: 2, chosenPoints: 5, kind: 'quick' })).toBe(false)
  })
  it('noch nichts gewählt: nein, der Dialog sperrt ohnehin', () => {
    expect(isDeviation({ standardPoints: 3, chosenPoints: null, kind: 'task' })).toBe(false)
  })

  it('unbewertete Aufgabe (erstes Bewerten): nein, es gibt keinen Standard', () => {
    expect(isDeviation({ standardPoints: null, chosenPoints: 5, kind: 'task' })).toBe(false)
  })
})
