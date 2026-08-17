import { onUnmounted, readonly, ref } from 'vue'

/**
 * Der Scroll-Wächter der Pinnwand (Pinnwand-Redesign, Etappe 4).
 *
 * **EIN** Zustand für alle Gesten der Seite: ein einziger passiver Zuhörer am
 * Fenster, nicht einer je Zettel. Bei rund zwanzig Zetteln mit je einem
 * Eselsohr, deren Zettelchen und dazu dem Long-Press wären es sonst dutzende
 * Zuhörer für dieselbe Information.
 *
 * Herausgelöst aus `useTearGesture` (Ticket 09), als der Long-Press (Ticket 10)
 * denselben Zustand brauchte. Verhalten unverändert — nur der Ort ist neu.
 */

/**
 * Nachlauf nach dem letzten Scroll-Ereignis.
 *
 * Momentum-Scrolling läuft nach dem Loslassen weiter; ohne diesen Nachlauf
 * greift man mitten in eine fliegende Wand und löst eine Geste aus, deren
 * Zettel man nur vorbeifliegen sah.
 */
const SCROLL_QUIET_MS = 300

const scrolling = ref(false)
let quietTimer: number | null = null
let users = 0

const onWindowScroll = () => {
  scrolling.value = true
  if (quietTimer !== null) clearTimeout(quietTimer)
  quietTimer = window.setTimeout(() => {
    scrolling.value = false
    quietTimer = null
  }, SCROLL_QUIET_MS)
}

export const retainScrollWatch = () => {
  users += 1
  if (users === 1) window.addEventListener('scroll', onWindowScroll, { passive: true })
}

export const releaseScrollWatch = () => {
  users = Math.max(0, users - 1)
  if (users > 0) return
  window.removeEventListener('scroll', onWindowScroll)
  if (quietTimer !== null) {
    clearTimeout(quietTimer)
    quietTimer = null
  }
  scrolling.value = false
}

/** Nur lesend — geändert wird ausschließlich hier drin. */
export const scrollQuietState = readonly(scrolling)

/**
 * Für Aufrufer, die den Wächter nur mitbenutzen: hält ihn am Leben, solange die
 * Komponente lebt.
 */
export function useScrollQuiet() {
  retainScrollWatch()
  onUnmounted(releaseScrollWatch)
  return scrollQuietState
}
