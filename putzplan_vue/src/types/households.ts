export interface Household {
    household_id: string      // UUID von Supabase
    name: string             // "WG Musterstraße"
    invite_code: string      // "ABC123" - zum Teilen
    // Wochenziel + Wochenstart (Pinnwand-Redesign, Etappe 3).
    // Optional typisiert, weil die Anzeige auch dann sinnvoll bleiben muss,
    // wenn die Migration noch nicht gelaufen ist — dann fehlen die Felder
    // schlicht in der Zeile.
    weekly_goal_points?: number | null
    week_start_day?: number | null   // 0 = Sonntag … 6 = Samstag, gilt GERADE
    // Anstehende Änderung des Wochenstarts (Ticket 08). Ein geänderter
    // Wochenstart darf die laufende Woche nicht neu zuschneiden, deshalb liegt
    // der Wechseltag am Haushalt — haushaltsweit, nicht pro Gerät.
    week_start_day_pending?: number | null
    week_start_pending_from?: string | null   // 'YYYY-MM-DD'
}

export interface HouseholdMember {
    user_id: string          // PK + FK zu auth.users (Supabase Auth) - One ID per user!
    household_id: string     // FK zu households
    display_name: string     // Name des Mitglieds
    user_color: string       // Hex color code for user (e.g., '#4A90E2')
    joined_at?: string       // Optional für Queries
}