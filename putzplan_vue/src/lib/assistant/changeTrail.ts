/**
 * Was der Assistent seit dem Öffnen des Chats geändert hat.
 *
 * Daraus folgt die App dem Chat: sie zeigt die Seite der letzten Änderung, und
 * beim Schließen leuchten die Einträge auf, die auf der dann gezeigten Seite
 * geändert wurden. Eine zurückgenommene Änderung fällt heraus.
 */
import type { AssistantPage, ChangedEntry, ToolOutcome } from './tools'

const samePage = (a: AssistantPage, b: AssistantPage) => a.area === b.area && a.listId === b.listId

export function createChangeTrail() {
  // Je geänderten Eintrag ein eigener Datensatz: nimmt der zweite von zwei
  // Aufrufen an demselben Artikel zurück, bleibt der erste stehen.
  let records: { entry: ChangedEntry }[] = []

  /** Wickelt eine Rücknahme so ein, dass sie bei Erfolg `dropped` herausnimmt. */
  const dropOnUndo =
    (undo: () => Promise<boolean>, dropped: { entry: ChangedEntry }[]) =>
    async (): Promise<boolean> => {
      const ok = await undo()
      if (ok) records = records.filter((r) => !dropped.includes(r))
      return ok
    }

  return {
    /** Beim Öffnen des Chats: gesammelt wird ab jetzt. */
    reset() {
      records = []
    },

    /**
     * Merkt sich die Änderungen eines Werkzeugaufrufs. Die Rücknahmen des
     * zurückgegebenen Ergebnisses nehmen sie wieder heraus, wenn sie gelingen:
     * `undo` alle, eine einzelne aus `changes` nur ihren Eintrag. `changes`
     * steht dafür in derselben Reihenfolge wie `changed`.
     */
    track(outcome: ToolOutcome): ToolOutcome {
      if (!outcome.changed?.length) return outcome
      const mine = outcome.changed.map((entry) => ({ entry }))
      records.push(...mine)
      const { undo, changes } = outcome
      const paired = changes?.length === mine.length
      return {
        ...outcome,
        ...(undo ? { undo: dropOnUndo(undo, mine) } : {}),
        ...(changes && paired
          ? { changes: changes.map((c, i) => ({ ...c, undo: dropOnUndo(c.undo, [mine[i]!]) })) }
          : {}),
      }
    },

    /** Die Seite der letzten Änderung; `null`, wenn nichts geändert wurde. */
    lastPage(): AssistantPage | null {
      return records[records.length - 1]?.entry.page ?? null
    },

    /** Die IDs der Einträge, die auf `page` geändert wurden, ohne Doppelte. */
    changedOn(page: AssistantPage): string[] {
      const ids = records.filter((r) => samePage(r.entry.page, page)).map((r) => r.entry.id)
      return [...new Set(ids)]
    },
  }
}
