/**
 * Die App folgt dem Chat: hinter dem offenen Chat zeigt sie die Seite der
 * letzten Änderung, und beim Schließen leuchten auf der dann gezeigten Seite
 * die Einträge auf, die seit dem Öffnen geändert wurden.
 *
 * Seiten sind die Listen, die Notizen und die Pinnwand: die Einkaufsansicht
 * liest `flashedShoppingIds`, die Ansicht der Pack- und To-do-Listen
 * `flashedChecklistIds`, die Notizen `flashedNoteIds`, die Pinnwand
 * `flashedTaskIds` (Zettel und Zeilen im Erledigt-Streifen), der Verlauf
 * `flashedCompletionIds` (eine Quick-Aufgabe), ein Topf `flashedPotIds` (sein
 * Titel) und `flashedPotEntryIds` (Ausgaben und Rückzahlungen), und lassen die
 * Einträge aufleuchten.
 */
import { ref } from 'vue'
import type { Router } from 'vue-router'
import type { useShoppingStore } from '@/stores/shoppingStore'
import { listAreaOfTab, type GoToPage } from '@/lib/appNavigation'
import { createChangeTrail, samePage } from './changeTrail'
import { FLASH_MS } from './flash'
import type { AssistantPage, ToolOutcome } from './tools'

/** Die Einkaufsartikel, die gerade aufleuchten. */
export const flashedShoppingIds = ref<ReadonlySet<string>>(new Set())
/** Die Einträge, Kategorien (`categoryHighlightId`) und Listen der Pack- und To-do-Listen, die gerade aufleuchten. */
export const flashedChecklistIds = ref<ReadonlySet<string>>(new Set())
/** Die Notizen, die gerade aufleuchten. */
export const flashedNoteIds = ref<ReadonlySet<string>>(new Set())
/** Die Aufgaben der Pinnwand, die gerade aufleuchten. */
export const flashedTaskIds = ref<ReadonlySet<string>>(new Set())
/** Die Erledigungen im Verlauf, die gerade aufleuchten. */
export const flashedCompletionIds = ref<ReadonlySet<string>>(new Set())
/** Die Töpfe, deren Titel gerade aufleuchtet. */
export const flashedPotIds = ref<ReadonlySet<string>>(new Set())
/** Die Ausgaben und Rückzahlungen im offenen Topf, die gerade aufleuchten. */
export const flashedPotEntryIds = ref<ReadonlySet<string>>(new Set())
let flashTimer: number | undefined

type FollowStore = Pick<ReturnType<typeof useShoppingStore>, 'currentListId' | 'currentItemId'>

/** Die offene Liste je Listenart; die Seite, die die App gerade zeigt. */
type Checklists = Record<'packing' | 'todo', { currentListId: string | null }>

export function followApp(
  router: Router,
  shopping: FollowStore,
  goToPage: GoToPage,
  checklists: Checklists,
) {
  let open = false
  // Ein zurückgenommenes Löschen bringt den Eintrag zurück: bei offenem Chat
  // folgt die App ihm und er leuchtet beim Schließen auf; bei geschlossenem
  // leuchtet er gleich auf, wenn seine Seite gezeigt wird.
  const trail = createChangeTrail({
    onRestored: (entry) => {
      if (open) return show(entry.page)
      const page = shownPage()
      if (page && samePage(page, entry.page)) flash(page, [entry.id])
    },
  })

  /** Welcher Listen-Reiter offen ist; `null` außerhalb der Listen. */
  const listsTab = () => {
    const route = router.currentRoute.value
    return route.name === 'listen' ? listAreaOfTab(route.query.tab) : null
  }

  // Über denselben Weg wie das Werkzeug „Gehe zu Seite“ (appNavigation.ts). Der
  // ruft push, nicht replace: Zurück führt dorthin, wo der Chat geöffnet wurde.
  const show = (page: AssistantPage) => goToPage(page)

  const shownPage = (): AssistantPage | null => {
    if (router.currentRoute.value.name === 'notes') return { area: 'notes' }
    if (router.currentRoute.value.name === 'home') return { area: 'wall' }
    if (router.currentRoute.value.name === 'history') return { area: 'history' }
    const potId = router.currentRoute.value.query.topf
    if (router.currentRoute.value.name === 'kasse' && typeof potId === 'string') {
      return { area: 'pot', potId }
    }
    const area = listsTab()
    if (!area) return null
    const listId = area === 'shopping' ? shopping.currentListId : checklists[area].currentListId
    return listId ? { area, listId } : null
  }

  /** Lässt die Einträge `ids` auf der gezeigten Seite `page` aufleuchten. */
  const flash = (page: AssistantPage, ids: string[]) => {
    if (ids.length === 0) return
    if (page.area === 'shopping') {
      // Neue Artikel trugen beim Anlegen eine vorläufige ID.
      flashedShoppingIds.value = new Set(ids.map(shopping.currentItemId))
    } else if (page.area === 'notes') {
      flashedNoteIds.value = new Set(ids)
    } else if (page.area === 'wall') {
      flashedTaskIds.value = new Set(ids)
    } else if (page.area === 'history') {
      flashedCompletionIds.value = new Set(ids)
    } else if (page.area === 'pot') {
      // Der Topf selbst (Titel) oder seine Einträge: die IDs sind verschieden.
      flashedPotIds.value = new Set(ids)
      flashedPotEntryIds.value = new Set(ids)
    } else {
      flashedChecklistIds.value = new Set(ids)
    }
    window.clearTimeout(flashTimer)
    flashTimer = window.setTimeout(() => {
      flashedShoppingIds.value = new Set()
      flashedChecklistIds.value = new Set()
      flashedNoteIds.value = new Set()
      flashedTaskIds.value = new Set()
      flashedCompletionIds.value = new Set()
      flashedPotIds.value = new Set()
      flashedPotEntryIds.value = new Set()
    }, FLASH_MS)
  }

  return {
    /** Beim Öffnen des Chats. */
    opened() {
      open = true
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
      open = false
      const page = shownPage()
      if (page) flash(page, trail.changedOn(page))
    },
  }
}
