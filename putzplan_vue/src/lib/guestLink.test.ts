import { describe, expect, it } from 'vitest'

import { guestFailure, guestLinkUrl, secretFromHash } from './guestLink'

const SECRET = 'Ab3_-xYz0123456789AbCdEf'

describe('guestLinkUrl', () => {
  it('legt das Geheimnis in den Anker der Gastseite unter der App-Basis', () => {
    expect(guestLinkUrl('https://kjunicke.github.io', '/Household-planner/', SECRET)).toBe(
      'https://kjunicke.github.io/Household-planner/gast/#Ab3_-xYz0123456789AbCdEf',
    )
  })

  it('kommt mit einer Basis ohne Schrägstrich am Ende aus', () => {
    expect(guestLinkUrl('http://localhost:5173', '/Household-planner', SECRET)).toBe(
      'http://localhost:5173/Household-planner/gast/#Ab3_-xYz0123456789AbCdEf',
    )
  })
})

describe('secretFromHash', () => {
  it('liest das Geheimnis aus dem Anker', () => {
    expect(secretFromHash('#Ab3_-xYz0123456789AbCdEf')).toBe(SECRET)
  })

  it('liest es auch ohne Rautezeichen', () => {
    expect(secretFromHash(SECRET)).toBe(SECRET)
  })

  it('findet es auch in einem Link, den ein Messenger zerlegt und neu kodiert hat', () => {
    expect(secretFromHash('#Ab3_-xYz0123456789AbCdEf%20')).toBe(SECRET)
  })

  it('liefert nichts ohne Anker', () => {
    expect(secretFromHash('')).toBeNull()
    expect(secretFromHash('#')).toBeNull()
  })

  it('weist Zeichen ab, die ein Geheimnis nie enthält', () => {
    expect(secretFromHash('#<script>')).toBeNull()
    expect(secretFromHash('#abc def ghi jkl mno pqr')).toBeNull()
  })

  it('weist zu kurze Reste ab, etwa einen abgeschnittenen Link', () => {
    expect(secretFromHash('#Ab3_-xYz')).toBeNull()
  })
})

describe('guestFailure', () => {
  it('erkennt einen erneuerten oder beendeten Link', () => {
    expect(guestFailure({ message: 'invalid_guest_link', code: 'P0001' })).toBe('dead-link')
  })

  it('erkennt ein Projekt, in dem die Anonymanmeldung aus ist', () => {
    expect(
      guestFailure({ message: 'Anonymous sign-ins are disabled', code: 'anonymous_provider_disabled' }),
    ).toBe('unavailable')
  })

  it('erkennt zu viele Gäste von einer Adresse', () => {
    expect(guestFailure({ message: 'Request rate limit reached', status: 429 })).toBe('busy')
  })

  it('erkennt ein fehlendes Netz', () => {
    expect(guestFailure({ message: 'TypeError: Failed to fetch', code: '' })).toBe('offline')
  })

  it('ordnet alles andere als allgemeinen Fehler ein', () => {
    expect(guestFailure({ message: 'boom', code: 'XX000' })).toBe('error')
  })
})
