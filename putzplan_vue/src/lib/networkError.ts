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
 * Gateway- und Verbindungsstörungen: 502/503/504 und Cloudflares 520 kommen von
 * vor der Datenbank, die SQLSTATEs und PGRST000–003 von einer Datenbank, die
 * gerade nicht kann (Serialisierung, Deadlock, Verbindung, Ressourcen).
 */
const TRANSIENT_STATUSES = new Set([502, 503, 504, 520])
const TRANSIENT_CODES = new Set(['40001', '40P01', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'])
const TRANSIENT_CLASSES = ['08', '53']

/**
 * Wird ein späterer Versuch derselben Anfrage wahrscheinlich gelingen? Ja bei
 * Netzfehlern (auch mit `navigator.onLine === true`: Funkloch, Captive Portal)
 * und bei den Störungen oben. Andere 5xx sind es nicht sicher — die zählt die
 * Warteschlange in einem eigenen Budget (`judgeFailure`).
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
  if (typeof status === 'number' && TRANSIENT_STATUSES.has(status)) return true

  const message = String((error as { message?: unknown }).message ?? error)
  if (isNetworkMessage(message)) return true

  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && code !== '') {
    return TRANSIENT_CODES.has(code) || TRANSIENT_CLASSES.some((c) => code.startsWith(c))
  }
  if (error instanceof Error) return false
  return WRAPPED_FETCH_FAILURE.test(message)
}

/** Den HTTP-Status einer Supabase-Antwort an ihren Fehler hängen, bevor er geworfen wird. */
export function withStatus<E extends object>(error: E, status: number): E & { status: number } {
  return Object.assign(error, { status })
}
