import { describe, expect, it } from 'vitest'

import { executeShoppingTool, type ShoppingToolStore } from './shoppingTools'

type Item = ShoppingToolStore['items'][number]

/** A stand-in for the shopping store; `fail` makes every write report failure, as the real store does when logged out. */
function fakeStore(items: Partial<Item>[] = [], { fail = false } = {}): ShoppingToolStore {
  const store = {
    lists: [{ list_id: 'l1', name: 'Einkauf' }],
    items: items.map((i) => ({ list_id: 'l1', purchased: false, quantity: 1, ...i })),
    loadLists: async () => {},
    loadItems: async () => {},
    suggestCategoryFor: () => null,
    createItem: async (
      name: string,
      _category: string | null,
      quantity: number,
      listId: string,
    ) => {
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
    markUnpurchased: async () => true,
    updateItem: async () => true,
  }
  return store as unknown as ShoppingToolStore
}

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

  it('reports an item the store refused as an error, not as checked off', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Brot' }], { fail: true })
    const outcome = await executeShoppingTool(store, 'mark_shopping_items_purchased', {
      item_ids: ['i1'],
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.summary ?? '').not.toContain('✓')
  })
})
