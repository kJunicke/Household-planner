import { describe, expect, it, vi } from 'vitest'

import { createSessionEndHub } from './sessionEnd'

const ctx = { userId: 'u1', reason: 'logout' } as const

describe('createSessionEndHub', () => {
  it('ruft jeden angemeldeten Abmelder mit dem Kontext', () => {
    const hub = createSessionEndHub()
    const a = vi.fn()
    const b = vi.fn()
    hub.onSessionEnd(a)
    hub.onSessionEnd(b)
    hub.endSession(ctx)
    expect(a).toHaveBeenCalledWith(ctx)
    expect(b).toHaveBeenCalledWith(ctx)
  })

  it('läuft in Anmeldereihenfolge', () => {
    const hub = createSessionEndHub()
    const order: string[] = []
    hub.onSessionEnd(() => order.push('erst'))
    hub.onSessionEnd(() => order.push('dann'))
    hub.endSession(ctx)
    expect(order).toEqual(['erst', 'dann'])
  })

  it('ein werfender Abmelder hält die übrigen nicht auf', () => {
    const hub = createSessionEndHub()
    const after = vi.fn()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    hub.onSessionEnd(() => {
      throw new Error('kaputt')
    })
    hub.onSessionEnd(after)
    expect(() => hub.endSession(ctx)).not.toThrow()
    expect(after).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it('abgemeldete Abmelder laufen nicht mehr', () => {
    const hub = createSessionEndHub()
    const a = vi.fn()
    const off = hub.onSessionEnd(a)
    off()
    hub.endSession(ctx)
    expect(a).not.toHaveBeenCalled()
  })

  it('ein Abmelder, der sich selbst abmeldet, stört den laufenden Durchgang nicht', () => {
    const hub = createSessionEndHub()
    const b = vi.fn()
    const off = hub.onSessionEnd(() => off())
    hub.onSessionEnd(b)
    hub.endSession(ctx)
    expect(b).toHaveBeenCalledOnce()
  })

  it('läuft bei jedem Session-Ende erneut', () => {
    const hub = createSessionEndHub()
    const a = vi.fn()
    hub.onSessionEnd(a)
    hub.endSession(ctx)
    hub.endSession({ userId: 'u2', reason: 'signed-out' })
    expect(a).toHaveBeenCalledTimes(2)
    expect(a).toHaveBeenLastCalledWith({ userId: 'u2', reason: 'signed-out' })
  })
})
