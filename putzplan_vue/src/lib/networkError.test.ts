import { describe, expect, it } from 'vitest'

import { isRetryLater, withStatus } from './networkError'

/** So verpackt postgrest-js einen gescheiterten fetch: kein Wurf, ein Objekt mit Namen im Text. */
const wrapped = (name: string, message: string) => ({
  message: `${name}: ${message}`,
  details: '',
  hint: '',
  code: '',
  status: 0,
})

describe('isRetryLater: Netzfehler aus der postgrest-Hülle', () => {
  it.each([
    ['TypeError', 'Failed to fetch'],
    ['TypeError', 'Load failed'],
    ['TypeError', 'NetworkError when attempting to fetch resource.'],
    ['TypeError', 'The network connection was lost.'],
    ['TypeError', 'irgendein Text, den kein Browser bisher geliefert hat'],
    ['FetchError', 'request to https://x.supabase.co failed, reason: ECONNRESET'],
    ['AbortError', 'signal is aborted without reason'],
  ])('%s: %s', (name, message) => {
    expect(isRetryLater(wrapped(name, message))).toBe(true)
  })

  it('dieselbe Vorsilbe mit Fehlercode ist kein Netzfehler', () => {
    expect(isRetryLater({ message: 'TypeError: x', code: '23505' })).toBe(false)
  })
})

describe('isRetryLater: WebKit-Texte', () => {
  it.each([
    'The network connection was lost.',
    'The Internet connection appears to be offline.',
    'The request timed out.',
    'Load failed',
  ])('%s', (message) => {
    expect(isRetryLater({ message })).toBe(true)
    expect(isRetryLater(new TypeError(message))).toBe(true)
  })
})

describe('isRetryLater: HTTP-Status', () => {
  it.each([502, 503, 504, 520])('%i ist vorübergehend', (status) => {
    expect(isRetryLater({ message: 'upstream', code: '', status })).toBe(true)
  })

  it.each([500, 501, 599])('%i ist nicht sicher vorübergehend', (status) => {
    expect(isRetryLater({ message: 'boom', code: 'XX001', status })).toBe(false)
  })

  it.each([400, 401, 403, 404, 409])('%i zählt', (status) => {
    expect(isRetryLater({ message: 'nein', code: 'PGRST', status })).toBe(false)
  })

  it('der Status kommt über withStatus an den geworfenen Fehler', () => {
    const error = withStatus({ message: '<html>Bad Gateway</html>' }, 502)
    expect(error.status).toBe(502)
    expect(isRetryLater(error)).toBe(true)
  })
})

describe('isRetryLater: Fehler, die zählen', () => {
  it('ein Programm-TypeError ohne postgrest-Hülle', () => {
    expect(
      isRetryLater(new TypeError("Cannot read properties of undefined (reading 'x')")),
    ).toBe(false)
  })

  it('ein Error, dessen Text nur zufällig wie die Hülle anfängt', () => {
    expect(isRetryLater(new Error('TypeError: x is not a function'))).toBe(false)
  })

  it('ein Datenbankverstoß', () => {
    expect(
      isRetryLater({
        message: 'new row violates check constraint',
        code: '23514',
        status: 400,
      }),
    ).toBe(false)
  })

  it('nichts', () => {
    expect(isRetryLater(null)).toBe(false)
    expect(isRetryLater(undefined)).toBe(false)
  })
})
