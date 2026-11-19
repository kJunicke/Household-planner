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

/**
 * Wurde der Finger über einer dieser Flächen losgelassen (z. B. Kopf und Körper
 * einer Sektion)? `null` heißt: keine Fingerposition bekannt — dann nicht.
 *
 * SortableJS stellt seinen Platzhalter in die Sektion, über die der Finger
 * zuletzt kam, und meldet sie beim Loslassen als Ziel, auch wenn der Finger
 * da längst im leeren Raum steht. Ablegen zählt aber nur über dem Ziel
 * (L002 Story 10: „Loslassen außerhalb jedes Ziels verändert nichts").
 */
export function releasedOver(point: { x: number; y: number } | null, rects: Rect[]): boolean {
  if (!point) return false
  return rects.some(
    (r) => point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom,
  )
}
