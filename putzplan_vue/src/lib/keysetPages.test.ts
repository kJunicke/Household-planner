import { describe, expect, it } from 'vitest'

import { collectKeysetPages } from './keysetPages'

interface Row {
  id: string
}

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(5, '0') }) satisfies Row)

/**
 * Obergrenze für Aufrufe je Fake. Ein kaputter Abbruch (Mutant) liefe sonst
 * endlos und der Testlauf hinge, statt rot zu werden.
 */
const MAX_CALLS = 1000

const capped = <T>(fetchPage: (after: string | null) => Promise<T>) => {
  let calls = 0
  return (after: string | null) => {
    if (++calls > MAX_CALLS) throw new Error(`mehr als ${MAX_CALLS} Aufrufe`)
    return fetchPage(after)
  }
}

/** Simuliert PostgREST: `gt(after)`, aufsteigend, gekappt bei `cap` Zeilen. */
const server = (table: Row[], cap: number | ((call: number) => number)) => {
  const calls: (string | null)[] = []
  const fetchPage = capped(async (after: string | null) => {
    const limit = typeof cap === 'number' ? cap : cap(calls.length)
    calls.push(after)
    return table.filter((r) => after === null || r.id > after).slice(0, limit)
  })
  return { fetchPage, calls }
}

describe('collectKeysetPages', () => {
  it('holt mehr Zeilen als eine Seite fasst', async () => {
    const table = ids(2500)
    const { fetchPage, calls } = server(table, 1000)
    const rows = await collectKeysetPages(fetchPage, (r) => r.id)
    expect(rows).toHaveLength(2500)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2500)
    // drei volle bzw. teilvolle Seiten plus die leere Abschlussseite
    expect(calls).toEqual([null, '00999', '01999', '02499'])
  })

  it('kappt der Server enger als erwartet, fehlt trotzdem nichts', async () => {
    const { fetchPage } = server(ids(1200), 7)
    const rows = await collectKeysetPages(fetchPage, (r) => r.id)
    expect(rows).toHaveLength(1200)
  })

  it('genau eine volle Seite: die Abschlussseite ist leer', async () => {
    const { fetchPage, calls } = server(ids(1000), 1000)
    const rows = await collectKeysetPages(fetchPage, (r) => r.id)
    expect(rows).toHaveLength(1000)
    expect(calls).toEqual([null, '00999'])
  })

  it('eine kurze, nicht leere Zwischenseite bricht nicht ab', async () => {
    // Zweite Seite nur 3 statt 10 Zeilen (Server kappt enger, Zeitlimit):
    // „weniger als angefragt“ ist kein Ende.
    const { fetchPage, calls } = server(ids(25), (call) => (call === 1 ? 3 : 10))
    const rows = await collectKeysetPages(fetchPage, (r) => r.id)
    expect(rows).toHaveLength(25)
    expect(calls).toEqual([null, '00009', '00012', '00022', '00024'])
  })

  it('leere Tabelle: eine Anfrage, keine Zeilen', async () => {
    const { fetchPage, calls } = server([], 1000)
    expect(await collectKeysetPages(fetchPage, (r) => r.id)).toEqual([])
    expect(calls).toEqual([null])
  })

  it('eine zwischen zwei Seiten gelöschte Zeile verschiebt nichts', async () => {
    const table = ids(30)
    let call = 0
    const fetchPage = capped(async (after: string | null) => {
      // Nach der ersten Seite verschwindet eine bereits gelesene Zeile.
      if (call++ === 1) table.splice(3, 1)
      return table.filter((r) => after === null || r.id > after).slice(0, 10)
    })
    const rows = await collectKeysetPages(fetchPage, (r) => r.id)
    // Offset-Blättern hätte hier Zeile 00010 übersprungen.
    expect(rows.map((r) => r.id)).toContain('00010')
    expect(rows).toHaveLength(30)
  })

  it('wirft, wenn eine Seite scheitert, statt eine halbe Liste zu liefern', async () => {
    let call = 0
    const fetchPage = capped(async () => {
      if (call++ === 1) throw new Error('Netz weg')
      return ids(10)
    })
    await expect(collectKeysetPages(fetchPage, (r) => r.id)).rejects.toThrow('Netz weg')
  })

  it('wirft, wenn der Schlüssel nicht vorrückt', async () => {
    const fetchPage = capped(async () => ids(5))
    await expect(collectKeysetPages(fetchPage, (r) => r.id)).rejects.toThrow(/rückt nicht vor/)
  })
})
