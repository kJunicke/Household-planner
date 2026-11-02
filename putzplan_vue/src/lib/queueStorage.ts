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

const parseQueue = (raw: string | null): PendingMutation[] => {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PendingMutation[]) : []
  } catch {
    return []
  }
}

/**
 * Warteschlange des Besitzers.
 *
 * Fehlt sie, kann ein Altbestand unter dem ungebundenen Schlüssel (vor der
 * Bindung geschrieben) übernommen werden — aber nur, wenn `ownsLegacy` ihn dem
 * aktuellen Haushalt zuordnet. Sonst bleibt er unangetastet liegen: wessen
 * Änderungen das sind, weiß niemand mehr, und abgespielt landeten sie mit der
 * `household_id` des Lesers in dessen Haushalt. Ohne `ownsLegacy` wird nie
 * übernommen.
 */
export function readOwnedQueue(
  storage: KeyValueStorage,
  base: string,
  owner: string,
  ownsLegacy?: (legacy: PendingMutation[]) => boolean,
): PendingMutation[] {
  const raw = storage.getItem(ownedKey(base, owner))
  if (raw !== null) return parseQueue(raw)
  return ownsLegacy ? adoptLegacyQueue(storage, base, owner, ownsLegacy) : []
}

/**
 * Nur die Übernahme des Altbestands (siehe `readOwnedQueue`), ohne die eigene
 * Warteschlange zu lesen. Liegt schon eine eigene, bleibt alles, wie es ist.
 * Für einen zweiten Anlauf, sobald die Listen des Haushalts bekannt sind.
 */
export function adoptLegacyQueue(
  storage: KeyValueStorage,
  base: string,
  owner: string,
  ownsLegacy: (legacy: PendingMutation[]) => boolean,
): PendingMutation[] {
  const key = ownedKey(base, owner)
  if (storage.getItem(key) !== null) return []
  const legacyRaw = storage.getItem(base)
  const legacy = parseQueue(legacyRaw)
  if (legacy.length === 0 || !ownsLegacy(legacy)) return []
  storage.setItem(key, legacyRaw!)
  storage.removeItem(base)
  return legacy
}

/**
 * Gehört ein Altbestand in diesen Haushalt? Ja, wenn jede Liste, die er nennt,
 * eine des Haushalts ist. Solange dessen Listen nicht geladen sind, ist die
 * Menge leer und jedes Anlegen bleibt liegen, bis sie es sind.
 *
 * Mutationen ohne Liste (Abhaken, Ändern, Löschen per Zeilen-ID) halten nicht
 * auf: auf fremde Zeilen lässt RLS sie ins Leere laufen, und nur ein Anlegen
 * schreibt die `household_id` des Lesers.
 */
export function legacyListsBelong(
  legacy: readonly PendingMutation[],
  householdListIds: ReadonlySet<string>,
): boolean {
  return legacy.every(
    (m) => m.payload.listId === undefined || householdListIds.has(m.payload.listId),
  )
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
