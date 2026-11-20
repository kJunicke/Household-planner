import { formatEuroInput } from './settlementAmount'

/**
 * Topf-Rechnung (CONTEXT.md § Topf, § Ausgabe, § Aufteilung, § Rückzahlung):
 * rein, ohne Datenbank und Oberfläche. Gerechnet wird in ganzen Cent.
 *
 * Teilnehmer kommen als Kennungen in der festen Reihenfolge des Topfs an
 * (Anlage, dann Kennung). Diese Reihenfolge entscheidet, wer einen Cent-Rest
 * trägt — nicht die Reihenfolge in der Aufteilung.
 */

/**
 * Aufteilung einer Ausgabe, so wie sie gespeichert ist (Rohwerte, keine Euro).
 * `equal`: gleich auf die gewählten Teilnehmer — „gleich auf alle“ wählt alle.
 * `ratio`: Teilnehmer → Gewicht (2:1 → 2 und 1), bis zwei Nachkommastellen.
 * `percent`: Teilnehmer → Prozent, bis zwei Nachkommastellen; gültig bei 100.
 * `exact`: Teilnehmer → Cent; gültig, wenn die Summe der Betrag ist.
 * Teilnehmer mit 0 oder ohne Eintrag tragen nichts.
 */
export type ExpenseSplit =
  | { kind: 'equal'; participantIds: readonly string[] }
  | { kind: 'ratio' | 'percent' | 'exact'; values: Readonly<Record<string, number>> }

export interface LedgerExpense {
  payerId: string
  amountCents: number
  split: ExpenseSplit
}

/** Geld, das `fromId` an `toId` im selben Topf überwiesen hat. */
export interface LedgerRepayment {
  fromId: string
  toId: string
  amountCents: number
}

/**
 * Ganzzahlige Gewichte je Teilnehmer in Topf-Reihenfolge. Rohwerte mit
 * Nachkommastellen (Verhältnis, Prozent) zählen in Hundertsteln, damit die
 * Rechnung in ganzen Zahlen bleibt. Wer 0 trägt, fällt heraus.
 */
function splitWeights(
  split: ExpenseSplit,
  participantOrder: readonly string[],
): [string, number][] {
  if (split.kind === 'equal') {
    const chosen = new Set(split.participantIds)
    return participantOrder.filter((id) => chosen.has(id)).map((id) => [id, 1])
  }
  const scale = split.kind === 'exact' ? 1 : 100
  return participantOrder
    .map((id): [string, number] => [id, Math.round((split.values[id] ?? 0) * scale)])
    .filter(([, weight]) => weight > 0)
}

/**
 * Cent je Teilnehmer an einer Ausgabe; die Summe ist immer der Betrag.
 * Jeder trägt seinen Anteil abgerundet auf den Cent; die übrigen Cent gehen
 * einzeln an die größten abgeschnittenen Bruchteile, bei Gleichstand an die
 * ersten Teilnehmer in Topf-Reihenfolge. Beim gleichen Teilen heißt das: an
 * die ersten Teilnehmer. Geht eine Aufteilung nicht auf (→ `splitValidity`),
 * wird sie im Verhältnis ihrer Werte gerechnet, damit Salden stimmig bleiben.
 */
export function expenseShares(
  expense: LedgerExpense,
  participantOrder: readonly string[],
): Map<string, number> {
  const weights = splitWeights(expense.split, participantOrder)
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  const shares = new Map<string, number>()
  if (total === 0) return shares
  const parts = weights.map(([id, w], index) => {
    const exact = expense.amountCents * w
    return { id, index, cents: Math.floor(exact / total), remainder: exact % total }
  })
  let rest = expense.amountCents - parts.reduce((sum, p) => sum + p.cents, 0)
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const part of byRemainder) {
    if (rest === 0) break
    part.cents += 1
    rest -= 1
  }
  for (const part of parts) shares.set(part.id, part.cents)
  return shares
}

/**
 * Ob eine Aufteilung aufgeht. Ungültig ist sie, wenn niemand trägt, ein Wert
 * negativ ist oder Prozente bzw. genaue Beträge nicht genau aufgehen — dann
 * mit Fehlbetrag: > 0 fehlt noch, < 0 ist zu viel. Prozente zählen in
 * Hundertstel-Prozent, damit 33,33 + 33,33 + 33,34 genau 100 ergibt.
 * Gezählt werden nur Teilnehmer des Topfs.
 */
export type SplitValidity =
  | { valid: true }
  | { valid: false; reason: 'nobody' | 'negative' }
  | { valid: false; reason: 'percent_off'; missingHundredthPercent: number }
  | { valid: false; reason: 'exact_off'; missingCents: number }

export function splitValidity(
  expense: Pick<LedgerExpense, 'amountCents' | 'split'>,
  participantOrder: readonly string[],
): SplitValidity {
  const { split } = expense
  if (split.kind !== 'equal') {
    const values = split.values
    if (participantOrder.some((id) => (values[id] ?? 0) < 0)) {
      return { valid: false, reason: 'negative' }
    }
  }
  const weights = splitWeights(split, participantOrder)
  if (weights.length === 0) return { valid: false, reason: 'nobody' }
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  if (split.kind === 'percent' && total !== 10000) {
    return { valid: false, reason: 'percent_off', missingHundredthPercent: 10000 - total }
  }
  if (split.kind === 'exact' && total !== expense.amountCents) {
    return { valid: false, reason: 'exact_off', missingCents: expense.amountCents - total }
  }
  return { valid: true }
}

/**
 * Saldo je Teilnehmer in Cent: bezahlt minus getragen. > 0 hat gut, < 0 schuldet.
 * Eine Rückzahlung zählt für den Überweisenden wie bezahlt, für den Empfänger
 * wie getragen — sie senkt beide Salden Richtung null.
 * Jeder Teilnehmer steht drin, auch mit 0; die Summe ist immer 0.
 */
export function potBalances(
  participantOrder: readonly string[],
  expenses: readonly LedgerExpense[],
  repayments: readonly LedgerRepayment[],
): Map<string, number> {
  const balances = new Map(participantOrder.map((id) => [id, 0]))
  const add = (id: string, cents: number) => balances.set(id, (balances.get(id) ?? 0) + cents)
  for (const expense of expenses) {
    add(expense.payerId, expense.amountCents)
    for (const [id, cents] of expenseShares(expense, participantOrder)) add(id, -cents)
  }
  for (const repayment of repayments) {
    add(repayment.fromId, repayment.amountCents)
    add(repayment.toId, -repayment.amountCents)
  }
  return balances
}

/** Cent-Betrag zum Lesen: „12,34 €“. */
export function formatCents(cents: number): string {
  return `${formatEuroInput(cents / 100)} €`
}
