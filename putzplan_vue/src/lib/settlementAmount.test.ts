import { describe, expect, it } from 'vitest'

import {
  euroAmountFromWire,
  formatEuroInput,
  householdPotCredit,
  openBalance,
  parseEuroCents,
  parseEuroInput,
  potOffsetPoints,
  suggestEuros,
} from './settlementAmount'
import { potBalances } from './potLedger'

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

describe('parseEuroCents', () => {
  it('liest Euro als ganze Cent, ohne Umweg über Fließkomma', () => {
    expect(parseEuroCents('0,29')).toBe(29)
    expect(parseEuroCents('19,99')).toBe(1999)
    expect(parseEuroCents('1,15')).toBe(115)
    expect(parseEuroCents(' 7.5 ')).toBe(750)
    expect(parseEuroCents('0')).toBe(0)
  })

  it('weist Tausenderpunkte, mehr als zwei Nachkommastellen, Negatives und Text ab', () => {
    expect(parseEuroCents('1.234,56')).toBeNull()
    expect(parseEuroCents('0,835')).toBeNull()
    expect(parseEuroCents('-1')).toBeNull()
    expect(parseEuroCents('abc')).toBeNull()
    expect(parseEuroCents('')).toBeNull()
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

describe('euroAmountFromWire', () => {
  it('NUMERIC als Text (Realtime) wird zur Zahl', () => {
    expect(euroAmountFromWire('5.81')).toBe(5.81)
  })

  it('eine Zahl bleibt, wie sie ist', () => {
    expect(euroAmountFromWire(12)).toBe(12)
  })

  it('kein Betrag bleibt kein Betrag', () => {
    expect(euroAmountFromWire(null)).toBeNull()
    expect(euroAmountFromWire(undefined)).toBeNull()
  })

  it('Unlesbares wird kein Betrag statt NaN', () => {
    expect(euroAmountFromWire('abc')).toBeNull()
  })
})

describe('potOffsetPoints', () => {
  it('nimmt die offene Bilanz, wenn das Guthaben reicht', () => {
    expect(potOffsetPoints(3, 500, 1)).toBe(3)
  })

  it('begrenzt auf das Guthaben nach Kurs, abgerundet auf ganze Punkte', () => {
    expect(potOffsetPoints(10, 500, 1)).toBe(5)
    expect(potOffsetPoints(10, 581, 0.83)).toBe(7)
    expect(potOffsetPoints(10, 580, 0.83)).toBe(6)
  })

  it('ist 0 ohne offene Bilanz oder wenn das Guthaben keinen Punkt deckt', () => {
    expect(potOffsetPoints(0, 500, 1)).toBe(0)
    expect(potOffsetPoints(10, 99, 1)).toBe(0)
    expect(potOffsetPoints(10, -300, 1)).toBe(0)
  })
})

describe('householdPotCredit', () => {
  it('ist das Guthaben von from, soweit to es schuldet', () => {
    const balances = new Map([
      ['kim', 500],
      ['jo', -500],
    ])
    expect(householdPotCredit(balances, 'kim', 'jo')).toBe(500)
    expect(householdPotCredit(balances, 'jo', 'kim')).toBe(0)
  })

  it('nimmt bei mehr Teilnehmern nur, was to schuldet', () => {
    const balances = new Map([
      ['kim', 500],
      ['jo', -200],
      ['ali', -300],
    ])
    expect(householdPotCredit(balances, 'kim', 'jo')).toBe(200)
  })

  it('kennt Unbekannte als 0', () => {
    expect(householdPotCredit(new Map(), 'kim', 'jo')).toBe(0)
  })

  it('wird von der Rückzahlung to → from gesenkt, die beim Verrechnen entsteht', () => {
    const order = ['kim', 'jo']
    const expenses = [
      {
        payerId: 'kim',
        amountCents: 1000,
        split: { kind: 'equal' as const, participantIds: order },
      },
    ]
    const before = potBalances(order, expenses, [])
    expect(householdPotCredit(before, 'kim', 'jo')).toBe(500)
    const after = potBalances(order, expenses, [{ fromId: 'jo', toId: 'kim', amountCents: 300 }])
    expect(householdPotCredit(after, 'kim', 'jo')).toBe(200)
  })
})
