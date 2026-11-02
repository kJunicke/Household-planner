import { describe, expect, it } from 'vitest'

import { createJoinReloadGate } from './joinReload'

describe('createJoinReloadGate', () => {
  // Ob der Erstlauf beim Beitritt noch läuft oder schon fertig ist, spielt
  // keine Rolle — auch ein fertiger Lauf hat alles bis zu seinem Start gesehen.
  it('erster Beitritt nach einem seit dem Abo gestarteten Ladelauf lädt nicht nach', () => {
    const gate = createJoinReloadGate()
    gate.loadStarted()
    expect(gate.joined()).toBe(false)
  })

  it('erster Beitritt ohne Ladelauf seit dem Abo lädt nach', () => {
    const gate = createJoinReloadGate()
    expect(gate.joined()).toBe(true)
  })

  it('ein Ladelauf erst nach dem Beitritt ändert am Beitritt nichts', () => {
    const gate = createJoinReloadGate()
    expect(gate.joined()).toBe(true)
    gate.loadStarted()
    expect(gate.joined()).toBe(true)
  })

  it('jeder weitere Beitritt (Neuverbindung) lädt nach', () => {
    const gate = createJoinReloadGate()
    gate.loadStarted()
    expect(gate.joined()).toBe(false)
    expect(gate.joined()).toBe(true)
    gate.loadStarted()
    expect(gate.joined()).toBe(true)
  })
})
