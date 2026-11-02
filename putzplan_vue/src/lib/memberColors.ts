// Single source of truth for household member colors.
// Used for the profile color picker (SettingsSidebar) and as the palette the
// database assigns from on household create/join, so members never collide
// (which would make avatars and charts indistinguishable).
//
// MIRRORED IN SQL: `create_household` and `join_household`
// (migration 20261102120000) carry a copy of this list in the same order.
// The rule there: the founder gets the first color, a joining member the
// first color not yet used in the household (case-insensitive); if all are
// taken, MEMBER_COLORS[usedCount % length]. Change the list here → change it
// there in a new migration.

export const MEMBER_COLORS = [
  '#4A90E2', // Blue
  '#E74C3C', // Red
  '#2ECC71', // Green
  '#F39C12', // Orange
  '#9B59B6', // Purple
  '#1ABC9C', // Turquoise
  '#E67E22', // Dark Orange
  '#34495E', // Dark Gray
  '#3498DB', // Light Blue
  '#E91E63', // Pink
  '#16A085', // Dark Turquoise
  '#C0392B', // Dark Red
] as const

export const DEFAULT_MEMBER_COLOR = MEMBER_COLORS[0]
