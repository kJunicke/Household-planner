/**
 * Die App folgt dem Chat: hinter dem offenen Chat zeigt sie die Seite der
 * letzten Änderung, und beim Schließen leuchten auf der dann gezeigten Seite
 * die Einträge auf, die seit dem Öffnen geändert wurden.
 *
 * Seiten sind bisher die Einkaufslisten und die Notizen; ihre Ansichten lesen
 * `flashedShoppingIds` und `flashedNoteIds` und lassen die Einträge aufleuchten.
 */
import { ref } from 'vue'
import type { Router } from 'vue-router'
import type { useShoppingStore } from '@/stores/shoppingStore'
import type { GoToPage } from '@/lib/appNavigation'
import { createChangeTrail } from './changeTrail'
import type { AssistantPage, ToolOutcome } from './tools'

/** So lange leuchten die Einträge (drei Pulse à 1,2 s, siehe ShoppingView). */
const FLASH_MS = 3600

/** Die Einkaufsartikel, die gerade aufleuchten. */
export const flashedShoppingIds = ref<ReadonlySet<string>>(new Set())
/** Die Notizen, die gerade aufleuchten. */
export const flashedNoteIds = ref<ReadonlySet<string>>(new Set())
let flashTimer: number | undefined

type FollowStore = Pick<ReturnType<typeof useShoppingStore>, 'currentListId' | 'currentItemId'>

export function followApp(router: Router, shopping: FollowStore, goToPage: GoToPage) {
  const trail = createChangeTrail()

  const onShoppingTab = () => {
    const route = router.currentRoute.value
    return route.name === 'listen' && !route.query.tab
  }

  // Über denselben Weg wie das Werkzeug „Gehe zu Seite“ (appNavigation.ts). Der
  // ruft push, nicht replace: Zurück führt dorthin, wo der Chat geöffnet wurde.
  const show = (page: AssistantPage) => goToPage(page)

  const shownPage = (): AssistantPage | null => {
    if (router.currentRoute.value.name === 'notes') return { area: 'notes' }
    return onShoppingTab() && shopping.currentListId
      ? { area: 'shopping', listId: shopping.currentListId }
      : null
  }

  return {
    /** Beim Öffnen des Chats. */
    opened() {
      trail.reset()
    },

    /** Um jedes Werkzeugergebnis legen; wechselt die Seite, wenn es etwas änderte. */
    track(outcome: ToolOutcome): ToolOutcome {
      const tracked = trail.track(outcome)
      const page = outcome.changed?.length ? trail.lastPage() : null
      if (page) show(page)
      return tracked
    },

    /** Beim Schließen des Chats. */
    closed() {
      const page = shownPage()
      const ids = page ? trail.changedOn(page) : []
      if (!page || ids.length === 0) return
      const flashed = page.area === 'notes' ? flashedNoteIds : flashedShoppingIds
      // Neue Artikel trugen beim Anlegen eine vorläufige ID.
      flashed.value = new Set(page.area === 'notes' ? ids : ids.map(shopping.currentItemId))
      window.clearTimeout(flashTimer)
      flashTimer = window.setTimeout(() => {
        flashed.value = new Set()
      }, FLASH_MS)
    },
  }
}
