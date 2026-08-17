/**
 * Der Punkteflug (Pinnwand-Redesign, Etappe 4).
 *
 * Beim Abreißen fliegt der Punktwert sichtbar in die Statusleiste. Das ersetzt
 * das Konfetti: es zeigt nicht nur „geschafft", sondern **wohin** es zählt.
 *
 * **Warum das Ziel zur Flugzeit gesucht wird und nicht gespeichert ist:** die
 * Leiste klebt oben (`position: sticky`). Ihre Lage im Dokument ändert sich mit
 * jedem Scrollen, ihre Lage im **Fenster** nicht. `getBoundingClientRect()`
 * liefert genau Letztere, und weil der Flieger `position: fixed` ist, rechnen
 * beide im selben Bezugssystem. Damit findet der Flug sein Ziel auch bei weit
 * nach unten gescrollter Wand — ohne eine einzige Scroll-Korrektur.
 *
 * Die Leiste selbst wächst **nicht** durch diesen Flug: sie hängt an der
 * optimistischen Erledigung im Store und beginnt ihre Breitenanimation im
 * selben Moment. Der Flug ist die Erzählung dazu, nicht ihr Auslöser — wer ihn
 * entfernt, verliert die Erzählung, nicht die Zahl.
 */

/** Kein Ziel gefunden → oben in die Mitte, damit nie ins Leere geflogen wird. */
const FALLBACK_TOP = 12

/**
 * Wie lange das Ziel nach der Ankunft hervorgehoben bleibt. Etwas kürzer als
 * die 0,45 s Breitenanimation der Füllung, damit beides zusammen als eine
 * Bewegung liest. Gesetzt, nicht gemessen.
 */
const HIT_MS = 420

export interface FlightOrigin {
  /** Fensterkoordinaten (wie `getBoundingClientRect`), nicht Dokumentkoordinaten. */
  x: number
  y: number
}

export interface FlightOptions {
  /**
   * Ruhige Papiervariante ohne Punktbehauptung — für ein Abreißen, das
   * **nichts** einbringt, weil die Punkte schon über die Unteraufgaben
   * eingesammelt wurden.
   *
   * Warum überhaupt etwas fliegt: der Zettel verschwindet von der Wand, und
   * ohne Quittung sieht das wie ein Fehlgriff aus. Warum kein „+0 P": eine Null
   * in der Aufmachung eines Punktgewinns liest sich wie ein Verlust. Die
   * Bewegung ist deshalb dieselbe, nur die Aussage ist eine andere.
   */
  muted?: boolean
}

/**
 * Lässt `label` von `origin` in die Statusleiste fliegen.
 *
 * Ohne Wirkung, wenn `label` leer ist — eine Unteraufgabe im Modus `checklist`
 * trägt nichts zur Woche bei und quittiert an ihrem Zettelchen selbst.
 */
export function flyPoints(label: string, origin: FlightOrigin, options: FlightOptions = {}): void {
  if (typeof document === 'undefined' || !label) return

  const target = document.querySelector<HTMLElement>('[data-points-target]')
  const rect = target?.getBoundingClientRect() ?? null
  const to = rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : { x: window.innerWidth / 2, y: FALLBACK_TOP }

  const chip = document.createElement('div')
  chip.className = options.muted ? 'pw-points-flight pw-points-flight--muted' : 'pw-points-flight'
  chip.setAttribute('aria-hidden', 'true')
  chip.textContent = label
  chip.style.left = `${origin.x}px`
  chip.style.top = `${origin.y}px`
  document.body.appendChild(chip)

  const dx = to.x - origin.x
  const dy = to.y - origin.y

  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const done = () => {
    chip.remove()
    if (!target) return
    // Ankunft: das Ziel quittiert kurz. Eine Klasse, kein zweites Element.
    target.classList.add('is-hit')
    window.setTimeout(() => target.classList.remove('is-hit'), HIT_MS)
  }

  // Ohne Bewegung: kurz aufblitzen lassen, wo es hingeht, statt es zu fliegen.
  // Der Flug ist der Zusatz; die Aussage („so viel, dorthin") bleibt.
  if (reduced || typeof chip.animate !== 'function') {
    window.setTimeout(done, 260)
    return
  }

  // Ein leichter Bogen: erst abheben (der Zettel wird ja abgerissen), dann in
  // die Leiste. `translate` und `opacity` reichen dafür — kein Layout.
  const animation = chip.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0, offset: 0 },
      {
        transform: `translate(calc(-50% + ${dx * 0.18}px), calc(-50% + ${dy * 0.1 + 10}px)) scale(1.18)`,
        opacity: 1,
        offset: 0.18
      },
      {
        transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy * 0.42}px)) scale(1.05)`,
        opacity: 1,
        offset: 0.6
      },
      {
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5)`,
        opacity: 0,
        offset: 1
      }
    ],
    { duration: 620, easing: 'cubic-bezier(.32,.72,.3,1)', fill: 'forwards' }
  )

  animation.onfinish = done
  animation.oncancel = () => chip.remove()
}
