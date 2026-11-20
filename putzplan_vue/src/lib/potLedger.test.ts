import { describe, expect, it } from 'vitest'

import {
  expenseShares,
  formatCents,
  potBalances,
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
