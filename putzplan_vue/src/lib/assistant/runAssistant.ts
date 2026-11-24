/**
 * Die Werkzeugschleife des Assistenten.
 *
 * Claude antwortet entweder mit Text (fertig) oder mit `tool_use`-Blöcken
 * („ruf bitte diese Funktion mit diesen Argumenten auf“). Dann führen WIR das
 * Werkzeug aus, schicken das Ergebnis als `tool_result` zurück und fragen
 * erneut — so lange, bis Claude nur noch Text schickt.
 *
 * Bewusst ohne Supabase und ohne Store: `send` und `executeTool` kommen von
 * außen, damit die Schleife allein testbar ist (runAssistant.test.ts).
 */

export interface TextBlock {
  type: 'text'
  text: string
}
interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}
interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}
type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

export interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface AssistantReply {
  content: ContentBlock[]
  stop_reason: string
}

export interface ToolOutcome {
  /** Geht an Claude zurück. */
  result: string
  isError?: boolean
  /** Zeile für den Nutzer, z. B. „✓ Milch auf Einkauf“. Fehlt bei reinen Leseaktionen. */
  summary?: string
}

export interface RunOptions {
  send: (messages: Message[]) => Promise<AssistantReply>
  executeTool: (name: string, input: Record<string, unknown>) => Promise<ToolOutcome>
  /** Obergrenze für Hin und Her, damit ein Fehler keine Endlosschleife (und Rechnung) wird. */
  maxRounds?: number
}

export interface RunResult {
  messages: Message[]
  /** Was die Werkzeuge getan haben, in Reihenfolge. */
  actions: { summary: string; isError: boolean }[]
}

export async function runAssistant(history: Message[], options: RunOptions): Promise<RunResult> {
  const { send, executeTool, maxRounds = 5 } = options
  const messages = [...history]
  const actions: RunResult['actions'] = []

  for (let round = 0; round < maxRounds; round++) {
    const reply = await send(messages)

    if (reply.stop_reason !== 'tool_use') {
      // Bei `max_tokens` kann ein angefangener tool_use-Block drinstehen. Ohne
      // sein tool_result lehnt die API jede weitere Frage ab; also nur den Text
      // behalten, und ein Satz, falls kein Text da ist.
      const texts = reply.content.filter((b): b is TextBlock => b.type === 'text')
      messages.push({
        role: 'assistant',
        content: texts.some((b) => b.text.trim())
          ? texts
          : [{ type: 'text', text: 'Ich habe hier abgebrochen — die Antwort wurde zu lang.' }],
      })
      return { messages, actions }
    }
    messages.push({ role: 'assistant', content: reply.content })

    const results: ToolResultBlock[] = []
    for (const block of reply.content) {
      if (block.type !== 'tool_use') continue
      let outcome: ToolOutcome
      try {
        outcome = await executeTool(block.name, block.input)
      } catch (error) {
        outcome = {
          result: `Fehler: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
          summary: `✗ ${block.name} fehlgeschlagen`,
        }
      }
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: outcome.result,
        ...(outcome.isError ? { is_error: true } : {}),
      })
      if (outcome.summary) actions.push({ summary: outcome.summary, isError: !!outcome.isError })
    }
    messages.push({ role: 'user', content: results })
  }

  // Runden aufgebraucht: die letzte Nachricht ist ein tool_result ohne Antwort.
  // Ein abschließender Text hält den Verlauf gültig für die nächste Frage.
  messages.push({
    role: 'assistant',
    content: [{ type: 'text', text: 'Ich habe hier abgebrochen — zu viele Schritte.' }],
  })
  return { messages, actions }
}

/** Der Text einer Assistentennachricht, für die Anzeige. */
export const textOf = (message: Message): string =>
  typeof message.content === 'string'
    ? message.content
    : message.content
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
