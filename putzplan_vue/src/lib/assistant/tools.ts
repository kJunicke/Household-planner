/**
 * Das Werkzeug-Register des Assistenten.
 *
 * Jedes Werkzeug ist genau hier im Client definiert, ein Modul je Bereich
 * (`shoppingTools.ts`, …): Name, Beschreibung und Eingabeschema für Claude,
 * dazu die Ausführung über die Stores. Der Client schickt die Definitionen mit
 * jeder Frage an die Edge Function `assistant`; die reicht sie nur weiter.
 *
 * Die Stores kommen als Abhängigkeit herein, damit jedes Werkzeugmodul gegen
 * gefälschte Stores testbar ist.
 */
import type { AppPage } from '@/lib/appNavigation'
import { guideTools } from './appGuide'
import { expenseTools, type ExpenseToolStores } from './expenseTools'
import { checklistTools, type ListToolStores } from './listTools'
import { navigationTools } from './navigationTools'
import { notesTools, type NotesToolStore } from './notesTools'
import { shoppingTools, type ShoppingToolStore } from './shoppingTools'
import { taskCompleteTools } from './taskCompleteTools'
import { taskTools, type TaskToolStores } from './taskTools'

/** Wo ein geänderter Eintrag in der App steht; zum Hinführen und Aufleuchten. */
export type AssistantPage =
  | { area: 'shopping' | 'packing' | 'todo'; listId: string }
  | { area: 'notes' }
  | { area: 'wall' }
  | { area: 'history' }
  | { area: 'pot'; potId: string }

export interface ChangedEntry {
  id: string
  page: AssistantPage
  /**
   * Gelöscht: die App führt zu seiner Seite, aufleuchten kann er erst, wenn
   * das Löschen zurückgenommen ist; dann ist er wieder da und leuchtet auf.
   */
  removed?: true
}

export interface ToolOutcome {
  /** Geht an Claude zurück. */
  result: string
  isError?: boolean
  /** Zeile für den Nutzer, z. B. „✓ Milch → Einkauf“. Fehlt bei reinen Leseaktionen. */
  summary?: string
  /** Nimmt zurück, was der Aufruf geändert hat; `false`, wenn etwas davon misslang. */
  undo?: () => Promise<boolean>
  /** Die Einträge, die der Aufruf angelegt oder geändert hat. */
  changed?: ChangedEntry[]
  /** Dieselben Änderungen einzeln, je eine mit eigener Zeile und Rücknahme: ein Toast je Änderung. */
  changes?: Change[]
  /**
   * Ein Lösch-Werkzeug löscht nicht selbst, sondern legt diese Karte vor: die
   * Werkzeugschleife hält an, bis der Nutzer „Löschen“ oder „Abbrechen“ tippt.
   */
  deleteCard?: DeleteCard
}

/** Die Karte vor einem Löschen. Für jedes Lösch-Werkzeug dieselbe. */
interface DeleteCard {
  /** Was verschwindet, wie es auf der Karte steht, z. B. „Zucker (Einkauf)“. */
  what: string
  /** Löscht; läuft erst nach dem Knopf „Löschen“. Sein Ergebnis geht an Claude. */
  confirm: () => Promise<ToolOutcome>
}

/** Eine einzelne Änderung, für sich rücknehmbar. */
export interface Change {
  /** Zeile im Toast, z. B. „✓ Eier → Einkauf“. */
  summary: string
  /** Stellt den Stand vor dieser Änderung wieder her; `false`, wenn das misslang. */
  undo: () => Promise<boolean>
}

/** Was Claude von einem Werkzeug sieht, im Format der Messages API. */
interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface AssistantTool extends ToolDefinition {
  execute: (input: Record<string, unknown>) => Promise<ToolOutcome>
}

/** Die Stores, die die Werkzeuge bedienen. */
export interface ToolDeps {
  shopping: ShoppingToolStore
  /** Packlisten und To-do-Listen; dazu der Einkauf zum Anlegen und Umbenennen von Listen. */
  lists: ListToolStores
  notes: NotesToolStore
  /** Die Aufgaben der Pinnwand, dazu das Wochenziel. */
  tasks: TaskToolStores
  /** Ausgaben und Rückzahlungen in den Töpfen. */
  expenses: ExpenseToolStores
  /** Bringt die App auf eine Seite (`createGoToPage`). */
  goToPage: (page: AppPage) => void
  /** Wer fragt; `null` abgemeldet. */
  currentUserId: () => string | null
}

export interface ToolRegistry {
  definitions: ToolDefinition[]
  execute: (name: string, input: Record<string, unknown>) => Promise<ToolOutcome>
}

export function assistantTools(deps: ToolDeps): ToolRegistry {
  const tools = [
    ...shoppingTools(deps.shopping),
    ...checklistTools(deps.lists),
    ...notesTools(deps.notes, deps.currentUserId),
    ...taskTools(deps.tasks),
    ...taskCompleteTools(deps.tasks.tasks),
    ...expenseTools(deps.expenses),
    ...navigationTools(deps.goToPage),
    ...guideTools(),
  ]
  return {
    definitions: tools.map(({ name, description, input_schema }) => ({
      name,
      description,
      input_schema,
    })),
    execute: async (name, input) => {
      const tool = tools.find((t) => t.name === name)
      if (!tool) return { result: `Unbekanntes Werkzeug ${name}`, isError: true }
      return tool.execute(input)
    },
  }
}

/** Führt die Rücknahmen nacheinander aus, die letzte Änderung zuerst. */
export const undoAll = (steps: (() => Promise<boolean>)[]) => async (): Promise<boolean> => {
  let ok = true
  for (const step of [...steps].reverse()) ok = (await step()) && ok
  return ok
}

/**
 * Was der Toast sagt, wenn ein Rückgängig scheitert. Ohne Netz scheitern die
 * Rücknahmen, die direkt in die Datenbank schreiben (Pack- und To-do-Listen,
 * Notizen, gelöschte Listen); der Grund gehört dann in den Satz.
 */
export const undoFailedText = (summary: string, online: boolean) =>
  `Rückgängig ging nicht${online ? '' : ', keine Verbindung'}. Es bleibt: ${summary.replace(/^✓\s*/, '')}`
