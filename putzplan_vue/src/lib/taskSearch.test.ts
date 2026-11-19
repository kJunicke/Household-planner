import { describe, expect, it } from 'vitest'

import type { Task } from '@/types/Task'

import { searchTasks } from './taskSearch'

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

const titles = (results: ReturnType<typeof searchTasks>) => results?.map((r) => r.task.title)

describe('searchTasks', () => {
  it('leere Eingabe heißt „nichts gesucht" (null), nicht „nichts gefunden"', () => {
    const tasks = [task('Bad putzen')]
    expect(searchTasks(tasks, '')).toBeNull()
    expect(searchTasks(tasks, '   ')).toBeNull()
    expect(searchTasks(tasks, 'Keller')).toEqual([])
  })

  it('exakt (100) heißt: derselbe Titel im Sinne der Duplikat-Regel', () => {
    const results = searchTasks([task('Bad  putzen')], 'bad putzen ')
    expect(results?.[0]?.relevance).toBe(100)
  })

  it('ignoriert Groß-/Kleinschreibung und Leerraum um die Eingabe', () => {
    expect(titles(searchTasks([task('Bad putzen')], '  BAD '))).toEqual(['Bad putzen'])
  })

  it('ordnet nach Relevanz: exakt > Anfang > irgendwo > nur in einer Unteraufgabe', () => {
    const parent = task('Küche')
    const tasks = [
      task('Wäsche bad'), // irgendwo
      parent, // nur über Unteraufgabe
      task('Bad'), // exakt
      task('Bad putzen'), // Anfang
      task('Fenster'), // gar nicht
      task('Badewanne entkalken', { parent_task_id: parent.task_id }),
    ]
    const results = searchTasks(tasks, 'bad')!
    expect(titles(results)).toEqual(['Bad', 'Bad putzen', 'Wäsche bad', 'Küche'])
    const relevances = results.map((r) => r.relevance)
    expect([...relevances].sort((a, b) => b - a)).toEqual(relevances)
  })

  it('Unteraufgaben erscheinen nie selbst, nur über ihre Eltern', () => {
    const parent = task('Keller')
    const tasks = [parent, task('Regale abwischen', { parent_task_id: parent.task_id })]
    expect(titles(searchTasks(tasks, 'regale'))).toEqual(['Keller'])
  })

  it('eine Unteraufgabe hilft nur ihrem eigenen Elternteil', () => {
    const a = task('Keller')
    const b = task('Dachboden')
    const tasks = [a, b, task('Regale', { parent_task_id: a.task_id })]
    expect(titles(searchTasks(tasks, 'regale'))).toEqual(['Keller'])
  })

  it('ordnet die Treffer den Rubriken des Such-Overlays zu', () => {
    const tasks = [
      task('Putz daily', { task_type: 'daily' }),
      task('Putz einmal', { task_type: 'one-time' }),
      task('Putz recurring', { task_type: 'recurring' }),
      task('Putz projekt', { task_type: 'project' }),
      task('Putz erledigt', { task_type: 'project', completed: true }),
    ]
    const byTitle = Object.fromEntries(
      searchTasks(tasks, 'putz')!.map((r) => [r.task.title, [r.category, r.categoryLabel]]),
    )
    expect(byTitle).toEqual({
      'Putz daily': ['daily', 'Alltag'],
      'Putz einmal': ['daily', 'Alltag'],
      'Putz recurring': ['recurring', 'Putzen'],
      'Putz projekt': ['project', 'Projekte'],
      // Erledigt sticht den Typ
      'Putz erledigt': ['completed', 'Erledigt'],
    })
  })
})
