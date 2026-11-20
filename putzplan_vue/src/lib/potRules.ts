/**
 * Regeln rund um Töpfe und ihre Teilnehmer (CONTEXT.md § Topf), rein, ohne
 * Datenbank und Oberfläche. Gerechnet wird in der Topf-Rechnung
 * (`./potLedger`), nicht hier.
 */
import { POT_AMOUNT_MAX_CENTS, POT_PARTICIPANT_NAME_MAX_LENGTH } from './limits'
import { parseEuroInput } from './settlementAmount'

interface SortablePot {
  kind: 'household' | 'event'
  closed_at: string | null
  created_at: string
}

const rank = (p: SortablePot) => (p.kind === 'household' ? 0 : p.closed_at ? 2 : 1)

/**
 * Reihenfolge unter Töpfe: der Haushaltstopf oben, darunter die laufenden
 * (neueste zuerst), zuletzt die abgeschlossenen (zuletzt abgeschlossen zuerst).
 */
export function sortPots<T extends SortablePot>(pots: readonly T[]): T[] {
  const time = (p: T) => Date.parse(p.closed_at ?? p.created_at)
  return [...pots].sort((a, b) => rank(a) - rank(b) || time(b) - time(a))
}

/**
 * Was gegen einen Teilnehmernamen spricht, oder `null`: leer, zu lang oder
 * im Topf schon vergeben (Groß-/Kleinschreibung und Leerzeichen am Rand
 * egal, wie der eindeutige Index der Datenbank).
 */
export function participantNameProblem(
  name: string,
  takenNames: readonly string[],
): 'empty' | 'too_long' | 'duplicate' | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'empty'
  if (trimmed.length > POT_PARTICIPANT_NAME_MAX_LENGTH) return 'too_long'
  const key = trimmed.toLowerCase()
  return takenNames.some((t) => t.trim().toLowerCase() === key) ? 'duplicate' : null
}

/**
 * Wer heute an neuen Ausgaben teilnehmen kann. Im Haushaltstopf sind das die
 * heutigen Haushaltsmitglieder: Ehemalige bleiben Teilnehmer (ihre Geschichte
 * und ihr Saldo hängen daran), tragen aber nichts Neues mehr. Im Topf für
 * einen Anlass bleibt jeder Teilnehmer dabei, auch wer den Haushalt verlässt.
 */
export function currentParticipants<T extends { user_id: string | null }>(
  potKind: 'household' | 'event',
  participants: readonly T[],
  memberUserIds: readonly string[],
): T[] {
  if (potKind === 'event') return [...participants]
  return participants.filter((p) => p.user_id !== null && memberUserIds.includes(p.user_id))
}

/** Überschrift eines Topfs: der Haushaltstopf heißt immer so, sonst sein Name. */
export function potTitle(pot: { kind: 'household' | 'event'; name: string }): string {
  return pot.kind === 'household' ? 'Haushaltstopf' : pot.name
}

/**
 * Betrag einer Ausgabe oder Rückzahlung aus dem Textfeld, in ganzen Cent:
 * größer null und höchstens so groß, wie die Datenbank speichert. Sonst `null`.
 */
export function parsePotAmount(text: string): number | null {
  const euros = parseEuroInput(text)
  if (euros === null) return null
  const cents = Math.round(euros * 100)
  return cents > 0 && cents <= POT_AMOUNT_MAX_CENTS ? cents : null
}

/**
 * Hinweis zu einem Problem aus `participantNameProblem`. Leer und zu lang
 * klingen überall gleich; den doppelten Namen erklärt jede Stelle selbst
 * (Gast: „wähl ihn oben aus“).
 */
export function participantNameProblemText(
  problem: 'empty' | 'too_long' | 'duplicate',
  duplicate: string,
): string {
  if (problem === 'empty') return ''
  if (problem === 'too_long') return 'Der Name ist zu lang'
  return duplicate
}
