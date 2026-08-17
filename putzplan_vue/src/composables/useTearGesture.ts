import { onUnmounted, readonly, ref } from 'vue'

/**
 * Abreißen am Eselsohr (Pinnwand-Redesign, Etappe 4).
 *
 * Eine Zieh-Geste nach unten, die **sofort** greift — ohne vorheriges langes
 * Drücken, weil Erledigen die häufigste Handlung ist und nicht die langsamste
 * sein darf.
 *
 * Der Lebenszyklus steckt vollständig hier drin. Nach außen gehen nur zwei
 * Dinge: welcher Griff gerade gezogen wird (`activeId`) und wie weit (`pull`).
 * Was das optisch bedeutet, entscheidet die Komponente.
 *
 * **Warum eine eigene Geste und nicht `useSwipeAction`.** Das bestehende
 * Composable trennt Waagerechtes vom Senkrechten und gibt bei senkrechtem Zug
 * **auf** — es überlässt dem Browser das Scrollen. Genau umgekehrt ist es hier:
 * senkrecht ist die Geste, waagerecht ist der Abbruch. Die Achsenerkennung ist
 * dieselbe Idee, die Entscheidung die gegenteilige; wiederverwenden ließe sich
 * nur der Name.
 *
 * Handler am Griff binden:
 *   @pointerdown @pointermove @pointerup @pointercancel
 */

/**
 * Ab dieser Strecke gilt die Richtung als entschieden (Spec: „die ersten rund
 * 10 px"). Darunter ist noch nichts festgelegt und nichts eingefangen — der
 * Finger darf ohne Folgen wieder zurück.
 */
const AXIS_DISTANCE = 10

/**
 * Ab hier ist der Zettel ab.
 *
 * Gesetzt, nicht gemessen: rund die Höhe eines Zettels (min. 44 px) plus etwas
 * Zugabe. Kürzer wäre versehentlich auszulösen, länger wäre auf einem kleinen
 * Zettel ein Zug quer über den halben Bildschirm.
 */
const TEAR_DISTANCE = 56

/**
 * Wie stark der Zug senkrecht sein muss. `dy > dx` allein reicht nicht: bei
 * 46° wäre die Geste noch „senkrecht" und würde ein Wischen quer erledigen.
 */
const AXIS_RATIO = 1.4

/**
 * Nachlauf nach dem letzten Scroll-Ereignis.
 *
 * Momentum-Scrolling läuft nach dem Loslassen weiter; ohne diesen Nachlauf
 * greift man mitten in eine fliegende Wand und reißt einen Zettel ab, den man
 * nur vorbeifliegen sah.
 */
const SCROLL_QUIET_MS = 300

// --- Scroll-Wächter: EIN Zustand für alle Griffe der Seite -------------------
//
// Ein einziger passiver Zuhörer am Fenster, nicht einer je Zettel. Bei rund
// zwanzig Zetteln mit je einem Eselsohr plus deren Zettelchen wären es sonst
// dutzende Zuhörer für dieselbe Information.

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

const retainScrollWatch = () => {
  users += 1
  if (users === 1) window.addEventListener('scroll', onWindowScroll, { passive: true })
}

const releaseScrollWatch = () => {
  users = Math.max(0, users - 1)
  if (users > 0) return
  window.removeEventListener('scroll', onWindowScroll)
  if (quietTimer !== null) {
    clearTimeout(quietTimer)
    quietTimer = null
  }
  scrolling.value = false
}

export function useTearGesture(options: {
  /** Der Griff wurde weit genug nach unten gezogen. */
  onTear: (id: string, handle: HTMLElement) => void
}) {
  retainScrollWatch()

  /** Welcher Griff gerade wirklich gezogen wird — erst NACH der Erkennung. */
  const activeId = ref<string | null>(null)
  /** Wie weit nach unten, in Pixeln. */
  const pull = ref(0)

  let candidateId: string | null = null
  let handleEl: HTMLElement | null = null
  let pointerId = -1
  let startX = 0
  let startY = 0
  let recognized = false
  /** Die Geste hat ausgelöst → den nachlaufenden Klick schlucken. */
  let consumedClick = false

  const reset = () => {
    if (recognized && handleEl && handleEl.hasPointerCapture?.(pointerId)) {
      handleEl.releasePointerCapture(pointerId)
    }
    candidateId = null
    handleEl = null
    pointerId = -1
    recognized = false
    activeId.value = null
    pull.value = 0
  }

  const onPointerDown = (id: string, event: PointerEvent) => {
    // Scroll-Schutz, erste Hälfte: solange die Wand fliegt (plus Nachlauf),
    // wird der Griff gar nicht erst zum Kandidaten. Die zweite Hälfte ist
    // `touch-action`, das die Komponente an denselben Zustand hängt.
    if (scrolling.value) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // Ein zweiter Finger darf einer laufenden Geste nicht den Griff wegnehmen:
    // der erste hinge dann mit eingefangenem Zeiger fest und käme nie zum Ende.
    if (candidateId !== null) return
    consumedClick = false
    candidateId = id
    handleEl = event.currentTarget as HTMLElement
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    recognized = false
    // Bewusst KEIN `setPointerCapture` und kein `preventDefault` hier: bis die
    // Richtung feststeht, gehört die Geste noch dem Browser.
  }

  const onPointerMove = (event: PointerEvent) => {
    if (candidateId === null || event.pointerId !== pointerId) return

    const dx = event.clientX - startX
    const dy = event.clientY - startY

    if (!recognized) {
      // Fängt zwischendurch die Seite an zu scrollen, ist die Geste keine mehr.
      if (scrolling.value) {
        consumedClick = true
        reset()
        return
      }
      if (Math.hypot(dx, dy) < AXIS_DISTANCE) return
      // Klar vertikal UND nach unten — sonst fällt die Geste aus. Nach oben
      // greift sie ausdrücklich nicht: „unten" ist die einzige Richtung, die
      // laut Spec erledigt.
      if (dy <= 0 || Math.abs(dy) < Math.abs(dx) * AXIS_RATIO) {
        // Auch der ABBRUCH schluckt den nachlaufenden Klick. Wer quer über
        // einen Griff zieht, wollte nichts erledigen — und am Zettelchen
        // erledigt ein Klick sofort. Ohne diese Zeile wäre ein misslungener
        // Zug dort eine ungewollte Erledigung.
        consumedClick = true
        reset()
        return
      }
      recognized = true
      consumedClick = true
      activeId.value = candidateId
      // Erst jetzt einfangen: ab hier gehören alle weiteren Ereignisse diesem
      // Griff, auch wenn der Finger den Zettel verlässt.
      //
      // Im `try`, weil `setPointerCapture` einen `NotFoundError` wirft, wenn der
      // Zeiger nicht (mehr) aktiv ist. Beim QC trat das mit **synthetischen**
      // Zeigern der Browser-Automatisierung auf — ein Artefakt der Simulation,
      // kein Produktfehler. Es darf die Geste trotzdem nicht abbrechen: ohne
      // Einfangen läuft sie weiter, solange der Finger über dem Griff bleibt,
      // und es fehlte höchstens ein Frame Zugweg. Ein Wurf hier hätte dagegen
      // den ganzen Zug verschluckt.
      try {
        handleEl?.setPointerCapture?.(event.pointerId)
      } catch {
        // Kein Einfangen — die Geste läuft ohne weiter.
      }
    }

    // Nach oben zurück heißt: die Geste zurücknehmen, nicht negativ ziehen.
    pull.value = Math.max(0, dy)
    // Ab hier trägt der Griff die Geste allein; der Browser soll daraus keine
    // Auswahl oder kein Scrollen mehr machen.
    event.preventDefault()
  }

  const onPointerUp = (event: PointerEvent) => {
    if (candidateId === null || event.pointerId !== pointerId) return
    const id = candidateId
    const el = handleEl
    const torn = recognized && pull.value >= TEAR_DISTANCE
    reset()
    // Zu kurz gezogen = Abbruch: der Zettel geht zurück, sonst passiert nichts.
    if (torn && el) options.onTear(id, el)
  }

  /**
   * Der Browser hat die Geste weggenommen (Systemgeste, Fensterwechsel, ein
   * zweiter Finger). Zurück in den Ausgangszustand, ohne zu erledigen.
   */
  const onPointerCancel = (event: PointerEvent) => {
    if (candidateId === null || event.pointerId !== pointerId) return
    reset()
  }

  /**
   * Nach einer erkannten Geste feuert der Browser noch einen Klick. Er darf
   * weder den Zettel aufklappen noch ein zweites Mal erledigen.
   */
  const swallowClick = (event: MouseEvent): boolean => {
    event.stopPropagation()
    if (!consumedClick) return false
    consumedClick = false
    event.preventDefault()
    return true
  }

  onUnmounted(() => {
    reset()
    releaseScrollWatch()
  })

  return {
    /** Nur lesend nach außen — geändert wird ausschließlich hier drin. */
    scrolling: readonly(scrolling),
    activeId: readonly(activeId),
    pull: readonly(pull),
    tearDistance: TEAR_DISTANCE,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    swallowClick
  }
}
