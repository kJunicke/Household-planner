import { describe, expect, it } from 'vitest'

import { collectKeysetPages } from './keysetPages'

interface Row {
  id: string
}

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(5, '0') }) satisfies Row)

/** Simuliert PostgREST: `gt(after)`, aufsteigend, gekappt bei `cap` Zeilen. */
const server = (table: Row[], cap: number) => {
  const calls: (string | null)[] = []
  const fetchPage = async (after: string | null) => {
    calls.push(after)
    return table.filter((r) => after === null || r.id > after).slice(0, cap)
  }
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

  it('leere Tabelle: eine Anfrage, keine Zeilen', async () => {
    const { fetchPage, calls } = server([], 1000)
    expect(await collectKeysetPages(fetchPage, (r) => r.id)).toEqual([])
    expect(calls).toEqual([null])
  })

  it('eine zwischen zwei Seiten gelöschte Zeile verschiebt nichts', async () => {
    const table = ids(30)
    let call = 0
    const fetchPage = async (after: string | null) => {
      // Nach der ersten Seite verschwindet eine bereits gelesene Zeile.
      if (call++ === 1) table.splice(3, 1)
      return table.filter((r) => after === null || r.id > after).slice(0, 10)
    }
    const rows = await collectKeysetPages(fetchPage, (r) => r.id)
    // Offset-Blättern hätte hier Zeile 00010 übersprungen.
    expect(rows.map((r) => r.id)).toContain('00010')
    expect(rows).toHaveLength(30)
  })

  it('wirft, wenn eine Seite scheitert, statt eine halbe Liste zu liefern', async () => {
    let call = 0
    const fetchPage = async () => {
      if (call++ === 1) throw new Error('Netz weg')
      return ids(10)
    }
    await expect(collectKeysetPages(fetchPage, (r) => r.id)).rejects.toThrow('Netz weg')
  })

  it('wirft, wenn der Schlüssel nicht vorrückt', async () => {
    const fetchPage = async () => ids(5)
    await expect(collectKeysetPages(fetchPage, (r) => r.id)).rejects.toThrow(/rückt nicht vor/)
  })
})
