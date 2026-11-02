/**
 * Entscheidet bei jedem Beitritt eines Realtime-Abos (`SUBSCRIBED`), ob
 * nachgeladen werden muss. Je Abo-Aufruf ein neues Exemplar.
 *
 * Grundsätzlich ja: Ereignisse vor dem Beitritt kommen nie an, und nach einem
 * Verbindungsabriss fehlt alles dazwischen. **Ausnahme ist der erste Beitritt,
 * wenn seit dem Abo-Aufruf schon ein Ladelauf gestartet wurde** — gleich, ob er
 * noch läuft oder fertig ist. Dessen SELECT hat alles bis zu seinem Start
 * gesehen; ein Nachladen jetzt wäre eine zweite, gleiche Anfrage, auf die die
 * Ansicht beim ersten Aufbau mitwartet. Bewusst gezahlter Preis: was zwischen
 * dem Start des SELECT und dem Beitritt geschieht, fehlt bis zum nächsten
 * Nachladen (Sichtbarwerden, Neubeitritt).
 */
export function createJoinReloadGate() {
  let loadedSinceSubscribe = false
  let joinedOnce = false
  return {
    /** Beim Start jedes Ladelaufs, unmittelbar vor seiner Abfrage. */
    loadStarted(): void {
      loadedSinceSubscribe = true
    },
    /** Beim Beitritt; `true` = nachladen. */
    joined(): boolean {
      const firstJoin = !joinedOnce
      joinedOnce = true
      return !(firstJoin && loadedSinceSubscribe)
    },
  }
}
