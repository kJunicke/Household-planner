/**
 * Neue Kennung (UUID v4) für Zeilen, die der Client anlegt.
 *
 * `crypto.randomUUID` gibt es nur in sicheren Kontexten (https, localhost).
 * Über http im LAN (Dev-Server mit `--host`, IP als Origin) fehlt es, und
 * ein Aufruf wirft — Eintragen täte dann still nichts. `getRandomValues`
 * gibt es überall; daraus entsteht dieselbe Art UUID.
 */
export function newId(c: Crypto = globalThis.crypto): string {
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = c.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // Version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // Variante RFC 4122
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
