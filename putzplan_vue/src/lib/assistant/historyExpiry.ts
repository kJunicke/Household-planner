/**
 * Verfall des Chatverlaufs: nach 30 Minuten ohne Frage beginnt das Gespräch
 * frisch. Ein alter Verlauf würde Claude auf längst erledigte Befehle
 * beziehen und kostet bei jeder Frage mit.
 */

const EXPIRY_MS = 30 * 60_000

export function createHistoryExpiry(now: () => number = Date.now) {
  let lastQuestionAt: number | null = null

  return {
    /**
     * Bei jeder neuen Frage aufrufen. Liefert den Verlauf, der mitgehen darf,
     * und ob ein vorhandener Verlauf verfallen ist.
     */
    startQuestion<T>(history: T[]): { history: T[]; fresh: boolean } {
      const at = now()
      const expired = lastQuestionAt !== null && at - lastQuestionAt > EXPIRY_MS
      lastQuestionAt = at
      if (expired && history.length > 0) return { history: [], fresh: true }
      return { history, fresh: false }
    },
  }
}
