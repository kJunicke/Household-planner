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
 * Was hier als Bildlauf zaehlt — und was nicht (iOS).
 *
 * Der Waechter hing frueher am blossen Auftreten des `scroll`-Ereignisses.
 * Auf Android geht das auf, auf iOS nicht: dort federt WebKit die ganze Seite,
 * sobald man am Ende weiterzieht, und **meldet die Gummiband-Position
 * ungeklemmt an das DOM**. Jede Federbewegung ist damit ein echter Bildlauf mit
 * echten, grossen Deltas — nicht etwa ein Ereignis ohne Bewegung, wie eine
 * fruehere Fassung dieses Kommentars behauptete. Ein Schwellwert auf die
 * Schrittweite faengt das ausdruecklich NICHT.
 *
 * Was das Gummiband dagegen sicher verraet, ist die Position selbst: sie liegt
 * ausserhalb von `0 … scrollHeight − innerHeight`. Genau daran wird es hier
 * erkannt. Solche Ereignisse setzen den Waechter nicht scharf, und der Rueckweg
 * aus dem Gummiband in den gueltigen Bereich ebenso wenig — auch er ist keine
 * Handlung des Nutzers, sondern das Zurueckschnellen der Feder.
 *
 * In der Homescreen-App fiel das am staerksten auf, weil dort keine
 * Adressleiste den ersten Zug wegnimmt. Ergebnis war ein praktisch dauerhaft
 * scharfer Waechter — und der lehnt jeden Fingerdruck an der Wurzel ab
 * („klappt manchmal, meist nicht").
 *
 * `overscroll-behavior-y: none` auf `html` (→ `src/assets/base.css`) sollte das
 * Gummiband schon vorher abstellen. Diese Pruefung bleibt als Netz: der Wert
 * wirkt erst ab Safari 16.4, und mehrere WebKit-Tickets dazu sind offen.
 *
 * Belege in `docs/research/ios-gesten-webkit.md`.
 */

/** Liegt diese Position im gueltigen Bereich, oder ist sie Gummiband? */
const inScrollRange = (y: number): boolean => {
  const max = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight
  )
  // Eine Toleranz von 1 px gegen Rundung zwischen Layout- und Scroll-Metrik.
  return y >= -1 && y <= max + 1
}

const scrolling = ref(false)
let quietTimer: number | null = null
let users = 0
/** Die zuletzt gesehene Position — und ob sie im gueltigen Bereich lag. */
let lastY = 0
let lastInRange = true

const onWindowScroll = () => {
  const y = window.scrollY
  const wasInRange = lastInRange
  const isInRange = inScrollRange(y)
  const moved = Math.abs(y - lastY)
  lastY = y
  lastInRange = isInRange

  // Gummiband — weder das Ausfedern noch der Rueckweg daraus ist ein Bildlauf.
  if (!isInRange || !wasInRange) return
  // Ereignis ohne Bewegung. Nicht belegt notwendig, aber kostenlos.
  if (moved === 0) return

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
  lastInRange = inScrollRange(lastY)
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
