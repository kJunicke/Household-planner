import type { Task } from '@/types/Task'
import { findDuplicateTask } from './taskDuplicates'

/**
 * Die **Suche** der Pinnwand als reine Funktion: welche Zettel bleiben an der
 * Wand stehen, wenn ein Suchbegriff eingegeben ist (→ CONTEXT.md „Suche",
 * „Treffer").
 *
 * Die Suche ist ein Filter der Wand, kein eigenes Verzeichnis: die Treffer
 * zeigt die Wand im selben Raster mit derselben Zettel-Komponente. Eine
 * Reihenfolge liefert dieses Modul deshalb nicht mit — die Legereihenfolge
 * bestimmt allein `layoutWall`.
 */
export interface WallSearch {
  /**
   * Angepinnte Treffer: offene Hauptaufgaben, deren Titel oder der Titel einer
   * ihrer Unteraufgaben den Begriff enthält — genau die Zettel, die an der Wand
   * stehen bleiben.
   *
   * Erledigte Treffer (die **losen Zettel**) kommen als eigenes Feld dazu; sie
   * gehören nicht in diese Liste.
   */
  pinned: Task[]
  /**
   * „Aufgabe erstellen" anbieten? Nur, wenn es den Titel noch nicht gibt —
   * „genau" heißt hier dasselbe wie **Duplikat** (`findDuplicateTask`), sonst
   * führte der Knopf nur in eine Abweisung.
   */
  offerCreate: boolean
}

const isLive = (task: Task) => task.deleted_at === null

/**
 * `null` bei leerer Eingabe — das unterscheidet „nichts gesucht" (volle Wand)
 * von „nichts gefunden" (leere Wand).
 */
export function searchWall(tasks: readonly Task[], query: string): WallSearch | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return null

  // Eltern, die über eine Unteraufgabe passen — einmal gesammelt, sonst wird
  // die Suche O(n²).
  const parentsBySubtask = new Set<string>()
  for (const task of tasks) {
    if (task.parent_task_id && isLive(task) && task.title.toLowerCase().includes(needle)) {
      parentsBySubtask.add(task.parent_task_id)
    }
  }

  const pinned = tasks.filter(
    (task) =>
      task.parent_task_id === null &&
      isLive(task) &&
      !task.completed &&
      (task.title.toLowerCase().includes(needle) || parentsBySubtask.has(task.task_id)),
  )

  // Getrimmt wie der Titelvorschlag, den die Suche ans Anlegen weitergibt.
  const offerCreate = findDuplicateTask(tasks, query.trim()) === undefined

  return { pinned, offerCreate }
}
