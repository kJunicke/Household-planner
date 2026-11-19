import { onBeforeUnmount } from 'vue'

import { followDragPointer } from '@/lib/dragPointer'
import { edgeScrollSpeed } from '@/lib/edgeScrollSpeed'

/**
 * Seite scrollen, solange ein Listeneintrag in der Hand liegt.
 *
 * Ersetzt das eingebaute Auto-Scrollen von SortableJS (`scroll: false` dort):
 * das lief mit fester Geschwindigkeit und maß die Randzone am Fensterrand —
 * unten also größtenteils hinter der festen Navigationsleiste. Hier zählen die
 * sichtbaren Ränder (Unterkante Kopfleiste, Oberkante Navigationsleiste), und
 * die Geschwindigkeit kommt aus `edgeScrollSpeed`.
 *
 * Kennt nur Fingerposition und Ränder, nichts vom Ablegen: das Ziel unter dem
 * Finger sucht SortableJS im Fallback-Modus ohnehin alle 50 ms neu, also auch
 * während die Liste darunter wegscrollt.
 */
export function useDragAutoScroll() {
  let pointerY: number | null = null
  let frame: number | null = null
  let lastTime = 0
  /** Bruchteile eines Pixels, die `scrollBy` sonst wegrunden würde. */
  let carry = 0
  /** Meldet die Fingerverfolgung ab; `null`, solange nichts gezogen wird. */
  let unfollow: (() => void) | null = null

  const visibleEdges = () => {
    const header = document.querySelector('.app-header')?.getBoundingClientRect()
    const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect()
    return {
      top: header ? Math.max(0, header.bottom) : 0,
      bottom: nav ? Math.min(window.innerHeight, nav.top) : window.innerHeight,
    }
  }

  const tick = (now: number) => {
    // Schritt an der echten Bildzeit, nicht je Bild: sonst scrollte ein
    // 120-Hz-Gerät doppelt so schnell. Gedeckelt, damit ein hängender Tab nach
    // der Pause nicht einen Riesensprung macht.
    const dt = Math.min(0.05, (now - lastTime) / 1000)
    lastTime = now
    if (pointerY !== null) {
      carry += edgeScrollSpeed(pointerY, visibleEdges()) * dt
      const step = Math.trunc(carry)
      if (step !== 0) {
        window.scrollBy(0, step)
        carry -= step
      }
    }
    frame = requestAnimationFrame(tick)
  }

  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    pointerY = null
    carry = 0
    unfollow?.()
    unfollow = null
  }

  /**
   * Bis zur ersten Fingerbewegung steht die Liste: gegriffen wird nie am Rand.
   * Loslassen hält sie an, auch wenn `onEnd` ausbleibt (→ `followDragPointer`).
   */
  const start = () => {
    stop()
    unfollow = followDragPointer({
      onMove: (point) => {
        pointerY = point.y
      },
      onEnd: stop,
    })
    lastTime = performance.now()
    frame = requestAnimationFrame(tick)
  }

  onBeforeUnmount(stop)

  return { start, stop }
}
