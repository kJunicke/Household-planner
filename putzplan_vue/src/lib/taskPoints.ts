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

/**
 * Wie eine Erledigung entsteht: `task` = eine Aufgabe mit Standardpunkten
 * (Abreißen, Erledigungs-Dialog, Suche), `project` = Arbeit an einem Projekt,
 * `quick` = Quick-Aufgabe.
 */
export type CompletionKind = 'task' | 'project' | 'quick'

/**
 * **Abweichung** — und damit „braucht Begründung?“ (CONTEXT.md § Abweichung):
 * eine Erledigung zählt andere Punkte als die Standardpunkte der Aufgabe.
 *
 * Nie eine Abweichung, weil es keinen Standard gibt, von dem man abwiche:
 * Projekt-Arbeit, Quick-Aufgabe und das erste Bewerten einer **unbewerteten**
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
