import { describe, expect, it } from 'vitest'

import { rememberGuestParticipant, rememberedGuestParticipant } from './guestIdentity'

const fakeStorage = () => {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

const POT = 'pot-1'
const OTHER_POT = 'pot-2'

describe('rememberedGuestParticipant', () => {
  it('kennt beim ersten Öffnen niemanden', () => {
    expect(rememberedGuestParticipant(fakeStorage(), POT, ['lena', 'kim'])).toBeNull()
  })

  it('merkt sich die Wahl je Topf', () => {
    const storage = fakeStorage()
    rememberGuestParticipant(storage, POT, 'lena')
    expect(rememberedGuestParticipant(storage, POT, ['lena', 'kim'])).toBe('lena')
    expect(rememberedGuestParticipant(storage, OTHER_POT, ['lena', 'kim'])).toBeNull()
  })

  it('übernimmt beim Wechseln die neue Wahl', () => {
    const storage = fakeStorage()
    rememberGuestParticipant(storage, POT, 'lena')
    rememberGuestParticipant(storage, POT, 'kim')
    expect(rememberedGuestParticipant(storage, POT, ['lena', 'kim'])).toBe('kim')
  })

  it('kennt niemanden, den es im Topf nicht mehr gibt', () => {
    const storage = fakeStorage()
    rememberGuestParticipant(storage, POT, 'lena')
    expect(rememberedGuestParticipant(storage, POT, ['kim'])).toBeNull()
  })

  it('kommt ohne nutzbaren Speicher aus (privater Modus)', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => rememberGuestParticipant(broken, POT, 'lena')).not.toThrow()
    expect(rememberedGuestParticipant(broken, POT, ['lena'])).toBeNull()
  })
})
