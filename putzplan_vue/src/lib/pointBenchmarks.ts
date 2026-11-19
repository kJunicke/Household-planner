import type { PointBenchmark } from '@/types/PointBenchmark'
import { POINTS_MAX, isValidPoints } from './taskPoints'

/**
 * Pflege der **Richtwerte** (→ CONTEXT.md) in den Einstellungen: was eine
 * Eingabe gültig macht, bevor sie die Datenbank erreicht. Die Grenzen sind
 * dieselben wie in der Tabelle `point_benchmarks` (Migration 20261119120000);
 * die Datenbank prüft sie ein zweites Mal.
 */

type Parsed<K extends string, T> = { [key in K]: T } | { error: string }

/**
 * Punktzahl für einen neuen Richtwert: ganzzahlig 1–999 und im Haushalt noch
 * nicht vergeben (UNIQUE (household_id, points)) — auch nicht von einem
 * Richtwert ohne Schnelloption, sonst verteilten sich Beispiele auf zwei Einträge.
 */
export function parseBenchmarkPoints(
  benchmarks: readonly PointBenchmark[],
  text: string,
): Parsed<'points', number> {
  const trimmed = text.trim()
  if (trimmed === '') return { error: 'Bitte eine Punktzahl eintragen' }
  const value = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
  if (!isValidPoints(value, 'standard')) {
    return { error: `Nur ganze Zahlen von 1 bis ${POINTS_MAX}` }
  }
  if (benchmarks.some((b) => b.points === value)) {
    return { error: duplicatePointsMessage(value) }
  }
  return { points: value }
}

/** Höchstzahl der Beispiele je Richtwert — CHECK `point_benchmarks_examples_size`. */
const EXAMPLES_MAX_COUNT = 50
/** Höchstzahl der Zeichen aller Beispiele eines Richtwerts zusammen — derselbe CHECK. */
const EXAMPLES_MAX_TOTAL_LENGTH = 5000

/**
 * Beispiele aus dem Eingabefeld: eine Aufgabe je Zeile, Rand-Leerraum weg,
 * leere Zeilen fallen weg. Leerer Text heißt „keine Beispiele“.
 */
export function parseExamples(text: string): Parsed<'examples', string[]> {
  const examples = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  if (examples.length > EXAMPLES_MAX_COUNT) {
    return { error: `Höchstens ${EXAMPLES_MAX_COUNT} Beispiele` }
  }
  const totalLength = examples.reduce((sum, e) => sum + e.length, 0)
  if (totalLength > EXAMPLES_MAX_TOTAL_LENGTH) {
    return {
      error: `Höchstens ${EXAMPLES_MAX_TOTAL_LENGTH} Zeichen in allen Beispielen zusammen`,
    }
  }
  return { examples }
}

/** Meldung für eine schon vergebene Punktzahl — auch, wenn erst der Server sie meldet. */
export function duplicatePointsMessage(points: number): string {
  return `Einen Richtwert für ${points} Punkte gibt es schon`
}
