import { describe, expect, it } from 'vitest'

import {
  expenseShares,
  formatCents,
  potBalances,
  splitValidity,
  suggestTransfers,
  type LedgerExpense,
  type LedgerRepayment,
} from './potLedger'

// Teilnehmer in fester Reihenfolge des Topfs (Anlage, dann Kennung).
const participants = ['anna', 'ben', 'cleo']

describe('expenseShares', () => {
  it('teilt gleich auf alle, Cent-Reste an die ersten Teilnehmer', () => {
    const shares = expenseShares(
      {
        payerId: 'anna',
        amountCents: 1000,
        split: { kind: 'equal', participantIds: participants },
      },
      participants,
    )
    expect(shares).toEqual(
      new Map([
        ['anna', 334],
        ['ben', 333],
        ['cleo', 333],
      ]),
    )
  })

  it('vergibt Cent-Reste nach der Reihenfolge des Topfs, nicht der Auswahl', () => {
    const shares = expenseShares(
      {
        payerId: 'anna',
        amountCents: 200,
        split: { kind: 'equal', participantIds: ['cleo', 'ben', 'anna'] },
      },
      participants,
    )
    expect(shares).toEqual(
      new Map([
        ['anna', 67],
        ['ben', 67],
        ['cleo', 66],
      ]),
    )
  })

  it('summiert sich bei jedem Betrag genau zum Betrag', () => {
    for (const amountCents of [1, 2, 3, 99, 100, 101, 12345]) {
      const shares = expenseShares(
        { payerId: 'ben', amountCents, split: { kind: 'equal', participantIds: participants } },
        participants,
      )
      const sum = [...shares.values()].reduce((a, b) => a + b, 0)
      expect(sum).toBe(amountCents)
    }
  })
})

describe('expenseShares — Verhältnis', () => {
  it('teilt im Verhältnis 2:1, Cent-Rest an den größten Bruchteil', () => {
    const shares = expenseShares(
      { payerId: 'anna', amountCents: 1000, split: { kind: 'ratio', values: { anna: 2, ben: 1 } } },
      participants,
    )
    // 666,67 / 333,33 → anna bekommt den Rest-Cent
    expect(shares).toEqual(
      new Map([
        ['anna', 667],
        ['ben', 333],
      ]),
    )
  })
})

describe('expenseShares — Verhältnis mit Nachkommastellen und Gleichstand', () => {
  it('rechnet 1,5 : 1 genau', () => {
    const shares = expenseShares(
      {
        payerId: 'anna',
        amountCents: 500,
        split: { kind: 'ratio', values: { anna: 1.5, cleo: 1 } },
      },
      participants,
    )
    expect(shares).toEqual(
      new Map([
        ['anna', 300],
        ['cleo', 200],
      ]),
    )
  })

  it('gibt Rest-Cent bei gleichen Bruchteilen an die ersten in Topf-Reihenfolge', () => {
    const shares = expenseShares(
      {
        payerId: 'anna',
        amountCents: 1001,
        split: { kind: 'ratio', values: { cleo: 2, ben: 2, anna: 2 } },
      },
      participants,
    )
    expect(shares).toEqual(
      new Map([
        ['anna', 334],
        ['ben', 334],
        ['cleo', 333],
      ]),
    )
  })

  it('lässt Teilnehmer mit Gewicht 0 weg', () => {
    const shares = expenseShares(
      { payerId: 'anna', amountCents: 100, split: { kind: 'ratio', values: { anna: 0, ben: 1 } } },
      participants,
    )
    expect(shares).toEqual(new Map([['ben', 100]]))
  })
})

describe('expenseShares — Prozent', () => {
  it('teilt 50 / 30 / 20 Prozent', () => {
    const shares = expenseShares(
      {
        payerId: 'anna',
        amountCents: 2000,
        split: { kind: 'percent', values: { anna: 50, ben: 30, cleo: 20 } },
      },
      participants,
    )
    expect(shares).toEqual(
      new Map([
        ['anna', 1000],
        ['ben', 600],
        ['cleo', 400],
      ]),
    )
  })

  it('rundet 33,33 / 33,33 / 33,34 Prozent auf den Cent genau zum Betrag', () => {
    const shares = expenseShares(
      {
        payerId: 'anna',
        amountCents: 100,
        split: { kind: 'percent', values: { anna: 33.33, ben: 33.33, cleo: 33.34 } },
      },
      participants,
    )
    // 33,33 / 33,33 / 33,34 Cent → abgerundet 33/33/33, Rest-Cent an cleo (größter Bruchteil)
    expect(shares).toEqual(
      new Map([
        ['anna', 33],
        ['ben', 33],
        ['cleo', 34],
      ]),
    )
  })
})

describe('expenseShares — genaue Beträge', () => {
  it('übernimmt die Cent je Person unverändert', () => {
    const shares = expenseShares(
      {
        payerId: 'anna',
        amountCents: 1234,
        split: { kind: 'exact', values: { anna: 1000, cleo: 234 } },
      },
      participants,
    )
    expect(shares).toEqual(
      new Map([
        ['anna', 1000],
        ['cleo', 234],
      ]),
    )
  })
})

describe('splitValidity', () => {
  const check = (amountCents: number, split: Parameters<typeof splitValidity>[0]['split']) =>
    splitValidity({ amountCents, split }, participants)

  it('nimmt eine Auswahl mit mindestens einem Teilnehmer an', () => {
    expect(check(100, { kind: 'equal', participantIds: ['ben'] })).toEqual({ valid: true })
  })

  it('weist eine leere Auswahl ab', () => {
    expect(check(100, { kind: 'equal', participantIds: [] })).toEqual({
      valid: false,
      reason: 'nobody',
    })
  })

  it('weist ein Verhältnis ohne positives Gewicht ab', () => {
    expect(check(100, { kind: 'ratio', values: { anna: 0 } })).toEqual({
      valid: false,
      reason: 'nobody',
    })
    expect(check(100, { kind: 'ratio', values: { anna: 2, ben: 1 } })).toEqual({ valid: true })
  })

  it('weist negative Werte ab', () => {
    expect(check(100, { kind: 'ratio', values: { anna: 2, ben: -1 } })).toEqual({
      valid: false,
      reason: 'negative',
    })
  })

  it('nimmt Prozente an, die genau 100 ergeben', () => {
    expect(
      check(100, { kind: 'percent', values: { anna: 33.33, ben: 33.33, cleo: 33.34 } }),
    ).toEqual({ valid: true })
  })

  it('meldet fehlende Prozent in Hundertstel-Prozent', () => {
    expect(check(100, { kind: 'percent', values: { anna: 50, ben: 40 } })).toEqual({
      valid: false,
      reason: 'percent_off',
      missingHundredthPercent: 1000,
    })
  })

  it('meldet bei leeren Prozenten und Beträgen den ganzen Fehlbetrag', () => {
    expect(check(500, { kind: 'percent', values: {} })).toEqual({
      valid: false,
      reason: 'percent_off',
      missingHundredthPercent: 10000,
    })
    expect(check(500, { kind: 'exact', values: { anna: 0 } })).toEqual({
      valid: false,
      reason: 'exact_off',
      missingCents: 500,
    })
  })

  it('meldet zu viele Prozent negativ', () => {
    expect(check(100, { kind: 'percent', values: { anna: 60, ben: 45.5 } })).toEqual({
      valid: false,
      reason: 'percent_off',
      missingHundredthPercent: -550,
    })
  })

  it('nimmt genaue Beträge an, die den Betrag ergeben', () => {
    expect(check(1234, { kind: 'exact', values: { anna: 1000, cleo: 234 } })).toEqual({
      valid: true,
    })
  })

  it('meldet den Fehlbetrag genauer Beträge in Cent, zu viel negativ', () => {
    expect(check(1234, { kind: 'exact', values: { anna: 1000 } })).toEqual({
      valid: false,
      reason: 'exact_off',
      missingCents: 234,
    })
    expect(check(1000, { kind: 'exact', values: { anna: 600, ben: 500 } })).toEqual({
      valid: false,
      reason: 'exact_off',
      missingCents: -100,
    })
  })

  it('zählt nur Werte von Teilnehmern des Topfs', () => {
    expect(check(1000, { kind: 'exact', values: { anna: 500, fremd: 500 } })).toEqual({
      valid: false,
      reason: 'exact_off',
      missingCents: 500,
    })
  })
})

describe('potBalances', () => {
  it('Zahler hat gut, was die anderen tragen; die anderen schulden ihren Anteil', () => {
    const balances = potBalances(
      participants,
      [
        {
          payerId: 'anna',
          amountCents: 1000,
          split: { kind: 'equal', participantIds: participants },
        },
      ],
      [],
    )
    expect(balances).toEqual(
      new Map([
        ['anna', 666],
        ['ben', -333],
        ['cleo', -333],
      ]),
    )
  })

  it('führt jeden Teilnehmer, auch ohne Ausgaben, mit 0', () => {
    expect(potBalances(participants, [], [])).toEqual(
      new Map([
        ['anna', 0],
        ['ben', 0],
        ['cleo', 0],
      ]),
    )
  })

  it('summiert sich über mehrere Ausgaben zu null', () => {
    const balances = potBalances(
      participants,
      [
        {
          payerId: 'anna',
          amountCents: 1001,
          split: { kind: 'equal', participantIds: participants },
        },
        {
          payerId: 'ben',
          amountCents: 2399,
          split: { kind: 'equal', participantIds: participants },
        },
        { payerId: 'cleo', amountCents: 7, split: { kind: 'equal', participantIds: participants } },
      ],
      [],
    )
    // Anteile: 1001 → 334/334/333, 2399 → 800/800/799, 7 → 3/2/2
    expect(balances).toEqual(
      new Map([
        ['anna', -136],
        ['ben', 1263],
        ['cleo', -1127],
      ]),
    )
    expect([...balances.values()].reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('rechnet Verhältnis, Prozent und genaue Beträge mit, Summe null', () => {
    const balances = potBalances(
      participants,
      [
        {
          payerId: 'anna',
          amountCents: 999,
          split: { kind: 'ratio', values: { ben: 2, cleo: 1 } },
        },
        {
          payerId: 'ben',
          amountCents: 1000,
          split: { kind: 'percent', values: { anna: 25, ben: 25, cleo: 50 } },
        },
        { payerId: 'cleo', amountCents: 300, split: { kind: 'exact', values: { anna: 300 } } },
      ],
      [],
    )
    // anna: +999 −250 −300 = 449; ben: −666 +1000 −250 = 84; cleo: −333 −500 +300 = −533
    expect(balances).toEqual(
      new Map([
        ['anna', 449],
        ['ben', 84],
        ['cleo', -533],
      ]),
    )
  })

  it('summiert sich bei jeder Art und jedem Betrag genau zum Betrag', () => {
    const splits = [
      { kind: 'ratio', values: { anna: 3, ben: 1.25, cleo: 0.5 } },
      { kind: 'percent', values: { anna: 12.5, ben: 80, cleo: 7.5 } },
    ] as const
    for (const split of splits) {
      for (const amountCents of [1, 2, 7, 99, 101, 12345, 99999999]) {
        const shares = expenseShares({ payerId: 'anna', amountCents, split }, participants)
        expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(amountCents)
      }
    }
  })

  it('Rückzahlungen senken die Salden zwischen beiden', () => {
    const balances = potBalances(
      participants,
      [
        {
          payerId: 'anna',
          amountCents: 900,
          split: { kind: 'equal', participantIds: participants },
        },
      ],
      [{ fromId: 'ben', toId: 'anna', amountCents: 300 }],
    )
    expect(balances).toEqual(
      new Map([
        ['anna', 300],
        ['ben', 0],
        ['cleo', -300],
      ]),
    )
  })
})

describe('suggestTransfers', () => {
  it('lässt den Schuldner dem Gläubiger genau seine Schuld überweisen', () => {
    const balances = new Map([
      ['anna', 500],
      ['ben', -500],
    ])
    expect(suggestTransfers(balances)).toEqual([{ fromId: 'ben', toId: 'anna', amountCents: 500 }])
  })

  it('größter Schuldner zahlt zuerst an den größten Gläubiger', () => {
    // anna +700, ben +100, cleo -300, dora -500
    const balances = new Map([
      ['anna', 700],
      ['ben', 100],
      ['cleo', -300],
      ['dora', -500],
    ])
    expect(suggestTransfers(balances)).toEqual([
      { fromId: 'dora', toId: 'anna', amountCents: 500 },
      { fromId: 'cleo', toId: 'anna', amountCents: 200 },
      { fromId: 'cleo', toId: 'ben', amountCents: 100 },
    ])
  })

  it('schlägt nichts vor, wenn alle ausgeglichen sind', () => {
    expect(
      suggestTransfers(
        new Map([
          ['anna', 0],
          ['ben', 0],
        ]),
      ),
    ).toEqual([])
  })

  it('gleicht alle Salden mit höchstens n−1 Überweisungen aus', () => {
    const order = ['anna', 'ben', 'cleo', 'dora', 'emil']
    const expenses: LedgerExpense[] = [
      { payerId: 'anna', amountCents: 12345, split: { kind: 'equal', participantIds: order } },
      {
        payerId: 'ben',
        amountCents: 4999,
        split: { kind: 'equal', participantIds: ['ben', 'cleo', 'emil'] },
      },
      { payerId: 'emil', amountCents: 701, split: { kind: 'equal', participantIds: ['dora'] } },
    ]
    const repayments: LedgerRepayment[] = [{ fromId: 'cleo', toId: 'anna', amountCents: 1000 }]
    const transfers = suggestTransfers(potBalances(order, expenses, repayments))

    expect(transfers.length).toBeLessThanOrEqual(order.length - 1)
    expect(transfers.every((t) => t.amountCents > 0 && t.fromId !== t.toId)).toBe(true)
    // Als Rückzahlungen eingetragen, bringen die Vorschläge jeden Saldo auf null.
    const settled = potBalances(order, expenses, [...repayments, ...transfers])
    expect([...settled.values()]).toEqual([0, 0, 0, 0, 0])
  })

  it('verteilt bei gleichen Salden nach der Reihenfolge des Topfs', () => {
    const balances = new Map([
      ['anna', -100],
      ['ben', 200],
      ['cleo', -100],
    ])
    expect(suggestTransfers(balances)).toEqual([
      { fromId: 'anna', toId: 'ben', amountCents: 100 },
      { fromId: 'cleo', toId: 'ben', amountCents: 100 },
    ])
  })
})

describe('formatCents', () => {
  it('schreibt Cent als Euro mit Komma und Zeichen', () => {
    expect(formatCents(1234)).toBe('12,34 €')
    expect(formatCents(5)).toBe('0,05 €')
    expect(formatCents(0)).toBe('0,00 €')
  })
})
