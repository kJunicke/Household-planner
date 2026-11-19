import { describe, expect, it } from 'vitest'

import { pointOf } from './dragPointer'

// Ereignisse als schlichte Objekte: geprüft wird nur, welche Koordinaten
// gelesen werden, nicht das Anmelden am Dokument.
describe('pointOf', () => {
  it('liest Maus- und Zeigerereignisse direkt', () => {
    expect(pointOf({ clientX: 12, clientY: 34 })).toEqual({ x: 12, y: 34 })
  })

  it('liest bei Touch den ersten Finger', () => {
    const touch = {
      touches: [
        { clientX: 5, clientY: 6 },
        { clientX: 50, clientY: 60 },
      ],
    }
    expect(pointOf(touch)).toEqual({ x: 5, y: 6 })
  })

  it('gibt nichts, wenn kein Finger mehr liegt (touchend)', () => {
    expect(pointOf({ touches: [] })).toBeNull()
  })
})
