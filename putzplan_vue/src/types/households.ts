export interface Household {
    household_id: string      // UUID von Supabase
    name: string             // "WG Musterstraße"
    invite_code: string      // "ABC123" - zum Teilen
}

export interface HouseholdMember {
    user_id: string          // PK + FK zu auth.users (Supabase Auth) - One ID per user!
    household_id: string     // FK zu households
    display_name: string     // Name des Mitglieds
    user_color: string       // Hex color code for user (e.g., '#4A90E2')
    joined_at?: string       // Optional für Queries
}