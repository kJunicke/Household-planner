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
