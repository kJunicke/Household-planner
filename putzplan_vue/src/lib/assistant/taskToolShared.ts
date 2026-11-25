/**
 * Was die Aufgaben-Werkzeuge (`taskTools.ts`, `taskCompleteTools.ts`) gemeinsam
 * haben: Aufgaben laden, das Ergebnis einer rücknehmbaren Änderung an der
 * Pinnwand, die Titelprüfung und die Bausteine der Eingabeschemata.
 */
import type { useTaskStore } from '@/stores/taskStore'
import type { Task } from '@/types/Task'
import { TASK_TITLE_MAX_LENGTH } from '@/lib/limits'
import { undoAll, type ChangedEntry, type Change, type ToolOutcome } from './tools'

/** Ohne den Erfolgs-Toast des Stores: den Toast mit Rückgängig zeigt der Chat. */
export const QUIET = { quiet: true }

export const WALL = { area: 'wall' } as const

export const TASK_ID = { type: 'string', description: 'ID der Aufgabe aus read_tasks' }

/** Die Pinnwand lädt die Aufgaben; ist der Chat woanders geöffnet, fehlen sie noch. */
export async function loadedTasks(
  store: Pick<ReturnType<typeof useTaskStore>, 'tasks' | 'loadTasks'>,
): Promise<Task[]> {
  if (store.tasks.length === 0) await store.loadTasks()
  return store.tasks
}

/**
 * Ein Ergebnis aus genau einer rücknehmbaren Änderung. `shown` ist der Eintrag,
 * zu dem die App führt und der beim Schließen aufleuchtet: meist der Zettel an
 * der Pinnwand.
 */
export function changedTask(result: string, change: Change, shown: ChangedEntry): ToolOutcome {
  return {
    result,
    summary: change.summary,
    undo: undoAll([change.undo]),
    changed: [shown],
    changes: [change],
  }
}

/** Ein Tag für Claude, z. B. „Sonntag, 22. November“; die Übersicht nennt das heutige Datum. */
export const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })

/** Das Fehlerergebnis für Claude, wenn der Titel leer oder zu lang ist; sonst `null`. */
export function invalidTitle(title: string, empty: string): ToolOutcome | null {
  if (!title) return { result: empty, isError: true }
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    return { result: `Titel zu lang: höchstens ${TASK_TITLE_MAX_LENGTH} Zeichen`, isError: true }
  }
  return null
}
