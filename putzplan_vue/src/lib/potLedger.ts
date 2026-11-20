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
 * `whole_group`: gleich auf die ganze Gruppe; gespeichert wird keine Auswahl,
 *   die Träger löst `wholeGroupCarriers` je Ausgabe auf.
 * `ratio`: Teilnehmer → Gewicht (2:1 → 2 und 1), bis zwei Nachkommastellen.
 * `percent`: Teilnehmer → Prozent, bis zwei Nachkommastellen; gültig bei 100.
 * `exact`: Teilnehmer → Cent; gültig, wenn die Summe der Betrag ist.
 * Teilnehmer mit 0 oder ohne Eintrag tragen nichts.
 */
export type ExpenseSplit =
  | { kind: 'equal'; participantIds: readonly string[] }
  | { kind: 'whole_group'; participantIds: readonly string[] }
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
 * Ein Teilnehmer, wie die ganze Gruppe ihn sieht (CONTEXT.md § ganze Gruppe).
 * `joinedAt`: Beitritt (Anlage des Teilnehmers), ISO-Zeit. `decision`: was ein
 * Haushaltsmitglied entschieden hat — ob er auch die Ausgaben „ganze Gruppe“
 * mitträgt, die schon vor seinem Beitritt angelegt waren; `null` = offen.
 */
export interface GroupParticipant {
  id: string
  joinedAt: string
  decision: 'confirmed' | 'rejected' | null
  /** Austritt aus dem Haushalt (nur im Haushaltstopf), sonst `null`. */
  leftAt: string | null
}

/**
 * Wer eine Ausgabe „ganze Gruppe“ trägt, in der Reihenfolge von `group`: wer
 * beim Anlegen der Ausgabe schon dabei war, und wer später dazukam, sobald
 * seine Aufnahme bestätigt ist. Offen oder abgelehnt trägt der Neue nur, was
 * nach seinem Beitritt angelegt wurde. Wer ausgetreten ist, trägt weiter, was
 * vor seinem Austritt angelegt wurde, aber nichts danach. `group` enthält
 * jeden Teilnehmer des Topfs, auch Ehemalige.
 */
export function wholeGroupCarriers(
  expenseCreatedAt: string,
  group: readonly GroupParticipant[],
): string[] {
  const created = Date.parse(expenseCreatedAt)
  return group
    .filter((p) => !p.leftAt || Date.parse(p.leftAt) > created)
    .filter((p) => p.decision === 'confirmed' || Date.parse(p.joinedAt) <= created)
    .map((p) => p.id)
}

/** Eine Ausgabe „ganze Gruppe“ mit dem, was die Meldung über sie braucht. */
interface WholeGroupExpense {
  id: string
  createdAt: string
  payerId: string
  amountCents: number
}

/** Ein Neuer, über dessen Aufnahme ein Haushaltsmitglied entscheiden soll. */
export interface PendingJoin {
  participantId: string
  /** Die früheren Ausgaben „ganze Gruppe“ und sein Anteil daran nach Bestätigung. */
  shares: { expenseId: string; cents: number }[]
  totalCents: number
}

/**
 * Die Meldung zur ganzen Gruppe: jeder Neue ohne Entscheidung, für den es
 * Ausgaben „ganze Gruppe“ von vor seinem Beitritt gibt (Ehemalige nicht mehr),
 * mit seinem Anteil an jeder — so viel, wie er nach einer Bestätigung trüge. Reihenfolge wie `group`.
 */
export function pendingWholeGroupJoins(
  group: readonly GroupParticipant[],
  wholeGroupExpenses: readonly WholeGroupExpense[],
  participantOrder: readonly string[],
): PendingJoin[] {
  return group
    .filter((p) => p.decision === null && !p.leftAt)
    .map((p): PendingJoin => {
      const shares = wholeGroupExpenses
        .filter((e) => Date.parse(e.createdAt) < Date.parse(p.joinedAt))
        .map((e) => {
          const carriers = [...wholeGroupCarriers(e.createdAt, group), p.id]
          const cents = expenseShares(
            { ...e, split: { kind: 'whole_group', participantIds: carriers } },
            participantOrder,
          ).get(p.id)
          return { expenseId: e.id, cents: cents ?? 0 }
        })
      return {
        participantId: p.id,
        shares,
        totalCents: shares.reduce((sum, s) => sum + s.cents, 0),
      }
    })
    .filter((join) => join.shares.length > 0)
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
  if (split.kind === 'equal' || split.kind === 'whole_group') {
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
  if ('values' in split) {
    const values = split.values
    if (participantOrder.some((id) => (values[id] ?? 0) < 0)) {
      return { valid: false, reason: 'negative' }
    }
  }
  const weights = splitWeights(split, participantOrder)
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  if (split.kind === 'percent' && total !== 10000) {
    return { valid: false, reason: 'percent_off', missingHundredthPercent: 10000 - total }
  }
  if (split.kind === 'exact' && total !== expense.amountCents) {
    return { valid: false, reason: 'exact_off', missingCents: expense.amountCents - total }
  }
  if (weights.length === 0) return { valid: false, reason: 'nobody' }
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
