/**
 * Die Werkzeuge des Assistenten für Töpfe für einen Anlass (CONTEXT.md § Topf):
 * anlegen, abschließen, wieder öffnen und löschen. Ausgaben, Rückzahlungen und
 * Salden gehören nicht hierher.
 *
 * Grenzen (Spec D4, D5, D19):
 * - Den **Haushaltstopf** schließt und löscht kein Werkzeug; die Datenbank
 *   verbietet es ohnehin.
 * - Teilnehmer beim Anlegen sind Haushaltsmitglieder. Gäste kommen über den
 *   **Gastlink**, und den fasst der Assistent nicht an.
 * - Nichts hier verrechnet oder gleicht aus.
 *
 * Was sich zurücknehmen lässt: Anlegen (solange der Topf leer ist), Abschließen
 * und Wieder öffnen ganz. Löschen gar nicht: Zurückholen kann der Client einen
 * Topf nicht, er legt keine Zeile in `pots` an, nur `create_event_pot` einen
 * neuen Topf mit neuen Teilnehmern (andere Kennungen, Anlagezeiten und offene
 * Entscheidungen zur ganzen Gruppe; die Rechnung hinge daran). Den Gastlink
 * löscht die Datenbank mit. Darum geht Löschen nur über die Karte, die das sagt,
 * und ohne Rückgängig.
 */
import type { useHouseholdStore } from '@/stores/householdStore'
import type { usePotStore } from '@/stores/potStore'
import { POT_NAME_MAX_LENGTH } from '@/lib/limits'
import { undoAll, type AssistantTool, type Change, type ToolOutcome } from './tools'

/** Die Teile der Stores, die die Werkzeuge brauchen; hereingereicht, damit Tests sie fälschen können. */
export interface PotToolStores {
  pots: Pick<
    ReturnType<typeof usePotStore>,
    | 'pots'
    | 'participantsOf'
    | 'expensesOf'
    | 'repaymentsOf'
    | 'balancesOf'
    | 'createEventPot'
    | 'setPotClosed'
    | 'deletePot'
  >
  household: Pick<ReturnType<typeof useHouseholdStore>, 'householdMembers'>
  /** Ob der Topf einen Gastlink hat; der endet mit ihm. */
  hasGuestLink: (potId: string) => boolean
}

const POT_ID = { type: 'string', description: 'ID des Topfs aus der Übersicht' }

const error = (result: string): ToolOutcome => ({ result, isError: true })

const potPage = (potId: string) => ({ area: 'pot', potId }) as const

/** Ein Ergebnis aus genau einer rücknehmbaren Änderung am Topf `potId`; die App führt zu ihm. */
function changedPot(potId: string, result: string, change: Change): ToolOutcome {
  return {
    result,
    summary: change.summary,
    undo: undoAll([change.undo]),
    changed: [{ id: potId, page: potPage(potId) }],
    changes: [change],
  }
}

type Pot = PotToolStores['pots']['pots'][number]

/** Der Topf für einen Anlass zur ID, oder das Fehlerergebnis für Claude. */
function findEventPot(stores: PotToolStores, input: Record<string, unknown>): Pot | ToolOutcome {
  const potId = String(input.pot_id ?? '')
  const pot = stores.pots.pots.find((p) => p.pot_id === potId)
  if (!pot) return error(`Unbekannte pot_id ${potId}`)
  if (pot.kind === 'household') {
    return error(
      'Der Haushaltstopf ist immer da: ihn schließt und löscht niemand, auch nicht von Hand.',
    )
  }
  return pot
}

const isPot = (found: Pot | ToolOutcome): found is Pot => 'pot_id' in found

function countOf(n: number, one: string, many: string) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`
}

/** „mit 2 Ausgaben und 1 Rückzahlung“, „ohne Ausgaben“ */
function contents(stores: PotToolStores, potId: string): string {
  const expenses = stores.pots.expensesOf(potId).length
  const repayments = stores.pots.repaymentsOf(potId).length
  const parts = [
    ...(expenses ? [countOf(expenses, 'Ausgabe', 'Ausgaben')] : []),
    ...(repayments ? [countOf(repayments, 'Rückzahlung', 'Rückzahlungen')] : []),
  ]
  return parts.length ? `mit ${parts.join(' und ')}` : 'ohne Ausgaben'
}

async function createPot(
  stores: PotToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const name = String(input.name ?? '').trim()
  if (!name) return error('Kein Name für den Topf')
  if (name.length > POT_NAME_MAX_LENGTH) {
    return error(`Name zu lang: höchstens ${POT_NAME_MAX_LENGTH} Zeichen`)
  }
  const members = stores.household.householdMembers
  const wanted = Array.isArray(input.member_ids)
    ? input.member_ids.map(String)
    : members.map((m) => m.user_id)
  const strangers = wanted.filter((id) => !members.some((m) => m.user_id === id))
  if (strangers.length) {
    return error(
      `Kein Haushaltsmitglied: ${strangers.join(', ')}. Teilnehmer beim Anlegen sind nur ` +
        'Mitglieder; Gäste kommen über den Gastlink, den man im Topf von Hand anlegt.',
    )
  }
  if (wanted.length === 0) return error('Keine Teilnehmer: mindestens ein Mitglied nennen')
  const potId = await stores.pots.createEventPot({ name, memberIds: wanted, guestNames: [] })
  if (!potId)
    return { ...error('Anlegen fehlgeschlagen'), summary: `✗ Topf nicht angelegt: ${name}` }
  const names = members.filter((m) => wanted.includes(m.user_id)).map((m) => m.display_name)
  const undo = async () => {
    // Ein Rückgängig löscht den Topf; was inzwischen darin steht, ginge mit.
    const hasContent =
      stores.pots.expensesOf(potId).length > 0 ||
      stores.pots.repaymentsOf(potId).length > 0 ||
      stores.hasGuestLink(potId)
    return !hasContent && stores.pots.deletePot(potId)
  }
  return changedPot(
    potId,
    `Topf „${name}“ angelegt (id ${potId}), Teilnehmer: ${names.join(', ')}. ` +
      'Er steht ab der nächsten Frage in der Übersicht. Gäste kommen über den Gastlink, ' +
      'den man im Topf von Hand anlegt.',
    { summary: `✓ neuer Topf: ${name}`, undo },
  )
}

function closePot(stores: PotToolStores, input: Record<string, unknown>): ToolOutcome {
  const pot = findEventPot(stores, input)
  if (!isPot(pot)) return pot
  if (pot.closed_at) return error(`Der Topf „${pot.name}“ ist schon abgeschlossen`)
  if (!stores.pots.setPotClosed(pot.pot_id, true)) {
    return { ...error('Abschließen fehlgeschlagen'), summary: `✗ nicht abgeschlossen: ${pot.name}` }
  }
  const open = [...stores.pots.balancesOf(pot.pot_id).values()].some((cents) => cents !== 0)
  return changedPot(
    pot.pot_id,
    `Topf „${pot.name}“ abgeschlossen, jetzt schreibgeschützt.` +
      (open ? ' Es ist noch Geld offen; sag das dem Nutzer.' : ''),
    {
      summary: `✓ abgeschlossen: Topf ${pot.name}`,
      undo: async () => stores.pots.setPotClosed(pot.pot_id, false),
    },
  )
}

function reopenPot(stores: PotToolStores, input: Record<string, unknown>): ToolOutcome {
  const pot = findEventPot(stores, input)
  if (!isPot(pot)) return pot
  const closedAt = pot.closed_at
  if (!closedAt) return error(`Der Topf „${pot.name}“ ist nicht abgeschlossen`)
  if (!stores.pots.setPotClosed(pot.pot_id, false)) {
    return { ...error('Öffnen fehlgeschlagen'), summary: `✗ nicht geöffnet: ${pot.name}` }
  }
  return changedPot(pot.pot_id, `Topf „${pot.name}“ wieder geöffnet.`, {
    summary: `✓ wieder geöffnet: Topf ${pot.name}`,
    // Mit dem alten Datum: „Abgeschlossen am …“ steht wieder wie vorher.
    undo: async () => stores.pots.setPotClosed(pot.pot_id, true, closedAt),
  })
}

function deletePot(stores: PotToolStores, input: Record<string, unknown>): ToolOutcome {
  const pot = findEventPot(stores, input)
  if (!isPot(pot)) return pot
  const what = `Topf „${pot.name}“ ${contents(stores, pot.pot_id)}`
  const guestLink = stores.hasGuestLink(pot.pot_id) ? '; sein Gastlink endet' : ''
  return {
    result: 'Wartet auf die Bestätigung des Nutzers.',
    deleteCard: {
      what: `${what}${guestLink}; lässt sich nicht zurücknehmen`,
      confirm: async () => {
        if (!stores.pots.deletePot(pot.pot_id)) {
          return { ...error('Löschen fehlgeschlagen'), summary: `✗ nicht gelöscht: ${what}` }
        }
        return {
          result: `Gelöscht: ${what}. Das lässt sich nicht zurücknehmen.`,
          summary: `✓ gelöscht: ${what}`,
        }
      },
    },
  }
}

export const potTools = (stores: PotToolStores): AssistantTool[] => [
  {
    name: 'create_pot',
    description:
      'Legt einen Topf für einen Anlass an (Urlaub, Feier), in dem Teilnehmer Ausgaben teilen. ' +
      'Teilnehmer sind Haushaltsmitglieder: ohne member_ids alle. Gäste trägt das Werkzeug nicht ' +
      'ein; sie kommen über den Gastlink, den man im Topf von Hand anlegt.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name des Anlasses, z. B. „Skiurlaub“' },
        member_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: user_ids der Mitglieder aus der Übersicht; ohne = alle',
        },
      },
      required: ['name'],
    },
    execute: (input) => createPot(stores, input),
  },
  {
    name: 'close_pot',
    description:
      'Schließt einen Topf für einen Anlass ab: danach schreibgeschützt, unter „Abgeschlossen“. ' +
      'Nie den Haushaltstopf.',
    input_schema: { type: 'object', properties: { pot_id: POT_ID }, required: ['pot_id'] },
    execute: async (input) => closePot(stores, input),
  },
  {
    name: 'reopen_pot',
    description: 'Öffnet einen abgeschlossenen Topf wieder, damit man wieder eintragen kann.',
    input_schema: { type: 'object', properties: { pot_id: POT_ID }, required: ['pot_id'] },
    execute: async (input) => reopenPot(stores, input),
  },
  {
    name: 'delete_pot',
    description:
      'Löscht einen Topf für einen Anlass samt Ausgaben und Rückzahlungen, nie den Haushaltstopf. ' +
      'Vor dem Löschen zeigt die App dem Nutzer eine Karte mit „Löschen“ und „Abbrechen“; frag ' +
      'darum nicht selbst nach, und melde das Löschen erst, wenn das Ergebnis es bestätigt. ' +
      'Zurücknehmen lässt es sich nicht.',
    input_schema: { type: 'object', properties: { pot_id: POT_ID }, required: ['pot_id'] },
    execute: async (input) => deletePot(stores, input),
  },
]
