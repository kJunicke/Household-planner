/**
 * Shared shapes of the **Checkliste** — the common layer behind Packliste and
 * (Etappe 5 Teil B) To-do. Ein einzelnes Element heißt **Eintrag**; „Aufgabe"
 * ist im Glossar für die Tasks des Putzen-Tabs reserviert und wird hier nicht
 * verwendet.
 *
 * Column names are deliberately identical across all checklist table pairs
 * (`*_lists` / `*_items`), so the store factory can talk to any of them without
 * a field mapping. A new checklist type MUST copy the packing columns 1:1.
 *
 * Kategorien (seit Etappe 2) sind eigenständige Zeilen in einer dritten Tabelle
 * je Typ: `packing_categories` / `todo_categories` (Einkauf: `shopping_categories`),
 * PK `category_id`, Spalten wie in `types/CategoryRow.ts`. Die Kopplung zwischen
 * Kategorie und Eintrag läuft **über den Namen**, nicht über eine Fremdschlüssel-
 * Spalte: `*_items.category` trägt den Text, `NULL` heißt „Unkategorisiert".
 * `lower(name)` ist je Liste eindeutig — Vergleiche laufen deshalb immer über
 * `normalizeCategoryName` aus `@/lib/categoryOrder`. Eine Kategorie ohne Einträge
 * bleibt dadurch bestehen, und Einträge mit einem Namen ohne Zeile (Altdaten)
 * bekommen trotzdem eine Sektion.
 */

/** A checklist (one row of a `*_lists` table). */
export interface ChecklistList {
  list_id: string
  household_id: string
  name: string
  icon: string | null
  /** Free-text list note (weather, days, reminders…). */
  notes: string | null
  created_at: string
  created_by: string | null
}

/** A single Eintrag (one row of a `*_items` table). */
export interface ChecklistItem {
  item_id: string
  list_id: string
  name: string
  /** Free-text category label. NULL = "Unkategorisiert" bucket. */
  category: string | null
  /** Target amount (>= 1). qty > 1 shows the stepper. */
  quantity: number
  /** Progress 0..quantity. Reaching quantity auto-sets `packed`. */
  packed_count: number
  /** Canonical "done" flag (body-tap / stepper-full / reset). */
  packed: boolean
  created_at: string
  created_by: string | null
}

// Der Sentinel lebt in der geteilten Bibliothek (Einkauf und Checkliste bilden
// Sektionsschlüssel gleich); hier nur weitergereicht, damit `packingStore` ihn
// wie bisher exportieren kann.
export { UNCATEGORIZED } from '@/lib/categoryOrder'

/**
 * Eine Sektion der Checkliste. Erfüllt `OrderableCategoryGroup` aus
 * `@/lib/categoryOrder` ohne Adapter — deshalb `doneCount` (nicht `packedCount`)
 * und `sortOrder`.
 */
export interface CategoryGroup {
  /** Real category label, or null for the Unkategorisiert bucket. */
  category: string | null
  /** Stable key for v-for: normalisierter Name bzw. UNCATEGORIZED-Sentinel. */
  key: string
  label: string
  /** Offene Einträge zuerst, dann erledigte, je nach `created_at`. */
  items: ChecklistItem[]
  /** Einträge unter `items` mit gesetztem `packed`-Flag. */
  doneCount: number
  total: number
  isComplete: boolean
  isUncategorized: boolean
  /** Position aus der Kategorientabelle; Altdaten ohne Zeile landen hinten. */
  sortOrder: number
}

