/**
 * Richtwert (→ CONTEXT.md): eine Punktzahl des Haushalts mit Beispielaufgaben.
 * `is_quick_option` macht ihn zur Schnelloption, einem Knopf in jeder Punktwahl.
 * Tabelle `point_benchmarks`, Migration 20261119120000.
 */
export interface PointBenchmark {
  benchmark_id: string
  household_id: string
  points: number
  is_quick_option: boolean
  examples: string[]
  created_at: string
}
