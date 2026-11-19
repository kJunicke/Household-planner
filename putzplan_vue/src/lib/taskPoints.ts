import type { Task } from '@/types/Task'
import type { PointBenchmark } from '@/types/PointBenchmark'

/**
 * Punkte, die das Erledigen einer Hauptaufgabe voraussichtlich bringt: ihr Aufwand
 * abzüglich der schon erledigten `deduct`-Unteraufgaben, nie unter null.
 *
 * Verbindlich rechnet die Edge Function `complete-task`; das hier ist die Schätzung
 * für fliegende Zahl, Zettel-Fußzeile, Fetzen und Wochenbalken. Alle lesen sie von
 * hier, damit nirgends eine andere Zahl steht, als dann in den Balken wandert.
 */
export function estimateParentPoints(effort: number, subtasks: readonly Task[]): number {
  const deductSum = subtasks
    .filter((s) => s.completed && s.subtask_points_mode === 'deduct')
    .reduce((sum, s) => sum + s.effort, 0)
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
