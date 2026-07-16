export interface PackingList {
  list_id: string
  household_id: string
  name: string
  icon: string | null
  /** Free-text trip notes (weather, days, reminders…). */
  notes: string | null
  created_at: string
  created_by: string | null
}
