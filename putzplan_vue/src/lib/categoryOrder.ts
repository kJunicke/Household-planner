// Kategorien-Ordnung: Schlüssel, Normalisierung, Rang, Vergleicher, Vorschläge.
//
// Herausgelöst aus dem Einkaufs-Store, damit Einkauf, Packliste und To-do
// dieselbe Reihenfolge und dieselben Schlüssel benutzen. Wer hier etwas ändert,
// ändert es in allen drei Listen — das ist der Zweck.

import type { CategoryRow } from '@/types/CategoryRow'
import type { CategoryOption } from '@/types/CategoryOption'

/** Sentinel key for the "Unkategorisiert" bucket (items with category === null). */
export const UNCATEGORIZED = '__uncategorized__'

/** Namensvergleich wie der eindeutige Index aus der Migration: getrimmt, case-insensitiv. */
export const normalizeCategoryName = (name: string) => name.trim().toLowerCase()

/**
 * Schlüssel einer Sektion. Muss überall gleich gebildet werden, sonst laufen
 * Gruppierung und Ansicht auseinander und dieselbe Kategorie erscheint doppelt.
 */
export const categoryKey = (label: string | null) =>
  label === null ? UNCATEGORIZED : normalizeCategoryName(label)

/** Mindestgestalt einer Sektion, damit Einkauf und Checkliste denselben Vergleicher benutzen. */
export interface OrderableCategoryGroup {
  label: string
  isUncategorized: boolean
  sortOrder: number
  items: readonly unknown[]
  /** Erledigte unter `items`. Fehlt → alle offen (Einkauf: Gekauftes verlässt die Sektion). */
  doneCount?: number
}

/** 0 = aktiv (offene Einträge), 1 = vollständig (nur erledigte), 2 = leer. */
export type CategoryRank = 0 | 1 | 2

export const categoryRank = (g: OrderableCategoryGroup): CategoryRank => {
  const open = g.items.length - (g.doneCount ?? 0)
  return open > 0 ? 0 : g.items.length > 0 ? 1 : 2
}

/**
 * Rang → innerhalb des Rangs Unkategorisiert zuletzt → sort_order → Name.
 *
 * „Leer" heißt: gerade keine sichtbaren Einträge — deshalb muss die Ansicht
 * *nach* dem Einblenden der Einträge im Rückgängig-Fenster erneut hiermit
 * sortieren, statt die Regel nachzubauen.
 */
export const compareCategoryGroups = (a: OrderableCategoryGroup, b: OrderableCategoryGroup) => {
  const byRank = categoryRank(a) - categoryRank(b)
  if (byRank !== 0) return byRank
  if (a.isUncategorized !== b.isUncategorized) return a.isUncategorized ? 1 : -1
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.label.localeCompare(b.label)
}

/** Altdaten ohne Kategorienzeile: hinter alle bekannten Zeilen, in Reihenfolge des Auftretens. */
export const orphanSortOrder = (index: number, count: number) =>
  Number.MAX_SAFE_INTEGER - count + index

/**
 * Vorschläge für die Kategorie-Combobox: alle Listen des Haushalts, die der
 * aktuellen Liste zuerst (in ihrer gespeicherten Reihenfolge), die fremden
 * alphabetisch mit Herkunftsangabe. Ein Name, den es in der aktuellen Liste
 * schon gibt, verdrängt den gleichnamigen Treffer aus einer fremden Liste —
 * sonst stünde derselbe Name zweimal in der Liste und die Herkunftsangabe wäre
 * irreführend.
 */
export function buildCategoryOptions(
  rows: CategoryRow[],
  currentListId: string | null,
  listNames: Map<string, string>,
): CategoryOption[] {
  const seen = new Set<string>()
  const own: CategoryOption[] = []
  const foreign: CategoryOption[] = []

  const mine = rows
    .filter(c => currentListId !== null && c.list_id === currentListId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  for (const c of mine) {
    const key = normalizeCategoryName(c.name)
    if (seen.has(key)) continue
    seen.add(key)
    own.push({ name: c.name })
  }

  const rest = rows
    .filter(c => c.list_id !== currentListId)
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const c of rest) {
    const key = normalizeCategoryName(c.name)
    if (seen.has(key)) continue
    seen.add(key)
    foreign.push({ name: c.name, sourceListName: listNames.get(c.list_id) })
  }

  return [...own, ...foreign]
}
