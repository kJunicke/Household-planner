import { onUnmounted } from 'vue'

/**
 * Long-press (touch) + right-click (desktop) → fire a callback (e.g. open edit).
 *
 * Handles the whole gesture lifecycle: a press timer arms after `pressMs`, a
 * move beyond `moveTolerance` cancels it, release-while-armed fires and swallows
 * the trailing ghost click so it neither toggles a row nor leaks into a modal.
 * `isControl` lets callers exempt inner buttons/steppers from the gesture.
 *
 * Bind the returned handlers on the row element:
 *   @touchstart.passive @touchmove.passive @touchend @touchcancel @contextmenu @click
 * `onClick` calls `onTap` unless the press just fired (ghost-click suppression).
 */
export function useLongPress(options: {
  onLongPress: () => void
  onTap?: () => void
  pressMs?: number
  moveTolerance?: number
  isControl?: (t: EventTarget | null) => boolean
}) {
  const pressMs = options.pressMs ?? 480
  const moveTolerance = options.moveTolerance ?? 10
  const isControl = options.isControl ?? (() => false)

  let pressTimer: number | null = null
  let startX = 0
  let startY = 0
  let armed = false // threshold elapsed → open on release
  let fired = false // opened → swallow the trailing click

  const clearPress = () => {
    if (pressTimer !== null) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
  }

  const onTouchStart = (e: TouchEvent) => {
    if (isControl(e.target)) return
    armed = false
    fired = false
    const t = e.touches[0]
    startX = t.clientX
    startY = t.clientY
    clearPress()
    pressTimer = window.setTimeout(() => { armed = true }, pressMs)
  }

  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0]
    if (Math.abs(t.clientX - startX) > moveTolerance || Math.abs(t.clientY - startY) > moveTolerance) {
      clearPress()
      armed = false
    }
  }

  const onTouchEnd = (e: TouchEvent) => {
    clearPress()
    if (armed) {
      e.preventDefault() // swallow the ghost click so it neither toggles nor hits the modal
      fired = true
      options.onLongPress()
    }
    armed = false
  }

  const onClick = () => {
    if (fired) { fired = false; return }
    options.onTap?.()
  }

  const onContextMenu = (e: Event) => {
    if (isControl(e.target)) return
    e.preventDefault()
    options.onLongPress()
  }

  onUnmounted(clearPress)

  return { onTouchStart, onTouchMove, onTouchEnd, onClick, onContextMenu, clearPress }
}
