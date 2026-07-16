// ShoppingItem Type Definition
// Matches Supabase shopping_items table schema

export interface ShoppingItem {
  shopping_item_id: string
  household_id: string
  list_id: string
  name: string
  /** Free-text category; null = "Unkategorisiert" bucket. */
  category: string | null
  /** Desired amount (>= 1), shown as a plain ×N annotation. */
  quantity: number
  purchased: boolean
  is_priority: boolean
  times_purchased: number
  last_purchased_at: string | null
  last_purchased_by: string | null
  created_at: string
}
