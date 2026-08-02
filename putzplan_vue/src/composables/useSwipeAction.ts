import { ref } from 'vue'

/**
 * Wisch nach links → eine Aktion hinter der Zeile freilegen (z.B. Löschen).
 *
 * Der Lebenszyklus der Geste steckt vollständig hier drin: die Achse wird beim
 * ersten Move festgelegt, ein überwiegend vertikaler Zug gibt sofort auf und
 * überlässt dem Browser das Scrollen (die Zeile braucht dafür `touch-action:
 * pan-y`), ein horizontaler Zug schleift den Versatz mit und rastet beim
 * Loslassen ein oder zurück. Der nachlaufende Klick wird geschluckt, damit ein
 * Wisch nichts auf- oder zuklappt.
 *
 * `actionWidth: 0` bedeutet: keine Aktion freilegen, nur horizontale Züge vom
 * Tap trennen — für Zeilen, die sich zwar aufklappen, aber nichts freigeben.
 *
 * Handler auf der Zeile binden:
 *   @pointerdown @pointermove @pointerup @pointercancel @click
 */
export function useSwipeAction(options: {
  onTap?: () => void
  onReveal?: () => void
  actionWidth?: number
  /** Mindestdistanz, ab der ein Zug als Wisch zählt statt als Tap. */
  threshold?: number
  isControl?: (t: EventTarget | null) => boolean
}) {
  const actionWidth = options.actionWidth ?? 80
  const threshold = options.threshold ?? 12

  const offset = ref(0)
  const revealed = ref(false)

  let startX = 0
  let startY = 0
  let tracking = false
  let axis: 'x' | 'y' | null = null
  let swiped = false // horizontal gezogen → nachlaufenden Klick schlucken

  const hide = () => {
    offset.value = 0
    revealed.value = false
  }

  const onPointerDown = (e: PointerEvent) => {
    if (options.isControl?.(e.target)) return
    tracking = true
    axis = null
    swiped = false
    startX = e.clientX
    startY = e.clientY
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!tracking) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (!axis) {
      // Vertikal gewinnt: Scrollen der Liste geht vor.
      if (Math.abs(dy) > Math.abs(dx)) {
        tracking = false
        axis = 'y'
        return
      }
      if (Math.abs(dx) < threshold) return
      axis = 'x'
    }

    swiped = true
    const base = revealed.value ? -actionWidth : 0
    offset.value = Math.min(0, Math.max(-actionWidth, base + dx))
  }

  const onPointerUp = () => {
    if (!tracking) return
    tracking = false
    if (axis !== 'x') return
    if (offset.value < -actionWidth / 2) {
      offset.value = -actionWidth
      revealed.value = true
      options.onReveal?.()
    } else {
      hide()
    }
  }

  const onClick = (e: MouseEvent) => {
    if (swiped) {
      swiped = false
      e.stopPropagation()
      return
    }
    // Tap auf eine offene Zeile schließt sie, statt aufzuklappen.
    if (revealed.value) {
      hide()
      return
    }
    options.onTap?.()
  }

  return {
    offset,
    revealed,
    hide,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onClick
  }
}
