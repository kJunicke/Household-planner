/**
 * Welche Kategorie-Blase liegt unter dem Finger?
 *
 * `rect` in Viewport-Koordinaten, wie `getBoundingClientRect` sie liefert.
 * Waagerecht muss der Finger auf der Blase liegen. Senkrecht zählt die
 * nächstgelegene Blase, solange der Finger zwischen Ober- und Unterkante der
 * Leiste ist: in den Lücken zwischen zwei Blasen soll die Hervorhebung nicht
 * flackern und das Loslassen nicht ins Leere gehen. Über der ersten und unter
 * der letzten Blase gibt es kein Ziel.
 */
type Rect = { left: number; right: number; top: number; bottom: number }

export function dropTargetAt(
  point: { x: number; y: number },
  bubbles: { key: string; rect: Rect }[],
): string | null {
  const column = bubbles.filter((b) => point.x >= b.rect.left && point.x <= b.rect.right)
  if (column.length === 0) return null

  const top = Math.min(...column.map((b) => b.rect.top))
  const bottom = Math.max(...column.map((b) => b.rect.bottom))
  if (point.y < top || point.y > bottom) return null

  const distance = (r: Rect) => Math.max(0, r.top - point.y, point.y - r.bottom)
  let best = column[0]!
  for (const b of column) if (distance(b.rect) < distance(best.rect)) best = b
  return best.key
}
