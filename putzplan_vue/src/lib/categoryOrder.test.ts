import { describe, expect, it } from 'vitest'

import type { CategoryRow } from '@/types/CategoryRow'

import {
  buildCategoryOptions,
  categoryKey,
  categoryRank,
  compareCategoryGroups,
  normalizeCategoryName,
  orphanSortOrder,
  type OrderableCategoryGroup,
} from './categoryOrder'

const group = (
  label: string,
  overrides: Partial<OrderableCategoryGroup> & { open?: number; done?: number } = {},
): OrderableCategoryGroup => {
  const { open = 1, done = 0, ...rest } = overrides
  return {
    label,
    isUncategorized: false,
    sortOrder: 0,
    items: Array.from({ length: open + done }),
    doneCount: done,
    ...rest,
  }
}

const labels = (groups: OrderableCategoryGroup[]) =>
  [...groups].sort(compareCategoryGroups).map((g) => g.label)

describe('normalizeCategoryName / categoryKey', () => {
  it('normalisiert wie der eindeutige Index: getrimmt, case-insensitiv', () => {
    expect(normalizeCategoryName('  Obst & Gemüse ')).toBe('obst & gemüse')
    expect(categoryKey(' Obst ')).toBe(categoryKey('obst'))
  })

  it('„ohne Kategorie" hat einen eigenen Schlüssel, verschieden von jedem gewöhnlichen Namen', () => {
    const key = categoryKey(null)
    for (const name of ['', 'Unkategorisiert', 'unkategorisiert', 'null', 'Sonstiges']) {
      expect(categoryKey(name)).not.toBe(key)
    }
  })
})

describe('categoryRank', () => {
  it('0 = offene Einträge, 1 = nur erledigte, 2 = leer', () => {
    expect(categoryRank(group('a', { open: 2, done: 1 }))).toBe(0)
    expect(categoryRank(group('a', { open: 0, done: 3 }))).toBe(1)
    expect(categoryRank(group('a', { open: 0, done: 0 }))).toBe(2)
  })

  it('ohne doneCount gilt alles als offen (Einkauf)', () => {
    expect(categoryRank({ ...group('a', { open: 0, done: 2 }), doneCount: undefined })).toBe(0)
  })
})

describe('compareCategoryGroups', () => {
  it('Rang zuerst: aktiv vor vollständig vor leer, unabhängig von sort_order', () => {
    expect(
      labels([
        group('leer', { open: 0, sortOrder: 0 }),
        group('fertig', { open: 0, done: 1, sortOrder: 1 }),
        group('aktiv', { sortOrder: 2 }),
      ]),
    ).toEqual(['aktiv', 'fertig', 'leer'])
  })

  it('innerhalb des Rangs steht Unkategorisiert zuletzt', () => {
    expect(
      labels([
        group('Unkategorisiert', { isUncategorized: true, sortOrder: -10 }),
        group('Zucker', { sortOrder: 99 }),
      ]),
    ).toEqual(['Zucker', 'Unkategorisiert'])
  })

  it('aber eine aktive Unkategorisiert-Sektion steht vor einer leeren Kategorie', () => {
    expect(
      labels([group('leer', { open: 0 }), group('Unkategorisiert', { isUncategorized: true })]),
    ).toEqual(['Unkategorisiert', 'leer'])
  })

  it('dann sort_order, bei Gleichstand der Name', () => {
    expect(
      labels([
        group('C', { sortOrder: 2 }),
        group('B', { sortOrder: 1 }),
        group('A', { sortOrder: 2 }),
      ]),
    ).toEqual(['B', 'A', 'C'])
  })
})

describe('orphanSortOrder', () => {
  it('Altdaten stehen hinter allen bekannten Zeilen, in Reihenfolge des Auftretens', () => {
    const count = 3
    const orphans = [0, 1, 2].map((i) => orphanSortOrder(i, count))
    expect(orphans[0]).toBeGreaterThan(1_000_000_000)
    expect([...orphans].sort((a, b) => a - b)).toEqual(orphans)
    expect(new Set(orphans).size).toBe(count)
    for (const value of orphans) expect(Number.isSafeInteger(value)).toBe(true)
  })
})

describe('buildCategoryOptions', () => {
  let n = 0
  const row = (list_id: string, name: string, sort_order = 0): CategoryRow => ({
    category_id: `c${n++}`,
    household_id: 'h1',
    list_id,
    name,
    sort_order,
    created_at: '2026-01-01T00:00:00Z',
  })
  const listNames = new Map([
    ['L1', 'Einkauf'],
    ['L2', 'Baumarkt'],
    ['L3', 'Urlaub'],
  ])

  it('eigene zuerst in gespeicherter Reihenfolge, fremde alphabetisch mit Herkunft', () => {
    const rows = [
      row('L2', 'Werkzeug'),
      row('L1', 'Obst', 2),
      row('L3', 'Kleidung'),
      row('L1', 'Brot', 1),
      row('L1', 'Käse', 1),
    ]
    expect(buildCategoryOptions(rows, 'L1', listNames)).toEqual([
      { name: 'Brot' },
      { name: 'Käse' },
      { name: 'Obst' },
      { name: 'Kleidung', sourceListName: 'Urlaub' },
      { name: 'Werkzeug', sourceListName: 'Baumarkt' },
    ])
  })

  it('ein eigener Name verdrängt den gleichnamigen fremden — auch bei anderer Schreibweise', () => {
    const rows = [row('L1', 'Obst'), row('L2', ' obst '), row('L3', 'OBST')]
    expect(buildCategoryOptions(rows, 'L1', listNames)).toEqual([{ name: 'Obst' }])
  })

  it('derselbe Name aus mehreren fremden Listen steht nur einmal da', () => {
    const rows = [row('L2', 'Getränke'), row('L3', 'getränke')]
    expect(buildCategoryOptions(rows, 'L1', listNames)).toHaveLength(1)
  })

  it('ohne aktuelle Liste ist alles fremd', () => {
    const rows = [row('L1', 'Obst'), row('L2', 'Werkzeug')]
    expect(buildCategoryOptions(rows, null, listNames)).toEqual([
      { name: 'Obst', sourceListName: 'Einkauf' },
      { name: 'Werkzeug', sourceListName: 'Baumarkt' },
    ])
  })

  it('verändert die Eingabe nicht', () => {
    const rows = [row('L1', 'B', 2), row('L1', 'A', 1)]
    const before = rows.map((r) => r.name)
    buildCategoryOptions(rows, 'L1', listNames)
    expect(rows.map((r) => r.name)).toEqual(before)
  })
})
