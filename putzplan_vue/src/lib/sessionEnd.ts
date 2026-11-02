/**
 * Session-Ende: eine Stelle, an der sich jeder Store mit seinem Aufräumen anmeldet.
 *
 * Ohne sie überlebt alles das Abmelden — Haushalt, Aufgaben, Kanäle, Caches —
 * und ein zweites Konto im selben Tab erbt den Stand des ersten. Der Auth-Store
 * kennt die übrigen Stores nicht (und soll es nicht, sonst entstehen Import-
 * Zyklen); er ruft nur `endSession`. Jeder Store meldet im eigenen Setup an,
 * was er räumt.
 *
 * Abmelder laufen **synchron** und in Anmeldereihenfolge. Sie laufen im
 * `onAuthStateChange`-Callback, während supabase-js seine Auth-Sperre hält: wer
 * darin auf einen Supabase-Aufruf wartet, wartet auf sich selbst. Lokales
 * Leeren und `removeChannel` sind unkritisch. Wirft ein Abmelder, laufen die
 * übrigen trotzdem — ein halb geräumter Zustand ist genau, was das hier
 * verhindern soll.
 */

export interface SessionEndContext {
  /** Konto, dessen Sitzung endet (Abmelden, Abmeldung von außen, Kontowechsel). */
  userId: string
}

type SessionEndHandler = (context: SessionEndContext) => void

export function createSessionEndHub() {
  const handlers = new Set<SessionEndHandler>()

  return {
    /** Aufräumen anmelden. Rückgabe meldet wieder ab. */
    onSessionEnd(handler: SessionEndHandler): () => void {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    /** Alle Abmelder ausführen. */
    endSession(context: SessionEndContext): void {
      for (const handler of [...handlers]) {
        try {
          handler(context)
        } catch (error) {
          console.error('Session-end handler failed:', error)
        }
      }
    },
  }
}

const hub = createSessionEndHub()

export const onSessionEnd = hub.onSessionEnd
export const endSession = hub.endSession
