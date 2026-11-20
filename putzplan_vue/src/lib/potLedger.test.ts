import { describe, expect, it } from 'vitest'

import { expenseShares, formatCents, potBalances } from './potLedger'

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

describe('formatCents', () => {
  it('schreibt Cent als Euro mit Komma und Zeichen', () => {
    expect(formatCents(1234)).toBe('12,34 €')
    expect(formatCents(5)).toBe('0,05 €')
    expect(formatCents(0)).toBe('0,00 €')
  })
})
