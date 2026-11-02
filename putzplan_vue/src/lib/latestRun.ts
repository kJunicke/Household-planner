/**
 * Reihenfolgeschutz für Nachlader, die parallel laufen dürfen.
 *
 * Laufen zwei Ladevorgänge derselben Daten gleichzeitig, gewinnt ohne Schutz der,
 * dessen Antwort **zuletzt ankommt** — nicht der, der zuletzt gestartet wurde.
 * Kommt die ältere Antwort später, überschreibt sie den neueren Stand still.
 *
 * `start()` vergibt eine Generation und liefert die Prüfung, ob sie noch die
 * jüngste ist. Geschrieben wird nur, solange sie `true` liefert.
 * `invalidate()` entwertet alle laufenden Läufe (z. B. beim Abmelden), ohne
 * einen neuen zu beginnen.
 */
export function createLatestRunGuard() {
  let current = 0
  return {
    start(): () => boolean {
      const generation = ++current
      return () => generation === current
    },
    invalidate(): void {
      current++
    },
  }
}

/**
 * Wie `createLatestRunGuard`, für Läufe, auf die jemand **wartet**.
 *
 * Mit dem Wächter allein verwirft ein überholter Lauf seine Antwort und endet —
 * wer auf ihn gewartet hat, macht dann mit einem Stand ohne seine Daten weiter
 * (die Wand packt dann mit Projektsummen 0 und springt beim nächsten Lauf).
 * Hier endet `run()` erst, wenn auch der jüngste inzwischen gestartete Lauf
 * fertig ist. Fehler überholter Läufe fallen weg, ihr Ergebnis zählt ohnehin
 * nicht.
 *
 * `invalidate()` entwertet wie beim Wächter, ohne neuen Lauf; ein Wartender
 * endet dann mit seinem eigenen.
 */
export function createLatestRunner(work: (isLatest: () => boolean) => Promise<void>) {
  const guard = createLatestRunGuard()
  let latest: Promise<void> = Promise.resolve()

  return {
    async run(): Promise<void> {
      const own = work(guard.start())
      latest = own
      let current = own
      for (;;) {
        try {
          await current
        } catch (error) {
          if (latest === current) throw error
        }
        if (latest === current) return
        current = latest
      }
    },
    invalidate: guard.invalidate,
  }
}
