export interface Household {
    household_id: string      // UUID von Supabase
    name: string             // "WG Musterstraße"
    invite_code: string      // "ABC123" - zum Teilen
}

export interface HouseholdMember {
    member_id: string        // UUID - Primary Key
    household_id: string     // Foreign Key zu Household
    user_id: string          // Foreign Key zu auth.users (Supabase Auth)
}