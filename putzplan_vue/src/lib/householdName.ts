import { HOUSEHOLD_NAME_MAX_LENGTH } from './limits'

/**
 * Haushaltsname zum Speichern: ohne Rand-Leerzeichen, oder `null`, wenn er
 * leer oder länger ist, als der CHECK `households_name_len` zulässt. Vorab
 * prüfen statt den CHECK zuschlagen zu lassen: ein Postgres-Fehlertext ist
 * keine Nutzermeldung.
 */
export const normalizeHouseholdName = (input: string): string | null => {
  const name = input.trim()
  if (name.length < 1 || name.length > HOUSEHOLD_NAME_MAX_LENGTH) return null
  return name
}
