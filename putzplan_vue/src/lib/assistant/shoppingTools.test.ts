import { describe, expect, it } from 'vitest'

import { type ShoppingToolStore } from './shoppingTools'
import { assistantTools } from './tools'

type Item = ShoppingToolStore['items'][number]

/** A stand-in for the shopping store; `fail` makes every write report failure, as the real store does when logged out. */
function fakeStore(items: Partial<Item>[] = [], { fail = false } = {}): ShoppingToolStore {
  const store = {
    lists: [{ list_id: 'l1', name: 'Einkauf' }],
    items: items.map((i) => ({ list_id: 'l1', purchased: false, quantity: 1, ...i })),
    loadLists: async () => {},
    loadItems: async () => {},
    suggestCategoryFor: () => null,
    createItem: async ({
      name,
      quantity,
      listId,
    }: {
      name: string
      quantity: number
      listId: string
    }) => {
      if (fail) return null
      const item = {
        shopping_item_id: `new-${name}`,
        name,
        quantity,
        list_id: listId,
        purchased: false,
      }
      store.items.push(item)
      return item
    },
    markPurchased: async (id: string) => {
      if (fail) return false
      const item = store.items.find((i) => i.shopping_item_id === id)!
      item.purchased = true
      return true
    },
    markUnpurchased: async (id: string) => {
      store.items.find((i) => i.shopping_item_id === id)!.purchased = false
      return true
    },
    updateItem: async (id: string, patch: Partial<Item>) => {
      Object.assign(store.items.find((i) => i.shopping_item_id === id)!, patch)
      return true
    },
    deleteItem: async (id: string) => {
      if (fail) return false
      store.items = store.items.filter((i) => i.shopping_item_id !== id)
      return true
    },
  }
  return store as unknown as ShoppingToolStore
}

const executeShoppingTool = (
  store: ShoppingToolStore,
  name: string,
  input: Record<string, unknown>,
) => assistantTools({ shopping: store, goToPage: () => {} }).execute(name, input)

describe('add_shopping_items', () => {
  it('puts a new item on the list and tells Claude and the user', async () => {
    const store = fakeStore()
    const outcome = await executeShoppingTool(store, 'add_shopping_items', {
      list_id: 'l1',
      items: [{ name: 'Milch' }],
    })
    expect(store.items.map((i) => i.name)).toEqual(['Milch'])
    expect(outcome.isError).toBeFalsy()
    expect(outcome.summary).toBe('✓ Milch → Einkauf')
  })

  it('can be taken back: the new item is gone again', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Brot' }])
    const outcome = await executeShoppingTool(store, 'add_shopping_items', {
      list_id: 'l1',
      items: [{ name: 'Milch' }],
    })
    expect(outcome.changed).toEqual([{ id: 'new-Milch', page: { area: 'shopping', listId: 'l1' } }])
    expect(await outcome.undo!()).toBe(true)
    expect(store.items.map((i) => i.name)).toEqual(['Brot'])
  })

  it('reopens a bought item, and taking it back makes it bought again with its old quantity', async () => {
    const store = fakeStore([
      { shopping_item_id: 'i1', name: 'Eier', purchased: true, quantity: 1 },
    ])
    const outcome = await executeShoppingTool(store, 'add_shopping_items', {
      list_id: 'l1',
      items: [{ name: 'eier', quantity: 2 }],
    })
    expect(store.items).toMatchObject([{ name: 'Eier', purchased: false, quantity: 2 }])
    expect(outcome.summary).toBe('✓ 2× eier → Einkauf')
    expect(outcome.changed).toEqual([{ id: 'i1', page: { area: 'shopping', listId: 'l1' } }])

    expect(await outcome.undo!()).toBe(true)
    expect(store.items).toMatchObject([{ name: 'Eier', purchased: true, quantity: 1 }])
  })

  it('offers nothing to take back when the item already stood on the list', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Brot' }])
    const outcome = await executeShoppingTool(store, 'add_shopping_items', {
      list_id: 'l1',
      items: [{ name: 'Brot' }],
    })
    expect(outcome.result).toContain('stand schon drauf')
    expect(outcome.undo).toBeUndefined()
  })

  it('reports an item the store refused as an error, not as done', async () => {
    const outcome = await executeShoppingTool(fakeStore([], { fail: true }), 'add_shopping_items', {
      list_id: 'l1',
      items: [{ name: 'Milch' }],
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('Milch')
    expect(outcome.summary ?? '').not.toContain('✓')
  })

  it('rejects an unknown list id', async () => {
    const outcome = await executeShoppingTool(fakeStore(), 'add_shopping_items', {
      list_id: 'nope',
      items: [{ name: 'Milch' }],
    })
    expect(outcome.isError).toBe(true)
  })
})

describe('mark_shopping_items_purchased', () => {
  it('checks off an open item', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Brot' }])
    const outcome = await executeShoppingTool(store, 'mark_shopping_items_purchased', {
      item_ids: ['i1'],
    })
    expect(store.items[0]!.purchased).toBe(true)
    expect(outcome.summary).toBe('✓ abgehakt: Brot')
  })

  it('can be taken back: the item is open again', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Brot' }])
    const outcome = await executeShoppingTool(store, 'mark_shopping_items_purchased', {
      item_ids: ['i1'],
    })
    expect(outcome.changed).toEqual([{ id: 'i1', page: { area: 'shopping', listId: 'l1' } }])
    expect(await outcome.undo!()).toBe(true)
    expect(store.items[0]!.purchased).toBe(false)
  })

  it('rejects an id that is not an open item and changes nothing', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Brot' }])
    const outcome = await executeShoppingTool(store, 'mark_shopping_items_purchased', {
      item_ids: ['erfunden'],
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('erfunden')
    expect(outcome.undo).toBeUndefined()
    expect(store.items[0]!.purchased).toBe(false)
  })

  it('reports an item the store refused as an error, not as checked off', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Brot' }], { fail: true })
    const outcome = await executeShoppingTool(store, 'mark_shopping_items_purchased', {
      item_ids: ['i1'],
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.summary ?? '').not.toContain('✓')
  })
})

describe('read_shopping_list', () => {
  it('shows the open and the bought items of a list with their ids, and changes nothing', async () => {
    const store = fakeStore([
      { shopping_item_id: 'i1', name: 'Brot', quantity: 2 },
      { shopping_item_id: 'i2', name: 'Eier', purchased: true },
    ])
    const outcome = await executeShoppingTool(store, 'read_shopping_list', { list_id: 'l1' })
    expect(outcome.isError).toBeFalsy()
    expect(outcome.result).toContain('Offen:\n- Brot ×2 (id i1)')
    expect(outcome.result).toContain('- Eier ×1 (id i2)')
    expect(outcome.summary).toBeUndefined()
    expect(outcome.undo).toBeUndefined()
  })

  it('says when nothing is open', async () => {
    const outcome = await executeShoppingTool(fakeStore(), 'read_shopping_list', { list_id: 'l1' })
    expect(outcome.result).toContain('Offen: nichts')
  })

  it('shows only the most recently bought items of a long history, and how many there are', async () => {
    const bought = Array.from({ length: 45 }, (_, n) => ({
      shopping_item_id: `b${n}`,
      name: `Artikel ${n}`,
      purchased: true,
      last_purchased_at: `2026-11-${String((n % 28) + 1).padStart(2, '0')}T10:00:00Z`,
    }))
    const outcome = await executeShoppingTool(fakeStore(bought), 'read_shopping_list', {
      list_id: 'l1',
    })
    // Artikel 27 ist am 28. gekauft, als einziger und zuletzt.
    expect(outcome.result).toContain('Gekauft (die letzten 30 von 45):\n- Artikel 27 ×1 (id b27)')
    expect(outcome.result.match(/^- /gm)).toHaveLength(30)
  })

  it('rejects an unknown list id', async () => {
    const outcome = await executeShoppingTool(fakeStore(), 'read_shopping_list', { list_id: 'x' })
    expect(outcome.isError).toBe(true)
  })
})
