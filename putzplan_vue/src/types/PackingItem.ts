export interface PackingItem {
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
