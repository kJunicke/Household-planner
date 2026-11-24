/**
 * Die App folgt dem Chat: hinter dem offenen Chat zeigt sie die Seite der
 * letzten Änderung, und beim Schließen leuchten auf der dann gezeigten Seite
 * die Einträge auf, die seit dem Öffnen geändert wurden.
 *
 * Bisher gibt es nur Einkaufslisten als Seite; die Einkaufsansicht liest
 * `flashedShoppingIds` und lässt die Zeilen aufleuchten.
 */
import { ref } from 'vue'
import type { Router } from 'vue-router'
import type { useShoppingStore } from '@/stores/shoppingStore'
import { createChangeTrail } from './changeTrail'
import type { AssistantPage, ToolOutcome } from './tools'

/** So lange leuchten die Einträge (drei Pulse à 1 s, siehe ShoppingView). */
const FLASH_MS = 3000

/** Die Einkaufsartikel, die gerade aufleuchten. */
export const flashedShoppingIds = ref<ReadonlySet<string>>(new Set())
let flashTimer: number | undefined

type FollowStore = Pick<ReturnType<typeof useShoppingStore>, 'currentListId' | 'currentItemId'>

export function followApp(router: Router, shopping: FollowStore) {
  const trail = createChangeTrail()

  const onShoppingTab = () => {
    const route = router.currentRoute.value
    return route.name === 'listen' && !route.query.tab
  }

  const show = (page: AssistantPage) => {
    shopping.currentListId = page.listId
    // push, nicht replace: Zurück führt wieder dorthin, wo der Chat geöffnet wurde.
    if (!onShoppingTab()) void router.push({ name: 'listen' })
  }

  const shownPage = (): AssistantPage | null =>
    onShoppingTab() && shopping.currentListId
      ? { area: 'shopping', listId: shopping.currentListId }
      : null

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
      if (ids.length === 0) return
      // Neue Artikel trugen beim Anlegen eine vorläufige ID.
      flashedShoppingIds.value = new Set(ids.map(shopping.currentItemId))
      window.clearTimeout(flashTimer)
      flashTimer = window.setTimeout(() => {
        flashedShoppingIds.value = new Set()
      }, FLASH_MS)
    },
  }
}
