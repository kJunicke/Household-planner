import type { Task } from '@/types/Task'

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
