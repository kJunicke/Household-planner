/**
 * Die Werkzeuge des Assistenten zum Erledigen: eine Aufgabe erledigen und eine
 * **Quick-Aufgabe** verbuchen, mit denselben Regeln wie von Hand.
 *
 * - Immer als der, der fragt: erledigt wird über `taskStore.completeTask`, also
 *   die Edge Function `complete-task` mit der Anmeldung des Nutzers. Ein
 *   Werkzeug für einen anderen gibt es nicht.
 * - Eine **unbewertete** Aufgabe wird nicht ohne Punkte erledigt: das Werkzeug
 *   weist ab und sagt Claude, dass es fragen soll; der genannte Wert werden
 *   ihre **Standardpunkte**.
 * - Eine **Abweichung** braucht eine Begründung; fehlt sie, weist es ab.
 * - Rückgängig ist **Zurückkleben**: die Erledigung verschwindet aus der
 *   Historie, die Punkte aus dem Wochenziel. Mehr Historie löscht kein
 *   Werkzeug.
 */
import type { useTaskStore } from '@/stores/taskStore'
import type { Task } from '@/types/Task'
import {
  estimateCompletionPoints,
  isProjectWork,
  isUnrated,
  isValidPoints,
  POINTS_MAX,
  type PointsKind,
} from '@/lib/taskPoints'
import { TASK_TITLE_MAX_LENGTH } from '@/lib/limits'
import { undoAll, type AssistantTool, type Change, type ToolOutcome } from './tools'

/**
 * Der Teil des taskStore, den die Werkzeuge brauchen. Hereingereicht statt
 * selbst geholt, damit die Tests einen gefälschten Store geben können.
 */
export type TaskCompleteToolStore = Pick<
  ReturnType<typeof useTaskStore>,
  | 'tasks'
  | 'loadTasks'
  | 'completeTask'
  | 'undoTicketOf'
  | 'undoCompletion'
  | 'createQuickTask'
  | 'deleteCompletion'
>

const QUIET = { quiet: true }

/** Ein Ergebnis aus genau einer rücknehmbaren Änderung. */
function changed(result: string, change: Change): ToolOutcome {
  return { result, summary: change.summary, undo: undoAll([change.undo]), changes: [change] }
}

/** Die Pinnwand lädt die Aufgaben; ist der Chat woanders geöffnet, fehlen sie noch. */
async function loadedTasks(store: TaskCompleteToolStore): Promise<Task[]> {
  if (store.tasks.length === 0) await store.loadTasks()
  return store.tasks
}

/** Wie eine Aufgabe in der Suche für Claude steht: Name, ID, Punkte, Stand. */
function taskLine(task: Task, parent: Task | undefined): string {
  const name = parent ? `${task.title}, Unteraufgabe von „${parent.title}“` : task.title
  if (task.task_type === 'project') {
    return `- ${name} (id ${task.task_id}): Projekt, Arbeit daran mit complete_task und points`
  }
  const points = isUnrated(task) ? 'unbewertet' : `${task.effort} Standardpunkte`
  let state = 'dran'
  if (task.task_type === 'daily') state = 'täglich, immer dran'
  else if (task.completed && task.postponed_until) state = `verschoben bis ${task.postponed_until}`
  else if (task.completed) {
    state = task.last_completed_at ? `erledigt ${dateOf(task.last_completed_at)}` : 'erledigt'
  }
  return `- ${name} (id ${task.task_id}): ${points}, ${state}`
}

/**
 * Sucht Aufgaben über ein Wort ihres Titels oder des Titels ihrer Hauptaufgabe;
 * ohne Suchwort alle. Die Zeilen „Am Projekt arbeiten“ stehen nicht darin: Arbeit
 * am Projekt bucht complete_task am Projekt selbst.
 */
async function findTasks(store: TaskCompleteToolStore, input: Record<string, unknown>) {
  const tasks = await loadedTasks(store)
  const words = String(input.query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  const parentOf = (t: Task) => tasks.find((p) => p.task_id === t.parent_task_id)
  const lines = tasks
    .filter(
      (t) => !isProjectWork({ title: t.title, parentTaskType: parentOf(t)?.task_type ?? null }),
    )
    .filter((t) => {
      const text = `${t.title} ${parentOf(t)?.title ?? ''}`.toLowerCase()
      return words.length === 0 || words.some((w) => text.includes(w))
    })
    .map((t) => taskLine(t, parentOf(t)))
  if (lines.length === 0) return { result: `Keine Aufgabe passt zu „${String(input.query)}“.` }
  return { result: `Aufgaben:\n${lines.join('\n')}` }
}

/** `input.points` als gültige Punktzahl, `undefined` ohne, `null` bei einer ungültigen. */
function pointsOf(input: Record<string, unknown>, kind: PointsKind): number | undefined | null {
  if (input.points === undefined || input.points === null) return undefined
  const points = Number(input.points)
  return isValidPoints(points, kind) ? points : null
}

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })

const invalidPoints = (kind: PointsKind): ToolOutcome => ({
  result: `Punkte müssen eine ganze Zahl von ${kind === 'standard' ? 1 : 0} bis ${POINTS_MAX} sein.`,
  isError: true,
})

async function completeTask(
  store: TaskCompleteToolStore,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const id = String(input.task_id ?? '')
  const tasks = await loadedTasks(store)
  const task = tasks.find((t) => t.task_id === id)
  if (!task) return { result: `Unbekannte task_id ${id}`, isError: true }
  const work = projectWorkOf(tasks, task)
  if (work) return logProjectWork(store, work.project, work.subtask, input)
  // Erledigt und nicht nur verschoben: ein zweites Mal zählte doppelt. Von Hand
  // geht es (lose Zettel in der Suche), also auf ausdrücklichen Wunsch auch hier.
  if (task.completed && !task.postponed_until && input.again !== true) {
    const when = task.last_completed_at ? ` (zuletzt ${dateOf(task.last_completed_at)})` : ''
    return {
      result:
        `„${task.title}“ ist schon erledigt${when}. Erledige sie nur noch einmal, wenn der ` +
        'Nutzer sagt, dass er sie seitdem wieder gemacht hat: dann mit again.',
      isError: true,
    }
  }
  const subtasks = tasks.filter((t) => t.parent_task_id === id)
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  const completionNote = note || undefined

  if (isUnrated(task)) {
    const standardPoints = pointsOf(input, 'standard')
    if (standardPoints === null) return invalidPoints('standard')
    if (standardPoints === undefined) {
      return {
        result:
          `„${task.title}“ ist noch unbewertet und lässt sich ohne Punkte nicht erledigen. ` +
          'Frag den Nutzer, wie viele Punkte sie wert ist; der Wert werden ihre Standardpunkte ' +
          'für jede künftige Erledigung. Mit seiner Antwort rufst du complete_task mit points auf.',
        isError: true,
      }
    }
    const points = estimateCompletionPoints(task, subtasks, { standardPoints })
    return complete(
      store,
      task,
      { standardPoints, completionNote },
      points,
      `${points} P, ab jetzt Standard`,
    )
  }

  const chosen = pointsOf(input, 'completion')
  if (chosen === null) return invalidPoints('completion')
  if (chosen !== undefined && chosen !== task.effort) {
    // Abweichung (CONTEXT.md): andere Punkte nur mit Begründung, wie im
    // Erledigungs-Dialog; die Edge Function prüft dieselbe Regel.
    if (!note) {
      return {
        result:
          `„${task.title}“ zählt sonst ${task.effort} Punkte. Für ${chosen} braucht es eine ` +
          'Begründung (warum diesmal mehr oder weniger). Frag den Nutzer danach und ruf ' +
          'complete_task dann mit points und note auf.',
        isError: true,
      }
    }
    return complete(
      store,
      task,
      { effortOverride: chosen, completionNote },
      chosen,
      `${chosen} P statt ${task.effort}`,
    )
  }

  const points = estimateCompletionPoints(task, subtasks)
  return complete(store, task, { completionNote }, points, `${points} P`)
}

/** Projekt und seine Zeile „Am Projekt arbeiten“, wenn `task` eines von beiden ist. */
function projectWorkOf(tasks: Task[], task: Task): { project: Task; subtask: Task } | null {
  const project =
    task.task_type === 'project' ? task : tasks.find((t) => t.task_id === task.parent_task_id)
  if (project?.task_type !== 'project') return null
  const subtask = tasks.find(
    (t) =>
      t.parent_task_id === project.task_id &&
      isProjectWork({ title: t.title, parentTaskType: 'project' }),
  )
  if (!subtask || (task !== project && task !== subtask)) return null
  return { project, subtask }
}

/**
 * **Projekt-Arbeit**: ein Projekt wird nie fertig, Arbeit daran bucht Punkte auf
 * seine Zeile „Am Projekt arbeiten“, wie das Fenster am Zettel. Die Punkte nennt
 * der Nutzer; eine Begründung braucht es nicht. Die erste Arbeit macht sie zur
 * Vorauswahl (Standardpunkte der Zeile), die Rücknahme auch das wieder.
 */
async function logProjectWork(
  store: TaskCompleteToolStore,
  project: Task,
  subtask: Task,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const points = pointsOf(input, 'standard')
  if (points === null) return invalidPoints('standard')
  if (points === undefined) {
    return {
      result:
        `Arbeit am Projekt „${project.title}“ zählt so viele Punkte, wie der Nutzer sagt. Frag ` +
        'ihn, wie viele es waren, und ruf complete_task dann mit points auf.',
      isError: true,
    }
  }
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  const result = await complete(
    store,
    subtask,
    {
      effortOverride: points,
      completionNote: note || undefined,
      standardPoints: isUnrated(subtask) ? points : undefined,
    },
    points,
    `${points} P`,
  )
  if (result.isError) return { ...result, summary: `✗ nicht gebucht: ${project.title}` }
  const summary = `✓ Projekt-Arbeit: ${project.title} (+${points} P)`
  return {
    ...result,
    result: `Arbeit am Projekt „${project.title}“ gebucht, ${points} Punkte für dich. Das Projekt bleibt offen.`,
    summary,
    changes: result.changes!.map((c) => ({ ...c, summary })),
  }
}

/**
 * Erledigt über den Store, wie von Hand; die Rücknahme ist Zurückkleben und
 * nimmt ein erstes Bewerten mit zurück.
 */
async function complete(
  store: TaskCompleteToolStore,
  task: Task,
  options: Parameters<TaskCompleteToolStore['completeTask']>[1],
  points: number,
  pointsText: string,
): Promise<ToolOutcome> {
  const id = task.task_id
  if (!(await store.completeTask(id, options))) {
    return {
      result: 'Nicht erledigt',
      isError: true,
      summary: `✗ nicht erledigt: ${task.title}`,
    }
  }
  // Nur genau diese Erledigung zurücknehmen: hat eine neuere derselben Aufgabe
  // den Fahrschein ersetzt, bleibt alles stehen (→ `undoTicketOf`).
  const ticket = store.undoTicketOf(id)
  const restoreRating = options?.standardPoints !== undefined
  return changed(`Erledigt: „${task.title}“, ${points} Punkte für dich.`, {
    summary: `✓ erledigt: ${task.title} (+${pointsText})`,
    undo: async () =>
      store.undoTicketOf(id) === ticket && store.undoCompletion(id, { restoreRating }),
  })
}

/**
 * Eine **Quick-Aufgabe**: etwas Erledigtes ohne Zettel, mit Titel und Punkten
 * wie im Fenster „Quick-Aufgabe“. Die Rücknahme löscht genau ihre Erledigung,
 * so wie Zurückkleben; die Aufgabe dazu ist ohnehin gelöscht angelegt.
 */
async function logQuickTask(
  store: TaskCompleteToolStore,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) return { result: 'Ohne Titel keine Quick-Aufgabe', isError: true }
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    return { result: `Titel zu lang: höchstens ${TASK_TITLE_MAX_LENGTH} Zeichen`, isError: true }
  }
  const points = pointsOf(input, 'standard')
  if (points === null) return invalidPoints('standard')
  if (points === undefined) {
    return {
      result:
        'Eine Quick-Aufgabe braucht Punkte. Frag den Nutzer, wie viele Punkte sie wert war, ' +
        'und ruf log_quick_task dann mit points auf.',
      isError: true,
    }
  }
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  const booked = await store.createQuickTask(
    { title, effort: points, note: note || undefined },
    QUIET,
  )
  if (!booked) {
    return {
      result: 'Quick-Aufgabe nicht verbucht',
      isError: true,
      summary: `✗ Quick-Aufgabe nicht verbucht: ${title}`,
    }
  }
  return changed(`Quick-Aufgabe verbucht: „${title}“, ${points} Punkte für dich.`, {
    summary: `✓ Quick-Aufgabe: ${title} (+${points} P)`,
    undo: () => store.deleteCompletion(booked.completionId, QUIET),
  })
}

const TASK_ID = { type: 'string', description: 'ID der Aufgabe aus find_task_to_complete' }

export const taskCompleteTools = (store: TaskCompleteToolStore): AssistantTool[] => [
  {
    name: 'find_task_to_complete',
    description:
      'Sucht Aufgaben der Pinnwand über ein Wort ihres Titels (z. B. „Bad“) und nennt ID, ' +
      'Standardpunkte (oder unbewertet) und ob sie dran oder erledigt ist. Ohne query alle. ' +
      'Nutze es, bevor du eine Aufgabe erledigst; passen mehrere, frag nach.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Ein Wort aus dem Titel, z. B. „Bad“' },
      },
    },
    execute: (input) => findTasks(store, input),
  },
  {
    name: 'complete_task',
    description:
      'Erledigt eine Aufgabe der Pinnwand für den, der fragt, wie das Abreißen in der App: ' +
      'die Punkte gehen in sein Wochenziel, die Erledigung in die Historie. Immer als der, der ' +
      'fragt, nie für ein anderes Mitglied. Nenne points nur, wenn der Nutzer Punkte nennt; ' +
      'weist das Werkzeug ab, weil Punkte oder eine Begründung fehlen, frag den Nutzer danach.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: TASK_ID,
        points: {
          type: 'integer',
          description:
            'Nur wenn der Nutzer Punkte nennt. Bei einer unbewerteten Aufgabe Pflicht: sie ' +
            'werden ihre Standardpunkte.',
        },
        note: {
          type: 'string',
          description:
            'Notiz zur Erledigung. Pflicht, wenn points von den Standardpunkten abweicht: dann ' +
            'die Begründung des Nutzers, nie eine erfundene.',
        },
        again: {
          type: 'boolean',
          description:
            'Nur wenn die Aufgabe schon erledigt ist und der Nutzer sie seitdem noch einmal gemacht hat.',
        },
      },
      required: ['task_id'],
    },
    execute: (input) => completeTask(store, input),
  },
  {
    name: 'log_quick_task',
    description:
      'Verbucht eine Quick-Aufgabe für den, der fragt: etwas Erledigtes, das nicht als Aufgabe ' +
      'an der Pinnwand hängt („ich hab den Keller aufgeräumt, 8 Punkte“), mit Titel und Punkten. ' +
      'Hängt es als Aufgabe an der Pinnwand, nimm complete_task. Nennt der Nutzer keine Punkte, ' +
      'frag danach. Nie für ein anderes Mitglied.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Was erledigt wurde, kurz, z. B. „Keller aufräumen“',
        },
        points: { type: 'integer', description: 'Punkte, die der Nutzer genannt hat (1 bis 999)' },
        note: { type: 'string', description: 'Optionale Notiz des Nutzers' },
      },
      required: ['title', 'points'],
    },
    execute: (input) => logQuickTask(store, input),
  },
]
