export interface PairBalance {
  userAId: string
  userBId: string
  /** > 0: A liegt vorn, B schuldet A; < 0: umgekehrt */
  balance: number
}

/**
 * Euro-Vorschlag für einen Geld-Ausgleich: Punkte × Kurs, auf Cent gerundet
 * (CONTEXT.md § Umrechnung, § Ausgleich).
 *
 * Gerechnet wird in ganzen Cent, nicht in Euro-Gleitkomma: 7 × 0,83 ergibt
 * in Gleitkomma 5,8100000000000005, das Feld soll aber 5,81 zeigen.
 */
export function suggestEuros(points: number, rate: number): number {
  const rateCents = Math.round(rate * 100)
  return Math.round(points * rateCents) / 100
}

/**
 * Euro-Eingabe aus einem Textfeld lesen: Komma oder Punkt als Trenner, höchstens
 * zwei Nachkommastellen, nicht negativ. Sonst `null`.
 *
 * Textfeld statt `type="number"`, weil Zahlenfelder das deutsche Komma je nach
 * Browser und Tastatur verschlucken.
 */
export function parseEuroInput(text: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text.trim())
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return cents / 100
}

/** Betrag fürs Eingabefeld: zwei Nachkommastellen, Komma. */
export function formatEuroInput(euros: number): string {
  return euros.toFixed(2).replace('.', ',')
}

/**
 * Offene Bilanz, die `fromId` an `toId` schuldet — die Vorbelegung des
 * Ausgleich-Dialogs (CONTEXT.md § Ausgleich). 0, wenn `fromId` nichts schuldet.
 */
export function openBalance(pairs: readonly PairBalance[], fromId: string, toId: string): number {
  for (const p of pairs) {
    // Positiv: toId liegt vorn, fromId schuldet.
    if (p.userAId === toId && p.userBId === fromId) return Math.max(0, p.balance)
    if (p.userAId === fromId && p.userBId === toId) return Math.max(0, -p.balance)
  }
  return 0
}

/**
 * Guthaben, das `fromId` beim Verrechnen mit dem Haushaltstopf einsetzen
 * kann (CONTEXT.md § Ausgleich): was `fromId` im Topf gut hat, aber nur so
 * viel, wie `toId` dort schuldet — die Rückzahlung läuft von `toId` an
 * `fromId`. Salden in Cent wie aus der Topf-Rechnung; 0, wenn nichts da ist.
 */
export function householdPotCredit(
  balances: ReadonlyMap<string, number>,
  fromId: string,
  toId: string,
): number {
  return Math.max(0, Math.min(balances.get(fromId) ?? 0, -(balances.get(toId) ?? 0)))
}

/**
 * Vorbelegte Punkte beim Verrechnen mit dem Haushaltstopf: höchstens die
 * offene Bilanz und höchstens so viele ganze Punkte, wie das Guthaben nach
 * Kurs deckt (CONTEXT.md § Umrechnung). 0 heißt: nichts zu verrechnen.
 */
export function potOffsetPoints(openPoints: number, creditCents: number, rate: number): number {
  const rateCents = Math.round(rate * 100)
  if (rateCents <= 0) return 0
  return Math.max(0, Math.min(openPoints, Math.floor(creditCents / rateCents)))
}

/**
 * Euro-Betrag aus einer NUMERIC-Spalte (`households.euros_per_point`,
 * `settlements.paid_euros`) als Zahl: PostgREST liefert eine Zahl, Realtime
 * womöglich Text. Gelesen wird damit, wo die Zeile ankommt, damit die Typen
 * überall `number` sagen dürfen. Kein oder kein lesbarer Betrag → `null`.
 */
export function euroAmountFromWire(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Startwert des Kurses, wie der Spalten-Default. */
export const DEFAULT_EUROS_PER_POINT = 1
/** Grenzen der Spalten aus 20261119130000: NUMERIC(6,2) und NUMERIC(10,2). */
export const MAX_EUROS_PER_POINT = 9999.99
export const MAX_PAID_EUROS = 99999999.99
