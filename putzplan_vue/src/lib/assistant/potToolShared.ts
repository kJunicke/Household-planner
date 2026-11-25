/**
 * Was die Topf-Werkzeuge (`potTools.ts`, `expenseTools.ts`) gemeinsam haben:
 * das Fehlerergebnis, die Seite eines Topfs, das Ergebnis einer rücknehmbaren
 * Änderung darin und der Baustein `pot_id` der Eingabeschemata.
 */
import { undoAll, type Change, type ChangedEntry, type ToolOutcome } from './tools'

export const POT_ID = { type: 'string', description: 'ID des Topfs aus der Übersicht' }

export const error = (result: string): ToolOutcome => ({ result, isError: true })

export const potPage = (potId: string) => ({ area: 'pot', potId }) as const

/**
 * Ein Ergebnis aus genau einer rücknehmbaren Änderung; die App führt zu `shown`
 * (dem Topf selbst oder einem Eintrag darin), und es leuchtet auf.
 */
export function changedInPot(result: string, change: Change, shown: ChangedEntry): ToolOutcome {
  return {
    result,
    summary: change.summary,
    undo: undoAll([change.undo]),
    changed: [shown],
    changes: [change],
  }
}
