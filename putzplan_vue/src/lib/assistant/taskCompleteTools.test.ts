import { describe, expect, it } from 'vitest'

import type { Task } from '@/types/Task'
import type { ListToolStores } from './listTools'
import type { NotesToolStore } from './notesTools'
import type { ShoppingToolStore } from './shoppingTools'
import type { TaskToolStores } from './taskTools'
import type { ExpenseToolStores } from './expenseTools'
import { assistantTools } from './tools'

interface FakeCompletion {
  completion_id: string
  task_id: string
  points: number
  note: string | null
  quick: boolean
}

const task = (fields: Partial<Task>): Task =>
  ({
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
    subtask_points_mode: 'bonus',
    emphasis_level: 0,
    deleted_at: null,
    ...fields,
  }) as Task

/**
 * A stand-in for the task store, keeping the rules the real one and the
 * `complete-task` edge function keep: an unrated task is not completed
 * without `standardPoints`, the completion goes to the one asking, and
 * undoing it (Zurückkleben) deletes exactly that completion again. The
 * Wochenziel counts `completions`.
 */
function fakeStore(tasks: Partial<Task>[] = [], { loaded = true } = {}) {
  let next = 0
  const all = tasks.map(task)
  const tickets = new Map<string, { id: string; before: Task; completionId: string }>()
  const store = {
    tasks: loaded ? all : ([] as Task[]),
    completions: [] as FakeCompletion[],
    loadTasks: async () => {
      store.tasks = all
    },
    completeTask: async (
      taskId: string,
      o: { effortOverride?: number; completionNote?: string; standardPoints?: number } = {},
    ) => {
      const t = store.tasks.find((x) => x.task_id === taskId)
      if (!t) return false
      if (t.effort === null && o.standardPoints === undefined) return false
      const before = { ...t }
      if (t.effort === null) t.effort = o.standardPoints!
      if (t.task_type !== 'daily') t.completed = true
      const completionId = `c${next++}`
      store.completions.push({
        completion_id: completionId,
        task_id: taskId,
        points: o.effortOverride ?? t.effort,
        note: o.completionNote ?? null,
        quick: false,
      })
      tickets.set(taskId, { id: `ticket-${completionId}`, before, completionId })
      return true
    },
    undoTicketOf: (taskId: string) => tickets.get(taskId)?.id,
    undoCompletion: async (taskId: string, o: { restoreRating?: boolean } = {}) => {
      const ticket = tickets.get(taskId)
      if (!ticket) return false
      tickets.delete(taskId)
      store.completions = store.completions.filter((c) => c.completion_id !== ticket.completionId)
      const t = store.tasks.find((x) => x.task_id === taskId)!
      t.completed = ticket.before.completed
      if (o.restoreRating) t.effort = ticket.before.effort
      return true
    },
    createQuickTask: async (data: { title: string; effort: number; note?: string }) => {
      const completionId = `c${next++}`
      store.completions.push({
        completion_id: completionId,
        task_id: `quick-${completionId}`,
        points: data.effort,
        note: data.note ?? null,
        quick: true,
      })
      return { task: task({ task_id: `quick-${completionId}`, title: data.title }), completionId }
    },
    deleteCompletion: async (completionId: string) => {
      const before = store.completions.length
      store.completions = store.completions.filter((c) => c.completion_id !== completionId)
      return store.completions.length < before
    },
  }
  return store
}

type FakeStore = ReturnType<typeof fakeStore>

const registry = (store: FakeStore) =>
  assistantTools({
    shopping: { lists: [], items: [] } as unknown as ShoppingToolStore,
    lists: {} as ListToolStores,
    notes: { notes: [] } as unknown as NotesToolStore,
    tasks: { tasks: store, household: {}, today: () => new Date() } as unknown as TaskToolStores,
    expenses: {} as ExpenseToolStores,
    goToPage: () => {},
    currentUserId: () => 'me',
  })

const run = (store: FakeStore, name: string, input: Record<string, unknown>) =>
  registry(store).execute(name, input)

const weekPoints = (store: FakeStore) => store.completions.reduce((sum, c) => sum + c.points, 0)

const bad = { task_id: 'bad', title: 'Bad putzen', effort: 5 }

describe('complete_task', () => {
  it('completes a task for the one asking, with its Standardpunkte, and says so', async () => {
    const store = fakeStore([bad])
    const outcome = await run(store, 'complete_task', { task_id: 'bad' })
    expect(outcome.isError).toBeFalsy()
    expect(store.completions).toMatchObject([{ task_id: 'bad', points: 5, note: null }])
    expect(store.tasks[0]!.completed).toBe(true)
    expect(outcome.summary).toBe('✓ erledigt: Bad putzen (+5 P)')
    expect(outcome.result).toContain('Bad putzen')
    expect(outcome.changes).toHaveLength(1)
  })

  it('leads the app to the wall, where the task lights up', async () => {
    const outcome = await run(fakeStore([bad]), 'complete_task', { task_id: 'bad' })
    expect(outcome.changed).toEqual([{ id: 'bad', page: { area: 'wall' } }])
  })
})

describe('complete_task on an unrated task', () => {
  const unrated = { task_id: 'bad', title: 'Bad putzen', effort: null }

  it('does not complete it without points and tells Claude to ask for them', async () => {
    const store = fakeStore([unrated])
    const outcome = await run(store, 'complete_task', { task_id: 'bad' })
    expect(outcome.isError).toBe(true)
    expect(store.completions).toEqual([])
    expect(outcome.result).toMatch(/unbewertet/)
    expect(outcome.result).toMatch(/[Ff]rag/)
    expect(outcome.result).toMatch(/Standardpunkte/)
    expect(outcome.changes).toBeUndefined()
  })

  it('completes it with the points the user named, which become its Standardpunkte', async () => {
    const store = fakeStore([unrated])
    const outcome = await run(store, 'complete_task', { task_id: 'bad', points: 4 })
    expect(outcome.isError).toBeFalsy()
    expect(store.completions).toMatchObject([{ task_id: 'bad', points: 4 }])
    expect(store.tasks[0]!.effort).toBe(4)
    expect(outcome.summary).toBe('✓ erledigt: Bad putzen (+4 P, ab jetzt Standard)')
  })

  it('undo leaves it unrated again, as before', async () => {
    const store = fakeStore([unrated])
    const outcome = await run(store, 'complete_task', { task_id: 'bad', points: 4 })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(store.completions).toEqual([])
    expect(store.tasks[0]!.effort).toBeNull()
    expect(store.tasks[0]!.completed).toBe(false)
  })

  it('rejects points that are no whole number from 1 to 999', async () => {
    for (const points of [0, 2.5, 1000, 'viel']) {
      const store = fakeStore([unrated])
      const outcome = await run(store, 'complete_task', { task_id: 'bad', points })
      expect(outcome.isError).toBe(true)
      expect(store.completions).toEqual([])
    }
  })
})

describe('complete_task with other points than the Standardpunkte (Abweichung)', () => {
  it('does not complete it without a reason and tells Claude to ask for one', async () => {
    const store = fakeStore([bad])
    const outcome = await run(store, 'complete_task', { task_id: 'bad', points: 8 })
    expect(outcome.isError).toBe(true)
    expect(store.completions).toEqual([])
    expect(outcome.result).toMatch(/Begründung/)
    expect(outcome.result).toMatch(/[Ff]rag/)
  })

  it('a blank reason is no reason', async () => {
    const store = fakeStore([bad])
    const outcome = await run(store, 'complete_task', { task_id: 'bad', points: 8, note: '  ' })
    expect(outcome.isError).toBe(true)
    expect(store.completions).toEqual([])
  })

  it('completes it with those points and the reason as its note', async () => {
    const store = fakeStore([bad])
    const outcome = await run(store, 'complete_task', {
      task_id: 'bad',
      points: 8,
      note: 'war sehr dreckig',
    })
    expect(outcome.isError).toBeFalsy()
    expect(store.completions).toMatchObject([{ points: 8, note: 'war sehr dreckig' }])
    expect(store.tasks[0]!.effort).toBe(5)
    expect(outcome.summary).toBe('✓ erledigt: Bad putzen (+8 P statt 5)')
  })

  it('the Standardpunkte named as points are no Abweichung', async () => {
    const store = fakeStore([bad])
    const outcome = await run(store, 'complete_task', { task_id: 'bad', points: 5 })
    expect(outcome.isError).toBeFalsy()
    expect(store.completions).toMatchObject([{ points: 5 }])
  })

  it('keeps a note on an ordinary completion too', async () => {
    const store = fakeStore([bad])
    await run(store, 'complete_task', { task_id: 'bad', note: 'mit neuem Reiniger' })
    expect(store.completions).toMatchObject([{ points: 5, note: 'mit neuem Reiniger' }])
  })
})

describe('taking a completion back (Zurückkleben)', () => {
  it('deletes exactly this completion: the task is due again, its points leave the Wochenziel', async () => {
    const store = fakeStore([bad, { task_id: 'kueche', title: 'Küche', effort: 3 }])
    await run(store, 'complete_task', { task_id: 'kueche' })
    const outcome = await run(store, 'complete_task', { task_id: 'bad' })
    expect(weekPoints(store)).toBe(8)
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(weekPoints(store)).toBe(3)
    expect(store.completions).toMatchObject([{ task_id: 'kueche' }])
    expect(store.tasks.find((t) => t.task_id === 'bad')!.completed).toBe(false)
  })

  it('leaves a newer completion of the same task alone', async () => {
    const daily = { task_id: 'spuelen', title: 'Spülen', effort: 2, task_type: 'daily' as const }
    const store = fakeStore([daily])
    const first = await run(store, 'complete_task', { task_id: 'spuelen' })
    await store.completeTask('spuelen') // later, by hand
    expect(await first.changes![0]!.undo()).toBe(false)
    expect(store.completions).toHaveLength(2)
  })
})

describe('complete_task, what it turns down', () => {
  it('rejects an unknown task id', async () => {
    const outcome = await run(fakeStore([bad]), 'complete_task', { task_id: 'x' })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('x')
  })

  it('finds the tasks when the chat opened before any page loaded them', async () => {
    const store = fakeStore([bad], { loaded: false })
    const outcome = await run(store, 'complete_task', { task_id: 'bad' })
    expect(outcome.isError).toBeFalsy()
    expect(store.completions).toHaveLength(1)
  })

  it('does not complete a task that is already done, unless the user says he did it again', async () => {
    const store = fakeStore([
      { ...bad, completed: true, last_completed_at: '2026-11-24T08:00:00Z' },
    ])
    const outcome = await run(store, 'complete_task', { task_id: 'bad' })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toMatch(/schon erledigt/)
    expect(store.completions).toEqual([])

    const again = await run(store, 'complete_task', { task_id: 'bad', again: true })
    expect(again.isError).toBeFalsy()
    expect(store.completions).toHaveLength(1)
  })

  it('leaves "again" to the user: Claude first asks whether he did a done task once more', async () => {
    const store = fakeStore([
      { ...bad, completed: true, last_completed_at: '2026-11-24T08:00:00Z' },
    ])
    const outcome = await run(store, 'complete_task', { task_id: 'bad' })
    expect(outcome.result).toMatch(/[Ff]rag den Nutzer/)
    // T9: die Antwort nennt, wann sie erledigt wurde.
    expect(outcome.result).toMatch(/erledigt am Dienstag, 24\. November/)
    expect(outcome.result).toMatch(/wann/)

    const tool = registry(store).definitions.find((t) => t.name === 'complete_task')!
    const props = tool.input_schema.properties as Record<string, { description: string }>
    expect(props.again!.description).toMatch(/nie von dir aus/i)
    // „Die Pinnwand, war extrem dreckig“: die Antwort auf die Rückfrage gehört nicht in die Notiz.
    expect(props.note!.description).toMatch(/nur die Begründung/i)
  })

  it('completes a postponed task: postponing is no completion', async () => {
    const store = fakeStore([{ ...bad, completed: true, postponed_until: '2026-12-01' }])
    const outcome = await run(store, 'complete_task', { task_id: 'bad' })
    expect(outcome.isError).toBeFalsy()
  })

  it('takes no person: it completes only for the one asking', () => {
    const tool = registry(fakeStore()).definitions.find((t) => t.name === 'complete_task')!
    expect(Object.keys(tool.input_schema.properties as object)).not.toContain('user_id')
    expect(tool.description).toMatch(/nie für ein anderes Mitglied/)
  })
})

describe('log_quick_task', () => {
  it('books something done that hung on no wall, with title and points, for the one asking', async () => {
    const store = fakeStore()
    const outcome = await run(store, 'log_quick_task', { title: 'Keller aufräumen', points: 8 })
    expect(outcome.isError).toBeFalsy()
    expect(store.completions).toMatchObject([{ points: 8, quick: true, note: null }])
    expect(outcome.summary).toBe('✓ Quick-Aufgabe: Keller aufräumen (+8 P)')
    expect(outcome.changes).toHaveLength(1)
  })

  it('leads the app to the Verlauf, where its entry lights up: a Quick-Aufgabe hangs on no wall', async () => {
    const store = fakeStore()
    const outcome = await run(store, 'log_quick_task', { title: 'Keller aufräumen', points: 8 })
    const booked = store.completions[0]!.completion_id
    expect(outcome.changed).toEqual([{ id: booked, page: { area: 'history' } }])
  })

  it('keeps a note', async () => {
    const store = fakeStore()
    await run(store, 'log_quick_task', { title: 'Keller', points: 8, note: 'mit Sperrmüll' })
    expect(store.completions).toMatchObject([{ note: 'mit Sperrmüll' }])
  })

  it('can be taken back: its completion leaves the history and the Wochenziel', async () => {
    const store = fakeStore([bad])
    await run(store, 'complete_task', { task_id: 'bad' })
    const outcome = await run(store, 'log_quick_task', { title: 'Keller aufräumen', points: 8 })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(weekPoints(store)).toBe(5)
    expect(store.completions).toMatchObject([{ task_id: 'bad' }])
  })

  it('books nothing without points and tells Claude to ask for them', async () => {
    const store = fakeStore()
    const outcome = await run(store, 'log_quick_task', { title: 'Keller aufräumen' })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toMatch(/[Ff]rag/)
    expect(store.completions).toEqual([])
  })

  it('rejects an empty title and points outside 1 to 999', async () => {
    for (const input of [
      { title: ' ', points: 3 },
      { title: 'Keller', points: 0 },
      { title: 'Keller', points: 1000 },
    ]) {
      const store = fakeStore()
      expect((await run(store, 'log_quick_task', input)).isError).toBe(true)
      expect(store.completions).toEqual([])
    }
  })
})

describe('complete_task on a project (Projekt-Arbeit)', () => {
  const project = {
    task_id: 'keller',
    title: 'Keller entrümpeln',
    task_type: 'project' as const,
    effort: null,
  }
  const work = {
    task_id: 'keller-work',
    title: 'Am Projekt arbeiten',
    parent_task_id: 'keller',
    task_type: 'daily' as const,
    effort: null,
  }

  it('asks how many points the work was worth, and books nothing before', async () => {
    const store = fakeStore([project, work])
    const outcome = await run(store, 'complete_task', { task_id: 'keller' })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toMatch(/[Ff]rag/)
    expect(store.completions).toEqual([])
  })

  it('books the work with the points named, without a reason, and the project stays open', async () => {
    const store = fakeStore([project, { ...work, effort: 6 }])
    const outcome = await run(store, 'complete_task', { task_id: 'keller', points: 10 })
    expect(outcome.isError).toBeFalsy()
    expect(store.completions).toMatchObject([{ task_id: 'keller-work', points: 10 }])
    expect(store.tasks.find((t) => t.task_id === 'keller')!.completed).toBe(false)
    expect(outcome.summary).toBe('✓ Projekt-Arbeit: Keller entrümpeln (+10 P)')
    expect(outcome.changed).toEqual([{ id: 'keller', page: { area: 'wall' } }])
  })

  it('the first work sets the default of the work, and undo takes all of it back', async () => {
    const store = fakeStore([project, work])
    const outcome = await run(store, 'complete_task', { task_id: 'keller', points: 10 })
    expect(store.tasks.find((t) => t.task_id === 'keller-work')!.effort).toBe(10)
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(store.completions).toEqual([])
    expect(store.tasks.find((t) => t.task_id === 'keller-work')!.effort).toBeNull()
  })
})
