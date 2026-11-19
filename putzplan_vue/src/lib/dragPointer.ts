/**
 * Den Finger verfolgen, solange ein Listeneintrag in der Hand liegt — gemeinsam
 * für `useCategoryDrag` (Blase unter dem Finger, Loslassen über einer Sektion)
 * und `useDragAutoScroll` (Abstand zum Rand).
 *
 * Während SortableJS im Fallback-Modus zieht, hängt es vom Gerät ab, welches
 * Ereignis der Browser liefert: Touch, Pointer oder Maus. Deshalb lauscht diese
 * Stelle auf alle drei, und zwar am Dokument — der Finger verlässt die Zeile
 * sofort.
 */

/** Bewegung: Touch, Pointer und Maus. */
const MOVE_EVENTS = ['touchmove', 'pointermove', 'mousemove'] as const

/**
 * Loslassen. **Kein `pointercancel`:** das feuert Chrome auf Android, sobald es
 * den Finger als Wischen deutet, auch wenn das Ziehen über Touch-Ereignisse
 * weiterläuft. Das Ziehen endete dann mitten im Zug.
 *
 * Loslassen beendet die Verfolgung auch dann, wenn SortableJS sein `onEnd`
 * nicht meldet — etwa weil die Sektion des gezogenen Eintrags mitten im Zug
 * neu gerendert wurde.
 */
const END_EVENTS = ['touchend', 'touchcancel', 'pointerup', 'mouseup'] as const

type Coordinates = { clientX: number; clientY: number }

/**
 * Wo der Finger liegt, in Fensterkoordinaten. Bei Touch der erste Finger;
 * `null`, wenn keiner mehr liegt (beim `touchend` ist `touches` leer).
 */
export function pointOf(
  evt: Coordinates | { touches: ArrayLike<Coordinates> },
): { x: number; y: number } | null {
  const point = 'touches' in evt ? evt.touches[0] : evt
  return point ? { x: point.clientX, y: point.clientY } : null
}

/**
 * Meldet jede Fingerbewegung an `onMove` und das Loslassen an `onEnd`, bis die
 * zurückgegebene Funktion die Zuhörer wieder abmeldet. Alle passiv: hier wird
 * nur gelesen, nie der Bildlauf verhindert.
 */
export function followDragPointer(handlers: {
  onMove: (point: { x: number; y: number }) => void
  onEnd: () => void
}): () => void {
  const move = (evt: Event) => {
    const point = pointOf(evt as unknown as Coordinates | { touches: ArrayLike<Coordinates> })
    if (point) handlers.onMove(point)
  }
  const end = () => handlers.onEnd()

  MOVE_EVENTS.forEach((type) => document.addEventListener(type, move, { passive: true }))
  END_EVENTS.forEach((type) => document.addEventListener(type, end, { passive: true }))

  return () => {
    MOVE_EVENTS.forEach((type) => document.removeEventListener(type, move))
    END_EVENTS.forEach((type) => document.removeEventListener(type, end))
  }
}
