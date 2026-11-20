/**
 * Höchstens eine Nachfrage je `minGapMs`: mehrere Anlässe kurz hintereinander
 * (eine Salve Fehlermeldungen, Abfrage-Takt, Tab-Wechsel) lösen nur eine
 * Anfrage aus. Rückgabe: darf jetzt (`now`) nachgefragt werden?
 */
export function createRecheckLimiter(minGapMs: number): (now: number) => boolean {
  let last: number | null = null
  return (now) => {
    if (last !== null && now - last < minGapMs) return false
    last = now
    return true
  }
}
