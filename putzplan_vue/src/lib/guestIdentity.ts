/**
 * Wer ein **Gast** in einem Topf ist (CONTEXT.md § Gast; ADR-0006): die
 * gewählte Teilnehmer-Kennung, je Topf im Browser gemerkt. Niemand prüft sie —
 * Vertrauensbasis. Ist sie vergessen oder gibt es den Teilnehmer nicht mehr,
 * wählt der Gast neu.
 *
 * Ein Speicher, der wirft (privater Modus, voll), gilt als leer: dann wählt
 * der Gast eben bei jedem Öffnen.
 */
type GuestStorage = Pick<Storage, 'getItem' | 'setItem'>

const key = (potId: string) => `putzplan.guest.participant.${potId}`

/** Gemerkte Kennung, wenn sie noch zu einem Teilnehmer des Topfs gehört. */
export function rememberedGuestParticipant(
  storage: GuestStorage,
  potId: string,
  participantIds: readonly string[],
): string | null {
  let id: string | null
  try {
    id = storage.getItem(key(potId))
  } catch {
    return null
  }
  return id !== null && participantIds.includes(id) ? id : null
}

export function rememberGuestParticipant(
  storage: GuestStorage,
  potId: string,
  participantId: string,
): void {
  try {
    storage.setItem(key(potId), participantId)
  } catch {
    // Nicht gemerkt — beim nächsten Öffnen wählt der Gast neu.
  }
}
