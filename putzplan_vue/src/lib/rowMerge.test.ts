import { describe, expect, it } from 'vitest'

import { keepPendingLocal, mergeLoadedRows, type ChangeDuringLoad } from './rowMerge'

interface Row {
  id: string
  v: number
}

const row = (id: string, v: number): Row => ({ id, v })

const merge = (
  loaded: Row[],
  current: Row[],
  changes: [string, ChangeDuringLoad<Row>][] = [],
  keepLocal: (id: string) => boolean = () => false,
) =>
  mergeLoadedRows({
    loaded,
    current,
    keyOf: (r) => r.id,
    keepLocal,
    changedDuringLoad: new Map(changes),
  })

describe('mergeLoadedRows', () => {
  it('übernimmt ohne Zwischenmeldungen die geladenen Zeilen', () => {
    expect(merge([row('a', 2), row('b', 2)], [row('a', 1), row('c', 1)])).toEqual([
      row('a', 2),
      row('b', 2),
    ])
  })

  it('eine fremde Änderung während des Ladens schlägt die ältere Momentaufnahme', () => {
    // SELECT sah a@1, danach kam per Realtime a@2 an.
    const result = merge(
      [row('a', 1), row('b', 1)],
      [row('a', 2), row('b', 1)],
      [['a', { kind: 'upsert', row: row('a', 2) }]],
    )
    expect(result).toEqual([row('a', 2), row('b', 1)])
  })

  it('die gemeldete Zeile gilt auch, wenn sie lokal noch fehlte', () => {
    // Erster Ladevorgang: die Liste ist leer, das UPDATE fand keinen Platz.
    const result = merge([row('a', 1)], [], [['a', { kind: 'upsert', row: row('a', 2) }]])
    expect(result).toEqual([row('a', 2)])
  })

  it('eine während des Ladens entfernte Zeile kommt nicht zurück', () => {
    const result = merge([row('a', 1), row('b', 1)], [row('b', 1)], [['a', { kind: 'remove' }]])
    expect(result).toEqual([row('b', 1)])
  })

  it('eine während des Ladens eingefügte Zeile bleibt, auch wenn das SELECT sie nicht sah', () => {
    const result = merge(
      [row('a', 1)],
      [row('a', 1), row('n', 1)],
      [['n', { kind: 'upsert', row: row('n', 1) }]],
    )
    expect(result).toEqual([row('a', 1), row('n', 1)])
  })

  it('die letzte Meldung zählt: eingefügt und wieder entfernt bleibt weg', () => {
    const changes = new Map<string, ChangeDuringLoad<Row>>()
    changes.set('n', { kind: 'upsert', row: row('n', 1) })
    changes.set('n', { kind: 'remove' })
    const result = mergeLoadedRows({
      loaded: [row('a', 1)],
      current: [row('a', 1)],
      keyOf: (r) => r.id,
      keepLocal: () => false,
      changedDuringLoad: changes,
    })
    expect(result).toEqual([row('a', 1)])
  })

  it('eine eigene laufende Mutation behält ihren lokalen Stand', () => {
    const result = merge(
      [row('a', 1)],
      [row('a', 9)],
      [['a', { kind: 'upsert', row: row('a', 2) }]],
      (id) => id === 'a',
    )
    expect(result).toEqual([row('a', 9)])
  })

  it('keepLocal ohne lokale Zeile nimmt die geladene', () => {
    expect(merge([row('a', 1)], [], [], () => true)).toEqual([row('a', 1)])
  })

  it('serverseitig verschwundene Zeilen fallen weg, auch bei keepLocal', () => {
    expect(merge([], [row('a', 1)], [], () => true)).toEqual([])
  })

  it('verändert die Eingaben nicht', () => {
    const loaded = [row('a', 1)]
    const current = [row('a', 2)]
    merge(loaded, current, [['a', { kind: 'remove' }]])
    expect(loaded).toEqual([row('a', 1)])
    expect(current).toEqual([row('a', 2)])
  })
})

describe('keepPendingLocal', () => {
  const r = (id: string, v: number) => ({ id, v })
  const key = (x: { id: string }) => x.id

  it('ohne wartende Mutation gewinnt der Server', () => {
    expect(keepPendingLocal([r('a', 1)], [r('a', 2)], new Set(), key)).toEqual([r('a', 1)])
  })

  it('eine wartende Änderung behält ihren lokalen Stand', () => {
    expect(keepPendingLocal([r('a', 1), r('b', 1)], [r('a', 2)], new Set(['a']), key)).toEqual([
      r('a', 2),
      r('b', 1),
    ])
  })

  it('ein wartendes Löschen holt die Zeile nicht zurück', () => {
    expect(keepPendingLocal([r('a', 1), r('b', 1)], [r('b', 1)], new Set(['a']), key)).toEqual([
      r('b', 1),
    ])
  })
})
