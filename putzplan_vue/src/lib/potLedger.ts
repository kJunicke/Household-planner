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
 */
type ExpenseSplit = { kind: 'equal'; participantIds: readonly string[] }

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

/** Cent je Teilnehmer an einer Ausgabe; die Summe ist immer der Betrag. */
export function expenseShares(
  expense: LedgerExpense,
  participantOrder: readonly string[],
): Map<string, number> {
  const chosen = new Set(expense.split.participantIds)
  const bearers = participantOrder.filter((id) => chosen.has(id))
  const shares = new Map<string, number>()
  if (bearers.length === 0) return shares
  const base = Math.floor(expense.amountCents / bearers.length)
  const rest = expense.amountCents - base * bearers.length
  bearers.forEach((id, i) => shares.set(id, base + (i < rest ? 1 : 0)))
  return shares
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

/**
 * Überweisungsvorschläge (CONTEXT.md § Rückzahlung): wer wem wie viel
 * überweist, damit alle Salden auf null gehen.
 *
 * Immer zahlt der größte Schuldner an den größten Gläubiger, so viel wie
 * der kleinere der beiden Beträge. Jede Überweisung bringt mindestens einen
 * Teilnehmer auf null, also sind es höchstens n−1. Bei gleichen Beträgen
 * entscheidet die Reihenfolge von `balances` (die des Topfs), damit jedes
 * Gerät dieselben Vorschläge zeigt.
 */
export function suggestTransfers(balances: ReadonlyMap<string, number>): LedgerRepayment[] {
  const open = [...balances].map(([id, cents]) => ({ id, cents })).filter((p) => p.cents !== 0)
  // Größter Betrag zuerst; bei Gleichstand der Erste in der Reihenfolge.
  const largest = (sign: 1 | -1) =>
    open.reduce<{ id: string; cents: number } | null>(
      (best, p) => (p.cents * sign > 0 && (!best || p.cents * sign > best.cents * sign) ? p : best),
      null,
    )

  const transfers: LedgerRepayment[] = []
  for (;;) {
    const creditor = largest(1)
    const debtor = largest(-1)
    if (!creditor || !debtor) return transfers
    const amountCents = Math.min(creditor.cents, -debtor.cents)
    transfers.push({ fromId: debtor.id, toId: creditor.id, amountCents })
    creditor.cents -= amountCents
    debtor.cents += amountCents
  }
}

/** Cent-Betrag zum Lesen: „12,34 €“. */
export function formatCents(cents: number): string {
  return `${formatEuroInput(cents / 100)} €`
}
