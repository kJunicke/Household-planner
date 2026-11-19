import { describe, expect, it } from 'vitest'

import { normalizeHouseholdName } from './householdName'

describe('normalizeHouseholdName', () => {
  it('übernimmt einen Namen ohne Rand-Leerzeichen', () => {
    expect(normalizeHouseholdName('  WG Lindenstraße ')).toBe('WG Lindenstraße')
  })

  it('weist einen leeren Namen ab', () => {
    expect(normalizeHouseholdName('')).toBeNull()
  })

  it('weist einen Namen aus lauter Leerzeichen ab', () => {
    expect(normalizeHouseholdName('   ')).toBeNull()
  })

  it('nimmt 100 Zeichen an und weist 101 ab, wie der CHECK der Datenbank', () => {
    expect(normalizeHouseholdName('x'.repeat(100))).toBe('x'.repeat(100))
    expect(normalizeHouseholdName('x'.repeat(101))).toBeNull()
  })
})
