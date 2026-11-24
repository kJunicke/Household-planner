/**
 * Was der Assistent seit dem Öffnen des Chats geändert hat.
 *
 * Daraus folgt die App dem Chat: sie zeigt die Seite der letzten Änderung, und
 * beim Schließen leuchten die Einträge auf, die auf der dann gezeigten Seite
 * geändert wurden. Eine zurückgenommene Änderung fällt heraus.
 */
import type { AssistantPage, ChangedEntry, ToolOutcome } from './tools'

const samePage = (a: AssistantPage, b: AssistantPage) =>
  a.area === b.area && a.listId === b.listId

export function createChangeTrail() {
  // Je Werkzeugaufruf ein Eintrag: nimmt der zweite von zwei Aufrufen an
  // demselben Artikel zurück, bleibt der erste stehen.
  let calls: ChangedEntry[][] = []

  return {
    /** Beim Öffnen des Chats: gesammelt wird ab jetzt. */
    reset() {
      calls = []
    },

    /**
     * Merkt sich die Änderungen eines Werkzeugaufrufs. Die Rücknahme des
     * zurückgegebenen Ergebnisses nimmt sie wieder heraus, wenn sie gelingt.
     */
    track(outcome: ToolOutcome): ToolOutcome {
      if (!outcome.changed?.length) return outcome
      const call = outcome.changed
      calls.push(call)
      const { undo } = outcome
      if (!undo) return outcome
      return {
        ...outcome,
        undo: async () => {
          const ok = await undo()
          if (ok) calls = calls.filter((c) => c !== call)
          return ok
        },
      }
    },

    /** Die Seite der letzten Änderung; `null`, wenn nichts geändert wurde. */
    lastPage(): AssistantPage | null {
      const last = calls[calls.length - 1]
      return last?.[last.length - 1]?.page ?? null
    },

    /** Die IDs der Einträge, die auf `page` geändert wurden, ohne Doppelte. */
    changedOn(page: AssistantPage): string[] {
      const ids = calls.flat().filter((c) => samePage(c.page, page)).map((c) => c.id)
      return [...new Set(ids)]
    },
  }
}
