import { describe, expect, it, vi } from 'vitest'

import { runAssistant, textOf, type AssistantReply, type Message } from './runAssistant'

const text = (t: string): AssistantReply => ({
  content: [{ type: 'text', text: t }],
  stop_reason: 'end_turn',
})
const toolCall = (id: string, name: string, input: Record<string, unknown>): AssistantReply => ({
  content: [{ type: 'tool_use', id, name, input }],
  stop_reason: 'tool_use',
})
const ask = (t: string): Message[] => [{ role: 'user', content: t }]

describe('runAssistant', () => {
  it('stops after a plain text reply without running a tool', async () => {
    const executeTool = vi.fn()
    const { messages, actions } = await runAssistant(ask('Hallo'), {
      send: async () => text('Hi!'),
      executeTool,
    })
    expect(executeTool).not.toHaveBeenCalled()
    expect(actions).toEqual([])
    expect(textOf(messages[messages.length - 1]!)).toBe('Hi!')
  })

  it('runs the tool, returns its result to Claude, and ends on the next text', async () => {
    const replies = [toolCall('t1', 'add', { name: 'Milch' }), text('Milch steht drauf.')]
    const sent: Message[][] = []
    const { messages, actions } = await runAssistant(ask('Milch'), {
      send: async (m) => {
        sent.push(structuredClone(m))
        return replies.shift()!
      },
      executeTool: async (name, input) => ({
        result: `ok ${name} ${input.name}`,
        summary: '✓ Milch',
      }),
    })

    expect(sent[1]![sent[1]!.length - 1]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok add Milch' }],
    })
    expect(actions).toEqual([{ summary: '✓ Milch', isError: false }])
    expect(textOf(messages[messages.length - 1]!)).toBe('Milch steht drauf.')
  })

  it('reports a throwing tool to Claude as an error instead of aborting', async () => {
    const replies = [toolCall('t1', 'add', {}), text('Ging nicht.')]
    const sent: Message[][] = []
    const { actions } = await runAssistant(ask('x'), {
      send: async (m) => {
        sent.push(structuredClone(m))
        return replies.shift()!
      },
      executeTool: async () => {
        throw new Error('kaputt')
      },
    })
    const result = (
      sent[1]![sent[1]!.length - 1]!.content as { is_error?: boolean; content: string }[]
    )[0]!
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('kaputt')
    expect(actions[0]!.isError).toBe(true)
  })

  it('keeps the history valid when a reply is cut off in the middle of a tool call', async () => {
    // A tool_use without its tool_result makes the API reject every later question.
    const executeTool = vi.fn()
    const { messages } = await runAssistant(ask('Milch'), {
      send: async () => ({
        content: [
          { type: 'text', text: 'Ich setze' },
          { type: 'tool_use', id: 't1', name: 'add', input: {} },
        ],
        stop_reason: 'max_tokens',
      }),
      executeTool,
    })
    expect(executeTool).not.toHaveBeenCalled()
    const last = messages[messages.length - 1]!
    expect(last.role).toBe('assistant')
    expect(JSON.stringify(messages)).not.toContain('tool_use')
    expect(textOf(last)).not.toBe('')
  })

  describe('a delete card', () => {
    /** A tool that only asks; the delete itself runs behind the card's button. */
    function deletingTool() {
      const deleted: string[] = []
      const executeTool = async () => ({
        result: 'wartet auf die Karte',
        deleteCard: {
          what: 'Zucker (Einkauf)',
          confirm: async () => {
            deleted.push('Zucker')
            return { result: 'Gelöscht: Zucker', summary: '✓ gelöscht: Zucker' }
          },
        },
      })
      return { deleted, executeTool }
    }

    it('holds the loop until the card is answered, then sends the delete to Claude', async () => {
      const { deleted, executeTool } = deletingTool()
      const replies = [toolCall('t1', 'delete', { item_ids: ['z'] }), text('Zucker ist weg.')]
      const sent: Message[][] = []
      let answer!: (ok: boolean) => void
      const cards: string[] = []
      const run = runAssistant(ask('Lösch den Zucker'), {
        send: async (m) => {
          sent.push(structuredClone(m))
          return replies.shift()!
        },
        executeTool,
        confirmDelete: (what) => {
          cards.push(what)
          return new Promise((resolve) => (answer = resolve))
        },
      })

      await vi.waitFor(() => expect(cards).toEqual(['Zucker (Einkauf)']))
      await new Promise((r) => setTimeout(r, 10))
      expect(sent).toHaveLength(1)
      expect(deleted).toEqual([])

      answer(true)
      const { actions } = await run
      expect(deleted).toEqual(['Zucker'])
      expect(sent[1]![sent[1]!.length - 1]).toEqual({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Gelöscht: Zucker' }],
      })
      expect(actions).toEqual([{ summary: '✓ gelöscht: Zucker', isError: false }])
    })

    it('tells Claude when the user cancels, and deletes nothing', async () => {
      const { deleted, executeTool } = deletingTool()
      const replies = [toolCall('t1', 'delete', { item_ids: ['z'] }), text('Gut, bleibt.')]
      const sent: Message[][] = []
      const { actions } = await runAssistant(ask('Lösch den Zucker'), {
        send: async (m) => {
          sent.push(structuredClone(m))
          return replies.shift()!
        },
        executeTool,
        confirmDelete: async () => false,
      })
      expect(deleted).toEqual([])
      const result = (sent[1]![sent[1]!.length - 1]!.content as { content: string }[])[0]!
      expect(result.content).toMatch(/abgebrochen/i)
      expect(result.content).toContain('Zucker (Einkauf)')
      expect(actions).toEqual([])
    })

    it('never deletes when nobody can answer a card', async () => {
      const { deleted, executeTool } = deletingTool()
      const replies = [toolCall('t1', 'delete', {}), text('ok')]
      await runAssistant(ask('Lösch den Zucker'), {
        send: async () => replies.shift()!,
        executeTool,
      })
      expect(deleted).toEqual([])
    })
  })

  describe('thinking blocks', () => {
    const thinkingToolCall = (id: string): AssistantReply => ({
      content: [
        { type: 'thinking', thinking: 'Milch fehlt noch.', signature: 'sig-1' },
        { type: 'redacted_thinking', data: 'redacted-1' },
        { type: 'tool_use', id, name: 'add', input: { name: 'Milch' } },
      ],
      stop_reason: 'tool_use',
    })
    const hasThinking = (messages: Message[]) =>
      messages.some(
        (m) =>
          typeof m.content !== 'string' &&
          m.content.some((b) => b.type === 'thinking' || b.type === 'redacted_thinking'),
      )

    it('sends them back within the tool round, but not with the next question', async () => {
      // Their signatures are bound to the system prompt; it carries the overview,
      // which changes between questions, and the API then rejects the old blocks.
      const sent: Message[][] = []
      const options = (replies: AssistantReply[]) => ({
        send: async (m: Message[]) => {
          sent.push(structuredClone(m))
          return replies.shift()!
        },
        executeTool: async () => ({ result: 'ok' }),
      })

      const first = await runAssistant(
        ask('Milch'),
        options([thinkingToolCall('t1'), text('Milch steht drauf.')]),
      )
      expect(hasThinking(sent[1]!)).toBe(true)

      await runAssistant(
        [...first.messages, { role: 'user', content: 'Und Brot?' }],
        options([thinkingToolCall('t2'), text('Brot auch.')]),
      )
      expect(hasThinking(sent[2]!)).toBe(false)
      // Within the second question's own tool round they still go back.
      const secondRound = sent[3]!
      expect(secondRound[secondRound.length - 2]!.content).toEqual(thinkingToolCall('t2').content)
      expect(hasThinking(secondRound.slice(0, -2))).toBe(false)
      // The earlier tool round itself stays, only without its thinking.
      expect(JSON.stringify(secondRound)).toContain('"id":"t1"')
    })
  })

  it('gives up after maxRounds and still ends on an assistant message', async () => {
    const send = vi.fn(async () => toolCall('t', 'loop', {}))
    const { messages } = await runAssistant(ask('x'), {
      send,
      executeTool: async () => ({ result: 'ok' }),
      maxRounds: 3,
    })
    expect(send).toHaveBeenCalledTimes(3)
    expect(messages[messages.length - 1]!.role).toBe('assistant')
  })
})
