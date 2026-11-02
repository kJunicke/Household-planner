/** Was Realtime zu einer Zeile gemeldet hat, während ein Ladevorgang lief. */
export type ChangeDuringLoad<T> = { kind: 'upsert'; row: T } | { kind: 'remove' }

/**
 * Frisch geladene Zeilen in die vorhandene Liste mergen, statt sie zu ersetzen.
 *
 * Ein SELECT ist eine Momentaufnahme vom Zeitpunkt seiner Ausführung. Was
 * Realtime meldet, während die Antwort noch unterwegs ist, kann neuer sein —
 * ein blindes Ersetzen setzte dann den älteren Stand zurück, und der bliebe
 * stehen, bis zufällig die nächste Änderung derselben Zeile kommt. Realtime
 * liefert seine Ereignisse in Reihenfolge, deshalb gewinnt das zuletzt
 * gemeldete gegen die Momentaufnahme.
 *
 * Vorrang je Zeile:
 * 1. `keepLocal(id)` und die Zeile liegt lokal vor → lokale Zeile (eigene
 *    Mutation unterwegs, ihr optimistischer Stand darf nicht zurückspringen)
 * 2. während des Ladens entfernt → fehlt im Ergebnis, auch wenn geladen
 * 3. während des Ladens eingefügt/geändert → die gemeldete Zeile
 * 4. sonst die geladene Zeile
 *
 * Lokale Zeilen, die weder geladen noch während des Ladens gemeldet wurden,
 * fallen weg — sie sind serverseitig verschwunden. Die Reihenfolge ist die der
 * geladenen Zeilen; nur während des Ladens hinzugekommene stehen am Ende.
 */
export function mergeLoadedRows<T>(options: {
  loaded: readonly T[]
  current: readonly T[]
  keyOf: (row: T) => string
  keepLocal: (id: string) => boolean
  changedDuringLoad: ReadonlyMap<string, ChangeDuringLoad<T>>
}): T[] {
  const { loaded, current, keyOf, keepLocal, changedDuringLoad } = options
  const currentById = new Map(current.map((row) => [keyOf(row), row]))
  const result: T[] = []
  const seen = new Set<string>()

  for (const row of loaded) {
    const id = keyOf(row)
    seen.add(id)
    const local = currentById.get(id)
    if (local !== undefined && keepLocal(id)) {
      result.push(local)
      continue
    }
    const change = changedDuringLoad.get(id)
    if (change?.kind === 'remove') continue
    result.push(change?.kind === 'upsert' ? change.row : row)
  }

  for (const [id, change] of changedDuringLoad) {
    if (change.kind === 'upsert' && !seen.has(id)) result.push(change.row)
  }

  return result
}
