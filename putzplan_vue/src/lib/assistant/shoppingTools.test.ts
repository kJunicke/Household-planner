import { describe, expect, it } from 'vitest'

import type { ListToolStores } from './listTools'
import { type ShoppingToolStore } from './shoppingTools'
import type { NotesToolStore } from './notesTools'
import type { TaskCompleteToolStore } from './taskCompleteTools'
import { assistantTools } from './tools'

type Item = ShoppingToolStore['items'][number]

/** A stand-in for the shopping store; `fail` makes every write report failure, as the real store does when logged out. */
const key = (name: string) => name.trim().toLowerCase()

function fakeStore(
  items: Partial<Item>[] = [],
  { fail = false, categories = [] as string[] } = {},
): ShoppingToolStore {
  const store = {
    lists: [{ list_id: 'l1', name: 'Einkauf' }],
    items: items.map((i) => ({ list_id: 'l1', purchased: false, quantity: 1, category: null, ...i })),
    categories: categories.map((name, n) => ({ category_id: `c${n}`, list_id: 'l1', name })),
    currentListId: null as string | null,
    // Wie der echte Store: die Kategorie hängt an der offenen Liste, ein bekannter Name behält seine Schreibweise.
    createCategory: async (name: string) => {
      if (fail || !store.currentListId) return null
      const row = store.categories.find(
        (c) => c.list_id === store.currentListId && key(c.name) === key(name),
      )
      if (row) return row.name
      store.categories.push({ category_id: `cat-${name}`, list_id: store.currentListId, name })
      return name
    },
    deleteCategory: async (name: string) => {
      store.categories = store.categories.filter(
        (c) => !(c.list_id === store.currentListId && key(c.name) === key(name)),
      )
      for (const i of store.items) {
        if (i.list_id === store.currentListId && key(i.category ?? '') === key(name)) i.category = null
      }
    },
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
        category: null,
      }
      store.items.push(item)
      return item
    },
    // Wie der echte Store: jeder Kauf zählt mit und trägt Zeit und Käufer ein.
    markPurchased: async (id: string) => {
      if (fail) return false
      const item = store.items.find((i) => i.shopping_item_id === id)!
      item.purchased = true
      item.times_purchased = (item.times_purchased ?? 0) + 1
      item.last_purchased_at = '2026-11-24T12:00:00Z'
      item.last_purchased_by = 'me'
      return true
    },
    setPurchaseState: async (id: string, state: Partial<Item>) => {
      if (fail) return false
      Object.assign(store.items.find((i) => i.shopping_item_id === id)!, state)
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
    restoreItem: async (item: Item) => {
      if (fail) return null
      const back = { ...item, shopping_item_id: `restored-${item.name}` }
      store.items.push(back)
      return back
    },
  }
  return store as unknown as ShoppingToolStore
}

const executeShoppingTool = (
  store: ShoppingToolStore,
  name: string,
  input: Record<string, unknown>,
) =>
  assistantTools({
    shopping: store,
    lists: {} as ListToolStores,
    notes: { notes: [] } as unknown as NotesToolStore,
    taskCompletion: {} as TaskCompleteToolStore,
    goToPage: () => {},
    currentUserId: () => 'me',
  }).execute(name, input)

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

  it('taking back a reopened item restores its purchase counter, date and buyer exactly', async () => {
    const bought = {
      shopping_item_id: 'i1',
      name: 'Eier',
      purchased: true,
      times_purchased: 4,
      last_purchased_at: '2026-11-01T09:00:00Z',
      last_purchased_by: 'anna',
    }
    const store = fakeStore([bought])
    const outcome = await executeShoppingTool(store, 'add_shopping_items', {
      list_id: 'l1',
      items: [{ name: 'Eier' }],
    })
    expect(await outcome.undo!()).toBe(true)
    expect(store.items).toMatchObject([bought])
  })

  it('reports each added item as its own change; taking back the middle one removes only that item', async () => {
    const store = fakeStore()
    const outcome = await executeShoppingTool(store, 'add_shopping_items', {
      list_id: 'l1',
      items: [{ name: 'Milch' }, { name: 'Eier' }, { name: 'Butter' }],
    })
    expect(outcome.changes!.map((c) => c.summary)).toEqual([
      '✓ Milch → Einkauf',
      '✓ Eier → Einkauf',
      '✓ Butter → Einkauf',
    ])
    expect(await outcome.changes![1]!.undo()).toBe(true)
    expect(store.items.map((i) => i.name)).toEqual(['Milch', 'Butter'])
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

describe('update_shopping_items', () => {
  it('renames an item and changes its quantity; taking it back restores both', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Tomate', quantity: 1 }])
    const outcome = await executeShoppingTool(store, 'update_shopping_items', {
      items: [{ item_id: 'i1', name: 'Cherrytomaten', quantity: 2 }],
    })
    expect(store.items).toMatchObject([{ name: 'Cherrytomaten', quantity: 2 }])
    expect(outcome.summary).toBe('✓ geändert: Tomate → „Cherrytomaten“, ×2')
    expect(outcome.changed).toEqual([{ id: 'i1', page: { area: 'shopping', listId: 'l1' } }])
    expect(await outcome.undo!()).toBe(true)
    expect(store.items).toMatchObject([{ name: 'Tomate', quantity: 1 }])
  })

  it('files an item under an existing category in its spelling; taking it back restores the old one', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Milch' }], { categories: ['Kühlregal'] })
    const outcome = await executeShoppingTool(store, 'update_shopping_items', {
      items: [{ item_id: 'i1', category: 'kühlregal' }],
    })
    expect(store.items[0]!.category).toBe('Kühlregal')
    expect(outcome.changes).toHaveLength(1)
    expect(await outcome.undo!()).toBe(true)
    expect(store.items[0]!.category).toBeNull()
    expect(store.categories.map((c) => c.name)).toEqual(['Kühlregal'])
  })

  it('creates a missing category as its own change; taking all back removes it again', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Apfel' }])
    const outcome = await executeShoppingTool(store, 'update_shopping_items', {
      items: [{ item_id: 'i1', category: 'Obst' }],
    })
    expect(store.items[0]!.category).toBe('Obst')
    expect(outcome.changes!.map((c) => c.summary)).toEqual([
      '✓ neue Kategorie: Obst (Einkauf)',
      '✓ geändert: Apfel → Kategorie Obst',
    ])
    expect(await outcome.undo!()).toBe(true)
    expect(store.items[0]!.category).toBeNull()
    expect(store.categories).toEqual([])
  })

  it('takes an item out of its category with an empty category', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Milch', category: 'Kühlregal' }], {
      categories: ['Kühlregal'],
    })
    await executeShoppingTool(store, 'update_shopping_items', {
      items: [{ item_id: 'i1', category: '' }],
    })
    expect(store.items[0]!.category).toBeNull()
  })

  it('rejects an unknown item id and changes nothing', async () => {
    const store = fakeStore([{ shopping_item_id: 'i1', name: 'Milch' }])
    const outcome = await executeShoppingTool(store, 'update_shopping_items', {
      items: [{ item_id: 'erfunden', name: 'Hafermilch' }],
    })
    expect(outcome.isError).toBe(true)
    expect(store.items[0]!.name).toBe('Milch')
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

  it('taking a check-off back restores the purchase counter, date and buyer of before', async () => {
    const open = {
      shopping_item_id: 'i1',
      name: 'Brot',
      purchased: false,
      times_purchased: 2,
      last_purchased_at: '2026-10-01T09:00:00Z',
      last_purchased_by: 'anna',
    }
    const store = fakeStore([open])
    const outcome = await executeShoppingTool(store, 'mark_shopping_items_purchased', {
      item_ids: ['i1'],
    })
    expect(store.items[0]!.times_purchased).toBe(3)
    expect(await outcome.undo!()).toBe(true)
    expect(store.items).toMatchObject([open])
  })

  it('reports each checked-off item as its own change; taking one back reopens only that item', async () => {
    const store = fakeStore([
      { shopping_item_id: 'i1', name: 'Brot' },
      { shopping_item_id: 'i2', name: 'Käse' },
    ])
    const outcome = await executeShoppingTool(store, 'mark_shopping_items_purchased', {
      item_ids: ['i1', 'i2'],
    })
    expect(outcome.changes!.map((c) => c.summary)).toEqual(['✓ abgehakt: Brot', '✓ abgehakt: Käse'])
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(store.items).toMatchObject([
      { name: 'Brot', purchased: false },
      { name: 'Käse', purchased: true },
    ])
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

describe('delete_shopping_items', () => {
  const sugar = {
    shopping_item_id: 'z1',
    name: 'Zucker',
    quantity: 2,
    category: 'Backen',
    is_priority: true,
  }

  it('deletes nothing itself but lays a card naming the item and its list', async () => {
    const store = fakeStore([sugar])
    const outcome = await executeShoppingTool(store, 'delete_shopping_items', { item_ids: ['z1'] })
    expect(outcome.deleteCard!.what).toBe('2× Zucker (Einkauf)')
    expect(store.items.map((i) => i.name)).toEqual(['Zucker'])
    expect(outcome.changes).toBeUndefined()
  })

  it('deletes once the card is confirmed, and tells Claude and the user', async () => {
    const store = fakeStore([sugar, { shopping_item_id: 'm1', name: 'Mehl' }])
    const card = (await executeShoppingTool(store, 'delete_shopping_items', { item_ids: ['z1'] }))
      .deleteCard!
    const outcome = await card.confirm()
    expect(store.items.map((i) => i.name)).toEqual(['Mehl'])
    expect(outcome.isError).toBeFalsy()
    expect(outcome.result).toContain('Zucker')
    expect(outcome.summary).toBe('✓ gelöscht: 2× Zucker (Einkauf)')
  })

  it('can be taken back: the item returns with name, quantity, category and state', async () => {
    const store = fakeStore([{ ...sugar, purchased: true }])
    const card = (await executeShoppingTool(store, 'delete_shopping_items', { item_ids: ['z1'] }))
      .deleteCard!
    const outcome = await card.confirm()
    expect(outcome.changes).toHaveLength(1)
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(store.items).toMatchObject([
      {
        name: 'Zucker',
        quantity: 2,
        category: 'Backen',
        purchased: true,
        is_priority: true,
        list_id: 'l1',
      },
    ])
  })

  it('names every item on one card when several go at once', async () => {
    const store = fakeStore([sugar, { shopping_item_id: 'm1', name: 'Mehl' }])
    const outcome = await executeShoppingTool(store, 'delete_shopping_items', {
      item_ids: ['z1', 'm1'],
    })
    expect(outcome.deleteCard!.what).toBe('2× Zucker, Mehl (Einkauf)')
    const done = await outcome.deleteCard!.confirm()
    expect(store.items).toEqual([])
    expect(done.changes!.map((c) => c.summary)).toEqual([
      '✓ gelöscht: 2× Zucker (Einkauf)',
      '✓ gelöscht: Mehl (Einkauf)',
    ])
  })

  it('rejects an unknown id without a card', async () => {
    const store = fakeStore([sugar])
    const outcome = await executeShoppingTool(store, 'delete_shopping_items', {
      item_ids: ['erfunden'],
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('erfunden')
    expect(outcome.deleteCard).toBeUndefined()
  })
})
