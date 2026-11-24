/**
 * Ein Weg, die App auf eine Seite zu bringen: für das Werkzeug „Gehe zu
 * Seite“ des Assistenten und für alles, was der App hinter dem Chat folgt.
 *
 * Seiten werden fachlich benannt (`area`), nicht als Route; welche Route und
 * welcher Untertab dazugehören, weiß nur diese Datei. Die Listen und die Kasse
 * tragen Untertab und offene Liste bzw. offenen Topf in der Adresse
 * (`/listen?tab=packlisten&liste=…`, `/kasse?tab=toepfe&topf=…`). Die
 * Einstellungen sind keine Seite, sondern die Seitenleiste im Header.
 */
import { ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

type KasseTab = 'statistik' | 'ausgleich' | 'toepfe'

export type AppPage =
  | { area: 'wall' }
  | { area: 'history' }
  | { area: 'notes' }
  | { area: 'settings' }
  | { area: 'kasse'; tab: KasseTab }
  | { area: 'pot'; potId: string }
  | { area: 'shopping' | 'packing' | 'todo'; listId?: string }

/** Untertab der Listen in der Adresse; Einkauf ist der Standard und steht nicht darin. */
export const LISTS_TAB_QUERY = { shopping: undefined, packing: 'packlisten', todo: 'todo' } as const

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
      return {
        name: 'listen',
        query: { ...(tab ? { tab } : {}), ...(page.listId ? { liste: page.listId } : {}) },
      }
    }
  }
}

/** Ob die Einstellungen (Seitenleiste im Header) offen sind. */
export const settingsSidebarOpen = ref(false)

export function createGoToPage(app: {
  push: (to: RouteLocationRaw) => unknown
  openSettings: () => void
}) {
  return (page: AppPage): void => {
    if (page.area === 'settings') app.openSettings()
    else void app.push(routeFor(page))
  }
}
