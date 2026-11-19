import { onBeforeUnmount, ref } from 'vue'
import Sortable from 'sortablejs'

import { dropTargetAt } from '@/lib/dropTargetAt'

import { useDragAutoScroll } from './useDragAutoScroll'

/**
 * Produkte per Halten und Ziehen zwischen Kategorie-Sektionen verschieben.
 *
 * SortableJS hängt direkt an den Sektions-Containern — bewusst ohne Vue-Wrapper:
 * die Sektionen sind berechnete Gruppen aus dem Store und besitzen kein eigenes
 * Array, das die Bibliothek umsortieren dürfte. Jeder Drop wird deshalb im DOM
 * sofort zurückgerollt; geschrieben wird ausschließlich die Zielkategorie, und
 * die Ansicht rendert danach ohnehin neu (innerhalb einer Kategorie bleibt es
 * bei alphabetischer Sortierung).
 *
 * Auslöser ist kurzes Halten mit Bewegungsschwelle: vertikales Wischen scrollt
 * weiter, kurzes Antippen hakt weiter ab.
 *
 * Zweites Ablageziel sind die Kategorie-Blasen der Leiste (`CategoryRail`,
 * Elemente mit `data-drop-key` und `data-cat-name`). Sie liegen außerhalb jeder
 * Sortable-Gruppe; welche Blase unter dem Finger liegt, verfolgt diese
 * Komponente selbst (`dropKey`). Loslassen über einer Blase schreibt deren
 * Kategorie über denselben `onMove` wie das Ablegen auf einer Sektion.
 */
export function useCategoryDrag(options: {
  /** Sortable-Gruppenname — nur Container derselben Gruppe nehmen einander an. */
  group: string
  /** Ziel-Kategoriename aus dem Container; null heißt „Unkategorisiert". */
  categoryOf: (container: HTMLElement) => string | null
  onMove: (itemId: string, category: string | null) => void
}) {
  const instances = new Map<string, Sortable>()
  const autoScroll = useDragAutoScroll()
  /** Liegt gerade ein Eintrag in der Hand? Die Leiste klappt dann auf. */
  const dragging = ref(false)
  /** `data-drop-key` der Blase unter dem Finger, sonst null. */
  const dropKey = ref<string | null>(null)
  let pointer: { x: number; y: number } | null = null
  /**
   * Erst wenn der Finger einmal neben jeder Blase war, zählen Blasen als Ziel.
   * Die Leiste wird beim Greifen breiter und kann dann schon unter dem Finger
   * liegen: wer rechts in der Zeile greift und gleich loslässt, soll nichts
   * verschieben.
   */
  let armed = false
  /** Ursprung der gerade gezogenen Zeile — in `onStart` gemerkt, in `onEnd` benutzt. */
  let originParent: HTMLElement | null = null
  let originNext: Node | null = null

  const bubbles = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-drop-key]'))
      .map((el) => ({ key: el.dataset.dropKey!, el, rect: el.getBoundingClientRect() }))
      // Ohne Fläche: Leiste eines gerade versteckten Listentyps.
      .filter((b) => b.rect.width > 0 && b.rect.height > 0)

  const refreshDropKey = () => {
    const hit = pointer ? dropTargetAt(pointer, bubbles()) : null
    if (hit === null) armed = true
    const next = armed ? hit : null
    if (next === dropKey.value) return
    // Über einer Blase steht die Liste: sonst liefe sie unter den unteren
    // Blasen weg, die in der Scroll-Zone über der Navigationsleiste liegen.
    if (next !== null && dropKey.value === null) autoScroll.stop()
    if (next === null && dropKey.value !== null) autoScroll.start()
    dropKey.value = next
  }

  const trackPointer = (evt: Event) => {
    const point = 'touches' in evt ? (evt as TouchEvent).touches[0] : (evt as MouseEvent)
    if (!point) return
    pointer = { x: point.clientX, y: point.clientY }
    refreshDropKey()
  }

  const MOVE_EVENTS = ['touchmove', 'pointermove', 'mousemove'] as const
  const END_EVENTS = ['touchend', 'touchcancel', 'pointerup', 'mouseup'] as const

  const endTracking = () => {
    MOVE_EVENTS.forEach((type) => document.removeEventListener(type, trackPointer))
    END_EVENTS.forEach((type) => document.removeEventListener(type, endLater))
    dragging.value = false
    dropKey.value = null
    pointer = null
    armed = false
  }
  // Fallback, falls `onEnd` ausbleibt (Sektion mitten im Zug neu gerendert).
  // Verzögert, weil Loslassen-Ereignisse vor `onEnd` ankommen können, das den
  // Zustand noch braucht.
  const endLater = () => setTimeout(endTracking, 0)

  const startTracking = () => {
    endTracking()
    MOVE_EVENTS.forEach((type) => document.addEventListener(type, trackPointer, { passive: true }))
    END_EVENTS.forEach((type) => document.addEventListener(type, endLater, { passive: true }))
    dragging.value = true
  }

  const destroy = (key: string) => {
    instances.get(key)?.destroy()
    instances.delete(key)
  }

  /** Ref-Callback je Sektion; `null` kommt beim Ausbau der Sektion. */
  const bind = (key: string, el: HTMLElement | null) => {
    const existing = instances.get(key)
    if (!el) {
      destroy(key)
      return
    }
    if (existing) {
      if (existing.el === el) return
      destroy(key)
    }

    instances.set(
      key,
      Sortable.create(el, {
        group: options.group,
        draggable: '[data-item-id]',
        delay: 200,
        delayOnTouchOnly: true,
        touchStartThreshold: 8,
        // Mit der Maus greift die Haltezeit nicht — ohne Toleranz würde schon
        // ein Wackeln beim Klicken ein Ziehen auslösen und das Abhaken fressen.
        fallbackTolerance: 8,
        animation: 150,
        // Ohne den Fallback benutzt die Bibliothek am Desktop das native
        // HTML5-Ziehen und verhält sich dort anders als auf dem Handy — eine
        // Bedienung, zwei Implementierungen wollen wir nicht.
        forceFallback: true,
        fallbackOnBody: true,
        // Eigenes Auto-Scrollen (`useDragAutoScroll`): das eingebaute läuft mit
        // fester Geschwindigkeit, und seine untere Zone liegt hinter der
        // Navigationsleiste.
        scroll: false,
        ghostClass: 'drag-ghost',
        chosenClass: 'drag-chosen',
        // Der Nachbar VOR dem Ziehen ist die Marke zum Zurückrollen — nicht der
        // Index. `from.children[oldIndex]` zählt nur Elemente; Vue schiebt aber
        // Textknoten als Fragment-Marken zwischen die Zeilen (eine Komponente
        // mit Kommentar über der Wurzel rendert ein Fragment). Der Index landet
        // dann außerhalb des eigenen Fragments, und Vues `removeFragment` läuft
        // beim Ausbauen nur von Marke zu Marke — die Zeile bleibt als Waise
        // stehen (Befund F5: Eintrag in zwei Sektionen zugleich). Ein echter
        // Nachbarknoten trifft die Stelle unabhängig von Knotentypen.
        onStart: (evt) => {
          originParent = evt.from as HTMLElement
          originNext = (evt.item as HTMLElement).nextSibling
          autoScroll.start()
          startTracking()
        },
        onEnd: (evt) => {
          autoScroll.stop()
          const from = evt.from as HTMLElement
          const to = evt.to as HTMLElement
          const itemId = (evt.item as HTMLElement).dataset.itemId
          const bubble = dropKey.value
            ? bubbles().find((b) => b.key === dropKey.value)?.el
            : undefined
          endTracking()

          // Zurückrollen, bevor Vue neu rendert: sonst steht die Zeile doppelt
          // im Baum — einmal von der Bibliothek verschoben, einmal gerendert.
          // Auch innerhalb einer Sektion: die Reihenfolge dort gehört dem Store,
          // nicht der Bibliothek.
          if (originParent === from) {
            const anchor = originNext && originNext.parentNode === from ? originNext : null
            from.insertBefore(evt.item, anchor)
          }
          originParent = null
          originNext = null

          if (!itemId) return
          // Die Blase gewinnt gegen die Sektion, in der die Bibliothek den
          // Platzhalter zuletzt abgestellt hat.
          if (bubble) {
            const category = options.categoryOf(bubble)
            if (category !== options.categoryOf(from)) options.onMove(itemId, category)
            return
          }
          if (from === to) return
          options.onMove(itemId, options.categoryOf(to))
        },
      }),
    )
  }

  onBeforeUnmount(() => {
    endTracking()
    instances.forEach((s) => s.destroy())
    instances.clear()
  })

  return { bind, dragging, dropKey }
}
