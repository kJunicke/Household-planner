/** Eine Zeile aus shopping_categories / packing_categories / todo_categories. */
export interface CategoryRow {
  category_id: string
  household_id: string
  list_id: string
  name: string
  sort_order: number
  created_at: string
}
