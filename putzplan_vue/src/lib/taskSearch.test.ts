import { describe, expect, it } from 'vitest'

import type { Task } from '@/types/Task'

import { searchWall } from './taskSearch'

let nextId = 0
const task = (title: string, overrides: Partial<Task> = {}): Task => ({
  task_id: `t${nextId++}`,
  household_id: 'h1',
  title,
  effort: 2,
  task_type: 'recurring',
  recurrence_days: 7,
  completed: false,
  last_completed_at: null,
  postponed_until: null,
  assigned_to: null,
  assignment_permanent: false,
  parent_task_id: null,
  order_index: 0,
  subtask_points_mode: 'bonus',
  emphasis_level: 0,
  project_saying_index: 0,
  deleted_at: null,
  ...overrides,
})

const pinnedTitles = (tasks: Task[], query: string) =>
  searchWall(tasks, query)?.pinned.map((t) => t.title)

describe('searchWall', () => {
  it('leere Eingabe heißt „nichts gesucht" (null), nicht „nichts gefunden"', () => {
    const tasks = [task('Bad putzen')]
    expect(searchWall(tasks, '')).toBeNull()
    expect(searchWall(tasks, '   ')).toBeNull()
    expect(searchWall(tasks, 'Keller')?.pinned).toEqual([])
  })

  it('findet offene Hauptaufgaben über ihren Titel, ohne Groß-/Kleinschreibung', () => {
    const tasks = [task('Bad putzen'), task('Wäsche BAD'), task('Fenster')]
    expect(pinnedTitles(tasks, '  bad ')).toEqual(['Bad putzen', 'Wäsche BAD'])
  })

  it('findet jede Art Zettel der Wand, auch Projekte', () => {
    const tasks = [
      task('Putz recurring'),
      task('Putz daily', { task_type: 'daily' }),
      task('Putz einmal', { task_type: 'one-time' }),
      task('Putz projekt', { task_type: 'project' }),
    ]
    expect(pinnedTitles(tasks, 'putz')).toEqual([
      'Putz recurring',
      'Putz daily',
      'Putz einmal',
      'Putz projekt',
    ])
  })

  it('findet eine Aufgabe über den Titel ihrer Unteraufgabe', () => {
    const keller = task('Keller')
    const dachboden = task('Dachboden')
    const tasks = [keller, dachboden, task('Regale abwischen', { parent_task_id: keller.task_id })]
    expect(pinnedTitles(tasks, 'regale')).toEqual(['Keller'])
  })

  it('zeigt Unteraufgaben nie selbst als Treffer', () => {
    const keller = task('Regal-Keller')
    const tasks = [keller, task('Regale abwischen', { parent_task_id: keller.task_id })]
    expect(pinnedTitles(tasks, 'regal')).toEqual(['Regal-Keller'])
  })

  it('lässt erledigte, gelöschte und Quick-Aufgaben aus den angepinnten Treffern', () => {
    const tasks = [
      task('Bad offen'),
      task('Bad erledigt', { completed: true }),
      task('Bad gelöscht', { deleted_at: '2026-11-19T10:00:00Z' }),
      // Quick-Aufgabe: erledigt und gelöscht angelegt (→ CONTEXT.md)
      task('Bad quick', {
        task_type: 'one-time',
        completed: true,
        deleted_at: '2026-11-19T10:00:00Z',
      }),
    ]
    expect(pinnedTitles(tasks, 'bad')).toEqual(['Bad offen'])
  })

  it('eine gelöschte Unteraufgabe macht ihr Elternteil nicht zum Treffer', () => {
    const keller = task('Keller')
    const tasks = [
      keller,
      task('Regale', { parent_task_id: keller.task_id, deleted_at: '2026-11-19T10:00:00Z' }),
    ]
    expect(pinnedTitles(tasks, 'regale')).toEqual([])
  })

  describe('„Aufgabe erstellen"', () => {
    it('wird angeboten, wenn keine Aufgabe genau so heißt', () => {
      const tasks = [task('Bad putzen')]
      expect(searchWall(tasks, 'Bad')?.offerCreate).toBe(true)
      expect(searchWall(tasks, 'Keller')?.offerCreate).toBe(true)
    })

    it('fehlt bei einem Duplikat — gleicher Titel nach der Duplikat-Regel', () => {
      const tasks = [task('Bad  putzen')]
      expect(searchWall(tasks, ' bad putzen ')?.offerCreate).toBe(false)
    })

    it('fehlt auch, wenn das Duplikat gerade erledigt ist', () => {
      const tasks = [task('Bad putzen', { completed: true })]
      expect(searchWall(tasks, 'Bad putzen')?.offerCreate).toBe(false)
    })

    it('wird trotz gleichnamiger Unteraufgabe oder gelöschter Aufgabe angeboten', () => {
      const projekt = task('Garten', { task_type: 'project' })
      const tasks = [
        projekt,
        task('Am Projekt arbeiten', { parent_task_id: projekt.task_id }),
        task('Fenster', { deleted_at: '2026-11-19T10:00:00Z' }),
      ]
      expect(searchWall(tasks, 'Am Projekt arbeiten')?.offerCreate).toBe(true)
      expect(searchWall(tasks, 'Fenster')?.offerCreate).toBe(true)
    })
  })
})
