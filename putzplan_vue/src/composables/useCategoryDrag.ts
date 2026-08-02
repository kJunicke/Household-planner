import { onBeforeUnmount } from 'vue'
import Sortable from 'sortablejs'

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
 */
export function useCategoryDrag(options: {
  /** Sortable-Gruppenname — nur Container derselben Gruppe nehmen einander an. */
  group: string
  /** Ziel-Kategoriename aus dem Container; null heißt „Unkategorisiert". */
  categoryOf: (container: HTMLElement) => string | null
  onMove: (itemId: string, category: string | null) => void
}) {
  const instances = new Map<string, Sortable>()

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
        scroll: true,
        scrollSensitivity: 80,
        ghostClass: 'drag-ghost',
        chosenClass: 'drag-chosen',
        onEnd: (evt) => {
          const from = evt.from as HTMLElement
          const to = evt.to as HTMLElement
          const itemId = (evt.item as HTMLElement).dataset.itemId
          if (from === to || !itemId) return

          // Zurückrollen, bevor Vue neu rendert: sonst steht die Zeile doppelt
          // im Baum — einmal von der Bibliothek verschoben, einmal gerendert.
          const anchor = from.children[evt.oldIndex ?? 0] ?? null
          from.insertBefore(evt.item, anchor)

          options.onMove(itemId, options.categoryOf(to))
        },
      })
    )
  }

  onBeforeUnmount(() => {
    instances.forEach(s => s.destroy())
    instances.clear()
  })

  return { bind }
}
