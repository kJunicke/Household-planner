// Offline-Warteschlange und Artikel-Cache im localStorage, gebunden an Nutzer
// und Haushalt. Ohne Bindung spielte nach einem Kontowechsel auf demselben
// Gerät die Warteschlange des Vorgängers in den Haushalt des Nachfolgers
// (`household_id` kommt beim Abspielen aus dem aktuellen Haushalt), und der
// Nachfolger sähe dessen Einkaufsliste.
//
// Beim Abmelden wird die Warteschlange NICHT gelöscht: Ungesendetes wäre sonst
// still verloren. Sie wartet unter ihrem Besitzer, bis derselbe Nutzer im
// selben Haushalt wieder angemeldet ist.

import type { PendingMutation } from '@/types/PendingMutation'

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type EnumerableStorage = KeyValueStorage & Pick<Storage, 'key' | 'length'>

/** Besitzer-Schlüssel, oder null ohne angemeldeten Nutzer bzw. ohne Haushalt. */
export function queueOwner(
  userId: string | null | undefined,
  householdId: string | null | undefined,
): string | null {
  return userId && householdId ? `${userId}:${householdId}` : null
}

export const ownedKey = (base: string, owner: string) => `${base}:${owner}`

/**
 * Warteschlange des Besitzers. Ein Altbestand unter dem ungebundenen Schlüssel
 * (vor der Bindung geschrieben) geht an den ersten Besitzer, der danach liest —
 * praktisch derselbe Nutzer, dessen Sitzung das Update überdauert hat.
 */
export function readOwnedQueue(
  storage: KeyValueStorage,
  base: string,
  owner: string,
): PendingMutation[] {
  const key = ownedKey(base, owner)
  let raw = storage.getItem(key)
  if (raw === null) {
    const legacy = storage.getItem(base)
    if (legacy !== null) {
      storage.setItem(key, legacy)
      storage.removeItem(base)
      raw = legacy
    }
  }
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PendingMutation[]) : []
  } catch {
    return []
  }
}

export function writeOwnedQueue(
  storage: KeyValueStorage,
  base: string,
  owner: string,
  queue: PendingMutation[],
) {
  const key = ownedKey(base, owner)
  if (queue.length === 0) storage.removeItem(key)
  else storage.setItem(key, JSON.stringify(queue))
}

/**
 * Erledigte Mutationen aus der gespeicherten Warteschlange eines Besitzers
 * streichen, der nicht mehr angemeldet ist — eine Anfrage, die das Abmelden
 * überholt hat, liefe sonst beim nächsten Login ein zweites Mal.
 */
export function removeFromOwnedQueue(
  storage: KeyValueStorage,
  base: string,
  owner: string,
  queueIds: string[],
) {
  const rest = readOwnedQueue(storage, base, owner).filter((m) => !queueIds.includes(m.queueId))
  writeOwnedQueue(storage, base, owner, rest)
}

/** Alle Schlüssel mit diesem Präfix entfernen — gebundene wie der ungebundene Altbestand. */
export function removeKeysWithPrefix(storage: EnumerableStorage, prefix: string) {
  const doomed: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key !== null && key.startsWith(prefix)) doomed.push(key)
  }
  doomed.forEach((key) => storage.removeItem(key))
}
