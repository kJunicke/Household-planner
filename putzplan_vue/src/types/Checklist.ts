/**
 * Shared shapes of the **Checkliste** — the common layer behind Packliste and
 * (Etappe 5 Teil B) To-do. Ein einzelnes Element heißt **Eintrag**; „Aufgabe"
 * ist im Glossar für die Tasks des Putzen-Tabs reserviert und wird hier nicht
 * verwendet.
 *
 * Column names are deliberately identical across all checklist table pairs
 * (`*_lists` / `*_items`), so the store factory can talk to any of them without
 * a field mapping. A new checklist type MUST copy the packing columns 1:1.
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

/** Sentinel key for the "Unkategorisiert" bucket (items with category === null). */
export const UNCATEGORIZED = '__uncategorized__'

export interface CategoryGroup {
  /** Real category label, or null for the Unkategorisiert bucket. */
  category: string | null
  /** Stable key for v-for (label or UNCATEGORIZED sentinel). */
  key: string
  label: string
  items: ChecklistItem[]
  /** Count of items whose `packed` flag is true. */
  packedCount: number
  total: number
  isComplete: boolean
  isUncategorized: boolean
}

export interface ImportCandidate {
  sourceListId: string
  sourceListName: string
  category: string
  itemCount: number
  /** created_at of the source list — newest first in the picker. */
  sourceCreatedAt: string
}
