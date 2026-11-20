import { isNetworkError } from './networkError'

// Der Gastlink (CONTEXT.md § Gastlink) als URL.
//
// Form: `<Origin><Basis>gast/#<Geheimnis>`.
// - Der Pfad `gast/` ist eine echte Datei im Build (`gast/index.html`, siehe
//   vite.config.ts): GitHub Pages kennt keinen SPA-Rückfall, ein erfundener
//   Pfad wäre in einem frischen Browser ohne Service Worker eine 404.
// - Das Geheimnis steht im Anker: der geht nie an einen Server, steht also
//   weder in den Zugriffsprotokollen von Pages noch in einem Referer.

/** Zeichen und Länge, die `new_guest_secret()` in der Datenbank erzeugt (base64url). */
const SECRET_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

/** Gastlink zu einem Geheimnis; `base` ist `import.meta.env.BASE_URL`. */
export function guestLinkUrl(origin: string, base: string, secret: string): string {
  const root = base.endsWith('/') ? base : `${base}/`
  return `${origin}${root}gast/#${secret}`
}

/**
 * Geheimnis aus dem Anker der Gastseite, oder null, wenn dort keins steht.
 * Messenger hängen gern kodierte Leerzeichen an; die fallen weg.
 */
export function secretFromHash(hash: string): string | null {
  let raw = hash.startsWith('#') ? hash.slice(1) : hash
  try {
    raw = decodeURIComponent(raw)
  } catch {
    return null
  }
  const secret = raw.trim()
  return SECRET_PATTERN.test(secret) ? secret : null
}

/**
 * Warum ein Gastlink nicht aufging — jede Art bekommt in der Gastansicht ihre
 * eigene Meldung:
 * - `dead-link`: erneuert oder beendet (`invalid_guest_link` der Datenbank),
 * - `unavailable`: das Projekt lässt keine Anonymanmeldung zu,
 * - `busy`: zu viele neue Gäste von dieser Adresse (Ratenlimit von Supabase),
 * - `offline`: kein Netz,
 * - `error`: alles andere.
 */
export type GuestFailure = 'dead-link' | 'unavailable' | 'busy' | 'offline' | 'error'

export function guestFailure(error: unknown): GuestFailure {
  const { message, code, status } = (error ?? {}) as {
    message?: unknown
    code?: unknown
    status?: unknown
  }
  if (message === 'invalid_guest_link') return 'dead-link'
  if (code === 'anonymous_provider_disabled') return 'unavailable'
  if (status === 429 || code === 'over_request_rate_limit') return 'busy'
  if (isNetworkError(error)) return 'offline'
  return 'error'
}
