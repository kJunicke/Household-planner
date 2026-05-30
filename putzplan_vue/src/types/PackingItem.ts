export interface PackingItem {
  item_id: string
  list_id: string
  name: string
  packed: boolean
  created_at: string
  created_by: string | null
}
