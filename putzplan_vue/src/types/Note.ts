// Note Type Definition
// Matches Supabase notes table schema

export interface Note {
  note_id: string
  household_id: string
  content: string
  created_by: string
  created_at: string
  updated_at: string
}
