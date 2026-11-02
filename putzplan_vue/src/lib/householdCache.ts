import type { Household, HouseholdMember } from '@/types/households'

/**
 * Letzter bekannter Haushalt je Konto, für den Kaltstart ohne Netz.
 *
 * Ohne ihn landet ein Offline-Start auf der Haushalts-Einrichtung (der
 * Router-Guard sieht keinen Haushalt) — und damit genau dort nicht, wofür es
 * den Offline-Cache des Einkaufs gibt. Gelesen wird nur bei einem Netzfehler,
 * nie statt einer Serverantwort: „kein Mitglied" vom Server leert ihn.
 *
 * Der Schlüssel trägt die `user_id`, damit ein anderes Konto auf demselben
 * Gerät nie den Haushalt des vorigen bekommt. Beim Session-Ende wird er
 * gelöscht — er enthält den Einladungscode.
 */

export interface CachedHousehold {
  household: Household
  members: HouseholdMember[]
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const keyFor = (userId: string) => `putzplan.household.${userId}`

export function readCachedHousehold(
  storage: KeyValueStorage,
  userId: string,
): CachedHousehold | null {
  try {
    const raw = storage.getItem(keyFor(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedHousehold> | null
    if (typeof parsed?.household?.household_id !== 'string') return null
    return {
      household: parsed.household,
      members: Array.isArray(parsed.members) ? parsed.members : [],
    }
  } catch {
    // gesperrter Speicher oder kaputtes JSON: dann eben kein Cache
    return null
  }
}

export function writeCachedHousehold(
  storage: KeyValueStorage,
  userId: string,
  value: CachedHousehold,
): void {
  try {
    storage.setItem(keyFor(userId), JSON.stringify(value))
  } catch {
    // Speicher voll oder gesperrt: der Online-Start funktioniert trotzdem
  }
}

export function clearCachedHousehold(storage: KeyValueStorage, userId: string): void {
  try {
    storage.removeItem(keyFor(userId))
  } catch {
    // gesperrter Speicher: dann liegt dort auch nichts
  }
}
