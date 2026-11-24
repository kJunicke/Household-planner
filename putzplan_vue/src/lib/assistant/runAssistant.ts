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
import type { ToolOutcome } from './tools'

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
interface ThinkingBlock {
  type: 'thinking'
  thinking: string
  signature: string
}
interface RedactedThinkingBlock {
  type: 'redacted_thinking'
  data: string
}
type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | RedactedThinkingBlock

export interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface AssistantReply {
  content: ContentBlock[]
  stop_reason: string
}

export interface RunOptions {
  send: (messages: Message[]) => Promise<AssistantReply>
  executeTool: (name: string, input: Record<string, unknown>) => Promise<ToolOutcome>
  /**
   * Zeigt die Lösch-Karte und wartet auf den Knopf: `true` heißt „Löschen“.
   * Fehlt sie, wird nie gelöscht: ein getipptes „ja“ ersetzt den Knopf nicht.
   */
  confirmDelete?: (what: string) => Promise<boolean>
  /** Obergrenze für Hin und Her, damit ein Fehler keine Endlosschleife (und Rechnung) wird. */
  maxRounds?: number
}

export interface RunResult {
  messages: Message[]
  /** Was die Werkzeuge getan haben, in Reihenfolge. */
  actions: { summary: string; isError: boolean }[]
}

/**
 * Denkblöcke abgeschlossener Fragen fallen weg. Ihre Signatur hält fest, was
 * vor ihnen stand, samt Systemprompt mit der Übersicht; die ändert sich
 * zwischen zwei Fragen (und `trimHistory` kürzt vorn), und dann lehnt die API
 * die alten Blöcke ab oder liest Denken über einen veralteten Stand. Innerhalb
 * einer laufenden Werkzeug-Runde müssen sie dagegen mit: die kommen erst
 * später in `messages` und bleiben unberührt.
 */
function withoutThinking(message: Message): Message {
  if (typeof message.content === 'string') return message
  return {
    ...message,
    content: message.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking'),
  }
}

export async function runAssistant(history: Message[], options: RunOptions): Promise<RunResult> {
  const { send, executeTool, confirmDelete = async () => false, maxRounds = 5 } = options
  const messages = history.map(withoutThinking)
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
        const card = outcome.deleteCard
        if (card) {
          outcome = (await confirmDelete(card.what))
            ? await card.confirm()
            : {
                result: `Der Nutzer hat das Löschen abgebrochen; nichts gelöscht: ${card.what}.`,
              }
        }
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
