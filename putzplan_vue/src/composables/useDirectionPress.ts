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
 * - **gegen das Eselsohr**: der Ort. `isControl` hält die Abreiß-Griffe
 *   komplett aus dieser Geste heraus; dort startet der Timer gar nicht erst.
 *   Die beiden Gesten können sich damit nicht überschneiden — und das
 *   Abreißen bleibt ohne Wartezeit und **ohne Kranz**. Seit Ticket 01 ist das
 *   auch alles, was `isControl` noch aussperrt: Knöpfe gehören zum Griff, ihr
 *   Klick wird nach überschrittener Schwelle vom Klick-Wächter geschluckt.
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
 * Deshalb steht hier **kein** `touch-action`. **Und schon gar nicht
 * `manipulation`:** mit diesem Wert liefert iOS gar kein `pointercancel` mehr
 * (offener WebKit-Fehler), womit der Touch-Rueckfallweg weiter unten tot waere
 * — er haengt genau an diesem Ereignis. Belege in
 * `docs/research/ios-gesten-webkit.md`. Der Bildlauf bleibt bis zum
 * Auslösen vollständig zuständig; abgeschaltet wird er erst danach, und zwar
 * über einen nicht-passiven `touchmove`, der nur im geöffneten Zustand
 * `preventDefault()` ruft (→ `onTouchMove`). Das geht auf, weil der Finger im
 * Moment des Auslösens noch nicht bewegt wurde: der Browser hat den Bildlauf
 * dann noch nicht begonnen und lässt sich noch abbestellen. Kosten im
 * Ruhezustand: null.
 *
 * Handler am Zettel binden:
 *   @pointerdown @pointermove @pointerup @pointercancel @touchstart @touchmove
 *
 * Dazu gehört **`@contextmenu.prevent` am selben Element** (Ticket 01). Es
 * hängt kein Handler von hier daran, es ist reines Abbestellen — aber ohne das
 * nimmt die native Langdruck-Geste des Browsers dem Zettel den Zeiger wieder
 * weg, und zwar nur dort, wo etwas unter dem Finger liegt (Text, Sticker).
 * Begründung ausführlich im Template von `WallNote.vue`.
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
 * Ab dieser Strecke — gemessen ab dem **Aufsetzpunkt** — ist eine Richtung
 * gewählt.
 *
 * Früher 48 px, weil die Beschriftungen 56 px um die Zettelmitte lagen und die
 * Richtung feststehen musste, bevor der Daumen auf ihnen lag. Dieser Grund ist
 * mit den Beschriftungen an den **Bildschirm**rändern entfallen (Ticket 00b);
 * ein Zettel am linken Wandrand brauchte sonst einen Zug bis fast an die Kante.
 * Gesetzt, nicht gemessen.
 *
 * `WallDirectionMenu` hängt seine Pfeilgeometrie an genau diese Zahl: der Pfeil
 * erscheint auf denselben Pixel, auf dem die erste Richtung anliegen kann.
 * Deshalb ist sie exportiert und wird dort nicht noch einmal geschrieben.
 */
export const COMMIT_DISTANCE = 32

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
}) {
  const scrolling = useScrollQuiet()
  const isControl = options.isControl ?? (() => false)

  /** Sind die vier Beschriftungen sichtbar? */
  const open = ref(false)
  /** Welche Richtung liegt gerade an — `null` heißt „noch keine". */
  const direction = ref<PressDirection | null>(null)
  /**
   * Wo der Finger aufgesetzt hat, in **Fensterkoordinaten**.
   *
   * **Nicht** die Zettelmitte: Richtungswahl und Pfeil müssen denselben
   * Ursprung haben, sonst zeigt der Pfeil eine andere Strecke an als die, über
   * die entschieden wird (→ `WallDirectionMenu`). Die Richtung wird ohnehin
   * schon immer ab hier gemessen (`startX`/`startY`).
   */
  const origin = ref<{ x: number; y: number } | null>(null)
  /** Wo der Finger gerade liegt — dorthin zeigt der Pfeil. */
  const tip = ref<{ x: number; y: number } | null>(null)

  let pressTimer: number | null = null
  let el: HTMLElement | null = null
  let pointerId = -1
  /**
   * Welche **Berührung** dieser Geste gehört (`Touch.identifier`), oder `-1`.
   *
   * Nicht dasselbe wie `pointerId` und daraus auch nicht ableitbar: die beiden
   * Nummernkreise sind unabhängig. Deshalb wird der Wert am `touchstart`
   * eingesammelt (→ `onTouchStart`) und nicht am `pointerdown`.
   *
   * Gebraucht wird er nur vom Touch-Rückfallweg weiter unten. Der hört am
   * **Fenster** zu und sähe sonst jede Berührung der ganzen App als seine
   * eigene an.
   */
  let touchId = -1
  /** Die Art des Zeigers — entscheidet ueber das ausdrueckliche Einfangen. */
  let pointerType = ''
  /** Haben WIR eingefangen? Nur dann darf `reset()` freigeben (→ `captured`
   *  in `useTearGesture`, gleiche Begruendung). */
  let captured = false
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
    dropTouchWatch()
    if (captured && el && el.hasPointerCapture?.(pointerId)) {
      el.releasePointerCapture(pointerId)
    }
    captured = false
    pointerType = ''
    active = false
    el = null
    pointerId = -1
    touchId = -1
    open.value = false
    direction.value = null
    origin.value = null
    tip.value = null
  }

  const onPointerDown = (event: PointerEvent) => {
    // Ganz oben, VOR jedem Rücksprung: setzt der Finger wieder auf, ist ein
    // noch scharfer Wächter aus der vorigen Geste gegenstandslos. Stünde diese
    // Zeile hinter `isControl`, verschluckte er den ersten Klick auf alles, was
    // `isControl` aussperrt — heute (seit Ticket 01) sind das die Abreiß-Griffe
    // `.ear` und `.mini-ear`: ein Zug am Eselsohr direkt nach einem Long-Press
    // verlöre sonst seinen nachlaufenden Klick an den fremden Wächter. Die
    // frühere Begründung nannte den Bearbeiten-Knopf; der ist seit Ticket 01
    // kein Control mehr und braucht die Zeile nicht mehr. Die Reihenfolge
    // bleibt trotzdem richtig.
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
    pointerType = event.pointerType
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
      // Der Finger hat sich seit dem Aufsetzen um höchstens `MOVE_TOLERANCE`
      // bewegt (sonst hätte `onPointerMove` abgebrochen) — Ursprung und Spitze
      // fallen im Moment des Auslösens also zusammen, und es ist kein Pfeil zu
      // sehen. Genau richtig: gezogen wurde noch nicht.
      origin.value = { x: startX, y: startY }
      tip.value = { x: startX, y: startY }
      direction.value = null
      open.value = true
      // Ab hier gehören alle weiteren Ereignisse diesem Zettel, auch wenn der
      // Finger ihn verlässt — die Zugstrecke ist länger als ein kleiner Zettel.
      //
      // **Nur fuer Maus und Stift.** Bei `touch` ist der Zeiger laut Pointer
      // Events L3 §9.4 schon beim `pointerdown` **implizit** eingefangen, und
      // WebKit setzt das auch so um (`PointerCaptureController.cpp`). Der
      // ausdrueckliche Aufruf brachte dort also nichts — und ist wegen eines
      // offenen WebKit-Fehlers, bei dem das erste `pointermove` nach
      // `setPointerCapture` NICHT eingefangen ist, sogar riskant. Belege in
      // `docs/research/ios-gesten-webkit.md`.
      //
      // Im `try`, weil `setPointerCapture` einen `NotFoundError` wirft, wenn
      // der Zeiger nicht (mehr) aktiv ist — beim QC mit synthetischen Zeigern
      // der Browser-Automatisierung beobachtet. Ein Wurf darf die Geste nicht
      // verschlucken; ohne Einfangen laeuft sie weiter.
      if (pointerType !== 'touch') {
        try {
          el?.setPointerCapture?.(pointerId)
          captured = true
        } catch {
          // Kein Einfangen — die Geste läuft ohne weiter.
        }
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

    tip.value = { x: event.clientX, y: event.clientY }
    direction.value = directionOf(dx, dy)
    event.preventDefault()
  }

  /**
   * Sammelt die `Touch.identifier` **dieser** Geste ein (Ticket 01).
   *
   * Der Browser feuert `pointerdown` vor `touchstart`; wenn wir hier ankommen,
   * steht also schon fest, ob die Geste überhaupt läuft (`active`) — und wenn
   * `isControl` sie abgelehnt hat, notieren wir nichts. Ein zweiter Finger
   * findet `touchId` bereits gesetzt und ändert nichts daran; das passt zu
   * `onPointerDown`, wo ein zweiter Zeiger einer laufenden Geste ebenfalls
   * nichts wegnehmen darf.
   *
   * Rein beobachtend, deshalb passiv zu binden.
   */
  const onTouchStart = (event: TouchEvent) => {
    if (!active || touchId !== -1) return
    const touch = event.changedTouches.item(0)
    if (touch) touchId = touch.identifier
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

  // --- Der Zeiger gehört ab dem Auslösen dem Zettel (Ticket 01) --------------
  //
  // Regel aus dem Ticket: „Ab der spürbaren Bestätigung gehört der Zeiger dem
  // Zettel, bis der Finger hochgeht — auch bei Bewegung null."
  //
  // Die erste Hälfte der Umsetzung ist das Abbestellen des Kontextmenüs am
  // Zettel (`@contextmenu.prevent` in `WallNote.vue`, Begründung dort). Das
  // hier ist die zweite: der **Rückfall auf Touch-Ereignisse**, falls der
  // Browser uns den Zeiger trotzdem wegnimmt.
  //
  // Warum das nötig ist: `pointercancel` ist die Art, wie der Browser eine
  // Geste an sich zieht. Danach kommt für diesen `pointerId` weder ein
  // `pointermove` noch ein `pointerup` — die bisherige Fassung musste die
  // Geste deshalb abräumen. Genau das ist der gemeldete Fehler: es vibriert
  // (nativ, die App vibriert nirgends), und der Griff ist sofort wieder weg.
  //
  // Die Touch-Ereignisse laufen unabhängig davon weiter, solange der Finger
  // liegt. Das ist keine Hoffnung, sondern belegt: WebKit ruft beim Beginn des
  // Bildlaufs `cancelPointersForGestureRecognizer:` — das bricht ausschliesslich
  // die ZEIGER ab, die UIKit-Touches laufen unberuehrt weiter. Wir hören ab dem Abbruch am **Fenster** zu und führen die Geste mit
  // denselben Zahlen weiter (Ursprung, `directionOf`, Klick-Wächter) — der
  // Nutzer merkt vom Wechsel nichts.
  //
  // **Nur nach dem Auslösen und nur bei `touch`.** Vor dem Auslösen bleibt es
  // beim alten Verhalten: im Zweifel gewinnt der Bildlauf. Und mit Maus oder
  // Stift gibt es keine Touch-Ereignisse, auf die man ausweichen könnte.
  //
  // **Der Wächter nimmt ausschließlich die EIGENE Berührung an** (`touchId`,
  // eingesammelt am `touchstart`). Ohne diese Fessel wäre er ein offener
  // Buchungspfad, und zwar ein stiller: er hängt am Fenster, also sähe er jede
  // Berührung irgendwo in der App; er rechnete sie gegen den alten
  // Aufsetzpunkt, käme fast sicher über `COMMIT_DISTANCE` — und ein
  // `touchend` löste `onDirection('down')` aus, also eine gebuchte Erledigung,
  // die der Nutzer nie als Fehler erkennt. Derselbe Mangel machte im Alltag
  // schon den zweiten Finger zum Beender der Geste des ersten.
  //
  // **Im ferngesteuerten Tab ist dieser ganze Weg NICHT prüfbar** (→
  // `docs/testing.md`). Synthetische Zeiger der Browser-Automatisierung
  // erzeugen kein `touchstart`; `touchId` bleibt `-1`, und `armTouchWatch`
  // biegt sofort in den `abandon()`-Zweig ab. Der Rückfallweg sieht dort also
  // tot aus, ohne es zu sein — bestätigen kann ihn nur ein echtes Telefon.
  // Wer hier eine Stunde lang sucht, warum „nichts passiert": das ist der
  // Grund, und es ist kein Fehler.
  //
  // **Zwei Auswege, nicht einer**, weil der Finger als einziger Ausweg nicht
  // reicht: wer nach dem Auslösen den Reiter wechselt oder das Telefon sperrt,
  // ohne den Finger zu heben, bekommt danach weder `touchend` noch
  // `touchcancel` — der Zettel bleibt gemountet, `onUnmounted` greift nicht,
  // und der Zustand stünde für immer. Deshalb endet die Geste auch, sobald die
  // Seite in den Hintergrund geht (`visibilitychange` → `hidden`); wer beim
  // Armieren schon versteckt ist, kommt gar nicht erst hinein.

  let touchWatch = false

  /** Unsere Berührung in einer Liste — oder `null`, dann ist es eine fremde. */
  function ownTouch(list: TouchList): Touch | null {
    if (touchId === -1) return null
    for (let i = 0; i < list.length; i += 1) {
      const touch = list.item(i)
      if (touch && touch.identifier === touchId) return touch
    }
    return null
  }

  function dropTouchWatch() {
    if (!touchWatch) return
    touchWatch = false
    window.removeEventListener('touchmove', onWindowTouchMove)
    window.removeEventListener('touchend', onWindowTouchEnd)
    window.removeEventListener('touchcancel', onWindowTouchAbort)
    document.removeEventListener('visibilitychange', onWindowHidden)
  }

  /** Ende ohne Entscheidung: abräumen und den nachlaufenden Klick schlucken. */
  function abandon() {
    reset()
    armClickGuard()
  }

  function armTouchWatch() {
    if (touchWatch) return
    // Ohne bekannte Berührung gibt es nichts, dem wir folgen dürften — dann
    // lieber sauber abräumen als blind jede fremde Berührung annehmen.
    if (touchId === -1) {
      abandon()
      return
    }
    // Schon im Hintergrund: es kommt kein Ereignis mehr, das uns beendet. Wie
    // in `onWindowHidden` nur `reset()` und KEIN Klick-Wächter — in einer
    // verborgenen Seite überlebte dessen gedrosselter Timer seine 300 ms und
    // schluckte womöglich den ersten Tipp nach der Rückkehr. Der Zweig
    // darüber (`touchId === -1`) armiert sehr wohl: dort ist die Seite
    // sichtbar, der Finger liegt, und ein nachlaufender Klick ist zu erwarten.
    if (document.visibilityState === 'hidden') {
      reset()
      return
    }
    touchWatch = true
    // Nicht passiv: nur so lässt sich der Bildlauf weiterhin abbestellen,
    // wie es `onTouchMove` am Zettel im ungestörten Fall tut.
    window.addEventListener('touchmove', onWindowTouchMove, { passive: false })
    window.addEventListener('touchend', onWindowTouchEnd)
    window.addEventListener('touchcancel', onWindowTouchAbort)
    document.addEventListener('visibilitychange', onWindowHidden)
  }

  function onWindowTouchMove(event: TouchEvent) {
    if (!active || !open.value) return
    // `touches` = alle liegenden Finger. Ein fremder bewegt hier nichts.
    const touch = ownTouch(event.touches)
    if (!touch) return
    tip.value = { x: touch.clientX, y: touch.clientY }
    direction.value = directionOf(touch.clientX - startX, touch.clientY - startY)
    if (event.cancelable) event.preventDefault()
  }

  /** Der Finger geht hoch — dasselbe Ende wie `onPointerUp`. */
  function onWindowTouchEnd(event: TouchEvent) {
    if (!active) return
    // `changedTouches` = die Finger, die dieses Ereignis wirklich MEINT. Hebt
    // ein zweiter Finger ab, steht unserer zwar in `touches`, aber nicht hier —
    // und die Geste läuft zu Recht weiter.
    if (!ownTouch(event.changedTouches)) return
    const chosen = direction.value
    reset()
    // Ausgelöst hat die Geste, also schluckt auch der Abbruch ohne Richtung.
    armClickGuard()
    if (chosen) options.onDirection(chosen)
  }

  /**
   * Jetzt ist der Finger wirklich weg (Anruf, Systemgeste, Fensterwechsel).
   * Abräumen, ohne etwas auszulösen — eine Richtung, die niemand losgelassen
   * hat, ist keine Entscheidung.
   */
  function onWindowTouchAbort(event: TouchEvent) {
    if (!active) return
    if (!ownTouch(event.changedTouches)) return
    abandon()
  }

  /**
   * Die Seite geht in den Hintergrund (Reiterwechsel, Bildschirmsperre). Der
   * zweite Ausweg — und der einzige, der auch dann noch greift, wenn der
   * Finger liegen bleibt und deshalb nie ein `touchend` erzeugt.
   *
   * Beendet ohne auszulösen: was der Nutzer beim Wegschalten in der Hand
   * hatte, ist keine getroffene Entscheidung.
   *
   * **Nur `reset()`, ausdrücklich NICHT `abandon()`.** Der Klick-Wächter
   * fängt den Klick ab, den das **Loslassen** erzeugt — beim Wegschalten lässt
   * niemand los, es gibt also keinen zu schlucken. Ihn hier trotzdem zu
   * armieren wäre schädlich: sein `setTimeout` über `CLICK_GUARD_MS` liefe in
   * einer verborgenen Seite, wo Timer auf mindestens eine Sekunde gedrosselt
   * werden. Er überlebte seine 300 ms deutlich und wäre bei der Rückkehr
   * womöglich noch scharf — der erste Tipp nach dem Zurückkommen täte dann
   * nichts, und das sieht wie ein Aussetzer der App aus.
   */
  function onWindowHidden() {
    if (!active) return
    if (document.visibilityState !== 'hidden') return
    reset()
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
   * Der Browser hat die Geste weggenommen (native Langdruck-Geste,
   * Systemgeste, Fensterwechsel, ein zweiter Finger).
   *
   * **Vor dem Auslösen** heißt das: es war kein Drücken. Zurück in den
   * Ausgangszustand, ohne etwas auszulösen und ohne Klick zu schlucken — ein
   * Antippen soll den Zettel weiterhin aufklappen.
   *
   * **Nach dem Auslösen** gilt die Regel aus Ticket 01: der Zeiger gehört dem
   * Zettel, bis der Finger hochgeht. Bei einem Finger wird deshalb nicht
   * abgeräumt, sondern auf Touch-Ereignisse ausgewichen (→ `armTouchWatch`).
   * Nur mit Maus oder Stift bleibt es beim Abräumen: dorthin gibt es keinen
   * Rückfallweg.
   */
  const onPointerCancel = (event: PointerEvent) => {
    if (!active || event.pointerId !== pointerId) return
    if (!open.value) {
      reset()
      return
    }
    if (event.pointerType !== 'touch') {
      reset()
      armClickGuard()
      return
    }
    armTouchWatch()
  }

  onUnmounted(() => {
    reset()
    dropClickGuard()
  })

  return {
    open: readonly(open),
    direction: readonly(direction),
    origin: readonly(origin),
    tip: readonly(tip),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onTouchStart,
    onTouchMove
  }
}
