import { describe, expect, it } from 'vitest'

import { createChangeTrail } from './changeTrail'
import type { ToolOutcome } from './tools'

const einkauf = { area: 'shopping', listId: 'einkauf' } as const
const baumarkt = { area: 'shopping', listId: 'baumarkt' } as const

const outcome = (changed: ToolOutcome['changed'], undo?: () => Promise<boolean>): ToolOutcome => ({
  result: 'ok',
  summary: '✓',
  changed,
  ...(undo ? { undo } : {}),
})

describe('the change trail of an open chat', () => {
  it('a pure question changes nothing, so there is no page to follow', () => {
    const trail = createChangeTrail()
    trail.track({ result: 'Auf der Liste stehen Milch und Brot.' })
    expect(trail.lastPage()).toBeNull()
  })

  it('follows the page of the latest change', () => {
    const trail = createChangeTrail()
    trail.track(outcome([{ id: 'milch', page: einkauf }]))
    expect(trail.lastPage()).toEqual(einkauf)
    trail.track(outcome([{ id: 'schrauben', page: baumarkt }]))
    expect(trail.lastPage()).toEqual(baumarkt)
  })

  it('lists every entry changed on the shown page since the chat opened, and only those', () => {
    const trail = createChangeTrail()
    trail.track(outcome([{ id: 'alt', page: einkauf }]))
    trail.reset()
    trail.track(
      outcome([
        { id: 'milch', page: einkauf },
        { id: 'brot', page: einkauf },
      ]),
    )
    trail.track(outcome([{ id: 'schrauben', page: baumarkt }]))
    expect(trail.changedOn(einkauf)).toEqual(['milch', 'brot'])
    expect(trail.changedOn(baumarkt)).toEqual(['schrauben'])
  })

  it('a change that was undone does not light up', async () => {
    const trail = createChangeTrail()
    trail.track(outcome([{ id: 'milch', page: einkauf }]))
    const tracked = trail.track(outcome([{ id: 'brot', page: einkauf }], async () => true))
    expect(await tracked.undo!()).toBe(true)
    expect(trail.changedOn(einkauf)).toEqual(['milch'])
  })

  it('undoing one change of a call (its toast) keeps the other changes of that call lit', async () => {
    const trail = createChangeTrail()
    const tracked = trail.track({
      result: 'ok',
      changed: [
        { id: 'milch', page: einkauf },
        { id: 'brot', page: einkauf },
      ],
      changes: [
        { summary: '✓ Milch → Einkauf', undo: async () => true },
        { summary: '✓ Brot → Einkauf', undo: async () => true },
      ],
    })
    expect(await tracked.changes![1]!.undo()).toBe(true)
    expect(trail.changedOn(einkauf)).toEqual(['milch'])
  })

  it('an entry changed twice still lights up when only the second change is undone', async () => {
    const trail = createChangeTrail()
    trail.track(outcome([{ id: 'milch', page: einkauf }]))
    const second = trail.track(outcome([{ id: 'milch', page: einkauf }], async () => true))
    await second.undo!()
    expect(trail.changedOn(einkauf)).toEqual(['milch'])
  })

  it('an undo that failed leaves the change lit', async () => {
    const trail = createChangeTrail()
    const tracked = trail.track(outcome([{ id: 'milch', page: einkauf }], async () => false))
    expect(await tracked.undo!()).toBe(false)
    expect(trail.changedOn(einkauf)).toEqual(['milch'])
  })

  it('hands the outcome on unchanged for Claude and the chat', () => {
    const trail = createChangeTrail()
    const tracked = trail.track(outcome([{ id: 'milch', page: einkauf }]))
    expect(tracked).toMatchObject({ result: 'ok', summary: '✓' })
  })
})

describe('a deleted entry in the change trail', () => {
  const wall = { area: 'wall' } as const

  it('leads to its page, but does not light up while it is gone', () => {
    const trail = createChangeTrail()
    trail.track(outcome([{ id: 'bad', page: wall, removed: true }], async () => true))
    expect(trail.lastPage()).toEqual(wall)
    expect(trail.changedOn(wall)).toEqual([])
  })

  it('lights up once the delete is undone, and the app follows it there', async () => {
    const restored: string[] = []
    const trail = createChangeTrail({ onRestored: (entry) => restored.push(entry.id) })
    const deleted = trail.track({
      result: 'ok',
      changed: [{ id: 'bad', page: wall, removed: true }],
      changes: [{ summary: '✓ Aufgabe gelöscht: Bad', undo: async () => true }],
    })
    trail.track(outcome([{ id: 'milch', page: einkauf }]))
    expect(await deleted.changes![0]!.undo()).toBe(true)
    expect(trail.changedOn(wall)).toEqual(['bad'])
    expect(trail.lastPage()).toEqual(wall)
    expect(restored).toEqual(['bad'])
  })

  it('stays dark when undoing the delete failed', async () => {
    const trail = createChangeTrail()
    const deleted = trail.track(
      outcome([{ id: 'bad', page: wall, removed: true }], async () => false),
    )
    expect(await deleted.undo!()).toBe(false)
    expect(trail.changedOn(wall)).toEqual([])
  })
})

describe('the change trail across areas', () => {
  it('keeps notes apart from the shopping lists', () => {
    const trail = createChangeTrail()
    const notes = { area: 'notes' } as const
    trail.track(outcome([{ id: 'milch', page: einkauf }]))
    trail.track(outcome([{ id: 'handwerker', page: notes }]))
    expect(trail.lastPage()).toEqual(notes)
    expect(trail.changedOn(notes)).toEqual(['handwerker'])
    expect(trail.changedOn(einkauf)).toEqual(['milch'])
  })

  it('keeps one pot apart from another', () => {
    const trail = createChangeTrail()
    const urlaub = { area: 'pot', potId: 'urlaub' } as const
    const haushalt = { area: 'pot', potId: 'haushalt' } as const
    trail.track(outcome([{ id: 'pizza', page: urlaub }]))
    trail.track(outcome([{ id: 'strom', page: haushalt }]))
    expect(trail.changedOn(urlaub)).toEqual(['pizza'])
    expect(trail.changedOn(haushalt)).toEqual(['strom'])
  })
})
