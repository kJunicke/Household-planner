import { describe, expect, it } from 'vitest'

import type { Household, HouseholdMember } from '@/types/households'

import { clearCachedHousehold, readCachedHousehold, writeCachedHousehold } from './householdCache'

const memoryStorage = () => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

const household: Household = {
  household_id: 'h1',
  name: 'WG',
  invite_code: 'ABC123',
  weekly_goal_points: 50,
  week_start_day: 1,
}
const members: HouseholdMember[] = [
  { user_id: 'u1', household_id: 'h1', display_name: 'A', user_color: '#111111' },
]

describe('householdCache', () => {
  it('liest zurück, was geschrieben wurde', () => {
    const s = memoryStorage()
    writeCachedHousehold(s, 'u1', { household, members })
    expect(readCachedHousehold(s, 'u1')).toEqual({ household, members })
  })

  it('ein anderes Konto bekommt den Haushalt des vorigen nicht', () => {
    const s = memoryStorage()
    writeCachedHousehold(s, 'u1', { household, members })
    expect(readCachedHousehold(s, 'u2')).toBeNull()
  })

  it('nach dem Löschen ist nichts mehr da, andere Konten bleiben', () => {
    const s = memoryStorage()
    writeCachedHousehold(s, 'u1', { household, members })
    writeCachedHousehold(s, 'u2', { household: { ...household, household_id: 'h2' }, members })
    clearCachedHousehold(s, 'u1')
    expect(readCachedHousehold(s, 'u1')).toBeNull()
    expect(readCachedHousehold(s, 'u2')?.household.household_id).toBe('h2')
  })

  it('kaputtes oder fremdes JSON gilt als kein Cache', () => {
    const s = memoryStorage()
    s.map.set('putzplan.household.u1', '{kaputt')
    expect(readCachedHousehold(s, 'u1')).toBeNull()
    s.map.set('putzplan.household.u1', JSON.stringify({ household: { name: 'ohne id' } }))
    expect(readCachedHousehold(s, 'u1')).toBeNull()
    s.map.set('putzplan.household.u1', 'null')
    expect(readCachedHousehold(s, 'u1')).toBeNull()
  })

  it('fehlende Mitgliederliste wird zur leeren', () => {
    const s = memoryStorage()
    s.map.set('putzplan.household.u1', JSON.stringify({ household }))
    expect(readCachedHousehold(s, 'u1')).toEqual({ household, members: [] })
  })

  it('ein werfender Speicher bricht nichts ab', () => {
    const throwing = {
      getItem: () => {
        throw new Error('gesperrt')
      },
      setItem: () => {
        throw new Error('voll')
      },
      removeItem: () => {
        throw new Error('gesperrt')
      },
    }
    expect(readCachedHousehold(throwing, 'u1')).toBeNull()
    expect(() => writeCachedHousehold(throwing, 'u1', { household, members })).not.toThrow()
    expect(() => clearCachedHousehold(throwing, 'u1')).not.toThrow()
  })
})
