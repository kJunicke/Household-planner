import { ref } from 'vue'

/** Ab dieser Distanz zählt ein Zug als Wisch statt als Tap. */
const SWIPE_THRESHOLD = 12

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
 * `onSwipeStart` feuert, sobald die Geste als horizontal erkannt ist — also
 * bevor sie einrastet. Nur so schließt ein Wisch anderswo die offene Zeile
 * auch dann, wenn er auf halber Strecke wieder zurückschnappt.
 *
 * Handler auf der Zeile binden:
 *   @pointerdown @pointermove @pointerup @pointercancel @click
 */
export function useSwipeAction(options: {
  onTap?: () => void
  onSwipeStart?: () => void
  onReveal?: () => void
  onHide?: () => void
  actionWidth?: number
}) {
  const actionWidth = options.actionWidth ?? 80

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
    options.onHide?.()
  }

  const onPointerDown = (e: PointerEvent) => {
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
      if (Math.abs(dx) < SWIPE_THRESHOLD) return
      axis = 'x'
      options.onSwipeStart?.()
    }

    swiped = true
    const base = revealed.value ? -actionWidth : 0
    offset.value = Math.min(0, Math.max(-actionWidth, base + dx))
  }

  const onPointerUp = () => {
    if (!tracking) return
    tracking = false
    if (axis !== 'x') return
    if (actionWidth > 0 && offset.value < -actionWidth / 2) {
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
