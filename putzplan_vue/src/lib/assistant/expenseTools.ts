/**
 * Die Werkzeuge des Assistenten für Ausgaben und Rückzahlungen in einem Topf:
 * lesen, wer wem wie viel schuldet und wer was bezahlt hat; eintragen, ändern
 * und löschen, je mit Rücknahme. Töpfe selbst (anlegen, abschließen, löschen)
 * gehören nicht hierher.
 *
 * Ausgeführt wird über den potStore wie von Hand und mit den Regeln der
 * Formulare: Beträge in ganzen Cent aus dem Text, wie gesagt, nie gerundet; die
 * Aufteilung wie im Formular, geprüft mit `splitValidity`. Ein abgeschlossener
 * Topf ist schreibgeschützt. Eine Rückzahlung, die mit einem Punkte-Ausgleich
 * verrechnet wurde, ändert und löscht nur ihr Ausgleich, also nie der
 * Assistent: einen Ausgleich fasst er nicht an (CONTEXT.md § Ausgleich).
 *
 * Jede Änderung lässt sich ganz zurücknehmen: das Löschen stellt dieselbe Zeile
 * wieder her, mit Kennung, Zeitstempeln und „zuletzt geändert von“.
 */
import type { PotEntryWrite, usePotStore } from '@/stores/potStore'
import type { Pot, PotExpense, PotRepayment } from '@/types/Pot'
import { POT_EXPENSE_DESCRIPTION_MAX_LENGTH } from '@/lib/limits'
import { formatCents, splitValidity, suggestTransfers, type ExpenseSplit } from '@/lib/potLedger'
import { parsePotAmount, potTitle } from '@/lib/potRules'
import { parseEuroCents } from '@/lib/settlementAmount'
import { toIsoDate } from '@/lib/taskSchedule'
import { changedInPot, error, POT_ID, potPage } from './potToolShared'
import type { AssistantTool, ToolOutcome } from './tools'

/**
 * Die Teile des potStore, die die Werkzeuge brauchen. Hereingereicht statt
 * selbst geholt, damit die Tests einen gefälschten Store geben können; `today`
 * aus demselben Grund.
 */
export interface ExpenseToolStores {
  pots: Pick<
    ReturnType<typeof usePotStore>,
    | 'pots'
    | 'loaded'
    | 'participantsOf'
    | 'currentParticipantsOf'
    | 'wholeGroupCarriersAt'
    | 'expensesOf'
    | 'repaymentsOf'
    | 'balancesOf'
    | 'sharesOf'
    | 'participantName'
    | 'myParticipantId'
    | 'createExpense'
    | 'updateExpense'
    | 'deleteExpense'
    | 'restoreExpense'
    | 'createRepayment'
    | 'updateRepayment'
    | 'deleteRepayment'
    | 'restoreRepayment'
  >
  today: () => Date
}

type Store = ExpenseToolStores['pots']

/** So viele Einträge nennt `read_pot`, neueste zuerst. */
const ENTRIES_MAX = 40

const QUIET = { quiet: true }

const isError = (value: unknown): value is ToolOutcome =>
  typeof value === 'object' && value !== null && 'isError' in value

const settled = async (write: PotEntryWrite) => write.applied && (await write.settled)

const formatDay = (isoDate: string) => isoDate.split('-').reverse().join('.')

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))

/** Der Betrag in ganzen Cent, genau wie gesagt; sonst `null` (nie gerundet). */
const amountOf = (value: unknown): number | null =>
  typeof value === 'string' || typeof value === 'number' ? parsePotAmount(String(value)) : null

const BAD_AMOUNT =
  'Betrag ungültig: Euro größer 0 mit höchstens zwei Nachkommastellen, z. B. „34“ oder „12,50“. ' +
  'Nichts eingetragen; frag nach dem Betrag, statt zu runden.'

const notLoaded = () => error('Die Töpfe sind noch nicht geladen; versuch es gleich noch einmal.')

/** Der Topf zu `input.pot_id`, oder das Fehlerergebnis für Claude. */
function findPot(store: Store, potId: unknown): Pot | ToolOutcome {
  if (!store.loaded) return notLoaded()
  const id = String(potId ?? '')
  return store.pots.find((p) => p.pot_id === id) ?? error(`Unbekannte pot_id ${id}`)
}

/** Das Fehlerergebnis, wenn der Topf abgeschlossen ist; sonst `null`. */
const closedError = (pot: Pot): ToolOutcome | null =>
  pot.closed_at
    ? error(
        `Der Topf ${potTitle(pot)} ist abgeschlossen und damit schreibgeschützt: nichts geändert. ` +
          'Sag das dem Nutzer.',
      )
    : null

/** Der offene Topf zu `potId`, oder das Fehlerergebnis. */
function writablePot(store: Store, potId: unknown): Pot | ToolOutcome {
  const pot = findPot(store, potId)
  if (isError(pot)) return pot
  return closedError(pot) ?? pot
}

const potOf = (store: Store, potId: string) => store.pots.find((p) => p.pot_id === potId)!

// ---------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------

const splitLabel = (store: Store, e: PotExpense): string => {
  switch (e.split_kind) {
    case 'equal': {
      const chosen = Object.keys(e.split_values)
      const all = store.currentParticipantsOf(e.pot_id).map((p) => p.participant_id)
      const everyone = all.length === chosen.length && all.every((id) => chosen.includes(id))
      return everyone ? 'gleich auf alle' : 'gleich auf Auswahl'
    }
    case 'whole_group':
      return 'ganze Gruppe'
    case 'ratio':
      return 'nach Verhältnis'
    case 'percent':
      return 'nach Prozent'
    case 'exact':
      return 'nach Beträgen'
  }
}

/** „Kilian 11,34 €, Anna 11,33 €“: wer an einer Ausgabe wie viel trägt. */
const sharesLine = (store: Store, e: PotExpense) =>
  [...store.sharesOf(e)]
    .map(([id, cents]) => `${store.participantName(id)} ${formatCents(cents)}`)
    .join(', ')

const expenseLine = (store: Store, e: PotExpense) =>
  `${e.description} ${formatCents(e.amount_cents)}, bezahlt von ` +
  `${store.participantName(e.payer_participant_id)}; ${splitLabel(store, e)}: ${sharesLine(store, e)}`

/** „Kilian an Anna“ */
const fromTo = (store: Store, fromId: string, toId: string) =>
  `${store.participantName(fromId)} an ${store.participantName(toId)}`

const repaymentLine = (store: Store, r: PotRepayment) =>
  `${fromTo(store, r.from_participant_id, r.to_participant_id)} ${formatCents(r.amount_cents)}`

function readPot(store: Store, input: Record<string, unknown>): ToolOutcome {
  const pot = findPot(store, input.pot_id)
  if (isError(pot)) return pot
  const id = pot.pot_id
  const me = store.myParticipantId(id)
  const current = new Set(store.currentParticipantsOf(id).map((p) => p.participant_id))
  const balances = store.balancesOf(id)

  const state = pot.closed_at
    ? `abgeschlossen am ${formatDay(pot.closed_at.slice(0, 10))}, schreibgeschützt`
    : pot.kind === 'household'
      ? 'Haushaltstopf, offen'
      : 'offen'
  const participantLines = store.participantsOf(id).map((p) => {
    const marks = [
      `participant_id ${p.participant_id}`,
      p.participant_id === me ? 'du' : null,
      p.user_id === null ? 'Gast' : null,
      current.has(p.participant_id) ? null : 'ehemalig, trägt nichts Neues',
    ].filter(Boolean)
    const cents = balances.get(p.participant_id) ?? 0
    const balance =
      cents > 0
        ? `hat ${formatCents(cents)} gut`
        : cents < 0
          ? `schuldet ${formatCents(-cents)}`
          : 'ausgeglichen'
    return `- ${store.participantName(p.participant_id)} (${marks.join(', ')}): ${balance}`
  })

  const transfers = suggestTransfers(balances).map(
    (t) => `- ${fromTo(store, t.fromId, t.toId)} ${formatCents(t.amountCents)}`,
  )

  type Line = { day: string; createdAt: string; text: string }
  const entries: Line[] = [
    ...store.expensesOf(id).map((e) => ({
      day: e.spent_on,
      createdAt: e.created_at,
      text: `- Ausgabe (id ${e.expense_id}) ${formatDay(e.spent_on)}: ${expenseLine(store, e)}`,
    })),
    ...store.repaymentsOf(id).map((r) => ({
      day: r.paid_on,
      createdAt: r.created_at,
      text:
        `- Rückzahlung (id ${r.repayment_id}) ${formatDay(r.paid_on)}: ${repaymentLine(store, r)}` +
        (r.settlement_id ? ' (mit einem Ausgleich verrechnet, per Chat nicht änderbar)' : ''),
    })),
  ].sort((a, b) => b.day.localeCompare(a.day) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const more =
    entries.length > ENTRIES_MAX ? `\n(${entries.length - ENTRIES_MAX} ältere nicht gezeigt)` : ''

  return {
    result: [
      `Topf ${potTitle(pot)} (id ${id}), ${state}.`,
      `Teilnehmer und Saldo:\n${participantLines.join('\n')}`,
      transfers.length
        ? `Vorgeschlagene Rückzahlungen, damit alle Salden auf null gehen:\n${transfers.join('\n')}`
        : 'Vorgeschlagene Rückzahlungen: keine, alle Salden sind null.',
      entries.length
        ? `Einträge, neueste zuerst:\n${entries
            .slice(0, ENTRIES_MAX)
            .map((e) => e.text)
            .join('\n')}${more}`
        : 'Keine Einträge.',
    ].join('\n\n'),
  }
}

// ---------------------------------------------------------------
// Ausgaben
// ---------------------------------------------------------------

/** Die Teilnehmer in der Reihenfolge des Topfs; an sie gehen Cent-Reste zuerst. */
const potOrder = (store: Store, potId: string) =>
  store.participantsOf(potId).map((p) => p.participant_id)

/** Die ganze Gruppe einer Ausgabe, die `createdAt` angelegt wurde (oder wird). */
const wholeGroupAt = (store: Store, potId: string, createdAt: string): ExpenseSplit => ({
  kind: 'whole_group',
  participantIds: store.wholeGroupCarriersAt(potId, createdAt),
})

/** Zwei Nachkommastellen höchstens, wie im Formular. */
const hasTwoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6

/**
 * Die Aufteilung aus der Eingabe, mit den Regeln des Formulars: wählbar sind
 * nur die heutigen Teilnehmer; „gleich“ ohne Auswahl heißt gleich auf alle.
 * `createdAt` ist die Anlage der Ausgabe, für die ganze Gruppe.
 */
function splitOf(
  store: Store,
  pot: Pot,
  raw: unknown,
  amountCents: number,
  createdAt: string,
): ExpenseSplit | ToolOutcome {
  if (typeof raw !== 'object' || raw === null) {
    return error('Aufteilung fehlt. Frag nach, wer die Ausgabe trägt.')
  }
  const input = raw as { kind?: unknown; participant_ids?: unknown; values?: unknown }
  const current = store.currentParticipantsOf(pot.pot_id).map((p) => p.participant_id)
  const unknownIds = (ids: string[]) => ids.filter((id) => !current.includes(id))
  const unknownError = (ids: string[]) =>
    error(
      `Nicht im Topf ${potTitle(pot)}: participant_id ${ids.join(', ')}. ` +
        'Nimm die IDs aus read_pot; ist eine genannte Person nicht dabei, sag das.',
    )

  let split: ExpenseSplit
  switch (input.kind) {
    case 'equal': {
      const ids = Array.isArray(input.participant_ids) ? input.participant_ids.map(String) : []
      const unknown = unknownIds(ids)
      if (unknown.length) return unknownError(unknown)
      // In Topf-Reihenfolge wie das Formular; ohne Auswahl gleich auf alle.
      split = {
        kind: 'equal',
        participantIds: ids.length ? current.filter((id) => ids.includes(id)) : current,
      }
      break
    }
    case 'whole_group':
      split = wholeGroupAt(store, pot.pot_id, createdAt)
      break
    case 'ratio':
    case 'percent':
    case 'exact': {
      if (typeof input.values !== 'object' || input.values === null) {
        return error('Für ratio, percent und exact braucht es values je participant_id.')
      }
      const entries = Object.entries(input.values as Record<string, unknown>)
      const unknown = unknownIds(entries.map(([id]) => id))
      if (unknown.length) return unknownError(unknown)
      const values: Record<string, number> = {}
      for (const [id, value] of entries) {
        if (input.kind === 'exact') {
          const cents = parseEuroCents(String(value))
          if (cents === null) return error(`Betrag für ${store.participantName(id)} ungültig.`)
          values[id] = cents
        } else {
          const n = Number(value)
          if (!Number.isFinite(n) || n < 0 || !hasTwoDecimals(n)) {
            return error(
              `Wert für ${store.participantName(id)} ungültig (höchstens zwei Nachkommastellen).`,
            )
          }
          values[id] = n
        }
      }
      split = { kind: input.kind, values }
      break
    }
    default:
      return error(`Unbekannte Aufteilung ${String(input.kind)}`)
  }

  const validity = splitValidity({ amountCents, split }, potOrder(store, pot.pot_id))
  if (validity.valid) return split
  const ask = ' Nichts eingetragen; frag nach der Aufteilung.'
  switch (validity.reason) {
    case 'nobody':
      return error(`Niemand trägt die Ausgabe.${ask}`)
    case 'negative':
      return error(`Werte dürfen nicht negativ sein.${ask}`)
    case 'percent_off': {
      const off = validity.missingHundredthPercent
      const text = `${String(Math.abs(off) / 100).replace('.', ',')} %`
      return error(
        `Die Prozente ergeben nicht 100: ${off > 0 ? `es fehlen ${text}` : `${text} zu viel`}.${ask}`,
      )
    }
    case 'exact_off': {
      const off = validity.missingCents
      return error(
        `Die Beträge ergeben nicht ${formatCents(amountCents)}: ` +
          `${off > 0 ? `es fehlen ${formatCents(off)}` : `${formatCents(-off)} zu viel`}.${ask}`,
      )
    }
  }
}

/** Die gespeicherte Aufteilung einer Ausgabe, so wie `updateExpense` sie zurückschreibt. */
const storedSplit = (e: PotExpense): ExpenseSplit =>
  e.split_kind === 'equal'
    ? { kind: 'equal', participantIds: Object.keys(e.split_values) }
    : e.split_kind === 'whole_group'
      ? { kind: 'whole_group', participantIds: [] }
      : { kind: e.split_kind, values: { ...e.split_values } }

type ExpenseInput = Parameters<Store['updateExpense']>[1]

const inputOf = (e: PotExpense): ExpenseInput => ({
  payerId: e.payer_participant_id,
  amountCents: e.amount_cents,
  spentOn: e.spent_on,
  description: e.description,
  split: storedSplit(e),
})

function descriptionOf(value: unknown): string | ToolOutcome {
  const text = String(value ?? '').trim()
  if (!text) return error('Beschreibung fehlt, z. B. „Pizza“. Frag danach.')
  if (text.length > POT_EXPENSE_DESCRIPTION_MAX_LENGTH) {
    return error(`Beschreibung zu lang: höchstens ${POT_EXPENSE_DESCRIPTION_MAX_LENGTH} Zeichen`)
  }
  return text
}

function payerOf(store: Store, pot: Pot, value: unknown): string | ToolOutcome {
  const id = typeof value === 'string' && value ? value : store.myParticipantId(pot.pot_id)
  if (!id) {
    return error(`Du bist im Topf ${potTitle(pot)} kein Teilnehmer: frag, wer bezahlt hat.`)
  }
  const current = store.currentParticipantsOf(pot.pot_id).map((p) => p.participant_id)
  if (!current.includes(id))
    return error(`participant_id ${id} zahlt nicht im Topf ${potTitle(pot)}.`)
  return id
}

async function addExpense(
  stores: ExpenseToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const store = stores.pots
  const pot = writablePot(store, input.pot_id)
  if (isError(pot)) return pot
  const description = descriptionOf(input.description)
  if (isError(description)) return description
  const amountCents = amountOf(input.amount)
  if (amountCents === null) return error(BAD_AMOUNT)
  const payerId = payerOf(store, pot, input.payer_participant_id)
  if (isError(payerId)) return payerId
  const spentOn = input.spent_on === undefined ? toIsoDate(stores.today()) : input.spent_on
  if (!isIsoDate(spentOn)) return error('spent_on muss ein Datum YYYY-MM-DD sein.')
  const split = splitOf(store, pot, input.split, amountCents, stores.today().toISOString())
  if (isError(split)) return split

  const write = store.createExpense({
    potId: pot.pot_id,
    payerId,
    amountCents,
    spentOn,
    description,
    split,
  })
  const id = write.id
  const line = `${description} ${formatCents(amountCents)}`
  if (!id || !(await settled(write))) {
    return { ...error('Ausgabe nicht eingetragen.'), summary: `✗ nicht eingetragen: ${line}` }
  }
  const added = store.expensesOf(pot.pot_id).find((e) => e.expense_id === id)
  return changedInPot(
    `Ausgabe eingetragen (id ${id}) im Topf ${potTitle(pot)}: ` +
      (added ? expenseLine(store, added) : line),
    {
      summary: `✓ ${line} → ${potTitle(pot)}`,
      undo: () => settled(store.deleteExpense(id, QUIET)),
    },
    { id, page: potPage(pot.pot_id) },
  )
}

/** Die Ausgabe zu `input.expense_id` in einem offenen Topf, oder das Fehlerergebnis. */
function findExpense(store: Store, input: Record<string, unknown>): PotExpense | ToolOutcome {
  if (!store.loaded) return notLoaded()
  const id = String(input.expense_id ?? '')
  const found = store.pots
    .flatMap((p) => store.expensesOf(p.pot_id))
    .find((e) => e.expense_id === id)
  if (!found) return error(`Unbekannte expense_id ${id}`)
  return closedError(potOf(store, found.pot_id)) ?? found
}

async function updateExpense(store: Store, input: Record<string, unknown>): Promise<ToolOutcome> {
  const found = findExpense(store, input)
  if (isError(found)) return found
  const pot = potOf(store, found.pot_id)
  const before = inputOf(found)
  const after = { ...before }
  const what: string[] = []

  if (input.description !== undefined) {
    const description = descriptionOf(input.description)
    if (isError(description)) return description
    after.description = description
    if (description !== before.description) what.push(`„${description}“`)
  }
  if (input.amount !== undefined) {
    const amountCents = amountOf(input.amount)
    if (amountCents === null) return error(BAD_AMOUNT)
    after.amountCents = amountCents
    if (amountCents !== before.amountCents) what.push(formatCents(amountCents))
  }
  if (input.payer_participant_id !== undefined) {
    const payerId = payerOf(store, pot, input.payer_participant_id)
    if (isError(payerId)) return payerId
    after.payerId = payerId
    if (payerId !== before.payerId) what.push(`bezahlt von ${store.participantName(payerId)}`)
  }
  if (input.spent_on !== undefined) {
    if (!isIsoDate(input.spent_on)) return error('spent_on muss ein Datum YYYY-MM-DD sein.')
    after.spentOn = input.spent_on
    if (input.spent_on !== before.spentOn) what.push(`am ${formatDay(input.spent_on)}`)
  }
  if (input.split !== undefined) {
    const split = splitOf(store, pot, input.split, after.amountCents, found.created_at)
    if (isError(split)) return split
    after.split = split
    what.push('neue Aufteilung')
  } else {
    // Ein neuer Betrag muss zur alten Aufteilung passen (Prozente, Beträge).
    const kept =
      before.split.kind === 'whole_group'
        ? wholeGroupAt(store, pot.pot_id, found.created_at)
        : before.split
    const order = potOrder(store, pot.pot_id)
    if (!splitValidity({ amountCents: after.amountCents, split: kept }, order).valid) {
      return error(
        'Mit dem neuen Betrag geht die Aufteilung nach Beträgen nicht mehr auf. Nichts geändert; ' +
          'frag nach der neuen Aufteilung.',
      )
    }
  }
  if (what.length === 0) return error('Nichts zu ändern: die Ausgabe steht schon so.')

  const id = found.expense_id
  if (!(await settled(store.updateExpense(id, after)))) {
    return { ...error('Nicht geändert'), summary: `✗ nicht geändert: ${found.description}` }
  }
  const changed = store.expensesOf(pot.pot_id).find((e) => e.expense_id === id)
  const line = `${before.description} → ${what.join(', ')}`
  return changedInPot(
    `Geändert: ${changed ? expenseLine(store, changed) : line}.`,
    {
      summary: `✓ geändert: ${line}`,
      undo: () => settled(store.updateExpense(id, before)),
    },
    { id, page: potPage(pot.pot_id) },
  )
}

function deleteExpense(store: Store, input: Record<string, unknown>): ToolOutcome {
  const found = findExpense(store, input)
  if (isError(found)) return found
  const row = { ...found, split_values: { ...found.split_values } }
  const potName = potTitle(potOf(store, row.pot_id))
  const amount = formatCents(row.amount_cents)
  return {
    result: 'Wartet auf die Bestätigung des Nutzers.',
    deleteCard: {
      what:
        `Ausgabe „${row.description}“ (${amount}, bezahlt von ` +
        `${store.participantName(row.payer_participant_id)}) im Topf ${potName}`,
      confirm: async () => {
        if (!(await settled(store.deleteExpense(row.expense_id, QUIET)))) {
          return { ...error('Nichts gelöscht.'), summary: `✗ nicht gelöscht: ${row.description}` }
        }
        return changedInPot(
          `Ausgabe gelöscht (id ${row.expense_id}).`,
          {
            summary: `✓ Ausgabe gelöscht: ${row.description} ${amount} (${potName})`,
            undo: () => settled(store.restoreExpense(row)),
          },
          // Die App geht in den Topf; die Ausgabe leuchtet auf, wenn Rückgängig sie zurückholt.
          { id: row.expense_id, page: potPage(row.pot_id), removed: true },
        )
      },
    },
  }
}

// ---------------------------------------------------------------
// Rückzahlungen
// ---------------------------------------------------------------

/** Ein Teilnehmer des Topfs (auch ehemalig, wie im Formular), oder das Fehlerergebnis. */
function participantOf(store: Store, pot: Pot, id: string): string | ToolOutcome {
  return store.participantsOf(pot.pot_id).some((p) => p.participant_id === id)
    ? id
    : error(`participant_id ${id} ist nicht im Topf ${potTitle(pot)}. Nimm die IDs aus read_pot.`)
}

async function addRepayment(
  stores: ExpenseToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const store = stores.pots
  const pot = writablePot(store, input.pot_id)
  if (isError(pot)) return pot
  const named = typeof input.from_participant_id === 'string' && input.from_participant_id
  const sender = named || store.myParticipantId(pot.pot_id)
  if (!sender) {
    return error(`Du bist im Topf ${potTitle(pot)} kein Teilnehmer: frag, wer überwiesen hat.`)
  }
  const fromId = participantOf(store, pot, sender)
  if (isError(fromId)) return fromId
  const toId = participantOf(store, pot, String(input.to_participant_id ?? ''))
  if (isError(toId)) return toId
  if (fromId === toId) return error('Von und an sind dieselbe Person. Frag nach, an wen.')
  const amountCents = amountOf(input.amount)
  if (amountCents === null) return error(BAD_AMOUNT)
  const paidOn = input.paid_on === undefined ? toIsoDate(stores.today()) : input.paid_on
  if (!isIsoDate(paidOn)) return error('paid_on muss ein Datum YYYY-MM-DD sein.')

  const write = store.createRepayment({ potId: pot.pot_id, fromId, toId, amountCents, paidOn })
  const line = `${fromTo(store, fromId, toId)} ${formatCents(amountCents)}`
  const id = write.id
  if (!id || !(await settled(write))) {
    return { ...error('Rückzahlung nicht eingetragen.'), summary: `✗ nicht eingetragen: ${line}` }
  }
  return changedInPot(
    `Rückzahlung eingetragen (id ${id}) im Topf ${potTitle(pot)}: ${line}.`,
    {
      summary: `✓ Rückzahlung: ${line} (${potTitle(pot)})`,
      undo: () => settled(store.deleteRepayment(id, QUIET)),
    },
    { id, page: potPage(pot.pot_id) },
  )
}

/** Die Rückzahlung zu `input.repayment_id`, die der Assistent ändern darf, oder das Fehlerergebnis. */
function findRepayment(store: Store, input: Record<string, unknown>): PotRepayment | ToolOutcome {
  if (!store.loaded) return notLoaded()
  const id = String(input.repayment_id ?? '')
  const found = store.pots
    .flatMap((p) => store.repaymentsOf(p.pot_id))
    .find((r) => r.repayment_id === id)
  if (!found) return error(`Unbekannte repayment_id ${id}`)
  if (found.settlement_id) {
    return error(
      'Diese Rückzahlung ist mit einem Ausgleich verrechnet; ändern oder löschen lässt sie sich ' +
        'nur über ihren Ausgleich, von Hand. Nichts geändert.',
    )
  }
  return closedError(potOf(store, found.pot_id)) ?? found
}

async function updateRepayment(store: Store, input: Record<string, unknown>): Promise<ToolOutcome> {
  const found = findRepayment(store, input)
  if (isError(found)) return found
  const pot = potOf(store, found.pot_id)
  const before = {
    fromId: found.from_participant_id,
    toId: found.to_participant_id,
    amountCents: found.amount_cents,
    paidOn: found.paid_on,
  }
  const after = { ...before }
  const what: string[] = []
  if (input.from_participant_id !== undefined) {
    const id = participantOf(store, pot, String(input.from_participant_id))
    if (isError(id)) return id
    after.fromId = id
  }
  if (input.to_participant_id !== undefined) {
    const id = participantOf(store, pot, String(input.to_participant_id))
    if (isError(id)) return id
    after.toId = id
  }
  if (after.fromId === after.toId)
    return error('Von und an wären dieselbe Person. Nichts geändert.')
  if (after.fromId !== before.fromId || after.toId !== before.toId) {
    what.push(fromTo(store, after.fromId, after.toId))
  }
  if (input.amount !== undefined) {
    const amountCents = amountOf(input.amount)
    if (amountCents === null) return error(BAD_AMOUNT)
    after.amountCents = amountCents
    if (amountCents !== before.amountCents) what.push(formatCents(amountCents))
  }
  if (input.paid_on !== undefined) {
    if (!isIsoDate(input.paid_on)) return error('paid_on muss ein Datum YYYY-MM-DD sein.')
    after.paidOn = input.paid_on
    if (input.paid_on !== before.paidOn) what.push(`am ${formatDay(input.paid_on)}`)
  }
  if (what.length === 0) return error('Nichts zu ändern: die Rückzahlung steht schon so.')

  const id = found.repayment_id
  const name = `Rückzahlung ${fromTo(store, before.fromId, before.toId)}`
  if (!(await settled(store.updateRepayment(id, after)))) {
    return { ...error('Nicht geändert'), summary: `✗ nicht geändert: ${name}` }
  }
  const line = `${name} → ${what.join(', ')}`
  return changedInPot(
    `Geändert: ${line}.`,
    {
      summary: `✓ geändert: ${line}`,
      undo: () => settled(store.updateRepayment(id, before)),
    },
    { id, page: potPage(pot.pot_id) },
  )
}

function deleteRepayment(store: Store, input: Record<string, unknown>): ToolOutcome {
  const found = findRepayment(store, input)
  if (isError(found)) return found
  const row = { ...found }
  const potName = potTitle(potOf(store, row.pot_id))
  const who = fromTo(store, row.from_participant_id, row.to_participant_id)
  const amount = formatCents(row.amount_cents)
  return {
    result: 'Wartet auf die Bestätigung des Nutzers.',
    deleteCard: {
      what: `Rückzahlung ${who} (${amount}) im Topf ${potName}`,
      confirm: async () => {
        if (!(await settled(store.deleteRepayment(row.repayment_id, QUIET)))) {
          return { ...error('Nichts gelöscht.'), summary: `✗ nicht gelöscht: Rückzahlung ${who}` }
        }
        return changedInPot(
          `Rückzahlung gelöscht (id ${row.repayment_id}).`,
          {
            summary: `✓ Rückzahlung gelöscht: ${who} ${amount} (${potName})`,
            undo: () => settled(store.restoreRepayment(row)),
          },
          { id: row.repayment_id, page: potPage(row.pot_id), removed: true },
        )
      },
    },
  }
}

// ---------------------------------------------------------------
// Definitionen für Claude
// ---------------------------------------------------------------

const AMOUNT = {
  type: 'string',
  description: 'Betrag in Euro genau wie gesagt, z. B. „34“ oder „12,50“; nie selbst gerundet',
}
const PARTICIPANT = (what: string) => ({
  type: 'string',
  description: `participant_id ${what} aus read_pot`,
})

const SPLIT = {
  type: 'object',
  description:
    'Aufteilung, wie gesagt. equal = gleich: ohne participant_ids auf alle heutigen Teilnehmer ' +
    '(„für alle“, „für uns alle“), mit participant_ids nur auf diese. whole_group = ganze Gruppe: ' +
    'nur, wenn der Nutzer „ganze Gruppe“ sagt; dann tragen auch später Dazukommende mit. ratio, ' +
    'percent, exact = erweitert: values je participant_id als Verhältnis (2:1 → 2 und 1), Prozent ' +
    '(Summe 100) oder Euro-Betrag (Summe = Betrag). Sagt der Satz nicht, wer trägt, frag nach.',
  properties: {
    kind: { type: 'string', enum: ['equal', 'whole_group', 'ratio', 'percent', 'exact'] },
    participant_ids: { type: 'array', items: { type: 'string' } },
    values: { type: 'object', additionalProperties: { type: ['number', 'string'] } },
  },
  required: ['kind'],
}

export const expenseTools = (stores: ExpenseToolStores): AssistantTool[] => [
  {
    name: 'read_pot',
    description:
      'Liest einen Topf: Teilnehmer mit participant_id und Saldo (wer wie viel gut hat oder ' +
      'schuldet), die vorgeschlagenen Rückzahlungen (wer wem wie viel überweist) und die Ausgaben ' +
      'und Rückzahlungen mit ID, wer bezahlt hat und wie aufgeteilt ist. Für „wer schuldet wem“, ' +
      '„wer hat was bezahlt“ und vor jedem Eintragen, Ändern oder Löschen.',
    input_schema: { type: 'object', properties: { pot_id: POT_ID }, required: ['pot_id'] },
    execute: async (input) => readPot(stores.pots, input),
  },
  {
    name: 'add_expense',
    description:
      'Trägt eine Ausgabe in einen offenen Topf ein, wie „+ Ausgabe“: Beschreibung, Betrag, wer ' +
      'bezahlt hat (ohne Angabe der Fragende), Datum (ohne Angabe heute) und Aufteilung. Betrag ' +
      'und Aufteilung genau wie gesagt; ist eins davon unklar, frag nach, statt zu raten. Ein ' +
      'abgeschlossener Topf ist schreibgeschützt.',
    input_schema: {
      type: 'object',
      properties: {
        pot_id: POT_ID,
        description: { type: 'string', description: 'Wofür, z. B. „Pizza“' },
        amount: AMOUNT,
        payer_participant_id: PARTICIPANT('dessen, der bezahlt hat; ohne Angabe der Fragende'),
        spent_on: { type: 'string', description: 'Optional: Datum YYYY-MM-DD, sonst heute' },
        split: SPLIT,
      },
      required: ['pot_id', 'description', 'amount', 'split'],
    },
    execute: (input) => addExpense(stores, input),
  },
  {
    name: 'update_expense',
    description:
      'Ändert eine Ausgabe wie ihr Bearbeiten-Fenster: Beschreibung, Betrag, wer bezahlt hat, ' +
      'Datum oder Aufteilung. Nur die genannten Felder ändern sich. Nicht in abgeschlossenen Töpfen.',
    input_schema: {
      type: 'object',
      properties: {
        expense_id: { type: 'string', description: 'ID der Ausgabe aus read_pot' },
        description: { type: 'string' },
        amount: AMOUNT,
        payer_participant_id: PARTICIPANT('dessen, der bezahlt hat'),
        spent_on: { type: 'string', description: 'Datum YYYY-MM-DD' },
        split: SPLIT,
      },
      required: ['expense_id'],
    },
    execute: (input) => updateExpense(stores.pots, input),
  },
  {
    name: 'delete_expense',
    description:
      'Löscht eine Ausgabe. Vorher zeigt die App dem Nutzer eine Karte mit „Löschen“ und ' +
      '„Abbrechen“; frag darum nicht selbst nach, und melde das Löschen erst, wenn das Ergebnis es ' +
      'bestätigt.',
    input_schema: {
      type: 'object',
      properties: { expense_id: { type: 'string', description: 'ID der Ausgabe aus read_pot' } },
      required: ['expense_id'],
    },
    execute: async (input) => deleteExpense(stores.pots, input),
  },
  {
    name: 'add_repayment',
    description:
      'Trägt eine Rückzahlung in einen offenen Topf ein: Geld, das einer einem anderen gegeben oder ' +
      'überwiesen hat („Ich hab Anna 50 € gegeben“). Keine Ausgabe. Von ohne Angabe der Fragende, ' +
      'Datum ohne Angabe heute. Fehlt der Betrag, darfst du den Vorschlag aus read_pot nennen und ' +
      'fragen, ob es der war.',
    input_schema: {
      type: 'object',
      properties: {
        pot_id: POT_ID,
        from_participant_id: PARTICIPANT('dessen, der gezahlt hat; ohne Angabe der Fragende'),
        to_participant_id: PARTICIPANT('dessen, der das Geld bekam'),
        amount: AMOUNT,
        paid_on: { type: 'string', description: 'Optional: Datum YYYY-MM-DD, sonst heute' },
      },
      required: ['pot_id', 'to_participant_id', 'amount'],
    },
    execute: (input) => addRepayment(stores, input),
  },
  {
    name: 'update_repayment',
    description:
      'Ändert eine Rückzahlung: von, an, Betrag oder Datum. Nur die genannten Felder ändern sich. ' +
      'Nicht in abgeschlossenen Töpfen.',
    input_schema: {
      type: 'object',
      properties: {
        repayment_id: { type: 'string', description: 'ID der Rückzahlung aus read_pot' },
        from_participant_id: PARTICIPANT('dessen, der gezahlt hat'),
        to_participant_id: PARTICIPANT('dessen, der das Geld bekam'),
        amount: AMOUNT,
        paid_on: { type: 'string', description: 'Datum YYYY-MM-DD' },
      },
      required: ['repayment_id'],
    },
    execute: (input) => updateRepayment(stores.pots, input),
  },
  {
    name: 'delete_repayment',
    description:
      'Löscht eine Rückzahlung, erst nach der Karte mit „Löschen“ und „Abbrechen“ wie ' +
      'delete_expense.',
    input_schema: {
      type: 'object',
      properties: {
        repayment_id: { type: 'string', description: 'ID der Rückzahlung aus read_pot' },
      },
      required: ['repayment_id'],
    },
    execute: async (input) => deleteRepayment(stores.pots, input),
  },
]
