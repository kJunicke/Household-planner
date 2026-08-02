// ShoppingCategory Type Definition
// Matches Supabase shopping_categories table schema.
// Kategorien existieren je Liste eigenständig — auch ohne Items.

export interface ShoppingCategory {
  category_id: string
  household_id: string
  list_id: string
  name: string
  sort_order: number
  created_at: string
}
