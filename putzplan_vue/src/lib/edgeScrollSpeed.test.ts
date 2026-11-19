import { describe, expect, it } from 'vitest'

import { edgeScrollSpeed } from './edgeScrollSpeed'

// Sichtbarer Bereich 60..700: Kopfleiste oben bis 60, Navigationsleiste ab 700.
const edges = { top: 60, bottom: 700 }

describe('edgeScrollSpeed', () => {
  it('steht still, solange der Finger außerhalb der Randzonen ist', () => {
    expect(edgeScrollSpeed(380, edges)).toBe(0)
  })

  it('scrollt nach unten, sobald der Finger in die untere Zone kommt', () => {
    expect(edgeScrollSpeed(690, edges)).toBeGreaterThan(0)
  })

  it('scrollt nach oben in der oberen Zone', () => {
    expect(edgeScrollSpeed(70, edges)).toBeLessThan(0)
  })

  it('wird schneller, je näher der Finger am Rand ist', () => {
    const weit = edgeScrollSpeed(620, edges)
    const nah = edgeScrollSpeed(680, edges)
    expect(weit).toBeGreaterThan(0)
    expect(nah).toBeGreaterThan(weit)

    const weitOben = edgeScrollSpeed(140, edges)
    const nahOben = edgeScrollSpeed(80, edges)
    expect(nahOben).toBeLessThan(weitOben)
  })

  it('läuft am Rand deutlich schneller als die alte Festgeschwindigkeit (≈ 420 px/s)', () => {
    expect(edgeScrollSpeed(700, edges)).toBeGreaterThanOrEqual(1500)
  })

  it('bleibt hinter dem Rand (über der Navigationsleiste) auf Höchstgeschwindigkeit', () => {
    expect(edgeScrollSpeed(760, edges)).toBe(edgeScrollSpeed(700, edges))
    expect(edgeScrollSpeed(10, edges)).toBe(edgeScrollSpeed(60, edges))
  })

  it('lässt die Zonen auf einem winzigen Bereich nicht überlappen', () => {
    const klein = { top: 0, bottom: 120 }
    expect(edgeScrollSpeed(60, klein)).toBe(0)
  })
})
