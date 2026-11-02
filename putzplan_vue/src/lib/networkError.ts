// Netzfehler erkennen, ohne den Supabase-Client zu laden: die Offline-Warteschlange
// und ihre Tests brauchen nur die Einordnung, nicht die Verbindung.

/**
 * Netzfehler? Dann ist ein Nachlade-SELECT sinnlos — er läuft in dieselben
 * Timeouts und lässt die Oberfläche sekundenlang widersprüchlich stehen.
 * supabase-js verpackt Netzfehler als `FunctionsFetchError`/`TypeError` mit
 * „Failed to fetch"; zusätzlich zählt ein offline gemeldeter Browser.
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (!error) return false

  const name = (error as { name?: string }).name ?? ''
  if (name === 'FunctionsFetchError' || name === 'AbortError' || name === 'TypeError') return true

  return isNetworkMessage(String((error as { message?: string }).message ?? error))
}

/** Die Fehltexte von fetch in Chrome, Safari, Firefox und Node — auch in einer Hülle wie „TypeError: Failed to fetch". */
export function isNetworkMessage(text: string): boolean {
  const message = text.toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network error') ||
    message.includes('load failed') ||
    message.includes('fetch failed')
  )
}
