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
 * denselben Zustand brauchte.
 */

/**
 * Nachlauf nach dem letzten Scroll-Ereignis.
 *
 * Momentum-Scrolling läuft nach dem Loslassen weiter; ohne diesen Nachlauf
 * greift man mitten in eine fliegende Wand und löst eine Geste aus, deren
 * Zettel man nur vorbeifliegen sah.
 */
const SCROLL_QUIET_MS = 300

/**
 * Ab wie vielen Pixeln Positionsänderung ein `scroll`-Ereignis als **echter**
 * Bildlauf zählt (iOS-Korrektur).
 *
 * Der Wächter hing früher am blossen Auftreten des Ereignisses. Auf Android
 * geht das auf, auf iOS nicht: WebKit feuert `scroll` auch dann, wenn sich
 * nichts bewegt hat oder nichts bewegen KONNTE —
 *
 * - **Gummiband** (elastic overscroll): jeder Zug am oberen oder unteren Ende
 *   federt die ganze Seite, meldet Bildlauf und federt zurück. In der
 *   Homescreen-App (standalone) ist das der Normalfall, weil dort keine
 *   Adressleiste den ersten Zug wegnimmt.
 * - **Ein- und Ausfahren der Adressleiste** und jede Änderung des visuellen
 *   Viewports.
 * - **Sub-Pixel-Rundung** beim Zurückfedern.
 *
 * Jedes dieser Ereignisse setzte den Wächter für 300 ms scharf. Da sie in
 * Serie kommen, stand er auf dem iPhone praktisch dauerhaft — und ein
 * dauerhaft scharfer Wächter heisst: `useTearGesture` und `useDirectionPress`
 * lehnen JEDEN Fingerdruck an der Wurzel ab. Genau das war der gemeldete
 * Fehler „klappt manchmal, meist nicht".
 *
 * Deshalb wird jetzt die **Position** verglichen, nicht das Ereignis gezählt.
 * 2 px ist gesetzt, nicht gemessen: unter der kleinsten Strecke, die ein
 * Mensch als Bildlauf wahrnimmt, und über allem, was Rundung und Gummiband
 * an Rauschen erzeugen.
 */
const SCROLL_MIN_DELTA = 2

const scrolling = ref(false)
let quietTimer: number | null = null
let users = 0
let lastY = 0

const onWindowScroll = () => {
  const y = window.scrollY
  const moved = Math.abs(y - lastY)
  lastY = y
  // Kein echter Weg → kein Bildlauf. Der Nachlauf eines schon laufenden
  // Bildlaufs wird dadurch NICHT verlängert; er läuft aus, wie er soll.
  if (moved < SCROLL_MIN_DELTA) return
  scrolling.value = true
  if (quietTimer !== null) clearTimeout(quietTimer)
  quietTimer = window.setTimeout(() => {
    scrolling.value = false
    quietTimer = null
  }, SCROLL_QUIET_MS)
}

export const retainScrollWatch = () => {
  users += 1
  if (users !== 1) return
  lastY = window.scrollY
  window.addEventListener('scroll', onWindowScroll, { passive: true })
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
