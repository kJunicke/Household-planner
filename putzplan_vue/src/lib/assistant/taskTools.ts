/**
 * Die Werkzeuge des Assistenten für die Aufgaben der Pinnwand: lesen, was dran
 * ist, wer was zuletzt gemacht hat und wie das Wochenziel steht; anlegen,
 * zuweisen, verschieben, wieder dreckig und löschen, je mit Rücknahme.
 * Erledigen gehört nicht hierher.
 *
 * Ausgeführt wird über den taskStore wie von Hand, nur ohne dessen
 * Erfolgs-Toasts: den Toast mit Rückgängig zeigt der Chat. Wortwahl nach dem
 * Glossar (CONTEXT.md): dran, überfällig, verschieben, wieder dreckig,
 * Duplikat, Standardpunkte.
 *
 * Jede Änderung hier lässt sich ganz zurücknehmen, auch das Löschen: es ist
 * weich (`deleted_at`), die Erledigungen der Aufgabe bleiben im Verlauf und an
 * ihr hängen, Rückgängig leert `deleted_at` wieder. Den Verlauf fasst kein
 * Werkzeug an.
 */
import type { useHouseholdStore } from '@/stores/householdStore'
import type { useTaskStore } from '@/stores/taskStore'
import type { Task } from '@/types/Task'
import { findDuplicateTask } from '@/lib/taskDuplicates'
import { TASK_TITLE_MAX_LENGTH } from '@/lib/limits'
import { isValidPoints, POINTS_MAX } from '@/lib/taskPoints'
import {
  canPostpone,
  earliestPostponeDate,
  formatPostponeDate,
  postponeTargetDate,
  scheduleOf,
} from '@/lib/taskSchedule'
import { undoAll, type AssistantTool, type Change, type ToolOutcome } from './tools'

/**
 * Die Teile von taskStore und householdStore, die die Werkzeuge brauchen.
 * Hereingereicht statt selbst geholt, damit die Tests gefälschte Stores geben
 * können; `today` aus demselben Grund.
 */
export interface TaskToolStores {
  tasks: Pick<
    ReturnType<typeof useTaskStore>,
    | 'tasks'
    | 'loadTasks'
    | 'createTask'
    | 'assignTask'
    | 'postponeTask'
    | 'markAsDirty'
    | 'restoreTaskState'
    | 'deleteTask'
    | 'restoreTask'
    | 'fetchCompletions'
  >
  household: Pick<
    ReturnType<typeof useHouseholdStore>,
    | 'householdMembers'
    | 'weeklyGoalPoints'
    | 'weeklyTotalPoints'
    | 'weeklyContributions'
    | 'currentWeekStart'
    | 'loadWeeklyCompletions'
  >
  today: () => Date
}

const QUIET = { quiet: true }
const PAGE = { area: 'wall' } as const

const TYPE_LABEL: Record<Task['task_type'], string> = {
  recurring: 'wiederkehrend',
  daily: 'täglich',
  'one-time': 'einmalig',
  project: 'Projekt',
}

/** Lädt die Aufgaben, wenn noch keine Seite es getan hat: der Chat kann auf jeder Seite offen sein. */
async function ensureLoaded(stores: TaskToolStores) {
  if (stores.tasks.tasks.length === 0) await stores.tasks.loadTasks()
}

const mainTasks = (stores: TaskToolStores) =>
  stores.tasks.tasks.filter((t) => t.parent_task_id === null && t.deleted_at === null)

const memberName = (stores: TaskToolStores, userId: string | null) =>
  stores.household.householdMembers.find((m) => m.user_id === userId)?.display_name ?? 'unbekannt'

const days = (n: number) => (n === 1 ? '1 Tag' : `${n} Tagen`)

/** Wie die Aufgabe steht, in den Worten des Glossars. */
function stateOf(task: Task, today: Date): string {
  const schedule = scheduleOf(task, today)
  if (schedule.status === 'postponed') {
    return `verschoben auf ${formatPostponeDate(schedule.postponedUntil!)}`
  }
  if (task.completed) {
    return schedule.daysUntilDue === null
      ? 'erledigt'
      : `erledigt, wieder fällig in ${days(schedule.daysUntilDue)}`
  }
  if (schedule.status === 'never-done') return 'dran, noch nie gemacht'
  if (schedule.status === 'overdue') {
    return schedule.daysOverdue === 0
      ? 'dran, heute fällig'
      : `dran, ${schedule.daysOverdue === 1 ? '1 Tag' : `${schedule.daysOverdue} Tage`} überfällig`
  }
  return 'dran'
}

function taskLine(stores: TaskToolStores, task: Task, today: Date): string {
  const type =
    task.task_type === 'recurring' && task.recurrence_days > 0
      ? `wiederkehrend alle ${task.recurrence_days} Tage`
      : TYPE_LABEL[task.task_type]
  const parts = [
    type,
    task.effort === null ? 'unbewertet' : `${task.effort} Punkte`,
    task.assigned_to ? `zuständig: ${memberName(stores, task.assigned_to)}` : null,
    stateOf(task, today),
  ]
  const subtasks = stores.tasks.tasks.filter((t) => t.parent_task_id === task.task_id)
  if (subtasks.length) parts.push(`Unteraufgaben: ${subtasks.map((s) => s.title).join(', ')}`)
  return `- ${task.title} (id ${task.task_id}): ${parts.filter(Boolean).join('; ')}`
}

async function readTasks(stores: TaskToolStores): Promise<ToolOutcome> {
  await ensureLoaded(stores)
  const today = stores.today()
  const lines = mainTasks(stores).map((t) => taskLine(stores, t, today))
  return { result: lines.length ? `Aufgaben:\n${lines.join('\n')}` : 'Keine Aufgaben.' }
}

/** Ein Ergebnis aus genau einer rücknehmbaren Änderung an einer Aufgabe. */
function changedTask(id: string, result: string, change: Change): ToolOutcome {
  return {
    result,
    summary: change.summary,
    undo: undoAll([change.undo]),
    changed: [{ id, page: PAGE }],
    changes: [change],
  }
}

const error = (result: string): ToolOutcome => ({ result, isError: true })

/** Die Hauptaufgabe zu `input.task_id`, oder das Fehlerergebnis für Claude. */
async function findTask(
  stores: TaskToolStores,
  input: Record<string, unknown>,
): Promise<Task | ToolOutcome> {
  await ensureLoaded(stores)
  const id = String(input.task_id ?? '')
  const found = stores.tasks.tasks.find((t) => t.task_id === id && t.deleted_at === null)
  if (!found) return error(`Unbekannte task_id ${id}`)
  if (found.parent_task_id !== null) {
    return error('Das ist eine Unteraufgabe; die bearbeitet man von Hand in ihrer Aufgabe.')
  }
  return found
}

const isMember = (stores: TaskToolStores, userId: string) =>
  stores.household.householdMembers.some((m) => m.user_id === userId)

const TASK_TYPES = Object.keys(TYPE_LABEL) as Task['task_type'][]

async function createTask(
  stores: TaskToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const title = String(input.title ?? '').trim()
  if (!title) return error('Kein Titel')
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    return error(`Titel zu lang: höchstens ${TASK_TITLE_MAX_LENGTH} Zeichen`)
  }
  const points = input.points
  if (typeof points !== 'number' || !isValidPoints(points, 'standard')) {
    return error(
      `Punkte fehlen oder sind ungültig (ganze Zahl 1 bis ${POINTS_MAX}). Frag den Nutzer danach.`,
    )
  }
  const type = input.task_type as Task['task_type']
  if (!TASK_TYPES.includes(type)) return error(`Unbekannter task_type ${String(type)}`)
  const recurrence = type === 'recurring' ? Number(input.recurrence_days) : 0
  if (type === 'recurring' && !(Number.isInteger(recurrence) && recurrence >= 1)) {
    return error(
      'Eine wiederkehrende Aufgabe braucht recurrence_days (alle wie viele Tage). Frag nach.',
    )
  }
  const assignee =
    typeof input.assigned_to === 'string' && input.assigned_to ? input.assigned_to : null
  if (assignee && !isMember(stores, assignee)) return error(`Unbekannte user_id ${assignee}`)

  await ensureLoaded(stores)
  // Wie die App: kein zweiter Zettel mit demselben Titel (→ CONTEXT.md „Duplikat").
  const existing = findDuplicateTask(stores.tasks.tasks, title)
  if (existing) {
    return error(
      `Nicht angelegt: „${existing.title}“ gibt es schon (id ${existing.task_id}, ` +
        `${stateOf(existing, stores.today())}). Nenne dem Nutzer diese Aufgabe.`,
    )
  }

  const created = await stores.tasks.createTask(
    {
      title,
      effort: points,
      task_type: type,
      recurrence_days: recurrence,
      ...(assignee ? { assigned_to: assignee } : {}),
    },
    QUIET,
  )
  if (!created) {
    return { ...error('Aufgabe nicht angelegt'), summary: `✗ Aufgabe nicht angelegt: ${title}` }
  }
  const id = created.task_id
  return changedTask(id, `Aufgabe angelegt (id ${id}).`, {
    summary: `✓ neue Aufgabe: ${created.title}`,
    // Weich gelöscht wie in der App; eine neue Aufgabe hat noch keinen Verlauf,
    // und hätte sie inzwischen einen, bliebe er stehen.
    undo: () => stores.tasks.deleteTask(id, QUIET),
  })
}

async function assignTask(
  stores: TaskToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const found = await findTask(stores, input)
  if (!('task_id' in found)) return found
  const userId = typeof input.user_id === 'string' && input.user_id ? input.user_id : null
  if (userId && !isMember(stores, userId)) return error(`Unbekannte user_id ${userId}`)
  // Ohne Zuständige gibt es nichts beizubehalten, wie im Dialog der App.
  const permanent = userId !== null && input.permanent === true
  const before = { assigned_to: found.assigned_to, permanent: found.assignment_permanent }
  const id = found.task_id
  if (!(await stores.tasks.assignTask(id, userId, permanent, QUIET))) {
    return { ...error('Nicht zugewiesen'), summary: `✗ nicht zugewiesen: ${found.title}` }
  }
  const who = userId ? memberName(stores, userId) : null
  return changedTask(
    id,
    who ? `${found.title} ist jetzt ${who} zugewiesen.` : `${found.title}: niemand zuständig.`,
    {
      summary: who ? `✓ ${found.title} → ${who}` : `✓ ${found.title}: niemand zuständig`,
      undo: () => stores.tasks.assignTask(id, before.assigned_to, before.permanent, QUIET),
    },
  )
}

/** `completed` und `postponed_until` von jetzt: was die Rücknahme zurückschreibt. */
const stateSnapshot = (task: Task) => ({
  task_id: task.task_id,
  completed: task.completed,
  postponed_until: task.postponed_until,
})

async function postponeTask(
  stores: TaskToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const found = await findTask(stores, input)
  if (!('task_id' in found)) return found
  if (!canPostpone(found)) {
    return error(
      'Tägliche Aufgaben und Projekte lassen sich nicht verschieben (tägliche setzen sich ' +
        'nachts selbst zurück, Projekte geraten nie in Verzug).',
    )
  }
  // Wie in der App: verschoben wird, was dran ist oder schon verschoben.
  if (found.completed && !found.postponed_until) {
    return error(`${found.title} ist erledigt und nicht dran; da gibt es nichts zu verschieben.`)
  }
  const today = stores.today()
  const target =
    typeof input.until === 'string' && input.until
      ? postponeTargetDate(found, 'custom', { customDate: input.until }, today)
      : postponeTargetDate(found, 'days', { customDays: Number(input.days) }, today)
  if (!target) {
    return error(`Kein gültiger Termin: frühestens morgen (${earliestPostponeDate(today)}).`)
  }
  const before = stateSnapshot(found)
  const id = found.task_id
  if (!(await stores.tasks.postponeTask(id, target, QUIET))) {
    return { ...error('Nicht verschoben'), summary: `✗ nicht verschoben: ${found.title}` }
  }
  const day = formatPostponeDate(target)
  return changedTask(id, `${found.title} verschoben auf ${day} (${target}).`, {
    summary: `✓ ${found.title} verschoben auf ${day}`,
    undo: () => stores.tasks.restoreTaskState(before),
  })
}

async function markTaskDirty(
  stores: TaskToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const found = await findTask(stores, input)
  if (!('task_id' in found)) return found
  if (!found.completed) return error(`${found.title} ist schon dran.`)
  const before = stateSnapshot(found)
  const id = found.task_id
  if (!(await stores.tasks.markAsDirty(id))) {
    return { ...error('Nicht zurückgesetzt'), summary: `✗ nicht wieder dreckig: ${found.title}` }
  }
  return changedTask(id, `${found.title} ist wieder dran; die Erledigungen bleiben im Verlauf.`, {
    summary: `✓ ${found.title} wieder dreckig`,
    undo: () => stores.tasks.restoreTaskState(before),
  })
}

/**
 * Löscht erst nach der Karte im Chat, und weich wie die App: die Aufgabe
 * verlässt die Wand, ihre Erledigungen bleiben im Verlauf und zählen weiter
 * (Wochenziel, Bilanz). Rückgängig leert `deleted_at` wieder, dieselbe Zeile ist
 * zurück. Ein hartes Löschen, das den Verlauf mitnähme, lehnt die Datenbank ab.
 */
async function deleteTask(
  stores: TaskToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const found = await findTask(stores, input)
  if (!('task_id' in found)) return found
  const { task_id: id, title } = found
  const history = await stores.tasks.fetchCompletions()
  const hasHistory = history.some((c) => c.task_id === id)
  return {
    result: 'Wartet auf die Bestätigung des Nutzers.',
    deleteCard: {
      what: `Aufgabe „${title}“${hasHistory ? '; ihre Erledigungen bleiben im Verlauf' : ''}`,
      confirm: async () => {
        if (!(await stores.tasks.deleteTask(id, QUIET))) {
          return { ...error('Nichts gelöscht.'), summary: `✗ Aufgabe nicht gelöscht: ${title}` }
        }
        const change: Change = {
          summary: `✓ Aufgabe gelöscht: ${title}`,
          // Scheitert, wenn inzwischen eine gleichnamige Aufgabe angelegt wurde (Duplikat).
          undo: () => stores.tasks.restoreTask(id),
        }
        return {
          result: `Aufgabe gelöscht (id ${id}); ihre Erledigungen bleiben im Verlauf.`,
          summary: change.summary,
          undo: change.undo,
          changes: [change],
        }
      },
    },
  }
}

/** So viele Erledigungen nennt `read_task_history`, wenn Claude keine Zahl angibt. */
const HISTORY_DEFAULT = 15
const HISTORY_MAX = 50

const when = (iso: string) => {
  const date = new Date(iso)
  const day = date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

async function readTaskHistory(
  stores: TaskToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const taskId = typeof input.task_id === 'string' && input.task_id ? input.task_id : null
  const asked = Number(input.limit)
  const limit =
    Number.isInteger(asked) && asked > 0 ? Math.min(asked, HISTORY_MAX) : HISTORY_DEFAULT
  // Neueste zuerst, wie im Verlauf.
  const all = await stores.tasks.fetchCompletions()
  const matching = all.filter((c) => !taskId || c.task_id === taskId)
  if (matching.length === 0) return { result: 'Keine Erledigungen.' }
  const lines = matching.slice(0, limit).map((c) => {
    const marks = [
      c.isQuick ? 'Quick-Aufgabe' : null,
      c.isDeleted && !c.isQuick ? 'Aufgabe inzwischen gelöscht' : null,
      c.completion_note ? `Notiz: ${c.completion_note}` : null,
    ].filter(Boolean)
    const extra = marks.length ? ` (${marks.join('; ')})` : ''
    return `- ${when(c.completed_at)} ${c.household_members.display_name}: ${c.tasks.title}, ${c.effort_override} Punkte${extra}`
  })
  const more = matching.length > limit ? `\n(${matching.length - limit} ältere nicht gezeigt)` : ''
  return { result: `Erledigungen, neueste zuerst:\n${lines.join('\n')}${more}` }
}

async function readWeeklyGoal(stores: TaskToolStores): Promise<ToolOutcome> {
  const h = stores.household
  await h.loadWeeklyCompletions()
  const since = h.currentWeekStart().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  })
  const shares = h.weeklyContributions.map((c) => `${c.name} ${c.points}`).join(', ')
  const left = h.weeklyGoalPoints - h.weeklyTotalPoints
  return {
    result:
      `Wochenziel: ${h.weeklyGoalPoints} Punkte. Diese Woche (seit ${since}): ` +
      `${h.weeklyTotalPoints} Punkte, davon ${shares}. ` +
      (left > 0 ? `Bis zum Ziel noch ${left} Punkte.` : 'Das Ziel ist erreicht.'),
  }
}

const TASK_ID = { type: 'string', description: 'ID der Aufgabe aus read_tasks' }

export const taskTools = (stores: TaskToolStores): AssistantTool[] => [
  {
    name: 'read_tasks',
    description:
      'Liest alle Aufgaben der Pinnwand mit ID, Typ, Punkten, wer zuständig ist und wie sie ' +
      'stehen (dran, überfällig, noch nie gemacht, erledigt, verschoben). Nutze es für Fragen wie ' +
      '„was ist dran“ und um die ID einer genannten Aufgabe zu finden.',
    input_schema: { type: 'object', properties: {} },
    execute: async () => readTasks(stores),
  },
  {
    name: 'read_task_history',
    description:
      'Liest den Verlauf: wer wann welche Aufgabe erledigt hat, mit Punkten und Notiz, neueste ' +
      'zuerst. Für Fragen wie „wer hat zuletzt das Bad geputzt“; mit task_id nur diese Aufgabe.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Optional: nur die Erledigungen dieser Aufgabe' },
        limit: {
          type: 'integer',
          description: `Wie viele Einträge höchstens (Standard ${HISTORY_DEFAULT}, höchstens ${HISTORY_MAX})`,
        },
      },
    },
    execute: (input) => readTaskHistory(stores, input),
  },
  {
    name: 'read_weekly_goal',
    description:
      'Liest das Wochenziel: Zielpunkte, Punkte der laufenden Woche, Anteil je Mitglied und was ' +
      'noch fehlt. Keine Rangliste: nenne die Anteile, nie wer vorn liegt.',
    input_schema: { type: 'object', properties: {} },
    execute: async () => readWeeklyGoal(stores),
  },
  {
    name: 'create_task',
    description:
      'Legt eine neue Aufgabe als Zettel an die Pinnwand. Wie in der App braucht sie Punkte; ' +
      'fehlen sie, frag nach. Eine wiederkehrende braucht recurrence_days; fehlt die Angabe, frag ' +
      'nach. Gibt es den Titel schon (Duplikat), lehnt das Werkzeug ab und nennt die bestehende.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titel der Aufgabe, z. B. „Fenster putzen“' },
        points: {
          type: 'integer',
          description: 'Standardpunkte, 1 Punkt ≈ 5 Minuten leichter Arbeit',
        },
        task_type: {
          type: 'string',
          enum: TASK_TYPES,
          description:
            'recurring = alle paar Tage wieder (recurrence_days nötig); daily = täglich; ' +
            'one-time = einmal; project = Projekt ohne Ende',
        },
        recurrence_days: { type: 'integer', description: 'Nur bei recurring: alle wie viele Tage' },
        assigned_to: {
          type: 'string',
          description: 'Optional: user_id des Mitglieds, das zuständig ist',
        },
      },
      required: ['title', 'points', 'task_type'],
    },
    execute: (input) => createTask(stores, input),
  },
  {
    name: 'assign_task',
    description:
      'Weist eine Aufgabe einem Mitglied zu („Anna macht das Bad“, „ich übernehme den Müll“) ' +
      'oder nimmt die Zuweisung weg (user_id leer).',
    input_schema: {
      type: 'object',
      properties: {
        task_id: TASK_ID,
        user_id: {
          type: 'string',
          description: 'user_id aus der Übersicht; leer = niemand zuständig',
        },
        permanent: {
          type: 'boolean',
          description:
            'true = bleibt auch nach dem Erledigen zuständig („immer“, „dauerhaft“); sonst nur bis dahin',
        },
      },
      required: ['task_id', 'user_id'],
    },
    execute: (input) => assignTask(stores, input),
  },
  {
    name: 'postpone_task',
    description:
      'Verschiebt eine Aufgabe, die dran ist: bis zum Termin ist sie aus dem Weg, ohne ' +
      'Erledigung und ohne Punkte. Termin frühestens morgen. Nicht für tägliche Aufgaben und ' +
      'Projekte. Gib entweder until oder days an.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: TASK_ID,
        until: { type: 'string', description: 'Datum YYYY-MM-DD, an dem sie wieder dran ist' },
        days: { type: 'integer', description: 'Oder: in wie vielen Tagen ab heute' },
      },
      required: ['task_id'],
    },
    execute: (input) => postponeTask(stores, input),
  },
  {
    name: 'mark_task_dirty',
    description:
      'Wieder dreckig: setzt eine erledigte oder verschobene Aufgabe wieder auf dran. Die ' +
      'Punkte und der Verlauf bleiben; es nimmt keine Erledigung zurück.',
    input_schema: { type: 'object', properties: { task_id: TASK_ID }, required: ['task_id'] },
    execute: (input) => markTaskDirty(stores, input),
  },
  {
    name: 'delete_task',
    description:
      'Löscht eine Aufgabe von der Pinnwand; ihre Erledigungen bleiben im Verlauf. Vor dem ' +
      'Löschen zeigt die App dem Nutzer eine Karte mit „Löschen“ und „Abbrechen“; frag darum nicht ' +
      'selbst nach, und melde das Löschen erst, wenn das Ergebnis es bestätigt.',
    input_schema: { type: 'object', properties: { task_id: TASK_ID }, required: ['task_id'] },
    execute: (input) => deleteTask(stores, input),
  },
]
