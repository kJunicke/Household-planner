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

const NETWORK_TEXTS = [
  'failed to fetch',
  'networkerror',
  'network error',
  'load failed',
  'fetch failed',
  'the network connection was lost',
  'the internet connection appears to be offline',
  'the request timed out',
]

/**
 * Die Fehltexte von fetch in Chrome, Safari, Firefox und Node — auch in einer
 * Hülle wie „TypeError: Failed to fetch". Safari/WebKit (iOS) meldet ein
 * Funkloch nicht als „Failed to fetch", sondern mit eigenen Sätzen.
 */
function isNetworkMessage(text: string): boolean {
  const message = text.toLowerCase()
  return NETWORK_TEXTS.some((t) => message.includes(t))
}

/**
 * So verpackt postgrest-js jeden gescheiterten fetch: kein Wurf, sondern
 * `{ message: '<Name>: <Text>', code: '' }` mit `status: 0`. Der Text hängt am
 * Browser und an der Sprache; Name und leerer Code sind das Verlässliche.
 */
const WRAPPED_FETCH_FAILURE = /^(TypeError|FetchError|AbortError): /

/**
 * Wird ein späterer Versuch derselben Anfrage wahrscheinlich gelingen? Ja bei
 * Netzfehlern (auch mit `navigator.onLine === true`: Funkloch, Captive Portal)
 * und bei HTTP 5xx (Gateway, Cloudflare 520–599, überlastete Datenbank).
 *
 * Ein echter `TypeError` aus einem Programmfehler ist eine Error-Instanz ohne
 * die Hülle oben und gilt nicht als vorübergehend — sonst hielte er die
 * Offline-Warteschlange für immer an, statt nach ein paar Versuchen verworfen
 * zu werden.
 *
 * Den HTTP-Status kennt nur die Antwort, nicht ihr `error`; wer ihn auswerten
 * lassen will, wirft `withStatus(error, status)`.
 */
export function isTransientFailure(error: unknown): boolean {
  if (!error) return false
  const status = (error as { status?: unknown }).status
  if (typeof status === 'number' && status >= 500 && status <= 599) return true

  const message = String((error as { message?: unknown }).message ?? error)
  if (isNetworkMessage(message)) return true

  if (error instanceof Error) return false
  const code = (error as { code?: unknown }).code
  return (code === '' || code === undefined) && WRAPPED_FETCH_FAILURE.test(message)
}

/** Den HTTP-Status einer Supabase-Antwort an ihren Fehler hängen, bevor er geworfen wird. */
export function withStatus<E extends object>(error: E, status: number): E & { status: number } {
  return Object.assign(error, { status })
}
