import type { Task } from '@/types/Task'

/**
 * Großbuchstaben, die beim Vergleich klein werden — und nur diese.
 *
 * **Dieselbe Tabelle steht im eindeutigen Index der Datenbank** (Migration
 * `20261118120000_unique_task_titles`, `translate(…)`). Bewusst eine feste Tabelle
 * statt `toLowerCase()`/`lower()`: `lower()` hängt in Postgres an der Locale der
 * Datenbank, `toLowerCase()` kennt Sonderfälle wie `İ`. Mit der Tabelle sind beide
 * Seiten Zeichen für Zeichen gleich, wo immer die Datenbank läuft.
 */
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ'
const LOWER = 'abcdefghijklmnopqrstuvwxyzäöü'

/**
 * Wann zwei Titel als gleich gelten (→ CONTEXT.md „Duplikat"): ASCII-Leerraum am Rand
 * entfernt und innen zu einem Leerzeichen zusammengezogen, Groß-/Kleinschreibung nach
 * `UPPER`/`LOWER` ignoriert.
 *
 * Leerraum ist eine **ausdrückliche** ASCII-Klasse statt `\s`/`trim()` — aus demselben
 * Grund wie die Tabelle: die Klasse hier und die im Index sind dieselbe. Wer eine
 * Seite ändert, ändert beide.
 *
 * Wer einen Titel vergleicht, der danach mit `trim()` gespeichert wird, vergleicht den
 * **getrimmten**: `trim()` entfernt mehr als diese Regel (etwa geschützte Leerzeichen),
 * und verglichen werden muss, was in der Datenbank ankommt.
 */
export function normalizeTaskTitle(title: string): string {
  return title
    .replace(/[ \t\n\r\f\v]+/g, ' ')
    .replace(/^ | $/g, '')
    .replace(/[A-ZÄÖÜ]/g, (ch) => LOWER[UPPER.indexOf(ch)]!)
}

/**
 * Die bestehende Hauptaufgabe, die denselben Titel trägt — oder `undefined`.
 *
 * Verglichen werden nur Hauptaufgaben, die nicht gelöscht sind: Unteraufgaben
 * dürfen sich wiederholen („Am Projekt arbeiten" steht an jedem Projekt), und
 * Quick-Aufgaben sind gelöscht angelegt (→ CONTEXT.md „Quick-Aufgabe").
 * `exceptId` nimmt beim Umbenennen die Aufgabe selbst aus.
 */
export function findDuplicateTask(
  tasks: readonly Task[],
  title: string,
  exceptId?: string,
): Task | undefined {
  const needle = normalizeTaskTitle(title)
  if (!needle) return undefined
  return tasks.find(
    (task) =>
      task.parent_task_id === null &&
      task.deleted_at === null &&
      task.task_id !== exceptId &&
      normalizeTaskTitle(task.title) === needle,
  )
}
