// ShoppingItem Type Definition
// Matches Supabase shopping_items table schema

export interface ShoppingItem {
  shopping_item_id: string
  household_id: string
  name: string
  purchased: boolean
  is_priority: boolean
  times_purchased: number
  last_purchased_at: string | null
  last_purchased_by: string | null
  created_at: string
}
