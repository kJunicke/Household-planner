import { describe, expect, it } from 'vitest'

import { dropTargetAt } from './dropTargetAt'

// Drei Blasen rechts untereinander, 6 px Lücke dazwischen.
const box = (top: number, bottom: number) => ({ left: 200, right: 300, top, bottom })
const bubbles = [
  { key: 'obst', rect: box(100, 150) },
  { key: 'brot', rect: box(156, 206) },
  { key: 'milch', rect: box(212, 262) },
]

describe('dropTargetAt', () => {
  it('trifft die Blase unter dem Finger', () => {
    expect(dropTargetAt({ x: 250, y: 120 }, bubbles)).toBe('obst')
    expect(dropTargetAt({ x: 210, y: 230 }, bubbles)).toBe('milch')
  })

  it('trifft nichts neben der Leiste', () => {
    expect(dropTargetAt({ x: 150, y: 120 }, bubbles)).toBeNull()
  })

  it('trifft nichts über der ersten und unter der letzten Blase', () => {
    expect(dropTargetAt({ x: 250, y: 60 }, bubbles)).toBeNull()
    expect(dropTargetAt({ x: 250, y: 320 }, bubbles)).toBeNull()
  })

  it('lässt in der Lücke zwischen zwei Blasen keine Stelle ohne Ziel', () => {
    expect(dropTargetAt({ x: 250, y: 152 }, bubbles)).toBe('obst')
    expect(dropTargetAt({ x: 250, y: 155 }, bubbles)).toBe('brot')
  })

  it('trifft ohne Blasen nichts', () => {
    expect(dropTargetAt({ x: 250, y: 120 }, [])).toBeNull()
  })
})
