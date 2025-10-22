export interface Household {
    household_id: string      // UUID von Supabase
    name: string             // "WG Musterstraße"
    invite_code: string      // "ABC123" - zum Teilen
}

export interface HouseholdMember {
    member_id?: string       // UUID - Primary Key (optional for queries)
    household_id?: string    // Foreign Key zu Household (optional for queries)
    user_id: string          // Foreign Key zu auth.users (Supabase Auth)
    display_name?: string    // Name des Mitglieds
}