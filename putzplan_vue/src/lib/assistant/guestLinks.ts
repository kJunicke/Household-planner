/**
 * Ob ein Ziel (Liste, Topf) einen Gastlink hat; mit ihm endet der Link, und
 * kein Rückgängig holt ihn zurück. Die Lösch-Werkzeuge fragen das, bevor sie
 * die Karte zeigen oder einen Topf als leer behandeln.
 */

/** Was davon aus dem guestShareStore gebraucht wird. */
export interface GuestLinkStore {
  readonly shares: readonly { target_id: string }[]
  load: () => Promise<void>
}

/**
 * Lädt die Gastlinks vorher: der Store kennt sie erst, wenn er geladen hat,
 * und das hängt am Echtzeit-Abo oder an einer Ansicht, die sie zeigt.
 */
export async function hasGuestLink(store: GuestLinkStore, targetId: string): Promise<boolean> {
  await store.load()
  return store.shares.some((s) => s.target_id === targetId)
}
