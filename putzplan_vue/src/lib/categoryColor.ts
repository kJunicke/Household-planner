// Fixed, contrast-checked palette so category dots stay legible in light & dark.
// Chosen over free HSL to guarantee readable saturation/lightness on both themes.
const PALETTE = [
  '#e11d48', // rose
  '#f97316', // orange
  '#d97706', // amber
  '#16a34a', // green
  '#0d9488', // teal
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#0891b2', // cyan
  '#65a30d', // lime
  '#9333ea', // purple
  '#0284c7', // sky
]

/** Muted grey for the always-present "Unkategorisiert" bucket. */
export const UNCATEGORIZED_COLOR = '#94a3b8'

/**
 * Deterministic category label → palette color.
 * NULL/empty (Unkategorisiert) → muted grey.
 */
export function categoryColor(name: string | null): string {
  const trimmed = name?.trim()
  if (!trimmed) return UNCATEGORIZED_COLOR
  let hash = 0
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
