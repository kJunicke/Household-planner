import { describe, expect, it } from 'vitest'

import type { Pot, PotExpense, PotParticipant, PotRepayment } from '@/types/Pot'
import { expenseShares, potBalances, wholeGroupCarriers, type ExpenseSplit } from '@/lib/potLedger'
import { currentParticipants, wholeGroup } from '@/lib/potRules'
import type { ExpenseToolStores } from './expenseTools'
import type { ListToolStores } from './listTools'
import type { NotesToolStore } from './notesTools'
import type { ShoppingToolStore } from './shoppingTools'
import type { TaskToolStores } from './taskTools'
import { assistantTools } from './tools'

/** Wednesday, 25 November 2026, noon: the "today" of every test here. */
const TODAY = new Date(2026, 10, 25, 12)

const pot = (pot_id: string, name: string, fields: Partial<Pot> = {}): Pot => ({
  pot_id,
  household_id: 'h1',
  name,
  kind: 'event',
  closed_at: null,
  created_at: '2026-11-01T10:00:00Z',
  ...fields,
})

let minute = 0
const participant = (
  participant_id: string,
  pot_id: string,
  name: string,
  user_id: string | null,
): PotParticipant => ({
  participant_id,
  pot_id,
  household_id: 'h1',
  name,
  user_id,
  confirmed: false,
  rejected: false,
  left_at: null,
  created_at: `2026-11-01T10:${String(minute++).padStart(2, '0')}:00Z`,
})

const expense = (fields: Partial<PotExpense> & Pick<PotExpense, 'expense_id' | 'pot_id'>) =>
  ({
    household_id: 'h1',
    payer_participant_id: 'p-kilian',
    amount_cents: 1000,
    spent_on: '2026-11-20',
    description: 'Einkauf',
    split_kind: 'equal',
    split_values: {},
    updated_by_participant_id: 'p-kilian',
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
    ...fields,
  }) as PotExpense

const repayment = (fields: Partial<PotRepayment> & Pick<PotRepayment, 'repayment_id' | 'pot_id'>) =>
  ({
    household_id: 'h1',
    from_participant_id: 'p-anna',
    to_participant_id: 'p-kilian',
    amount_cents: 500,
    paid_on: '2026-11-21',
    updated_by_participant_id: 'p-anna',
    created_at: '2026-11-21T10:00:00Z',
    updated_at: '2026-11-21T10:00:00Z',
    ...fields,
  }) as PotRepayment

/**
 * A stand-in for the pot store: the same reckoning (`potLedger`, `potRules`)
 * over plain arrays. Every write answers like the real store: applied at once,
 * `settled` with the database's answer; `fail` makes the database refuse.
 */
function fakePots(
  { expenses = [] as PotExpense[], repayments = [] as PotRepayment[] } = {},
  { fail = false } = {},
) {
  minute = 0
  const pots = [
    pot('hp', 'Haushalt', { kind: 'household' }),
    pot('urlaub', 'Urlaub'),
    pot('silvester', 'Silvester', { closed_at: '2026-11-10T10:00:00Z' }),
  ]
  const participants = [
    participant('h-kilian', 'hp', 'Kilian', 'me'),
    participant('h-anna', 'hp', 'Anna', 'anna'),
    participant('p-kilian', 'urlaub', 'Kilian', 'me'),
    participant('p-anna', 'urlaub', 'Anna', 'anna'),
    participant('p-bea', 'urlaub', 'Bea', null),
    participant('s-kilian', 'silvester', 'Kilian', 'me'),
    participant('s-anna', 'silvester', 'Anna', 'anna'),
  ]
  let nextId = 0
  const answer = () => ({ applied: true, settled: Promise.resolve(!fail) })
  const toSplitValues = (split: ExpenseSplit): Record<string, number> =>
    split.kind === 'whole_group'
      ? {}
      : split.kind === 'equal'
        ? Object.fromEntries(split.participantIds.map((id) => [id, 1]))
        : Object.fromEntries(Object.entries(split.values).filter(([, v]) => v > 0))
  const participantsOf = (potId: string) => participants.filter((p) => p.pot_id === potId)
  const order = (potId: string) => participantsOf(potId).map((p) => p.participant_id)
  const carriers = (potId: string, createdAt: string) =>
    wholeGroupCarriers(createdAt, wholeGroup(participantsOf(potId)))
  const ledger = (e: PotExpense) => ({
    payerId: e.payer_participant_id,
    amountCents: e.amount_cents,
    split: (e.split_kind === 'equal'
      ? { kind: 'equal', participantIds: Object.keys(e.split_values) }
      : e.split_kind === 'whole_group'
        ? { kind: 'whole_group', participantIds: carriers(e.pot_id, e.created_at) }
        : { kind: e.split_kind, values: e.split_values }) as ExpenseSplit,
  })

  const store = {
    pots,
    loaded: true,
    expenses,
    repayments,
    participantsOf,
    currentParticipantsOf: (potId: string) =>
      currentParticipants(pots.find((p) => p.pot_id === potId)!.kind, participantsOf(potId), [
        'me',
        'anna',
      ]),
    wholeGroupCarriersAt: carriers,
    expensesOf: (potId: string) => store.expenses.filter((e) => e.pot_id === potId),
    repaymentsOf: (potId: string) => store.repayments.filter((r) => r.pot_id === potId),
    balancesOf: (potId: string) =>
      potBalances(
        order(potId),
        store.expenses.filter((e) => e.pot_id === potId).map(ledger),
        store.repayments
          .filter((r) => r.pot_id === potId)
          .map((r) => ({
            fromId: r.from_participant_id,
            toId: r.to_participant_id,
            amountCents: r.amount_cents,
          })),
      ),
    sharesOf: (e: PotExpense) => expenseShares(ledger(e), order(e.pot_id)),
    participantName: (id: string | null) =>
      participants.find((p) => p.participant_id === id)?.name ?? 'Unbekannt',
    myParticipantId: (potId: string) =>
      participants.find((p) => p.pot_id === potId && p.user_id === 'me')?.participant_id ?? null,
    createExpense: (input: {
      potId: string
      payerId: string
      amountCents: number
      spentOn: string
      description: string
      split: ExpenseSplit
    }) => {
      const id = `e-new-${nextId++}`
      if (!fail) {
        store.expenses.push(
          expense({
            expense_id: id,
            pot_id: input.potId,
            payer_participant_id: input.payerId,
            amount_cents: input.amountCents,
            spent_on: input.spentOn,
            description: input.description,
            split_kind: input.split.kind,
            split_values: toSplitValues(input.split),
            created_at: '2026-11-25T11:00:00Z',
            updated_at: '2026-11-25T11:00:00Z',
          }),
        )
      }
      return { ...answer(), id }
    },
    updateExpense: (
      id: string,
      input: {
        payerId: string
        amountCents: number
        spentOn: string
        description: string
        split: ExpenseSplit
      },
    ) => {
      if (!fail) {
        Object.assign(store.expenses.find((e) => e.expense_id === id)!, {
          payer_participant_id: input.payerId,
          amount_cents: input.amountCents,
          spent_on: input.spentOn,
          description: input.description,
          split_kind: input.split.kind,
          split_values: toSplitValues(input.split),
        })
      }
      return answer()
    },
    deleteExpense: (id: string) => {
      if (!fail) store.expenses = store.expenses.filter((e) => e.expense_id !== id)
      return answer()
    },
    restoreExpense: (row: PotExpense) => {
      if (!fail) store.expenses.push({ ...row })
      return answer()
    },
    createRepayment: (input: {
      potId: string
      fromId: string
      toId: string
      amountCents: number
      paidOn: string
    }) => {
      const id = `r-new-${nextId++}`
      if (!fail) {
        store.repayments.push(
          repayment({
            repayment_id: id,
            pot_id: input.potId,
            from_participant_id: input.fromId,
            to_participant_id: input.toId,
            amount_cents: input.amountCents,
            paid_on: input.paidOn,
          }),
        )
      }
      return { ...answer(), id }
    },
    updateRepayment: (
      id: string,
      input: { fromId: string; toId: string; amountCents: number; paidOn: string },
    ) => {
      if (!fail) {
        Object.assign(store.repayments.find((r) => r.repayment_id === id)!, {
          from_participant_id: input.fromId,
          to_participant_id: input.toId,
          amount_cents: input.amountCents,
          paid_on: input.paidOn,
        })
      }
      return answer()
    },
    deleteRepayment: (id: string) => {
      if (!fail) store.repayments = store.repayments.filter((r) => r.repayment_id !== id)
      return answer()
    },
    restoreRepayment: (row: PotRepayment) => {
      if (!fail) store.repayments.push({ ...row })
      return answer()
    },
  }
  return store
}

type FakePots = ReturnType<typeof fakePots>

const execute = (store: FakePots, name: string, input: Record<string, unknown>) =>
  assistantTools({
    shopping: { lists: [], items: [] } as unknown as ShoppingToolStore,
    lists: {} as ListToolStores,
    notes: { notes: [] } as unknown as NotesToolStore,
    tasks: {} as TaskToolStores,
    expenses: { pots: store, today: () => TODAY } as unknown as ExpenseToolStores,
    goToPage: () => {},
    currentUserId: () => 'me',
  }).execute(name, input)

const URLAUB = { area: 'pot', potId: 'urlaub' } as const

describe('add_expense', () => {
  it('"34 € Pizza in den Urlaubstopf, für alle": equal on everyone, paid by the asker, today', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Pizza',
      amount: '34',
      split: { kind: 'equal' },
    })
    expect(outcome.isError).toBeFalsy()
    expect(store.expenses).toHaveLength(1)
    const [added] = store.expenses
    expect(added).toMatchObject({
      pot_id: 'urlaub',
      payer_participant_id: 'p-kilian',
      amount_cents: 3400,
      spent_on: '2026-11-25',
      description: 'Pizza',
      split_kind: 'equal',
      split_values: { 'p-kilian': 1, 'p-anna': 1, 'p-bea': 1 },
    })
    // The extra cent goes to the first in the pot's order, as in the app.
    expect(outcome.result).toContain('Kilian 11,34 €, Anna 11,33 €, Bea 11,33 €')
    expect(outcome.summary).toBe('✓ Pizza 34,00 € → Urlaub')
    expect(outcome.changed).toEqual([{ id: added!.expense_id, page: URLAUB }])
    expect(outcome.changes).toHaveLength(1)
  })

  it('can be taken back: the expense is gone again', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Pizza',
      amount: 34,
      split: { kind: 'equal' },
    })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(store.expenses).toEqual([])
  })

  it('splits equally on the named subset, with cents exactly as said', async () => {
    const store = fakePots()
    await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Taxi',
      amount: '12,50',
      split: { kind: 'equal', participant_ids: ['p-anna', 'p-bea'] },
    })
    expect(store.expenses[0]).toMatchObject({
      amount_cents: 1250,
      split_values: { 'p-anna': 1, 'p-bea': 1 },
    })
  })

  it('splits on the whole group when asked, and takes the payer that was named', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Ferienhaus',
      amount: '900',
      payer_participant_id: 'p-anna',
      spent_on: '2026-11-24',
      split: { kind: 'whole_group' },
    })
    expect(store.expenses[0]).toMatchObject({
      payer_participant_id: 'p-anna',
      spent_on: '2026-11-24',
      split_kind: 'whole_group',
      split_values: {},
    })
    expect(outcome.result).toContain('ganze Gruppe')
  })

  it('splits by ratio and by exact amounts', async () => {
    const store = fakePots()
    await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Wein',
      amount: '30',
      split: { kind: 'ratio', values: { 'p-kilian': 2, 'p-anna': 1 } },
    })
    await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Eis',
      amount: '10',
      split: { kind: 'exact', values: { 'p-kilian': '7,50', 'p-bea': '2,50' } },
    })
    expect(store.sharesOf(store.expenses[0]!)).toEqual(
      new Map([
        ['p-kilian', 2000],
        ['p-anna', 1000],
      ]),
    )
    expect(store.expenses[1]).toMatchObject({
      split_kind: 'exact',
      split_values: { 'p-kilian': 750, 'p-bea': 250 },
    })
  })

  it('takes exact amounts as whole cents, also tricky ones and plain numbers', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Kiosk',
      amount: '20,28',
      split: { kind: 'exact', values: { 'p-kilian': '19,99', 'p-bea': 0.29 } },
    })
    expect(outcome.isError).toBeFalsy()
    expect(store.expenses[0]).toMatchObject({
      amount_cents: 2028,
      split_values: { 'p-kilian': 1999, 'p-bea': 29 },
    })
  })

  it('rejects an exact amount written with a thousands separator', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Ferienhaus',
      amount: '1234,56',
      split: { kind: 'exact', values: { 'p-kilian': '1.234,56' } },
    })
    expect(outcome.isError).toBe(true)
    expect(store.expenses).toEqual([])
  })

  it('rejects exact amounts that do not add up, says how much is missing and enters nothing', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Eis',
      amount: '10',
      split: { kind: 'exact', values: { 'p-kilian': '7', 'p-bea': '2' } },
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('1,00 €')
    expect(store.expenses).toEqual([])
  })

  it('rejects an amount with more than two decimals instead of rounding it', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Pizza',
      amount: '12,345',
      split: { kind: 'equal' },
    })
    expect(outcome.isError).toBe(true)
    expect(store.expenses).toEqual([])
  })

  it('rejects a payer or a sharer who is not in the pot', async () => {
    const store = fakePots()
    const payer = await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Pizza',
      amount: '34',
      payer_participant_id: 'h-anna',
      split: { kind: 'equal' },
    })
    const sharer = await execute(store, 'add_expense', {
      pot_id: 'urlaub',
      description: 'Pizza',
      amount: '34',
      split: { kind: 'equal', participant_ids: ['p-anna', 'h-kilian'] },
    })
    expect(payer.isError).toBe(true)
    expect(sharer.isError).toBe(true)
    expect(store.expenses).toEqual([])
  })

  it('refuses a closed pot and says it is read-only', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_expense', {
      pot_id: 'silvester',
      description: 'Sekt',
      amount: '20',
      split: { kind: 'equal' },
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toMatch(/abgeschlossen.*schreibgeschützt/)
    expect(store.expenses).toEqual([])
  })

  it('rejects an unknown pot id', async () => {
    const outcome = await execute(fakePots(), 'add_expense', {
      pot_id: 'nope',
      description: 'Pizza',
      amount: '34',
      split: { kind: 'equal' },
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('nope')
  })

  it('reports an expense the database refused as an error, not as entered', async () => {
    const outcome = await execute(fakePots({}, { fail: true }), 'add_expense', {
      pot_id: 'urlaub',
      description: 'Pizza',
      amount: '34',
      split: { kind: 'equal' },
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.changes).toBeUndefined()
  })
})

describe('read_pot', () => {
  const store = () =>
    fakePots({
      expenses: [
        expense({
          expense_id: 'e1',
          pot_id: 'urlaub',
          amount_cents: 3000,
          description: 'Grillen',
          split_values: { 'p-kilian': 1, 'p-anna': 1, 'p-bea': 1 },
        }),
      ],
      repayments: [
        repayment({ repayment_id: 'r1', pot_id: 'urlaub', amount_cents: 500 }),
        repayment({
          repayment_id: 'r2',
          pot_id: 'urlaub',
          from_participant_id: 'p-bea',
          amount_cents: 100,
          settlement_id: 's1',
        }),
      ],
    })

  it('says who owes how much, who pays whom, and who paid what, and changes nothing', async () => {
    const outcome = await execute(store(), 'read_pot', { pot_id: 'urlaub' })
    // Kilian paid 30 € and carries 10 €, got 5 € and 1 € back: 14 € credit.
    expect(outcome.result).toContain('Kilian (participant_id p-kilian, du): hat 14,00 € gut')
    expect(outcome.result).toContain('Anna (participant_id p-anna): schuldet 5,00 €')
    expect(outcome.result).toContain('Bea (participant_id p-bea, Gast): schuldet 9,00 €')
    expect(outcome.result).toContain('- Bea an Kilian 9,00 €')
    expect(outcome.result).toContain('- Anna an Kilian 5,00 €')
    expect(outcome.result).toContain(
      'Ausgabe (id e1) 20.11.2026: Grillen 30,00 €, bezahlt von Kilian; gleich auf alle: Kilian 10,00 €, Anna 10,00 €, Bea 10,00 €',
    )
    expect(outcome.result).toContain('Rückzahlung (id r1) 21.11.2026: Anna an Kilian 5,00 €')
    expect(outcome.result).toMatch(/id r2.*nicht änderbar/)
    expect(outcome.summary).toBeUndefined()
    expect(outcome.changes).toBeUndefined()
  })

  it('says a closed pot is read-only', async () => {
    const outcome = await execute(store(), 'read_pot', { pot_id: 'silvester' })
    expect(outcome.result).toMatch(/abgeschlossen.*schreibgeschützt/)
    expect(outcome.result).toContain('Keine Einträge')
  })

  it('rejects an unknown pot id', async () => {
    const outcome = await execute(store(), 'read_pot', { pot_id: 'x' })
    expect(outcome.isError).toBe(true)
  })
})

describe('update_expense', () => {
  const store = () =>
    fakePots({
      expenses: [
        expense({
          expense_id: 'e1',
          pot_id: 'urlaub',
          amount_cents: 3400,
          description: 'Pizza',
          split_values: { 'p-kilian': 1, 'p-anna': 1, 'p-bea': 1 },
        }),
        expense({ expense_id: 'e-old', pot_id: 'silvester', payer_participant_id: 's-kilian' }),
      ],
    })

  it('changes only what was named, and taking it back restores the expense as it was', async () => {
    const s = store()
    const before = { ...s.expenses[0]! }
    const outcome = await execute(s, 'update_expense', { expense_id: 'e1', amount: '36' })
    expect(outcome.isError).toBeFalsy()
    expect(s.expenses[0]).toMatchObject({ amount_cents: 3600, description: 'Pizza' })
    expect(outcome.summary).toBe('✓ geändert: Pizza → 36,00 €')
    expect(outcome.changed).toEqual([{ id: 'e1', page: URLAUB }])
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(s.expenses[0]).toEqual(before)
  })

  it('changes the split and checks it like the form does', async () => {
    const s = store()
    const ok = await execute(s, 'update_expense', {
      expense_id: 'e1',
      split: { kind: 'equal', participant_ids: ['p-kilian', 'p-anna'] },
    })
    expect(ok.isError).toBeFalsy()
    expect(s.expenses[0]!.split_values).toEqual({ 'p-kilian': 1, 'p-anna': 1 })
    const bad = await execute(s, 'update_expense', {
      expense_id: 'e1',
      split: { kind: 'percent', values: { 'p-kilian': 50, 'p-anna': 40 } },
    })
    expect(bad.isError).toBe(true)
    expect(s.expenses[0]!.split_kind).toBe('equal')
  })

  it('refuses an expense in a closed pot', async () => {
    const s = store()
    const outcome = await execute(s, 'update_expense', { expense_id: 'e-old', amount: '5' })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toMatch(/abgeschlossen/)
    expect(s.expenses[1]!.amount_cents).toBe(1000)
  })

  it('rejects an unknown expense id', async () => {
    const outcome = await execute(store(), 'update_expense', { expense_id: 'x', amount: '5' })
    expect(outcome.isError).toBe(true)
  })
})

describe('delete_expense', () => {
  const store = () =>
    fakePots({
      expenses: [
        expense({
          expense_id: 'e1',
          pot_id: 'urlaub',
          amount_cents: 3400,
          description: 'Pizza',
          split_values: { 'p-kilian': 1, 'p-anna': 1 },
        }),
        expense({ expense_id: 'e-old', pot_id: 'silvester', payer_participant_id: 's-kilian' }),
      ],
    })

  it('deletes nothing itself but lays the card before the user, naming the expense', async () => {
    const s = store()
    const outcome = await execute(s, 'delete_expense', { expense_id: 'e1' })
    expect(outcome.deleteCard!.what).toBe(
      'Ausgabe „Pizza“ (34,00 €, bezahlt von Kilian) im Topf Urlaub',
    )
    expect(s.expenses).toHaveLength(2)
  })

  it('deletes after "Löschen", and taking it back brings the same expense back', async () => {
    const s = store()
    const before = { ...s.expenses[0]! }
    const card = (await execute(s, 'delete_expense', { expense_id: 'e1' })).deleteCard!
    const outcome = await card.confirm()
    expect(s.expenses.map((e) => e.expense_id)).toEqual(['e-old'])
    expect(outcome.summary).toBe('✓ Ausgabe gelöscht: Pizza 34,00 € (Urlaub)')
    expect(outcome.changed).toEqual([{ id: 'e1', page: URLAUB, removed: true }])
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(s.expenses.find((e) => e.expense_id === 'e1')).toEqual(before)
  })

  it('refuses an expense in a closed pot without a card', async () => {
    const outcome = await execute(store(), 'delete_expense', { expense_id: 'e-old' })
    expect(outcome.isError).toBe(true)
    expect(outcome.deleteCard).toBeUndefined()
  })
})

describe('add_repayment', () => {
  it('"Ich hab Anna 50 € gegeben": from the asker to Anna, in the named pot', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_repayment', {
      pot_id: 'hp',
      to_participant_id: 'h-anna',
      amount: '50',
    })
    expect(outcome.isError).toBeFalsy()
    expect(store.repayments[0]).toMatchObject({
      pot_id: 'hp',
      from_participant_id: 'h-kilian',
      to_participant_id: 'h-anna',
      amount_cents: 5000,
      paid_on: '2026-11-25',
    })
    expect(outcome.summary).toBe('✓ Rückzahlung: Kilian an Anna 50,00 € (Haushaltstopf)')
    expect(outcome.changed).toEqual([
      { id: store.repayments[0]!.repayment_id, page: { area: 'pot', potId: 'hp' } },
    ])
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(store.repayments).toEqual([])
  })

  it('rejects a repayment to oneself', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_repayment', {
      pot_id: 'hp',
      to_participant_id: 'h-kilian',
      amount: '50',
    })
    expect(outcome.isError).toBe(true)
    expect(store.repayments).toEqual([])
  })

  it('refuses a closed pot', async () => {
    const store = fakePots()
    const outcome = await execute(store, 'add_repayment', {
      pot_id: 'silvester',
      to_participant_id: 's-anna',
      amount: '50',
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toMatch(/abgeschlossen/)
    expect(store.repayments).toEqual([])
  })
})

describe('update_repayment and delete_repayment', () => {
  const store = () =>
    fakePots({
      repayments: [
        repayment({ repayment_id: 'r1', pot_id: 'urlaub', amount_cents: 5000 }),
        repayment({ repayment_id: 'r-offset', pot_id: 'hp', settlement_id: 's1' }),
        repayment({ repayment_id: 'r-old', pot_id: 'silvester' }),
      ],
    })

  it('changes the amount, and taking it back restores it', async () => {
    const s = store()
    const outcome = await execute(s, 'update_repayment', { repayment_id: 'r1', amount: '40' })
    expect(outcome.isError).toBeFalsy()
    expect(s.repayments[0]!.amount_cents).toBe(4000)
    expect(outcome.summary).toBe('✓ geändert: Rückzahlung Anna an Kilian → 40,00 €')
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(s.repayments[0]!.amount_cents).toBe(5000)
  })

  it('deletes after the card, and taking it back brings the same repayment back', async () => {
    const s = store()
    const before = { ...s.repayments[0]! }
    const card = (await execute(s, 'delete_repayment', { repayment_id: 'r1' })).deleteCard!
    expect(card.what).toBe('Rückzahlung Anna an Kilian (50,00 €) im Topf Urlaub')
    const outcome = await card.confirm()
    expect(s.repayments.some((r) => r.repayment_id === 'r1')).toBe(false)
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(s.repayments.find((r) => r.repayment_id === 'r1')).toEqual(before)
  })

  it('leaves a repayment that came with a settlement alone', async () => {
    const s = store()
    const update = await execute(s, 'update_repayment', { repayment_id: 'r-offset', amount: '1' })
    const remove = await execute(s, 'delete_repayment', { repayment_id: 'r-offset' })
    expect(update.isError).toBe(true)
    expect(remove.isError).toBe(true)
    expect(remove.deleteCard).toBeUndefined()
    expect(s.repayments[1]!.amount_cents).toBe(500)
  })

  it('refuses a repayment in a closed pot', async () => {
    const s = store()
    const update = await execute(s, 'update_repayment', { repayment_id: 'r-old', amount: '1' })
    const remove = await execute(s, 'delete_repayment', { repayment_id: 'r-old' })
    expect(update.isError).toBe(true)
    expect(remove.isError).toBe(true)
    expect(remove.deleteCard).toBeUndefined()
  })
})
