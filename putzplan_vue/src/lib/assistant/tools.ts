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
import { shoppingTools, type ShoppingToolStore } from './shoppingTools'

/** Wo ein geänderter Eintrag in der App steht; zum Hinführen und Aufleuchten. */
type AssistantPage = { area: 'shopping'; listId: string }

export interface ChangedEntry {
  id: string
  page: AssistantPage
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
}

export interface ToolRegistry {
  definitions: ToolDefinition[]
  execute: (name: string, input: Record<string, unknown>) => Promise<ToolOutcome>
}

export function assistantTools(deps: ToolDeps): ToolRegistry {
  const tools = [...shoppingTools(deps.shopping)]
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
