import type { Task } from '@/types/Task'
import type { PointBenchmark } from '@/types/PointBenchmark'

/**
 * **unbewertet** (CONTEXT.md § unbewertet): die Aufgabe hat keine Standardpunkte.
 * Sie lässt sich nicht erledigen, ohne erst bewertet zu werden — jeder Weg zum
 * Erledigen öffnet zuerst die Punktwahl. Dieselbe Regel prüft die Edge Function
 * `complete-task` (Parameter `standardPoints`); wer eine ändert, ändert beide.
 */
export function isUnrated(task: Pick<Task, 'effort'>): boolean {
  return task.effort === null
}

/**
 * Punkte, die das Erledigen einer Hauptaufgabe voraussichtlich bringt: ihr Aufwand
 * abzüglich der schon erledigten `deduct`-Unteraufgaben, nie unter null.
 * Eine unbewertete `deduct`-Unteraufgabe zieht nichts ab: erledigt sein kann sie
 * nur bewertet, die Absicherung gilt dem Zwischenstand beim Laden.
 *
 * Verbindlich rechnet die Edge Function `complete-task`; das hier ist die Schätzung
 * für fliegende Zahl, Zettel-Fußzeile, Fetzen und Wochenbalken. Alle lesen sie von
 * hier, damit nirgends eine andere Zahl steht, als dann in den Balken wandert.
 */
export function estimateParentPoints(effort: number, subtasks: readonly Task[]): number {
  const deductSum = subtasks
    .filter((s) => s.completed && s.subtask_points_mode === 'deduct')
    .reduce((sum, s) => sum + (s.effort ?? 0), 0)
  return Math.max(0, effort - deductSum)
}

/**
 * Punkte, die eine Erledigung voraussichtlich bringt — die eine Schätzung für
 * Wochenbalken, fliegende Zahl und Fetzen. `effortOverride` (angepasste Punkte)
 * ersetzt die Rechnung; `standardPoints` (erstes Bewerten) tritt an die Stelle
 * der fehlenden Standardpunkte. Eine Unteraufgabe bringt ihre Standardpunkte,
 * eine `checklist`-Unteraufgabe nichts; eine Hauptaufgabe rechnet über
 * `estimateParentPoints` mit ihren Unteraufgaben (`subtasks`).
 */
export function estimateCompletionPoints(
  task: Pick<Task, 'effort' | 'parent_task_id' | 'subtask_points_mode'>,
  subtasks: readonly Task[],
  options: { effortOverride?: number; standardPoints?: number } = {},
): number {
  if (options.effortOverride !== undefined) return options.effortOverride
  const effort = task.effort ?? options.standardPoints ?? 0
  if (task.parent_task_id !== null) {
    return task.subtask_points_mode === 'checklist' ? 0 : effort
  }
  return estimateParentPoints(effort, subtasks)
}

/** Obergrenze jeder Punktzahl — fängt Tippfehler wie „50000“ ab. Dieselbe Zahl wie die CHECKs der Migration 20261119120000. */
export const POINTS_MAX = 999

/**
 * Wofür eine Punktzahl steht: `standard` = **Standardpunkte** einer Aufgabe
 * (auch Quick-Aufgabe und Unteraufgabe), `completion` = Punkte einer Erledigung.
 */
export type PointsKind = 'standard' | 'completion'

/**
 * Gültige Punktzahl: ganzzahlig, Standardpunkte 1–999, Erledigung 0–999 (eine
 * Erledigung darf nichts zählen, eine Aufgabe nicht). Dieselben Grenzen prüfen
 * die CHECKs auf `tasks.effort` und `task_completions.effort_override`.
 */
export function isValidPoints(value: number, kind: PointsKind): boolean {
  const min = kind === 'standard' ? 1 : 0
  return Number.isInteger(value) && value >= min && value <= POINTS_MAX
}

/** Punktzahlen der **Schnelloptionen** — die Knöpfe der Punktwahl, aufsteigend. */
export function quickOptions(benchmarks: readonly PointBenchmark[]): number[] {
  return benchmarks
    .filter((b) => b.is_quick_option)
    .map((b) => b.points)
    .sort((a, b) => a - b)
}

/**
 * Vorauswahl im Erledigungs-Dialog („Punkte anpassen“). Haben die
 * Standardpunkte einen Knopf, ist er markiert und nichts gewählt — man tippt
 * bewusst. Ohne Knopf (z. B. 7) wäre der Standard nirgends zu sehen; dann steht
 * er von Anfang an gewählt im freien Feld. Unbewertet: nichts.
 */
export function initialCompletionPoints(
  standardPoints: number | null,
  quickOptionPoints: readonly number[],
): number | null {
  if (standardPoints === null || quickOptionPoints.includes(standardPoints)) return null
  return standardPoints
}

/**
 * Beispiele zu einer Punktzahl: die des **Richtwerts** mit genau dieser Zahl —
 * auch wenn er keine Schnelloption ist und die Zahl ins freie Feld getippt
 * wurde. Ohne Richtwert zu dieser Zahl keine; es wird nicht zum nächsten gerundet.
 */
export function examplesFor(
  benchmarks: readonly PointBenchmark[],
  points: number | null,
): readonly string[] {
  if (points === null) return []
  return benchmarks.find((b) => b.points === points)?.examples ?? []
}

/** Titel der Unteraufgabe eines Projekts, über die Projekt-Arbeit gebucht wird. */
const PROJECT_WORK_TITLE = 'Am Projekt arbeiten'

/**
 * **Projekt-Arbeit**: die Unteraufgabe „Am Projekt arbeiten“ eines Projekts —
 * und nur sie. Das Projekt selbst und seine anderen Unteraufgaben sind
 * gewöhnliche Aufgaben. Dieselbe Regel prüft die Edge Function `complete-task`
 * (Titel und Typ des Elternknotens); wer eine ändert, ändert beide.
 */
export function isProjectWork(input: { title: string; parentTaskType: string | null }): boolean {
  return input.parentTaskType === 'project' && input.title === PROJECT_WORK_TITLE
}

/**
 * Die Zeile für „Am Projekt arbeiten“, die jedes neue Projekt bekommt. Sie
 * entsteht **unbewertet**: die erste Projekt-Arbeit fragt nach ihren Punkten,
 * und diese Wahl wird ihr Standard (Story 29). Täglich, damit sie nie
 * wiederkehrt und immer buchbar ist; `bonus`, weil Arbeit Punkte gibt.
 */
export function newProjectWorkSubtask(input: { projectTaskId: string; householdId: string }) {
  return {
    title: PROJECT_WORK_TITLE,
    effort: null,
    recurrence_days: 0,
    task_type: 'daily' as const,
    subtask_points_mode: 'bonus' as const,
    parent_task_id: input.projectTaskId,
    order_index: 0,
    household_id: input.householdId,
  }
}

/**
 * Wie eine Erledigung entsteht: `task` = eine Aufgabe mit Standardpunkten
 * (Abreißen, Erledigungs-Dialog, Suche), `project` = Projekt-Arbeit
 * (`isProjectWork`, Arbeitsfenster), `quick` = Quick-Aufgabe.
 */
export type CompletionKind = 'task' | 'project' | 'quick'

/**
 * **Abweichung** — und damit „braucht Begründung?“ (CONTEXT.md § Abweichung):
 * eine Erledigung zählt andere Punkte als die Standardpunkte der Aufgabe.
 *
 * Nie eine Abweichung, weil es keinen Standard gibt, von dem man abwiche:
 * Projekt-Arbeit (nur die Unteraufgabe „Am Projekt arbeiten“, → `isProjectWork`;
 * Projekt und andere Unteraufgaben sind `task`), Quick-Aufgabe und das erste Bewerten einer **unbewerteten**
 * Aufgabe (`standardPoints === null`). Solange nichts gewählt ist
 * (`chosenPoints === null`), auch nicht — die Punktwahl sperrt dann ohnehin.
 *
 * Dieselbe Regel prüft die Edge Function `complete-task`; wer eine ändert,
 * ändert beide.
 */
export function isDeviation(input: {
  standardPoints: number | null
  chosenPoints: number | null
  kind: CompletionKind
}): boolean {
  const { standardPoints, chosenPoints, kind } = input
  if (kind !== 'task' || standardPoints === null || chosenPoints === null) return false
  return chosenPoints !== standardPoints
}
