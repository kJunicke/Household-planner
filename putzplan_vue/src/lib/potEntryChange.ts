/**
 * Zeile „wer zuletzt geändert hat“ an einem Eintrag im Topf (CONTEXT.md § Topf:
 * jeder Eintrag zeigt, wer ihn zuletzt geändert hat). Solange ihn niemand
 * geändert hat, heißt es „eingetragen von“.
 *
 * Verglichen werden Zeitpunkte: Datenbank und Realtime liefern dieselbe Zeit in
 * wechselnder Schreibweise (Mikrosekunden, Zeitzone). `null`, wenn der
 * Teilnehmer unbekannt ist (gelöscht oder nie gesetzt).
 */
export function entryChangeLine(entry: {
  createdAt: string
  updatedAt: string
  changedByName: string | null
}): string | null {
  if (entry.changedByName === null) return null
  const edited = Date.parse(entry.updatedAt) > Date.parse(entry.createdAt)
  return `${edited ? 'zuletzt geändert' : 'eingetragen'} von ${entry.changedByName}`
}
