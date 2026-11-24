/**
 * Der eine Weg, die App auf eine Seite zu bringen: für das Werkzeug „Gehe zu
 * Seite“ des Assistenten und für die App, die dem Chat folgt (followApp.ts).
 *
 * Seiten werden fachlich benannt (`area`), nicht als Route; welche Route und
 * welcher Untertab dazugehören, weiß nur diese Datei. Untertabs stehen in der
 * Adresse (`/listen?tab=packlisten|todo`, ohne = Einkauf; `/kasse?tab=…&topf=…`).
 * Die offene Liste ist die `currentListId` ihres Stores, wie beim Tipp auf einen
 * Listen-Chip. Die Einstellungen sind keine Seite, sondern die Seitenleiste im
 * Header.
 */
import { ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

type KasseTab = 'statistik' | 'ausgleich' | 'toepfe'
export type ListArea = 'shopping' | 'packing' | 'todo'

export type AppPage =
  | { area: 'wall' }
  | { area: 'history' }
  | { area: 'notes' }
  | { area: 'settings' }
  | { area: 'kasse'; tab: KasseTab }
  | { area: 'pot'; potId: string }
  | { area: ListArea; listId?: string }

/** Untertab der Listen in der Adresse; Einkauf ist der Standard und steht nicht darin. */
export const LISTS_TAB_QUERY = { shopping: undefined, packing: 'packlisten', todo: 'todo' } as const

/** Welche Listenart `?tab=` in der Adresse der Listen zeigt; ohne oder unbekannt = Einkauf. */
export function listAreaOfTab(tab: unknown): ListArea {
  const areas = Object.keys(LISTS_TAB_QUERY) as ListArea[]
  return areas.find((area) => tab !== undefined && LISTS_TAB_QUERY[area] === tab) ?? 'shopping'
}

function routeFor(page: Exclude<AppPage, { area: 'settings' }>): RouteLocationRaw {
  switch (page.area) {
    case 'wall':
      return { name: 'home' }
    case 'history':
      return { name: 'history' }
    case 'notes':
      return { name: 'notes' }
    case 'kasse':
      return { name: 'kasse', query: page.tab === 'statistik' ? {} : { tab: page.tab } }
    case 'pot':
      return { name: 'kasse', query: { tab: 'toepfe', topf: page.potId } }
    default: {
      const tab = LISTS_TAB_QUERY[page.area]
      return { name: 'listen', query: tab ? { tab } : {} }
    }
  }
}

/** Ob die Einstellungen (Seitenleiste im Header) offen sind. */
export const settingsSidebarOpen = ref(false)

export type GoToPage = (page: AppPage) => void

export function createGoToPage(app: {
  push: (to: RouteLocationRaw) => unknown
  /** Öffnet oder schließt die Einstellungen (Seitenleiste im Header). */
  setSettingsOpen: (open: boolean) => void
  /** Macht eine Liste zur offenen, wie der Tipp auf ihren Chip. */
  selectList: (area: ListArea, listId: string) => void
}): GoToPage {
  return (page) => {
    if (page.area === 'settings') return app.setSettingsOpen(true)
    // Die Seitenleiste läge sonst über der neuen Seite, auf dem Handy über allem.
    app.setSettingsOpen(false)
    if ('listId' in page && page.listId) app.selectList(page.area, page.listId)
    void app.push(routeFor(page))
  }
}
