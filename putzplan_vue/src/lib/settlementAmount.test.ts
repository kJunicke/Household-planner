import { describe, expect, it } from 'vitest'

import { formatEuroInput, openBalance, parseEuroInput, suggestEuros } from './settlementAmount'

describe('suggestEuros', () => {
  it('rechnet Punkte mal Kurs', () => {
    expect(suggestEuros(12, 1)).toBe(12)
  })

  it('rundet auf Cent: 7 × 0,83 € = 5,81 €', () => {
    expect(suggestEuros(7, 0.83)).toBe(5.81)
  })
})

describe('parseEuroInput', () => {
  it('liest Komma und Punkt als Dezimaltrenner', () => {
    expect(parseEuroInput('0,83')).toBe(0.83)
    expect(parseEuroInput('5.81')).toBe(5.81)
    expect(parseEuroInput(' 12 ')).toBe(12)
  })

  it('weist mehr als zwei Nachkommastellen, Negatives und Text ab', () => {
    expect(parseEuroInput('0,835')).toBeNull()
    expect(parseEuroInput('-1')).toBeNull()
    expect(parseEuroInput('abc')).toBeNull()
    expect(parseEuroInput('')).toBeNull()
  })
})

describe('formatEuroInput', () => {
  it('schreibt zwei Nachkommastellen mit Komma', () => {
    expect(formatEuroInput(5.81)).toBe('5,81')
    expect(formatEuroInput(1)).toBe('1,00')
  })

  it('übersteht den Weg durch das Feld unverändert', () => {
    expect(parseEuroInput(formatEuroInput(suggestEuros(7, 0.83)))).toBe(5.81)
  })
})

describe('openBalance', () => {
  // balance > 0: A liegt vorn, B schuldet A
  const pairs = [{ userAId: 'a', userBId: 'b', balance: 9 }]

  it('ist die ganze Bilanz, wenn der Zahlende schuldet', () => {
    expect(openBalance(pairs, 'b', 'a')).toBe(9)
  })

  it('ist 0 in Gegenrichtung', () => {
    expect(openBalance(pairs, 'a', 'b')).toBe(0)
  })

  it('findet das Paar auch, wenn A schuldet', () => {
    const behind = [{ userAId: 'a', userBId: 'b', balance: -4 }]
    expect(openBalance(behind, 'a', 'b')).toBe(4)
    expect(openBalance(behind, 'b', 'a')).toBe(0)
  })

  it('ist 0 ohne offenes Paar', () => {
    expect(openBalance(pairs, 'a', 'c')).toBe(0)
  })
})
