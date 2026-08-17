import { onUnmounted, readonly, ref } from 'vue'
import { useScrollQuiet } from './useScrollQuiet'

/**
 * Long-Press mit vier Richtungen (Pinnwand-Redesign, Etappe 4, Ticket 10).
 *
 * Lange auf einen Zettel drücken blendet alle vier Richtungen **beschriftet**
 * ein; danach entscheidet ein Zug, welche Aktion es wird. Die Beschriftung ist
 * der eigentliche Zweck: sie lehrt die Gesten, ohne sie zu erklären — inklusive
 * der Richtung nach unten, die man sonst nur über das Eselsohr fände.
 *
 * ## Die vierte Bedienart auf demselben Zettel
 *
 * Auf dem Zettel liegen bereits: Antippen (aufklappen, Ticket 06), Ziehen am
 * Eselsohr (abreißen, Ticket 09) und der Seitenbildlauf. Die Abgrenzungen:
 *
 * - **gegen das Antippen**: allein die Zeit. Unter `PRESS_MS` passiert hier
 *   nichts und der Klick läuft unangetastet durch. Erst wenn ausgelöst wurde,
 *   wird der nachlaufende Klick geschluckt (→ Klick-Wächter weiter unten) —
 *   sonst klappte der Zettel nach jedem Long-Press zusätzlich auf.
 * - **gegen das Eselsohr**: der Ort. `isControl` hält Eselsohr, Zettelchen und
 *   Bearbeiten-Knopf komplett aus dieser Geste heraus; dort startet der Timer
 *   gar nicht erst. Die beiden Gesten können sich damit nicht überschneiden.
 * - **gegen den Bildlauf**: die Bewegung und der Wächter. Jede Bewegung über
 *   `MOVE_TOLERANCE` vor dem Auslösen bricht ab, ebenso jedes Scroll-Ereignis
 *   (mit 300 ms Nachlauf, → `useScrollQuiet`). Im Zweifel gewinnt also immer
 *   der Bildlauf; ein zu selten auslösender Long-Press ist billiger als eine
 *   Wand, die sich nicht mehr scrollen lässt.
 *
 * ## Warum diese Geste dem Bildlauf KEINE Fläche wegnimmt
 *
 * Das Eselsohr bezahlt seinen Schnellweg mit `touch-action: none` — rund
 * 1500 px² je Zettel, auf denen nicht gescrollt werden kann. Ein zweiter
 * solcher Fleck über die **ganze** Zettelfläche wäre ein Vielfaches davon und
 * würde die Wand praktisch unscrollbar machen.
 *
 * Deshalb steht hier **kein** `touch-action`. Der Bildlauf bleibt bis zum
 * Auslösen vollständig zuständig; abgeschaltet wird er erst danach, und zwar
 * über einen nicht-passiven `touchmove`, der nur im geöffneten Zustand
 * `preventDefault()` ruft (→ `onTouchMove`). Das geht auf, weil der Finger im
 * Moment des Auslösens noch nicht bewegt wurde: der Browser hat den Bildlauf
 * dann noch nicht begonnen und lässt sich noch abbestellen. Kosten im
 * Ruhezustand: null.
 *
 * Handler am Zettel binden:
 *   @pointerdown @pointermove @pointerup @pointercancel @touchmove
 *
 * Um den nachlaufenden Klick muss sich der Aufrufer **nicht** kümmern — das
 * erledigt der Wächter am Fenster selbst.
 */

/** Die vier Richtungen. Die Belegung liegt beim Aufrufer, nicht hier. */
export type PressDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Haltezeit bis zum Einblenden. Gesetzt, nicht gemessen: dieselbe Größenordnung
 * wie das bestehende `useLongPress` (480 ms), etwas kürzer, weil danach noch
 * ein Zug folgt und die Geste sonst insgesamt zäh wirkt.
 */
const PRESS_MS = 420

/** Bis hierhin gilt der Finger als still. Wie in `useLongPress`. */
const MOVE_TOLERANCE = 10

/**
 * Ab dieser Strecke ist eine Richtung gewählt.
 *
 * Etwas weniger als der Abstand der Beschriftungen zum Mittelpunkt (56 px),
 * damit die Richtung bereits feststeht, bevor der Finger auf ihrer Beschriftung
 * liegt — sonst verdeckte der eigene Daumen die Bestätigung. Gesetzt, nicht
 * gemessen.
 */
const COMMIT_DISTANCE = 48

/**
 * Wie eindeutig die Richtung sein muss. `dy > dx` allein reicht nicht: bei 46°
 * wäre „unten" gewählt, obwohl der Zug genauso gut „rechts" meinte — und unten
 * erledigt. Dieselbe Zahlenlogik wie in `useTearGesture`, dort mit 1.4; hier
 * etwas milder, weil die Beschriftungen sichtbar sind und mitzielen helfen.
 */
const AXIS_RATIO = 1.25

/**
 * Wie lange der Klick-Wächter nach dem Loslassen scharf bleibt.
 *
 * Der nachlaufende Klick kommt unmittelbar nach dem `pointerup` — diese Spanne
 * ist der **Notausgang** für den Fall, dass gar keiner kommt, nicht das
 * erwartete Zeitfenster. Gesetzt, nicht gemessen; kurz genug, dass in ihr kein
 * echter zweiter Tipp Platz hat (ein Finger muss dafür erst wieder aufsetzen),
 * lang genug für einen verzögert zugestellten Klick.
 */
const CLICK_GUARD_MS = 300

export function useDirectionPress(options: {
  /** Ausgelöst beim Loslassen mit gewählter Richtung. */
  onDirection: (direction: PressDirection) => void
  /** Elemente, die diese Geste NICHT starten dürfen (Eselsohr, Knöpfe …). */
  isControl?: (target: EventTarget | null) => boolean
  /** Das Element, um dessen Mitte die Beschriftungen liegen. */
  anchorEl: () => HTMLElement | null
}) {
  const scrolling = useScrollQuiet()
  const isControl = options.isControl ?? (() => false)

  /** Sind die vier Beschriftungen sichtbar? */
  const open = ref(false)
  /** Welche Richtung liegt gerade an — `null` heißt „noch keine". */
  const direction = ref<PressDirection | null>(null)
  /** Mitte der Beschriftungen, in **Fensterkoordinaten**. */
  const anchor = ref<{ x: number; y: number } | null>(null)

  let pressTimer: number | null = null
  let el: HTMLElement | null = null
  let pointerId = -1
  let active = false
  let startX = 0
  let startY = 0

  // --- Der nachlaufende Klick ------------------------------------------------
  //
  // Jeder ausgelöste Long-Press hinterlässt einen Klick, auch der Abbruch ohne
  // Richtung. Käme er durch, klappte der Zettel als Nebenwirkung auf — auch
  // dann, wenn die Geste gerade ein Modal geöffnet hat.
  //
  // **Warum ein Wächter am Fenster und keine Fahne, die ein Klick-Handler am
  // Zettel abräumt.** Die Fahne wäre auf das Vertrauen angewiesen, dass der
  // Klick auch wirklich dort ankommt, wo jemand nachsieht. Tut er es nicht —
  // weil er auf einem Kind mit `@click.stop` landet oder gar nicht zugestellt
  // wird —, bleibt sie stehen und verschluckt irgendwann einen fremden Klick.
  // Ein Zustand, der „nur kurz" falsch ist, ist falsch, und genau diese Sorte
  // Fehler reproduziert niemand.
  //
  // Der Wächter hier hängt in der **Einfangphase am Fenster**: er sieht den
  // Klick vor jedem Ziel, egal wo dieser landet, und räumt sich selbst ab —
  // beim ersten Klick, spätestens nach `CLICK_GUARD_MS`, beim nächsten
  // `pointerdown` und beim Aushängen der Komponente. Es gibt keinen Pfad, auf
  // dem er stehen bleibt.

  let clickGuard: ((event: MouseEvent) => void) | null = null
  let guardTimer: number | null = null

  const dropClickGuard = () => {
    if (clickGuard) {
      window.removeEventListener('click', clickGuard, true)
      clickGuard = null
    }
    if (guardTimer !== null) {
      clearTimeout(guardTimer)
      guardTimer = null
    }
  }

  const armClickGuard = () => {
    dropClickGuard()
    clickGuard = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      dropClickGuard()
    }
    window.addEventListener('click', clickGuard, true)
    guardTimer = window.setTimeout(dropClickGuard, CLICK_GUARD_MS)
  }

  const clearTimer = () => {
    if (pressTimer === null) return
    clearTimeout(pressTimer)
    pressTimer = null
  }

  const reset = () => {
    clearTimer()
    if (open.value && el && el.hasPointerCapture?.(pointerId)) {
      el.releasePointerCapture(pointerId)
    }
    active = false
    el = null
    pointerId = -1
    open.value = false
    direction.value = null
    anchor.value = null
  }

  const onPointerDown = (event: PointerEvent) => {
    // Ganz oben, VOR jedem Rücksprung: setzt der Finger wieder auf, ist ein
    // noch scharfer Wächter aus der vorigen Geste gegenstandslos. Stünde diese
    // Zeile hinter `isControl`, verschluckte er den Klick auf den
    // Bearbeiten-Knopf, wenn man ihn direkt nach einem Long-Press antippt.
    dropClickGuard()
    if (isControl(event.target)) return
    // Wer in eine noch fliegende Wand fasst, will scrollen (Nachlauf → Wächter).
    if (scrolling.value) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // Ein zweiter Finger darf einer laufenden Geste nichts wegnehmen.
    if (active) return

    active = true
    el = event.currentTarget as HTMLElement
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY

    clearTimer()
    pressTimer = window.setTimeout(() => {
      pressTimer = null
      if (!active) return
      // Während der Haltezeit hat der Bildlauf begonnen → das war kein Drücken.
      if (scrolling.value) {
        reset()
        return
      }
      const rect = options.anchorEl()?.getBoundingClientRect() ?? null
      // Die Mitte eines Rechtecks ist auch bei geneigtem Element die Mitte des
      // Elements — die schiefen Ecken spielen hier keine Rolle. Ohne Element
      // (theoretisch) fällt die Mitte auf den Finger zurück.
      anchor.value = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: startX, y: startY }
      direction.value = null
      open.value = true
      // Ab hier gehören alle weiteren Ereignisse diesem Zettel, auch wenn der
      // Finger ihn verlässt — die Zugstrecke ist länger als ein kleiner Zettel.
      //
      // Im `try`, aus demselben Grund wie in `useTearGesture`: synthetische
      // Zeiger der Browser-Automatisierung lassen `setPointerCapture` mit
      // `NotFoundError` scheitern. Ohne Einfangen läuft die Geste weiter,
      // solange der Finger über dem Zettel bleibt — ein Wurf hier verschlänge
      // dagegen die ganze Geste.
      try {
        el?.setPointerCapture?.(pointerId)
      } catch {
        // Kein Einfangen — die Geste läuft ohne weiter.
      }
    }, PRESS_MS)
  }

  const directionOf = (dx: number, dy: number): PressDirection | null => {
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    if (Math.hypot(dx, dy) < COMMIT_DISTANCE) return null
    if (ay >= ax * AXIS_RATIO) return dy > 0 ? 'down' : 'up'
    if (ax >= ay * AXIS_RATIO) return dx > 0 ? 'right' : 'left'
    // Genau in der Diagonalen: keine Richtung. Lieber nichts als das Falsche.
    return null
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!active || event.pointerId !== pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY

    if (!open.value) {
      // Vor dem Auslösen: jede Bewegung über die Toleranz ist ein Bildlauf oder
      // ein Verrutschen. Beides bricht ab — und zwar OHNE Klick zu schlucken:
      // ein leichtes Verrutschen beim Antippen soll den Zettel weiterhin
      // aufklappen.
      if (Math.abs(dx) > MOVE_TOLERANCE || Math.abs(dy) > MOVE_TOLERANCE) reset()
      else if (scrolling.value) reset()
      return
    }

    direction.value = directionOf(dx, dy)
    event.preventDefault()
  }

  /**
   * Der Preis-freie Scroll-Schutz: erst **nach** dem Auslösen wird dem Browser
   * der Bildlauf abbestellt. Muss als nicht-passiver Zuhörer hängen — in einem
   * Vue-Template ohne `.passive`-Modifier ist er das.
   */
  const onTouchMove = (event: TouchEvent) => {
    if (!open.value) return
    if (event.cancelable) event.preventDefault()
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!active || event.pointerId !== pointerId) return
    const chosen = open.value ? direction.value : null
    const fired = open.value
    reset()
    // Auch der Abbruch ohne Richtung schluckt — ausgelöst hat die Geste ja.
    if (fired) armClickGuard()
    if (chosen) options.onDirection(chosen)
  }

  /**
   * Der Browser hat die Geste weggenommen (Systemgeste, Fensterwechsel, ein
   * zweiter Finger). Zurück in den Ausgangszustand, ohne etwas auszulösen.
   */
  const onPointerCancel = (event: PointerEvent) => {
    if (!active || event.pointerId !== pointerId) return
    const fired = open.value
    reset()
    if (fired) armClickGuard()
  }

  onUnmounted(() => {
    reset()
    dropClickGuard()
  })

  return {
    open: readonly(open),
    direction: readonly(direction),
    anchor: readonly(anchor),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onTouchMove
  }
}
