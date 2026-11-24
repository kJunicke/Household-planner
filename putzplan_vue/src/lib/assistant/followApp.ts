/**
 * Die App folgt dem Chat: hinter dem offenen Chat zeigt sie die Seite der
 * letzten Änderung, und beim Schließen leuchten auf der dann gezeigten Seite
 * die Einträge auf, die seit dem Öffnen geändert wurden.
 *
 * Seiten sind bisher die Listen: die Einkaufsansicht liest
 * `flashedShoppingIds`, die Ansicht der Pack- und To-do-Listen
 * `flashedChecklistIds`, und lässt die Zeilen aufleuchten.
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
/** Die Einträge, Kategorien (`categoryHighlightId`) und Listen der Pack- und To-do-Listen, die gerade aufleuchten. */
export const flashedChecklistIds = ref<ReadonlySet<string>>(new Set())
let flashTimer: number | undefined

type FollowStore = Pick<ReturnType<typeof useShoppingStore>, 'currentListId' | 'currentItemId'>

/** Die offene Liste je Listenart; die Seite, die die App gerade zeigt. */
type Checklists = Record<'packing' | 'todo', { currentListId: string | null }>

const LISTS_TAB = { packlisten: 'packing', todo: 'todo' } as const

export function followApp(
  router: Router,
  shopping: FollowStore,
  goToPage: GoToPage,
  checklists: Checklists,
) {
  const trail = createChangeTrail()

  /** Welcher Listen-Reiter offen ist; `null` außerhalb der Listen. */
  const listsTab = () => {
    const route = router.currentRoute.value
    if (route.name !== 'listen') return null
    const tab = String(route.query.tab ?? '')
    return tab in LISTS_TAB ? LISTS_TAB[tab as keyof typeof LISTS_TAB] : 'shopping'
  }

  // Über denselben Weg wie das Werkzeug „Gehe zu Seite“ (appNavigation.ts). Der
  // ruft push, nicht replace: Zurück führt dorthin, wo der Chat geöffnet wurde.
  const show = (page: AssistantPage) => goToPage(page)

  const shownPage = (): AssistantPage | null => {
    const area = listsTab()
    if (!area) return null
    const listId = area === 'shopping' ? shopping.currentListId : checklists[area].currentListId
    return listId ? { area, listId } : null
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
      if (page.area === 'shopping') {
        // Neue Artikel trugen beim Anlegen eine vorläufige ID.
        flashedShoppingIds.value = new Set(ids.map(shopping.currentItemId))
      } else {
        flashedChecklistIds.value = new Set(ids)
      }
      window.clearTimeout(flashTimer)
      flashTimer = window.setTimeout(() => {
        flashedShoppingIds.value = new Set()
        flashedChecklistIds.value = new Set()
      }, FLASH_MS)
    },
  }
}
