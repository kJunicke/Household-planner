// Single source of truth for household member colors.
// Used for the profile color picker (SettingsSidebar) and for assigning
// distinct default colors on household create/join so members never collide
// (which would make avatars and charts indistinguishable).

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

/**
 * Picks the first palette color not already used by existing members.
 * Falls back to a deterministic palette index (by used-count) if every
 * color is taken, so colors stay as distinct as possible.
 */
export function pickMemberColor(usedColors: Array<string | null | undefined>): string {
  const used = new Set(
    usedColors.filter(Boolean).map(c => (c as string).toUpperCase())
  )
  const free = MEMBER_COLORS.find(c => !used.has(c.toUpperCase()))
  if (free) return free
  // All colors used: cycle deterministically by member count.
  return MEMBER_COLORS[used.size % MEMBER_COLORS.length]
}
