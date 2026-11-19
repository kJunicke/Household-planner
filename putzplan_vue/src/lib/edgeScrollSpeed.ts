/**
 * Scroll-Geschwindigkeit beim Ziehen, abhängig vom Abstand des Fingers zum Rand.
 *
 * `top` und `bottom` sind die Ränder des **sichtbaren** Listenbereichs in
 * Viewport-Koordinaten — unten also die Oberkante der Navigationsleiste, nicht
 * der Bildschirmrand: dahinter erreicht der Daumen nichts mehr.
 *
 * Innerhalb der Randzone wächst die Geschwindigkeit quadratisch von `MIN` am
 * inneren Zonenrand bis `MAX` am Rand. Quadratisch, damit der äußere Teil der
 * Zone zum Feinsteuern langsam bleibt und erst der letzte Zentimeter rast.
 * Hinter dem Rand (Finger auf der Navigations- oder Kopfleiste) bleibt es bei
 * `MAX`. SortableJS lief vorher fest mit 10 px je 24 ms ≈ 420 px/s.
 */
const ZONE_PX = 96
const MIN_PX_PER_S = 150
const MAX_PX_PER_S = 2000

/** Px/s; positiv heißt nach unten, negativ nach oben, 0 heißt stehen. */
export function edgeScrollSpeed(y: number, edges: { top: number; bottom: number }): number {
  // Auf einem sehr kleinen Bereich teilen sich die Zonen die Höhe, statt sich
  // zu überlappen — sonst gäbe es keine Stelle, an der die Liste stillsteht.
  const zone = Math.min(ZONE_PX, (edges.bottom - edges.top) / 3)
  if (zone <= 0) return 0

  const ramp = (distance: number) => {
    const t = Math.min(1, Math.max(0, (zone - distance) / zone))
    return MIN_PX_PER_S + (MAX_PX_PER_S - MIN_PX_PER_S) * t * t
  }

  const toBottom = edges.bottom - y
  if (toBottom < zone) return ramp(toBottom)
  const toTop = y - edges.top
  if (toTop < zone) return -ramp(toTop)
  return 0
}
