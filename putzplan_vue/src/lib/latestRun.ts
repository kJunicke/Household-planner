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
