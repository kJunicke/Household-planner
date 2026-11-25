import { describe, expect, it } from 'vitest'

import type { Task } from '@/types/Task'
import type { ListToolStores } from './listTools'
import type { NotesToolStore } from './notesTools'
import type { ShoppingToolStore } from './shoppingTools'
import type { TaskToolStores } from './taskTools'
import { assistantTools } from './tools'

/** Tuesday, 24 November 2026, noon: the "today" of every test here. */
const TODAY = new Date(2026, 10, 24, 12)

let nextId = 0
function task(title: string, fields: Partial<Task> = {}): Task {
  return {
    task_id: `t-${title.toLowerCase().replace(/\s+/g, '-')}`,
    household_id: 'h1',
    title,
    effort: 5,
    task_type: 'recurring',
    recurrence_days: 7,
    completed: false,
    last_completed_at: null,
    postponed_until: null,
    assigned_to: null,
    assignment_permanent: false,
    parent_task_id: null,
    order_index: 0,
    subtask_points_mode: 'checklist',
    emphasis_level: 0,
    project_saying_index: 0,
    deleted_at: null,
    ...fields,
  }
}

interface FakeCompletion {
  completion_id: string
  task_id: string
  user_id: string
  completed_at: string
  effort_override: number
  completion_note: string | null
  isDeleted: boolean
  isQuick: boolean
  tasks: { title: string }
  household_members: { display_name: string }
}

/**
 * Stand-ins for the task and household stores. Like the real task store, a
 * write reports `false`/`null` when `fail` is set, and a deleted task leaves
 * `tasks` but stays in `all` (soft delete), together with its completions.
 */
function fakeStores(
  tasks: Task[] = [],
  { fail = false, completions = [] as FakeCompletion[] } = {},
) {
  const all = new Map(tasks.map((t) => [t.task_id, t]))
  const live = () => [...all.values()].filter((t) => t.deleted_at === null)
  const store = {
    get tasks() {
      return live()
    },
    completions,
    loaded: tasks.length > 0,
    loadTasks: async () => {
      store.loaded = true
    },
    createTask: async (data: Partial<Task> & Pick<Task, 'title'>) => {
      if (fail) return null
      const created = task(data.title.trim(), { ...data, task_id: `new-${nextId++}` })
      all.set(created.task_id, created)
      return created
    },
    assignTask: async (taskId: string, userId: string | null, permanent: boolean) => {
      if (fail) return false
      Object.assign(all.get(taskId)!, { assigned_to: userId, assignment_permanent: permanent })
      return true
    },
    postponeTask: async (taskId: string, targetDate: string) => {
      if (fail) return false
      Object.assign(all.get(taskId)!, { completed: true, postponed_until: targetDate })
      return true
    },
    markAsDirty: async (taskId: string) => {
      if (fail) return false
      Object.assign(all.get(taskId)!, { completed: false, postponed_until: null })
      return true
    },
    restoreTaskState: async (s: Pick<Task, 'task_id' | 'completed' | 'postponed_until'>) => {
      if (fail) return false
      Object.assign(all.get(s.task_id)!, {
        completed: s.completed,
        postponed_until: s.postponed_until,
      })
      return true
    },
    deleteTask: async (taskId: string) => {
      if (fail) return false
      all.get(taskId)!.deleted_at = '2026-11-24T12:00:00Z'
      return true
    },
    restoreTask: async (taskId: string) => {
      if (fail) return false
      all.get(taskId)!.deleted_at = null
      return true
    },
    fetchCompletions: async () => completions,
  }
  const household = {
    householdMembers: [
      { user_id: 'me', display_name: 'Kilian' },
      { user_id: 'anna', display_name: 'Anna' },
    ],
    weeklyGoalPoints: 80,
    weeklyTotalPoints: 34,
    weeklyContributions: [
      { userId: 'me', name: 'Kilian', points: 20 },
      { userId: 'anna', name: 'Anna', points: 14 },
    ],
    currentWeekStart: () => new Date(2026, 10, 23),
    loadWeeklyCompletions: async () => {},
  }
  return { store, household, all }
}

type Fakes = ReturnType<typeof fakeStores>

const execute = (fakes: Fakes, name: string, input: Record<string, unknown>) =>
  assistantTools({
    shopping: { lists: [], items: [] } as unknown as ShoppingToolStore,
    lists: {} as ListToolStores,
    notes: { notes: [] } as unknown as NotesToolStore,
    tasks: {
      tasks: fakes.store,
      household: fakes.household,
      today: () => TODAY,
    } as unknown as TaskToolStores,
    goToPage: () => {},
    currentUserId: () => 'me',
  }).execute(name, input)

const WALL = { area: 'wall' } as const

describe('read_tasks', () => {
  it('lists every task on the wall with its id, type, points, who is on it and how it stands', async () => {
    const fakes = fakeStores([
      task('Bad putzen', {
        recurrence_days: 7,
        last_completed_at: '2026-11-14T10:00:00Z',
        assigned_to: 'anna',
      }),
      task('Fenster putzen', { recurrence_days: 30, effort: null }),
      task('Staubsaugen', {
        completed: true,
        last_completed_at: '2026-11-22T10:00:00Z',
        recurrence_days: 7,
      }),
      task('Keller', { completed: true, postponed_until: '2026-11-28', task_type: 'one-time' }),
      task('Abwasch', { task_type: 'daily', recurrence_days: 0 }),
      task('Garten', { task_type: 'project', recurrence_days: 0 }),
    ])
    const outcome = await execute(fakes, 'read_tasks', {})
    const lines = outcome.result.split('\n')
    const line = (title: string) => lines.find((l) => l.includes(title))
    expect(line('Bad putzen')).toMatch(/id t-bad-putzen/)
    expect(line('Bad putzen')).toMatch(/alle 7 Tage/)
    expect(line('Bad putzen')).toMatch(/5 Punkte/)
    expect(line('Bad putzen')).toMatch(/zuständig: Anna/)
    expect(line('Bad putzen')).toMatch(/dran, 3 Tage überfällig/)
    expect(line('Fenster putzen')).toMatch(/unbewertet/)
    expect(line('Fenster putzen')).toMatch(/noch nie gemacht/)
    expect(line('Staubsaugen')).toMatch(/erledigt, wieder fällig in 5 Tagen/)
    expect(line('Keller')).toMatch(/einmalig/)
    expect(line('Keller')).toMatch(/verschoben auf Samstag, 28\.11\./)
    expect(line('Abwasch')).toMatch(/täglich/)
    expect(line('Garten')).toMatch(/Projekt/)
    expect(outcome.summary).toBeUndefined()
    expect(outcome.changes).toBeUndefined()
  })

  it('loads the tasks first when no page has loaded them yet', async () => {
    const fakes = fakeStores()
    await execute(fakes, 'read_tasks', {})
    expect(fakes.store.loaded).toBe(true)
  })

  it('names the subtasks under their task, but never as tasks of their own', async () => {
    const fakes = fakeStores([
      task('Garten', { task_type: 'project', recurrence_days: 0 }),
      task('Am Projekt arbeiten', { parent_task_id: 't-garten' }),
    ])
    const outcome = await execute(fakes, 'read_tasks', {})
    expect(outcome.result).toMatch(/Garten.*Unteraufgaben: Am Projekt arbeiten/)
    expect(outcome.result).not.toMatch(/^- Am Projekt arbeiten/m)
  })
})

function completion(
  title: string,
  who: 'me' | 'anna',
  completedAt: string,
  fields: Partial<FakeCompletion> = {},
): FakeCompletion {
  return {
    completion_id: `c-${completedAt}`,
    task_id: `t-${title.toLowerCase().replace(/\s+/g, '-')}`,
    user_id: who,
    completed_at: completedAt,
    effort_override: 5,
    completion_note: null,
    isDeleted: false,
    isQuick: false,
    tasks: { title },
    household_members: { display_name: who === 'me' ? 'Kilian' : 'Anna' },
    ...fields,
  }
}

describe('read_task_history', () => {
  const history = () => [
    completion('Bad putzen', 'anna', '2026-11-23T17:30:00Z', { completion_note: 'sehr dreckig' }),
    completion('Staubsaugen', 'me', '2026-11-22T09:00:00Z', { effort_override: 3 }),
    completion('Bad putzen', 'me', '2026-11-16T09:00:00Z'),
    completion('Keller aufgeräumt', 'me', '2026-11-15T09:00:00Z', { isQuick: true }),
    completion('Alter Schrank', 'anna', '2026-11-10T09:00:00Z', { isDeleted: true }),
  ]

  it('tells who did what when, newest first, with points, note and quick or deleted marks', async () => {
    const fakes = fakeStores([], { completions: history() })
    const outcome = await execute(fakes, 'read_task_history', {})
    const lines = outcome.result.split('\n').filter((l) => l.startsWith('- '))
    expect(lines).toHaveLength(5)
    expect(lines[0]).toMatch(/Mo\., 23\.11\..*Anna: Bad putzen, 5 Punkte.*Notiz: sehr dreckig/)
    expect(lines[1]).toMatch(/Kilian: Staubsaugen, 3 Punkte/)
    expect(lines[3]).toMatch(/Quick-Aufgabe/)
    expect(lines[4]).toMatch(/gelöscht/)
    expect(outcome.changes).toBeUndefined()
  })

  it('narrows to one task by its id', async () => {
    const fakes = fakeStores([], { completions: history() })
    const outcome = await execute(fakes, 'read_task_history', { task_id: 't-bad-putzen' })
    const lines = outcome.result.split('\n').filter((l) => l.startsWith('- '))
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => l.includes('Bad putzen'))).toBe(true)
  })

  it('stops after the asked number of entries', async () => {
    const fakes = fakeStores([], { completions: history() })
    const outcome = await execute(fakes, 'read_task_history', { limit: 2 })
    expect(outcome.result.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(2)
  })

  it('says so when nothing was done yet', async () => {
    const outcome = await execute(fakeStores(), 'read_task_history', { task_id: 't-x' })
    expect(outcome.result).toMatch(/keine Erledigungen/i)
  })
})

describe('read_weekly_goal', () => {
  it('tells the goal, the points so far this week, each member’s share and what is left', async () => {
    const outcome = await execute(fakeStores(), 'read_weekly_goal', {})
    expect(outcome.result).toMatch(/Wochenziel: 80 Punkte/)
    expect(outcome.result).toMatch(/seit Montag, 23\.11\./)
    expect(outcome.result).toMatch(/34 Punkte/)
    expect(outcome.result).toMatch(/Kilian 20, Anna 14/)
    expect(outcome.result).toMatch(/noch 46 Punkte/)
    expect(outcome.changes).toBeUndefined()
  })
})

describe('create_task', () => {
  it('puts a new task on the wall, with points, type and cadence, and leads to the wall', async () => {
    const fakes = fakeStores()
    const outcome = await execute(fakes, 'create_task', {
      title: 'Fenster putzen',
      points: 8,
      task_type: 'recurring',
      recurrence_days: 30,
    })
    const created = fakes.store.tasks.find((t) => t.title === 'Fenster putzen')!
    expect(created).toMatchObject({ effort: 8, task_type: 'recurring', recurrence_days: 30 })
    expect(outcome.isError).toBeFalsy()
    expect(outcome.result).toContain(created.task_id)
    expect(outcome.summary).toBe('✓ neue Aufgabe: Fenster putzen')
    expect(outcome.changed).toEqual([{ id: created.task_id, page: WALL }])
    expect(outcome.changes).toHaveLength(1)
  })

  it('can assign it right away', async () => {
    const fakes = fakeStores()
    await execute(fakes, 'create_task', {
      title: 'Müll rausbringen',
      points: 1,
      task_type: 'daily',
      assigned_to: 'anna',
    })
    expect(fakes.store.tasks[0]).toMatchObject({ assigned_to: 'anna', recurrence_days: 0 })
  })

  it('can be taken back: the new task is gone from the wall again', async () => {
    const fakes = fakeStores()
    const outcome = await execute(fakes, 'create_task', {
      title: 'Keller',
      points: 8,
      task_type: 'one-time',
    })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(fakes.store.tasks).toEqual([])
  })

  it('rejects a Duplikat like the app does, and names the existing task with its id and state', async () => {
    const fakes = fakeStores([
      task('Bad putzen', { completed: true, last_completed_at: '2026-11-23T10:00:00Z' }),
    ])
    const outcome = await execute(fakes, 'create_task', {
      title: '  bad   PUTZEN ',
      points: 5,
      task_type: 'recurring',
      recurrence_days: 7,
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toMatch(/„Bad putzen“ gibt es schon/)
    expect(outcome.result).toContain('t-bad-putzen')
    expect(outcome.result).toMatch(/erledigt/)
    expect(outcome.changes).toBeUndefined()
    expect(fakes.store.tasks).toHaveLength(1)
  })

  it.each<[string, Record<string, unknown>]>([
    ['no title', { title: ' ', points: 3, task_type: 'daily' }],
    ['no points (the app asks for them too)', { title: 'Keller', task_type: 'one-time' }],
    ['points of zero', { title: 'Keller', points: 0, task_type: 'one-time' }],
    ['a recurring task without a cadence', { title: 'Keller', points: 3, task_type: 'recurring' }],
    ['an unknown type', { title: 'Keller', points: 3, task_type: 'weekly' }],
    [
      'someone outside the household',
      { title: 'Keller', points: 3, task_type: 'daily', assigned_to: 'x' },
    ],
  ])('rejects %s and creates nothing', async (_, input) => {
    const fakes = fakeStores()
    const outcome = await execute(fakes, 'create_task', input)
    expect(outcome.isError).toBe(true)
    expect(fakes.store.tasks).toEqual([])
  })

  it('reports a task the store refused as an error, not as created', async () => {
    const outcome = await execute(fakeStores([], { fail: true }), 'create_task', {
      title: 'Keller',
      points: 8,
      task_type: 'one-time',
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.changes).toBeUndefined()
  })
})

describe('assign_task', () => {
  it('makes a member responsible for a task, and leads to the wall', async () => {
    const fakes = fakeStores([task('Bad putzen')])
    const outcome = await execute(fakes, 'assign_task', {
      task_id: 't-bad-putzen',
      user_id: 'anna',
    })
    expect(fakes.all.get('t-bad-putzen')).toMatchObject({
      assigned_to: 'anna',
      assignment_permanent: false,
    })
    expect(outcome.summary).toBe('✓ Bad putzen → Anna')
    expect(outcome.changed).toEqual([{ id: 't-bad-putzen', page: WALL }])
  })

  it('keeps the assignment after completing when asked to', async () => {
    const fakes = fakeStores([task('Bad putzen')])
    await execute(fakes, 'assign_task', { task_id: 't-bad-putzen', user_id: 'me', permanent: true })
    expect(fakes.all.get('t-bad-putzen')!.assignment_permanent).toBe(true)
  })

  it('takes the assignment away with an empty user_id', async () => {
    const fakes = fakeStores([task('Bad putzen', { assigned_to: 'anna' })])
    const outcome = await execute(fakes, 'assign_task', { task_id: 't-bad-putzen', user_id: '' })
    expect(fakes.all.get('t-bad-putzen')!.assigned_to).toBeNull()
    expect(outcome.summary).toBe('✓ Bad putzen: niemand zuständig')
  })

  it('can be taken back: who was on it before is on it again', async () => {
    const fakes = fakeStores([
      task('Bad putzen', { assigned_to: 'me', assignment_permanent: true }),
    ])
    const outcome = await execute(fakes, 'assign_task', {
      task_id: 't-bad-putzen',
      user_id: 'anna',
    })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(fakes.all.get('t-bad-putzen')).toMatchObject({
      assigned_to: 'me',
      assignment_permanent: true,
    })
  })

  it.each<[string, Record<string, unknown>]>([
    ['an unknown task', { task_id: 'x', user_id: 'anna' }],
    ['someone outside the household', { task_id: 't-bad-putzen', user_id: 'x' }],
    ['a subtask', { task_id: 't-sub', user_id: 'anna' }],
  ])('rejects %s', async (_, input) => {
    const fakes = fakeStores([task('Bad putzen'), task('Sub', { parent_task_id: 't-bad-putzen' })])
    const outcome = await execute(fakes, 'assign_task', input)
    expect(outcome.isError).toBe(true)
    expect(fakes.all.get('t-bad-putzen')!.assigned_to).toBeNull()
  })
})

describe('postpone_task', () => {
  it('moves a task that is dran out of the way until the given day, without completing it', async () => {
    const fakes = fakeStores([task('Bad putzen', { last_completed_at: '2026-11-14T10:00:00Z' })])
    const outcome = await execute(fakes, 'postpone_task', {
      task_id: 't-bad-putzen',
      until: '2026-11-28',
    })
    expect(fakes.all.get('t-bad-putzen')).toMatchObject({
      completed: true,
      postponed_until: '2026-11-28',
      last_completed_at: '2026-11-14T10:00:00Z',
    })
    expect(outcome.summary).toBe('✓ Bad putzen verschoben auf Samstag, 28.11.')
    expect(outcome.changed).toEqual([{ id: 't-bad-putzen', page: WALL }])
  })

  it('counts days from today', async () => {
    const fakes = fakeStores([task('Bad putzen')])
    await execute(fakes, 'postpone_task', { task_id: 't-bad-putzen', days: 3 })
    expect(fakes.all.get('t-bad-putzen')!.postponed_until).toBe('2026-11-27')
  })

  it('moves a task that is already postponed to another day', async () => {
    const fakes = fakeStores([
      task('Bad putzen', { completed: true, postponed_until: '2026-11-26' }),
    ])
    const outcome = await execute(fakes, 'postpone_task', { task_id: 't-bad-putzen', days: 7 })
    expect(outcome.isError).toBeFalsy()
    expect(fakes.all.get('t-bad-putzen')!.postponed_until).toBe('2026-12-01')
  })

  it('can be taken back: the task is as it was before, dran or postponed', async () => {
    const fakes = fakeStores([
      task('Bad putzen'),
      task('Keller', { task_type: 'one-time', completed: true, postponed_until: '2026-11-26' }),
    ])
    const first = await execute(fakes, 'postpone_task', { task_id: 't-bad-putzen', days: 2 })
    const second = await execute(fakes, 'postpone_task', { task_id: 't-keller', days: 9 })
    expect(await first.changes![0]!.undo()).toBe(true)
    expect(await second.changes![0]!.undo()).toBe(true)
    expect(fakes.all.get('t-bad-putzen')).toMatchObject({ completed: false, postponed_until: null })
    expect(fakes.all.get('t-keller')).toMatchObject({
      completed: true,
      postponed_until: '2026-11-26',
    })
  })

  it.each<[string, Partial<Task>, Record<string, unknown>]>([
    ['a daily task', { task_type: 'daily', recurrence_days: 0 }, { days: 2 }],
    ['a project', { task_type: 'project', recurrence_days: 0 }, { days: 2 }],
    ['today', {}, { until: '2026-11-24' }],
    ['a day in the past', {}, { until: '2026-11-20' }],
    ['zero days', {}, { days: 0 }],
    ['no day at all', {}, {}],
    [
      'a task that is erledigt and not postponed (nothing to move out of the way)',
      { completed: true, last_completed_at: '2026-11-23T10:00:00Z' },
      { days: 2 },
    ],
  ])('rejects %s', async (_, fields, input) => {
    const fakes = fakeStores([task('Bad putzen', fields)])
    const before = { ...fakes.all.get('t-bad-putzen')! }
    const outcome = await execute(fakes, 'postpone_task', { task_id: 't-bad-putzen', ...input })
    expect(outcome.isError).toBe(true)
    expect(fakes.all.get('t-bad-putzen')).toEqual(before)
  })
})

describe('mark_task_dirty', () => {
  it('puts an erledigt task back to dran (wieder dreckig), keeping its history', async () => {
    const fakes = fakeStores([
      task('Bad putzen', { completed: true, last_completed_at: '2026-11-23T10:00:00Z' }),
    ])
    const outcome = await execute(fakes, 'mark_task_dirty', { task_id: 't-bad-putzen' })
    expect(fakes.all.get('t-bad-putzen')).toMatchObject({
      completed: false,
      last_completed_at: '2026-11-23T10:00:00Z',
    })
    expect(outcome.summary).toBe('✓ Bad putzen wieder dreckig')
    expect(outcome.changed).toEqual([{ id: 't-bad-putzen', page: WALL }])
  })

  it('also brings a postponed task back right away', async () => {
    const fakes = fakeStores([
      task('Bad putzen', { completed: true, postponed_until: '2026-11-28' }),
    ])
    await execute(fakes, 'mark_task_dirty', { task_id: 't-bad-putzen' })
    expect(fakes.all.get('t-bad-putzen')).toMatchObject({ completed: false, postponed_until: null })
  })

  it('can be taken back: erledigt or postponed as before', async () => {
    const fakes = fakeStores([
      task('Bad putzen', { completed: true, last_completed_at: '2026-11-23T10:00:00Z' }),
      task('Keller', { task_type: 'one-time', completed: true, postponed_until: '2026-11-28' }),
    ])
    const first = await execute(fakes, 'mark_task_dirty', { task_id: 't-bad-putzen' })
    const second = await execute(fakes, 'mark_task_dirty', { task_id: 't-keller' })
    expect(await first.changes![0]!.undo()).toBe(true)
    expect(await second.changes![0]!.undo()).toBe(true)
    expect(fakes.all.get('t-bad-putzen')).toMatchObject({ completed: true, postponed_until: null })
    expect(fakes.all.get('t-keller')).toMatchObject({
      completed: true,
      postponed_until: '2026-11-28',
    })
  })

  it('rejects a task that is dran already', async () => {
    const fakes = fakeStores([task('Bad putzen')])
    const outcome = await execute(fakes, 'mark_task_dirty', { task_id: 't-bad-putzen' })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toMatch(/schon dran/)
  })

  it('reports a task the store could not reset as an error', async () => {
    const fakes = fakeStores([task('Bad putzen', { completed: true })], { fail: true })
    const outcome = await execute(fakes, 'mark_task_dirty', { task_id: 't-bad-putzen' })
    expect(outcome.isError).toBe(true)
    expect(outcome.changes).toBeUndefined()
  })
})

describe('delete_task', () => {
  const withHistory = () =>
    fakeStores([task('Bad putzen'), task('Keller', { task_type: 'one-time' })], {
      completions: [completion('Bad putzen', 'anna', '2026-11-23T17:30:00Z')],
    })

  it('deletes nothing by itself: it lays the card before the user, naming the task', async () => {
    const fakes = withHistory()
    const outcome = await execute(fakes, 'delete_task', { task_id: 't-bad-putzen' })
    expect(outcome.deleteCard!.what).toMatch(/^Aufgabe „Bad putzen“/)
    expect(fakes.store.tasks).toHaveLength(2)
    expect(outcome.changes).toBeUndefined()
  })

  it('says on the card that its history stays, when it has any', async () => {
    const outcome = await execute(withHistory(), 'delete_task', { task_id: 't-bad-putzen' })
    expect(outcome.deleteCard!.what).toMatch(/Erledigungen bleiben im Verlauf/)
    const fresh = await execute(withHistory(), 'delete_task', { task_id: 't-keller' })
    expect(fresh.deleteCard!.what).toBe('Aufgabe „Keller“')
  })

  it('after „Löschen“ the task leaves the wall, and its completions stay in the history', async () => {
    const fakes = withHistory()
    const outcome = await execute(fakes, 'delete_task', { task_id: 't-bad-putzen' })
    const deleted = await outcome.deleteCard!.confirm()
    expect(fakes.store.tasks.map((t) => t.title)).toEqual(['Keller'])
    expect(fakes.store.completions).toHaveLength(1)
    expect(deleted.summary).toBe('✓ Aufgabe gelöscht: Bad putzen')
    expect(deleted.changes).toHaveLength(1)
  })

  it('after „Löschen“ the app goes to the wall, where the task lights up once the delete is undone', async () => {
    const outcome = await execute(withHistory(), 'delete_task', { task_id: 't-bad-putzen' })
    const deleted = await outcome.deleteCard!.confirm()
    expect(deleted.changed).toEqual([{ id: 't-bad-putzen', page: WALL, removed: true }])
  })

  it('can be taken back after „Löschen“: the same task is on the wall again', async () => {
    const fakes = withHistory()
    const outcome = await execute(fakes, 'delete_task', { task_id: 't-bad-putzen' })
    const deleted = await outcome.deleteCard!.confirm()
    expect(await deleted.changes![0]!.undo()).toBe(true)
    expect(fakes.store.tasks.map((t) => t.task_id)).toContain('t-bad-putzen')
  })

  it('reports a failed delete as an error', async () => {
    const fakes = fakeStores([task('Bad putzen')], { fail: true })
    const outcome = await execute(fakes, 'delete_task', { task_id: 't-bad-putzen' })
    const deleted = await outcome.deleteCard!.confirm()
    expect(deleted.isError).toBe(true)
    expect(deleted.changes).toBeUndefined()
  })

  it('rejects an unknown task without a card', async () => {
    const outcome = await execute(withHistory(), 'delete_task', { task_id: 'x' })
    expect(outcome.isError).toBe(true)
    expect(outcome.deleteCard).toBeUndefined()
  })
})
