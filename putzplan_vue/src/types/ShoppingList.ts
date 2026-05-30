export interface ShoppingList {
  list_id: string
  household_id: string
  name: string
  icon: string | null
  sort_order: number
  created_at: string
  created_by: string | null
}
