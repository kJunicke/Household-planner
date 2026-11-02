/**
 * Alle Zeilen einer Abfrage seitenweise holen, geblättert über einen
 * eindeutigen, aufsteigend sortierten Schlüssel (Keyset, nicht Offset).
 *
 * PostgREST kappt jede Antwort bei `max_rows` — ohne Blättern fallen Zeilen
 * still weg. Keyset statt Offset, weil Einfügen oder Löschen zwischen zwei
 * Seiten bei Offset-Blättern Zeilen verschiebt: eine käme doppelt, eine andere
 * gar nicht. Über den Schlüssel geblättert, wird keine vorhandene Zeile
 * übersprungen oder doppelt geliefert.
 *
 * `fetchPage(after)` muss die Zeilen mit Schlüssel **größer** `after`
 * aufsteigend nach dem Schlüssel liefern (`after === null`: von vorn).
 *
 * Abbruch erst bei einer **leeren** Seite. „Weniger Zeilen als angefragt“ wäre
 * falsch, sobald der Server enger kappt als die angefragte Seitengröße: dann
 * sähe schon die erste Seite wie die letzte aus.
 *
 * Wirft, wenn `fetchPage` wirft — eine halbe Liste ist bei Summen schlimmer
 * als keine — und wenn der Schlüssel nicht vorrückt, statt endlos zu laufen.
 */
export async function collectKeysetPages<T>(
  fetchPage: (after: string | null) => Promise<readonly T[]>,
  keyOf: (row: T) => string,
): Promise<T[]> {
  const rows: T[] = []
  let after: string | null = null

  for (;;) {
    const page = await fetchPage(after)
    if (page.length === 0) return rows

    const last = keyOf(page[page.length - 1])
    if (after !== null && last <= after) {
      throw new Error(`Keyset-Blättern rückt nicht vor (${after} → ${last})`)
    }
    rows.push(...page)
    after = last
  }
}
