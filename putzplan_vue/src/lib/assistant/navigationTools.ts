/**
 * Das Werkzeug „Gehe zu Seite“: bringt die App hinter dem Chat auf eine Seite,
 * etwa wenn der Nutzer gefragt hat, wo etwas liegt, oder wenn der Assistent
 * etwas ablehnt, das man von Hand tut (Ausgleich, Einstellungen, Freigaben).
 */
import type { AppPage } from '@/lib/appNavigation'
import type { AssistantTool, ToolOutcome } from './tools'

/** Die Seiten, wie Claude sie wählt, mit Ziel und Anzeigename. */
const PAGES: Record<string, { label: string; page: (id?: string) => AppPage | null }> = {
  putzen: { label: 'Putzen', page: () => ({ area: 'wall' }) },
  verlauf: { label: 'Verlauf', page: () => ({ area: 'history' }) },
  kasse_statistik: {
    label: 'Kasse · Statistik',
    page: () => ({ area: 'kasse', tab: 'statistik' }),
  },
  kasse_ausgleich: {
    label: 'Kasse · Ausgleich',
    page: () => ({ area: 'kasse', tab: 'ausgleich' }),
  },
  toepfe: { label: 'Kasse · Töpfe', page: () => ({ area: 'kasse', tab: 'toepfe' }) },
  topf: { label: 'Kasse · Topf', page: (id) => (id ? { area: 'pot', potId: id } : null) },
  einkauf: { label: 'Listen · Einkauf', page: (id) => ({ area: 'shopping', listId: id }) },
  packlisten: { label: 'Listen · Packlisten', page: (id) => ({ area: 'packing', listId: id }) },
  todo: { label: 'Listen · To-do', page: (id) => ({ area: 'todo', listId: id }) },
  notizen: { label: 'Notizen', page: () => ({ area: 'notes' }) },
  einstellungen: { label: 'Einstellungen', page: () => ({ area: 'settings' }) },
}

function goTo(goToPage: (page: AppPage) => void, input: Record<string, unknown>): ToolOutcome {
  const name = String(input.page ?? '')
  const target = PAGES[name]
  if (!target) return { result: `Unbekannte Seite ${name}`, isError: true }
  const id = typeof input.id === 'string' && input.id ? input.id : undefined
  const page = target.page(id)
  if (!page) return { result: `Für ${name} fehlt die id`, isError: true }
  goToPage(page)
  return { result: `Die App zeigt jetzt ${target.label}.`, summary: `→ ${target.label}` }
}

export const navigationTools = (goToPage: (page: AppPage) => void): AssistantTool[] => [
  {
    name: 'go_to_page',
    description:
      'Bringt die App hinter dem Chat auf eine Seite; der Chat bleibt offen. Nutze es, wenn ' +
      'der Nutzer hingeführt werden möchte („zeig mir die Liste …“, „öffne …“, „bring mich zu …“), ' +
      'und wenn du etwas ablehnst, das man dort von Hand tut.',
    input_schema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          enum: Object.keys(PAGES),
          description:
            'putzen = Pinnwand mit den Aufgaben; einstellungen = Haushalt, Mitglieder, Profil, ' +
            'Wochenziel, Gastlinks, Richtwerte; kasse_ausgleich = Punkte-Bilanz, Ausgleich, ' +
            'Umrechnung; toepfe und topf = Ausgaben, Rückzahlungen und Salden in Euro.',
        },
        id: {
          type: 'string',
          description:
            'Optional: ID einer Liste (einkauf, packlisten, todo) oder eines Topfs (topf, nötig), ' +
            'um genau sie zu öffnen.',
        },
      },
      required: ['page'],
    },
    execute: async (input) => goTo(goToPage, input),
  },
]
