import { describe, expect, it } from 'vitest'

import type { ListToolStores } from './listTools'
import type { NotesToolStore } from './notesTools'
import { potTools, type PotToolStores } from './potTools'
import type { ShoppingToolStore } from './shoppingTools'
import type { TaskToolStores } from './taskTools'
import { assistantTools } from './tools'
import type { Pot, PotExpense, PotParticipant, PotRepayment } from '@/types/Pot'

const HOUSEHOLD_POT: Pot = {
  pot_id: 'household',
  household_id: 'h',
  name: 'Haushalt',
  kind: 'household',
  closed_at: null,
  created_at: '2026-11-01T10:00:00Z',
}

const SKI: Pot = { ...HOUSEHOLD_POT, pot_id: 'ski', name: 'Skiurlaub', kind: 'event' }

/**
 * A stand-in for the pot store and the household. `fail` makes every write
 * report failure, as the real store does when the database refuses.
 */
function fakeStores({
  pots = [HOUSEHOLD_POT, SKI],
  expenses = [] as Partial<PotExpense>[],
  repayments = [] as Partial<PotRepayment>[],
  participants = [] as Partial<PotParticipant>[],
  balances = new Map<string, number>(),
  guestLinks = [] as string[],
  fail = false,
} = {}) {
  const shown: string[] = []
  const state = {
    pots: pots.map((p) => ({ ...p })),
    participants: participants as PotParticipant[],
    expenses: expenses as PotExpense[],
    repayments: repayments as PotRepayment[],
  }
  const potStore = {
    get pots() {
      return state.pots
    },
    participantsOf: (id: string) => state.participants.filter((p) => p.pot_id === id),
    expensesOf: (id: string) => state.expenses.filter((e) => e.pot_id === id),
    repaymentsOf: (id: string) => state.repayments.filter((r) => r.pot_id === id),
    balancesOf: () => balances,
    createEventPot: async (input: {
      name: string
      memberIds: readonly string[]
      guestNames: readonly string[]
    }) => {
      if (fail) return null
      const pot_id = `new-${state.pots.length}`
      state.pots.push({
        ...SKI,
        pot_id,
        name: input.name.trim(),
        created_at: '2026-11-25T12:00:00Z',
      })
      for (const user_id of input.memberIds) {
        state.participants.push({ pot_id, user_id, name: user_id } as PotParticipant)
      }
      for (const name of input.guestNames) {
        state.participants.push({ pot_id, user_id: null, name } as PotParticipant)
      }
      return pot_id
    },
    setPotClosed: (id: string, closed: boolean, closedAt?: string) => {
      const pot = state.pots.find((p) => p.pot_id === id)
      if (fail || !pot || pot.kind !== 'event') return false
      pot.closed_at = closed ? (closedAt ?? '2026-11-25T12:00:00Z') : null
      return true
    },
    deletePot: (id: string) => {
      const pot = state.pots.find((p) => p.pot_id === id)
      if (fail || !pot || pot.kind !== 'event') return false
      state.pots = state.pots.filter((p) => p.pot_id !== id)
      return true
    },
  }
  const stores: PotToolStores = {
    pots: potStore as unknown as PotToolStores['pots'],
    household: {
      householdMembers: [
        { user_id: 'me', display_name: 'Kilian' },
        { user_id: 'anna', display_name: 'Anna' },
      ],
    } as unknown as PotToolStores['household'],
    hasGuestLink: (id) => guestLinks.includes(id),
    showPot: (id) => shown.push(id),
  }
  return { state, stores, shown }
}

const run = (stores: PotToolStores, name: string, input: Record<string, unknown>) =>
  assistantTools({
    shopping: { lists: [], items: [] } as unknown as ShoppingToolStore,
    lists: {} as ListToolStores,
    notes: { notes: [] } as unknown as NotesToolStore,
    tasks: {} as TaskToolStores,
    pots: stores,
    goToPage: () => {},
    currentUserId: () => 'me',
  }).execute(name, input)

const potNamed = (state: { pots: Pot[] }, name: string) => state.pots.find((p) => p.name === name)

describe('create_pot', () => {
  it('creates a pot for an occasion with all household members and leads to it', async () => {
    const { state, stores } = fakeStores()
    const outcome = await run(stores, 'create_pot', { name: 'Hüttenwochenende' })
    const pot = potNamed(state, 'Hüttenwochenende')!
    expect(pot.kind).toBe('event')
    expect(state.participants.filter((p) => p.pot_id === pot.pot_id).map((p) => p.user_id)).toEqual(
      ['me', 'anna'],
    )
    expect(outcome.isError).toBeFalsy()
    expect(outcome.summary).toBe('✓ neuer Topf: Hüttenwochenende')
    expect(outcome.result).toContain(`id ${pot.pot_id}`)
    expect(outcome.result).toContain('Kilian, Anna')
    expect(outcome.changed).toEqual([{ id: pot.pot_id, page: { area: 'pot', potId: pot.pot_id } }])
    expect(outcome.changes).toHaveLength(1)
  })

  it('takes only the named household members', async () => {
    const { state, stores } = fakeStores()
    await run(stores, 'create_pot', { name: 'Kino', member_ids: ['anna'] })
    const pot = potNamed(state, 'Kino')!
    expect(state.participants.filter((p) => p.pot_id === pot.pot_id).map((p) => p.user_id)).toEqual(
      ['anna'],
    )
  })

  it('refuses a participant who is not a household member: guests come by Gastlink', async () => {
    const { state, stores } = fakeStores()
    const outcome = await run(stores, 'create_pot', { name: 'Kino', member_ids: ['tom'] })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('tom')
    expect(outcome.result).toContain('Gastlink')
    expect(potNamed(state, 'Kino')).toBeUndefined()
  })

  it('refuses an empty or too long name', async () => {
    const { state, stores } = fakeStores()
    expect((await run(stores, 'create_pot', { name: '  ' })).isError).toBe(true)
    expect((await run(stores, 'create_pot', { name: 'x'.repeat(101) })).isError).toBe(true)
    expect(state.pots).toHaveLength(2)
  })

  it('reports a failed write as an error', async () => {
    const { stores } = fakeStores({ fail: true })
    const outcome = await run(stores, 'create_pot', { name: 'Kino' })
    expect(outcome.isError).toBe(true)
    expect(outcome.summary).toBe('✗ Topf nicht angelegt: Kino')
  })

  it('can be taken back while the pot is still empty: the pot is gone again', async () => {
    const { state, stores } = fakeStores()
    const outcome = await run(stores, 'create_pot', { name: 'Kino' })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(potNamed(state, 'Kino')).toBeUndefined()
  })

  it('is not taken back once the pot holds an expense, a repayment or a Gastlink', async () => {
    for (const add of ['expense', 'repayment', 'guestLink'] as const) {
      const guestLinks: string[] = []
      const { state, stores } = fakeStores({ guestLinks })
      const outcome = await run(stores, 'create_pot', { name: 'Kino' })
      const potId = potNamed(state, 'Kino')!.pot_id
      if (add === 'expense') state.expenses.push({ pot_id: potId } as PotExpense)
      if (add === 'repayment') state.repayments.push({ pot_id: potId } as PotRepayment)
      if (add === 'guestLink') guestLinks.push(potId)
      expect(await outcome.changes![0]!.undo(), add).toBe(false)
      expect(potNamed(state, 'Kino'), add).toBeDefined()
    }
  })
})

describe('close_pot', () => {
  it('closes a pot for an occasion and leads to it', async () => {
    const { state, stores } = fakeStores()
    const outcome = await run(stores, 'close_pot', { pot_id: 'ski' })
    expect(potNamed(state, 'Skiurlaub')!.closed_at).not.toBeNull()
    expect(outcome.isError).toBeFalsy()
    expect(outcome.summary).toBe('✓ abgeschlossen: Topf Skiurlaub')
    expect(outcome.changed).toEqual([{ id: 'ski', page: { area: 'pot', potId: 'ski' } }])
  })

  it('tells Claude when money is still open, so the answer can say so', async () => {
    const { stores } = fakeStores({
      balances: new Map([
        ['p1', 500],
        ['p2', -500],
      ]),
    })
    const outcome = await run(stores, 'close_pot', { pot_id: 'ski' })
    expect(outcome.result).toContain('noch Geld offen')
    const settled = await run(fakeStores().stores, 'close_pot', { pot_id: 'ski' })
    expect(settled.result).not.toContain('offen')
  })

  it('can be taken back: the pot is open again', async () => {
    const { state, stores } = fakeStores()
    const outcome = await run(stores, 'close_pot', { pot_id: 'ski' })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(potNamed(state, 'Skiurlaub')!.closed_at).toBeNull()
  })

  it('never closes the Haushaltstopf', async () => {
    const { state, stores } = fakeStores()
    const outcome = await run(stores, 'close_pot', { pot_id: 'household' })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('Haushaltstopf')
    expect(state.pots[0]!.closed_at).toBeNull()
  })

  it('rejects an unknown pot and one that is already closed', async () => {
    const closed = { ...SKI, closed_at: '2026-11-20T10:00:00Z' }
    const { stores } = fakeStores({ pots: [HOUSEHOLD_POT, closed] })
    expect((await run(stores, 'close_pot', { pot_id: 'nope' })).result).toContain('nope')
    const again = await run(stores, 'close_pot', { pot_id: 'ski' })
    expect(again.isError).toBe(true)
    expect(again.result).toContain('schon abgeschlossen')
  })
})

describe('reopen_pot', () => {
  const closedAt = '2026-11-20T10:00:00Z'
  const closedSki = { ...SKI, closed_at: closedAt }

  it('opens a closed pot again', async () => {
    const { state, stores } = fakeStores({ pots: [HOUSEHOLD_POT, closedSki] })
    const outcome = await run(stores, 'reopen_pot', { pot_id: 'ski' })
    expect(potNamed(state, 'Skiurlaub')!.closed_at).toBeNull()
    expect(outcome.summary).toBe('✓ wieder geöffnet: Topf Skiurlaub')
  })

  it('can be taken back: the pot is closed again, with its old date', async () => {
    const { state, stores } = fakeStores({ pots: [HOUSEHOLD_POT, closedSki] })
    const outcome = await run(stores, 'reopen_pot', { pot_id: 'ski' })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(potNamed(state, 'Skiurlaub')!.closed_at).toBe(closedAt)
  })

  it('rejects a pot that is open, and the Haushaltstopf', async () => {
    const { stores } = fakeStores()
    expect((await run(stores, 'reopen_pot', { pot_id: 'ski' })).isError).toBe(true)
    expect((await run(stores, 'reopen_pot', { pot_id: 'household' })).isError).toBe(true)
  })
})

describe('delete_pot', () => {
  const people = [
    { pot_id: 'ski', user_id: 'me', name: 'Kilian' },
    { pot_id: 'ski', user_id: 'anna', name: 'Anna' },
    { pot_id: 'ski', user_id: null, name: 'Tom' },
  ] as Partial<PotParticipant>[]

  it('refuses a pot with expenses, repayments or a Gastlink and leads the app to it', async () => {
    const cases = {
      expense: { expenses: [{ pot_id: 'ski' }] },
      repayment: { repayments: [{ pot_id: 'ski' }] },
      guestLink: { guestLinks: ['ski'] },
    }
    for (const [what, setup] of Object.entries(cases)) {
      const { state, stores, shown } = fakeStores(setup)
      const outcome = await run(stores, 'delete_pot', { pot_id: 'ski' })
      expect(outcome.deleteCard, what).toBeUndefined()
      expect(outcome.result, what).toMatch(/von Hand/)
      expect(outcome.summary, what).toBe('→ Topf Skiurlaub')
      expect(shown, what).toEqual(['ski'])
      expect(potNamed(state, 'Skiurlaub'), what).toBeDefined()
    }
  })

  it('names what the pot holds when it refuses', async () => {
    const { stores } = fakeStores({
      expenses: [{ pot_id: 'ski' }, { pot_id: 'ski' }, { pot_id: 'other' }],
      repayments: [{ pot_id: 'ski' }],
      guestLinks: ['ski'],
    })
    const outcome = await run(stores, 'delete_pot', { pot_id: 'ski' })
    expect(outcome.result).toContain('2 Ausgaben, 1 Rückzahlung und einen Gastlink')
  })

  it('shows the card for an empty pot and deletes it only on confirm', async () => {
    const { state, stores } = fakeStores({ participants: people })
    const outcome = await run(stores, 'delete_pot', { pot_id: 'ski' })
    expect(outcome.deleteCard!.what).toBe('Topf „Skiurlaub“ (leer)')
    expect(potNamed(state, 'Skiurlaub')).toBeDefined()
    const confirmed = await outcome.deleteCard!.confirm()
    expect(potNamed(state, 'Skiurlaub')).toBeUndefined()
    expect(confirmed.isError).toBeFalsy()
    expect(confirmed.summary).toBe('✓ gelöscht: Topf „Skiurlaub“ (leer)')
    expect(confirmed.changes).toHaveLength(1)
  })

  it('can be taken back: the pot is there again with its name and participants', async () => {
    const { state, stores } = fakeStores({ participants: people })
    const outcome = await run(stores, 'delete_pot', { pot_id: 'ski' })
    const confirmed = await outcome.deleteCard!.confirm()
    expect(await confirmed.changes![0]!.undo()).toBe(true)
    const back = potNamed(state, 'Skiurlaub')!
    expect(back.closed_at).toBeNull()
    expect(state.participants.filter((p) => p.pot_id === back.pot_id)).toEqual([
      { pot_id: back.pot_id, user_id: 'me', name: 'me' },
      { pot_id: back.pot_id, user_id: 'anna', name: 'anna' },
      { pot_id: back.pot_id, user_id: null, name: 'Tom' },
    ])
  })

  it('brings a closed pot back closed, with its old date', async () => {
    const closedAt = '2026-11-20T10:00:00Z'
    const { state, stores } = fakeStores({
      pots: [HOUSEHOLD_POT, { ...SKI, closed_at: closedAt }],
      participants: people,
    })
    const outcome = await run(stores, 'delete_pot', { pot_id: 'ski' })
    const confirmed = await outcome.deleteCard!.confirm()
    expect(await confirmed.changes![0]!.undo()).toBe(true)
    expect(potNamed(state, 'Skiurlaub')!.closed_at).toBe(closedAt)
  })

  it('says on the card when the undo would bring an open pot back at the top of the list', async () => {
    const newer = { ...SKI, pot_id: 'party', name: 'Party', created_at: '2026-11-10T10:00:00Z' }
    const { stores } = fakeStores({ pots: [HOUSEHOLD_POT, SKI, newer] })
    const outcome = await run(stores, 'delete_pot', { pot_id: 'ski' })
    expect(outcome.deleteCard!.what).toBe(
      'Topf „Skiurlaub“ (leer); Rückgängig holt ihn als neuesten Topf oben zurück',
    )
  })

  it('reports a failed delete', async () => {
    const { stores } = fakeStores({ fail: true })
    const outcome = await run(stores, 'delete_pot', { pot_id: 'ski' })
    const confirmed = await outcome.deleteCard!.confirm()
    expect(confirmed.isError).toBe(true)
  })

  it('never deletes the Haushaltstopf, not even with a card', async () => {
    const { state, stores } = fakeStores()
    const outcome = await run(stores, 'delete_pot', { pot_id: 'household' })
    expect(outcome.isError).toBe(true)
    expect(outcome.deleteCard).toBeUndefined()
    expect(outcome.result).toContain('Haushaltstopf')
    expect(state.pots).toHaveLength(2)
  })

  it('rejects an unknown pot', async () => {
    const outcome = await run(fakeStores().stores, 'delete_pot', { pot_id: 'nope' })
    expect(outcome.isError).toBe(true)
    expect(outcome.deleteCard).toBeUndefined()
  })
})

describe('the pot tools', () => {
  it('offer nothing that touches a Gastlink or an Ausgleich', () => {
    for (const { name, description } of potTools(fakeStores().stores)) {
      expect(name).not.toMatch(/guest|share|settle/i)
      expect(description).not.toMatch(/ausgleich/i)
    }
  })
})
