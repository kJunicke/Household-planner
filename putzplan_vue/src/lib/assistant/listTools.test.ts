import { describe, expect, it } from 'vitest'

import type { ChecklistItem, ChecklistList } from '@/types/Checklist'
import type { CategoryRow } from '@/types/CategoryRow'
import type { ListToolStores, ChecklistToolStore } from './listTools'
import type { ShoppingToolStore } from './shoppingTools'
import type { NotesToolStore } from './notesTools'
import type { TaskToolStores } from './taskTools'
import type { ExpenseToolStores } from './expenseTools'
import { assistantTools } from './tools'

const key = (name: string) => name.trim().toLowerCase()

/**
 * A stand-in for a checklist store (Packliste or To-do) that behaves like the
 * real one where the tools can tell: writes that need a list go to
 * `currentListId`, categories couple by name. `fail` makes every write fail.
 */
function fakeChecklist(
  seed: {
    lists?: Partial<ChecklistList>[]
    items?: Partial<ChecklistItem>[]
    categories?: Partial<CategoryRow>[]
  } = {},
  { fail = false } = {},
) {
  const store = {
    lists: (seed.lists ?? []).map((l) => ({ notes: null, ...l }) as ChecklistList),
    items: (seed.items ?? []).map(
      (i) =>
        ({
          category: null,
          quantity: 1,
          packed: false,
          packed_count: 0,
          created_at: '2026-11-01T00:00:00Z',
          ...i,
        }) as ChecklistItem,
    ),
    categories: (seed.categories ?? []).map(
      (c, n) => ({ category_id: `c${n}`, sort_order: n, ...c }) as CategoryRow,
    ),
    currentListId: null as string | null,
    loadLists: async () => {},
    loadItems: async () => {},
    loadCategories: async () => {},
    suggestCategoryFor: () => null,
    createList: async (name: string) => {
      if (fail) return null
      const list = { list_id: `new-${name}`, name, notes: null } as ChecklistList
      store.lists.push(list)
      store.currentListId = list.list_id
      return list
    },
    renameList: async (listId: string, name: string) => {
      if (fail) return false
      store.lists.find((l) => l.list_id === listId)!.name = name
      return true
    },
    updateNotes: async (listId: string, notes: string) => {
      if (fail) return false
      store.lists.find((l) => l.list_id === listId)!.notes = notes.trim() || null
      return true
    },
    deleteList: async (listId: string) => {
      if (fail) return false
      store.lists = store.lists.filter((l) => l.list_id !== listId)
      store.items = store.items.filter((i) => i.list_id !== listId)
      store.categories = store.categories.filter((c) => c.list_id !== listId)
      return true
    },
    addItem: async (name: string, category: string | null = null, quantity = 1) => {
      if (fail || !store.currentListId) return null
      const item = {
        item_id: `new-${name}`,
        list_id: store.currentListId,
        name,
        category,
        quantity,
        packed: false,
        packed_count: 0,
      } as ChecklistItem
      store.items.push(item)
      return item
    },
    // Wie der echte Store: weniger Menge kürzt den gepackten Stand mit.
    updateItem: async (itemId: string, patch: Partial<ChecklistItem>) => {
      if (fail) return false
      const item = store.items.find((i) => i.item_id === itemId)!
      Object.assign(item, patch)
      if (item.packed_count > item.quantity) item.packed_count = item.quantity
      return true
    },
    setItemState: async (itemId: string, state: Partial<ChecklistItem>) => {
      if (fail) return false
      const item = store.items.find((i) => i.item_id === itemId)
      if (!item) return false
      Object.assign(item, state)
      return true
    },
    togglePacked: async (itemId: string) => {
      if (fail) return false
      const item = store.items.find((i) => i.item_id === itemId)!
      item.packed = !item.packed
      return true
    },
    removeItem: async (itemId: string) => {
      if (fail) return false
      store.items = store.items.filter((i) => i.item_id !== itemId)
      return true
    },
    copyList: async (sourceId: string, name: string) => {
      if (fail) return null
      const list = { list_id: `copy-${name}`, name, notes: null } as ChecklistList
      store.lists.push(list)
      for (const i of store.items.filter((i) => i.list_id === sourceId)) {
        store.items.push({ ...i, item_id: `copy-${i.item_id}`, list_id: list.list_id, packed: false, packed_count: 0 })
      }
      store.currentListId = list.list_id
      return list
    },
    resetAllUnpacked: async (listId: string) => {
      if (fail) return false
      for (const i of store.items) {
        if (i.list_id === listId) Object.assign(i, { packed: false, packed_count: 0 })
      }
      return true
    },
    restore: async (snapshot: {
      list?: ChecklistList
      categories?: CategoryRow[]
      items?: ChecklistItem[]
    }) => {
      if (fail) return false
      if (snapshot.list) store.lists.push(snapshot.list)
      store.categories.push(...(snapshot.categories ?? []))
      store.items.push(...(snapshot.items ?? []))
      return true
    },
    createCategory: async (name: string) => {
      if (fail || !store.currentListId) return null
      const row = store.categories.find(
        (c) => c.list_id === store.currentListId && key(c.name) === key(name),
      )
      if (row) return row.name
      store.categories.push({
        category_id: `cat-${name}`,
        list_id: store.currentListId,
        name: name.trim(),
        sort_order: store.categories.length,
      } as CategoryRow)
      return name.trim()
    },
    renameCategory: async (oldName: string, newName: string) => {
      const inList = store.categories.filter((c) => c.list_id === store.currentListId)
      const row = inList.find((c) => key(c.name) === key(oldName))
      const conflict = inList.find((c) => key(c.name) === key(newName) && c !== row)
      const target = conflict ? conflict.name : newName
      if (conflict) store.categories = store.categories.filter((c) => c !== row)
      else if (row) row.name = newName
      for (const i of store.items) {
        if (i.list_id === store.currentListId && key(i.category ?? '') === key(oldName))
          i.category = target
      }
    },
    deleteCategory: async (name: string, opts: { withItems?: boolean } = {}) => {
      store.categories = store.categories.filter(
        (c) => !(c.list_id === store.currentListId && key(c.name) === key(name)),
      )
      const inIt = (i: ChecklistItem) =>
        i.list_id === store.currentListId && key(i.category ?? '') === key(name)
      if (opts.withItems) store.items = store.items.filter((i) => !inIt(i))
      else for (const i of store.items) if (inIt(i)) i.category = null
    },
    moveItemToCategory: async (itemId: string, category: string | null) => {
      store.items.find((i) => i.item_id === itemId)!.category = category
    },
  }
  return store
}

type FakeChecklist = ReturnType<typeof fakeChecklist>

type Row = Record<string, unknown> & { list_id: string }

function fakeShopping() {
  const store = {
    lists: [{ list_id: 's1', name: 'Einkauf' }] as { list_id: string; name: string }[],
    items: [
      { shopping_item_id: 'si1', list_id: 's1', name: 'Milch', purchased: false },
      { shopping_item_id: 'si2', list_id: 's1', name: 'Brot', purchased: true, times_purchased: 7 },
    ] as Row[],
    categories: [{ category_id: 'sc1', list_id: 's1', name: 'Kühlregal' }] as Row[],
    currentListId: 's1' as string | null,
    createList: async (name: string) => {
      const list = { list_id: `new-${name}`, name }
      store.lists.push(list)
      store.currentListId = list.list_id
      return list
    },
    renameList: async (listId: string, name: string) => {
      store.lists.find((l) => l.list_id === listId)!.name = name
      return true
    },
    deleteList: async (listId: string) => {
      store.lists = store.lists.filter((l) => l.list_id !== listId)
      store.items = store.items.filter((i) => i.list_id !== listId)
      store.categories = store.categories.filter((c) => c.list_id !== listId)
      return true
    },
    restoreList: async (snapshot: {
      list: { list_id: string; name: string }
      categories: Row[]
      items: Row[]
    }) => {
      store.lists.push(snapshot.list)
      store.categories.push(...snapshot.categories)
      store.items.push(...snapshot.items)
      return true
    },
  }
  return store
}

/** Eine To-do-Liste „Putztag“ und eine Packliste „Urlaub“, ohne Einträge, wenn nicht anders angegeben. */
function setup(
  todoSeed: Parameters<typeof fakeChecklist>[0] = {},
  packingSeed: Parameters<typeof fakeChecklist>[0] = {},
  opts: { fail?: boolean; sharedListIds?: string[] } = {},
) {
  const todo = fakeChecklist({ lists: [{ list_id: 't1', name: 'Putztag' }], ...todoSeed }, opts)
  const packing = fakeChecklist(
    { lists: [{ list_id: 'p1', name: 'Urlaub' }], ...packingSeed },
    opts,
  )
  const shopping = fakeShopping()
  // Wie der echte Store: Gastlinks kennt er erst, wenn er geladen hat.
  const guestLinks = {
    shares: [] as { target_id: string }[],
    load: async () => {
      guestLinks.shares = (opts.sharedListIds ?? []).map((target_id) => ({ target_id }))
    },
  }
  const stores = {
    shopping,
    packing,
    todo,
    guestLinks,
  } as unknown as ListToolStores
  const registry = assistantTools({
    shopping: { lists: [], items: [] } as unknown as ShoppingToolStore,
    lists: stores,
    notes: { notes: [] } as unknown as NotesToolStore,
    tasks: {} as TaskToolStores,
    expenses: {} as ExpenseToolStores,
    goToPage: () => {},
    currentUserId: () => 'me',
  })
  return { todo, packing, shopping, run: registry.execute }
}

const names = (store: FakeChecklist | ChecklistToolStore) => store.items.map((i) => i.name)

describe('read_checklist', () => {
  it('shows the open and the done entries of a list with ids, categories and the list note, and changes nothing', async () => {
    const { run } = setup({
      lists: [{ list_id: 't1', name: 'Putztag', notes: 'Schlüssel holen' }],
      items: [
        { item_id: 'e1', list_id: 't1', name: 'Fenster putzen', category: 'Küche' },
        { item_id: 'e2', list_id: 't1', name: 'Müll raus', packed: true },
        { item_id: 'e3', list_id: 't1', name: 'Tüten', quantity: 3, packed_count: 1 },
      ],
      categories: [{ list_id: 't1', name: 'Küche' }],
    })
    const outcome = await run('read_checklist', { list_id: 't1' })
    expect(outcome.isError).toBeFalsy()
    expect(outcome.result).toContain('To-do-Liste „Putztag“ (id t1)')
    expect(outcome.result).toContain('Notiz zur Liste: Schlüssel holen')
    expect(outcome.result).toContain('Kategorien: Küche')
    expect(outcome.result).toContain(
      'Offen:\n- Fenster putzen [Küche] (id e1)\n- Tüten 1/3 (id e3)',
    )
    expect(outcome.result).toContain('Erledigt:\n- Müll raus (id e2)')
    expect(outcome.summary).toBeUndefined()
    expect(outcome.undo).toBeUndefined()
  })

  it('reads a Packliste too', async () => {
    const { run } = setup({}, { items: [{ item_id: 'g1', list_id: 'p1', name: 'Zahnbürste' }] })
    const outcome = await run('read_checklist', { list_id: 'p1' })
    expect(outcome.result).toContain('Packliste „Urlaub“')
    expect(outcome.result).toContain('- Zahnbürste (id g1)')
  })

  it('rejects an unknown list id', async () => {
    const outcome = await setup().run('read_checklist', { list_id: 'nope' })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('nope')
  })
})

describe('add_checklist_entries', () => {
  it('puts new entries on the list and tells Claude and the user, one change each', async () => {
    const { todo, run } = setup()
    const outcome = await run('add_checklist_entries', {
      list_id: 't1',
      entries: [{ name: 'Fenster putzen' }, { name: 'Tüten', quantity: 3 }],
    })
    expect(todo.items).toMatchObject([
      { name: 'Fenster putzen', list_id: 't1', quantity: 1 },
      { name: 'Tüten', list_id: 't1', quantity: 3 },
    ])
    expect(outcome.isError).toBeFalsy()
    expect(outcome.result).toContain('Putztag')
    expect(outcome.changes!.map((c) => c.summary)).toEqual([
      '✓ Fenster putzen → Putztag',
      '✓ 3× Tüten → Putztag',
    ])
    expect(outcome.changed).toEqual([
      { id: 'new-Fenster putzen', page: { area: 'todo', listId: 't1' } },
      { id: 'new-Tüten', page: { area: 'todo', listId: 't1' } },
    ])
  })

  it('can be taken back entry by entry', async () => {
    const { todo, run } = setup()
    const outcome = await run('add_checklist_entries', {
      list_id: 't1',
      entries: [{ name: 'A' }, { name: 'B' }],
    })
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(names(todo)).toEqual(['B'])
    expect(await outcome.undo!()).toBe(true)
    expect(names(todo)).toEqual([])
  })

  it('files an entry under an existing category in its spelling', async () => {
    const { packing, run } = setup({}, { categories: [{ list_id: 'p1', name: 'Bad' }] })
    const outcome = await run('add_checklist_entries', {
      list_id: 'p1',
      entries: [{ name: 'Zahnbürste', category: 'bad' }],
    })
    expect(packing.items).toMatchObject([{ name: 'Zahnbürste', category: 'Bad' }])
    expect(outcome.changes).toHaveLength(1)
  })

  it('creates a missing category as its own change; taking that back leaves the entry uncategorised', async () => {
    const { packing, run } = setup()
    const outcome = await run('add_checklist_entries', {
      list_id: 'p1',
      entries: [{ name: 'Zahnbürste', category: 'Bad' }],
    })
    expect(packing.categories.map((c) => c.name)).toEqual(['Bad'])
    expect(outcome.changes!.map((c) => c.summary)).toEqual([
      '✓ neue Kategorie: Bad (Urlaub)',
      '✓ Zahnbürste → Urlaub',
    ])
    expect(outcome.changed!.map((c) => c.id)).toEqual(['category:bad', 'new-Zahnbürste'])
    expect(await outcome.undo!()).toBe(true)
    expect(packing.items).toEqual([])
    expect(packing.categories).toEqual([])
  })

  it('leaves an entry that is already open on the list alone', async () => {
    const { todo, run } = setup({ items: [{ item_id: 'e1', list_id: 't1', name: 'Müll raus' }] })
    const outcome = await run('add_checklist_entries', {
      list_id: 't1',
      entries: [{ name: 'müll raus' }],
    })
    expect(names(todo)).toEqual(['Müll raus'])
    expect(outcome.result).toContain('stand schon drauf')
    expect(outcome.undo).toBeUndefined()
  })

  it('reports an entry the store refused as an error, not as done', async () => {
    const { run } = setup({}, {}, { fail: true })
    const outcome = await run('add_checklist_entries', {
      list_id: 't1',
      entries: [{ name: 'A' }],
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.summary ?? '').not.toContain('✓')
  })

  it('rejects an unknown list id', async () => {
    const outcome = await setup().run('add_checklist_entries', {
      list_id: 'nope',
      entries: [{ name: 'A' }],
    })
    expect(outcome.isError).toBe(true)
  })
})

describe('update_checklist_entries', () => {
  const seed = {
    items: [{ item_id: 'g1', list_id: 'p1', name: 'Zahnbürste', quantity: 1 }],
    categories: [{ list_id: 'p1', name: 'Bad' }],
  }

  it('renames, re-counts and files an entry into a category, and taking it back restores all three', async () => {
    const { packing, run } = setup({}, seed)
    const outcome = await run('update_checklist_entries', {
      entries: [{ entry_id: 'g1', name: 'Zahnbürsten', quantity: 2, category: 'bad' }],
    })
    expect(packing.items).toMatchObject([{ name: 'Zahnbürsten', quantity: 2, category: 'Bad' }])
    expect(outcome.changes!.map((c) => c.summary)).toEqual([
      '✓ geändert: Zahnbürste → „Zahnbürsten“, ×2, Kategorie Bad',
    ])
    expect(outcome.changed).toEqual([{ id: 'g1', page: { area: 'packing', listId: 'p1' } }])
    expect(await outcome.undo!()).toBe(true)
    expect(packing.items).toMatchObject([{ name: 'Zahnbürste', quantity: 1, category: null }])
  })

  it('lowering the quantity cuts the packed count; taking it back restores both', async () => {
    const { packing, run } = setup(
      {},
      {
        items: [
          { item_id: 'g1', list_id: 'p1', name: 'Socken', quantity: 3, packed_count: 3, packed: true },
        ],
      },
    )
    const outcome = await run('update_checklist_entries', {
      entries: [{ entry_id: 'g1', quantity: 1 }],
    })
    expect(packing.items).toMatchObject([{ quantity: 1, packed_count: 1 }])
    expect(await outcome.undo!()).toBe(true)
    expect(packing.items).toMatchObject([{ quantity: 3, packed_count: 3, packed: true }])
  })

  it('takes an entry out of its category with an empty category', async () => {
    const { packing, run } = setup(
      {},
      { ...seed, items: [{ item_id: 'g1', list_id: 'p1', name: 'Seife', category: 'Bad' }] },
    )
    const outcome = await run('update_checklist_entries', {
      entries: [{ entry_id: 'g1', category: '' }],
    })
    expect(packing.items[0]!.category).toBeNull()
    expect(outcome.summary).toBe('✓ geändert: Seife → ohne Kategorie')
  })

  it('rejects an unknown entry id and changes nothing', async () => {
    const { packing, run } = setup({}, seed)
    const outcome = await run('update_checklist_entries', {
      entries: [{ entry_id: 'erfunden', name: 'X' }],
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('erfunden')
    expect(names(packing)).toEqual(['Zahnbürste'])
  })
})

describe('check_checklist_entries', () => {
  const seed = {
    items: [
      { item_id: 'e1', list_id: 't1', name: 'Fenster putzen' },
      { item_id: 'e2', list_id: 't1', name: 'Müll raus', packed: true },
    ],
  }

  it('checks off an open entry; taking it back opens it again', async () => {
    const { todo, run } = setup(seed)
    const outcome = await run('check_checklist_entries', { entry_ids: ['e1'] })
    expect(todo.items[0]!.packed).toBe(true)
    expect(outcome.summary).toBe('✓ abgehakt: Fenster putzen')
    expect(outcome.changed).toEqual([{ id: 'e1', page: { area: 'todo', listId: 't1' } }])
    expect(await outcome.undo!()).toBe(true)
    expect(todo.items[0]!.packed).toBe(false)
  })

  it('opens a done entry again with done: false', async () => {
    const { todo, run } = setup(seed)
    const outcome = await run('check_checklist_entries', { entry_ids: ['e2'], done: false })
    expect(todo.items[1]!.packed).toBe(false)
    expect(outcome.summary).toBe('✓ wieder offen: Müll raus')
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(todo.items[1]!.packed).toBe(true)
  })

  it('leaves an entry that is already in that state alone', async () => {
    const { run } = setup(seed)
    const outcome = await run('check_checklist_entries', { entry_ids: ['e2'] })
    expect(outcome.result).toContain('schon')
    expect(outcome.undo).toBeUndefined()
  })

  it('rejects an unknown entry id', async () => {
    const outcome = await setup(seed).run('check_checklist_entries', { entry_ids: ['x'] })
    expect(outcome.isError).toBe(true)
    expect(outcome.result).toContain('x')
  })

  it('reports an entry the store refused as an error', async () => {
    const outcome = await setup(seed, {}, { fail: true }).run('check_checklist_entries', {
      entry_ids: ['e1'],
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.summary ?? '').not.toContain('✓')
  })
})

describe('delete_checklist_entries', () => {
  const seed = {
    items: [
      { item_id: 'e1', list_id: 't1', name: 'Fenster putzen', category: 'Küche', packed: true },
      { item_id: 'e2', list_id: 't1', name: 'Müll raus' },
    ],
  }

  it('deletes nothing itself but lays a card naming the entries and their list', async () => {
    const { todo, run } = setup(seed)
    const outcome = await run('delete_checklist_entries', { entry_ids: ['e1', 'e2'] })
    expect(outcome.deleteCard!.what).toBe('Fenster putzen, Müll raus (Putztag)')
    expect(names(todo)).toEqual(['Fenster putzen', 'Müll raus'])
  })

  it('deletes once confirmed; taking it back returns the entry with the same id and state', async () => {
    const { todo, run } = setup(seed)
    const card = (await run('delete_checklist_entries', { entry_ids: ['e1'] })).deleteCard!
    const outcome = await card.confirm()
    expect(names(todo)).toEqual(['Müll raus'])
    expect(outcome.summary).toBe('✓ gelöscht: Fenster putzen (Putztag)')
    expect(await outcome.changes![0]!.undo()).toBe(true)
    expect(todo.items).toMatchObject([
      { item_id: 'e2' },
      { item_id: 'e1', name: 'Fenster putzen', category: 'Küche', packed: true, list_id: 't1' },
    ])
  })

  it('rejects an unknown id without a card', async () => {
    const outcome = await setup(seed).run('delete_checklist_entries', { entry_ids: ['x'] })
    expect(outcome.isError).toBe(true)
    expect(outcome.deleteCard).toBeUndefined()
  })
})

describe('create_list', () => {
  it('creates a To-do-Liste; taking it back deletes it again', async () => {
    const { todo, run } = setup()
    const outcome = await run('create_list', { kind: 'todo', name: 'Umzug' })
    expect(todo.lists.map((l) => l.name)).toEqual(['Putztag', 'Umzug'])
    expect(outcome.summary).toBe('✓ neue To-do-Liste: Umzug')
    expect(outcome.result).toContain('new-Umzug')
    expect(outcome.changed).toEqual([
      { id: 'new-Umzug', page: { area: 'todo', listId: 'new-Umzug' } },
    ])
    expect(await outcome.undo!()).toBe(true)
    expect(todo.lists.map((l) => l.name)).toEqual(['Putztag'])
  })

  it('creates a Packliste and an Einkaufsliste too', async () => {
    const { packing, shopping, run } = setup()
    await run('create_list', { kind: 'packliste', name: 'Camping' })
    const outcome = await run('create_list', { kind: 'einkauf', name: 'Drogerie' })
    expect(packing.lists.map((l) => l.name)).toEqual(['Urlaub', 'Camping'])
    expect(shopping.lists.map((l) => l.name)).toEqual(['Einkauf', 'Drogerie'])
    expect(outcome.summary).toBe('✓ neue Einkaufsliste: Drogerie')
    expect(outcome.changed![0]!.page).toEqual({ area: 'shopping', listId: 'new-Drogerie' })
    expect(await outcome.undo!()).toBe(true)
    expect(shopping.lists.map((l) => l.name)).toEqual(['Einkauf'])
  })

  it('rejects an unknown kind or an empty name', async () => {
    const { run } = setup()
    expect((await run('create_list', { kind: 'notiz', name: 'X' })).isError).toBe(true)
    expect((await run('create_list', { kind: 'todo', name: ' ' })).isError).toBe(true)
  })
})

describe('rename_list', () => {
  it('renames a Packliste and takes it back', async () => {
    const { packing, run } = setup()
    const outcome = await run('rename_list', { list_id: 'p1', name: 'Sommerurlaub' })
    expect(packing.lists[0]!.name).toBe('Sommerurlaub')
    expect(outcome.summary).toBe('✓ umbenannt: Urlaub → Sommerurlaub')
    expect(outcome.changed).toEqual([{ id: 'p1', page: { area: 'packing', listId: 'p1' } }])
    expect(await outcome.undo!()).toBe(true)
    expect(packing.lists[0]!.name).toBe('Urlaub')
  })

  it('renames an Einkaufsliste', async () => {
    const { shopping, run } = setup()
    const outcome = await run('rename_list', { list_id: 's1', name: 'Wocheneinkauf' })
    expect(shopping.lists[0]!.name).toBe('Wocheneinkauf')
    expect(await outcome.undo!()).toBe(true)
    expect(shopping.lists[0]!.name).toBe('Einkauf')
  })

  it('rejects an unknown list id', async () => {
    const outcome = await setup().run('rename_list', { list_id: 'x', name: 'Y' })
    expect(outcome.isError).toBe(true)
  })
})

describe('set_list_note', () => {
  it('writes the note of a list and taking it back restores the old one', async () => {
    const { todo, run } = setup({ lists: [{ list_id: 't1', name: 'Putztag', notes: 'alt' }] })
    const outcome = await run('set_list_note', { list_id: 't1', note: 'Schlüssel holen' })
    expect(todo.lists[0]!.notes).toBe('Schlüssel holen')
    expect(outcome.summary).toBe('✓ Notiz zur Liste Putztag')
    expect(await outcome.undo!()).toBe(true)
    expect(todo.lists[0]!.notes).toBe('alt')
  })
})

describe('delete_checklist', () => {
  const seed = {
    items: [
      { item_id: 'e1', list_id: 't1', name: 'Fenster putzen', category: 'Küche' },
      { item_id: 'e2', list_id: 't1', name: 'Müll raus' },
    ],
    categories: [{ list_id: 't1', name: 'Küche' }],
  }

  it('lays a card naming the list and how many entries go with it', async () => {
    const { todo, run } = setup(seed)
    const outcome = await run('delete_checklist', { list_id: 't1' })
    expect(outcome.deleteCard!.what).toBe('To-do-Liste „Putztag“ mit 2 Einträgen')
    expect(todo.lists).toHaveLength(1)
  })

  it('names a guest link on the list: it ends with the list and taking back does not return it', async () => {
    const { run } = setup(seed, {}, { sharedListIds: ['t1'] })
    const outcome = await run('delete_checklist', { list_id: 't1' })
    expect(outcome.deleteCard!.what).toBe(
      'To-do-Liste „Putztag“ mit 2 Einträgen; ihr Gastlink endet und kommt mit Rückgängig nicht zurück',
    )
  })

  it('deletes once confirmed; taking it back returns the list, its categories and entries', async () => {
    const { todo, run } = setup(seed)
    const outcome = await (await run('delete_checklist', { list_id: 't1' })).deleteCard!.confirm()
    expect(todo.lists).toEqual([])
    expect(todo.items).toEqual([])
    expect(outcome.summary).toBe('✓ gelöscht: To-do-Liste „Putztag“ mit 2 Einträgen')
    expect(await outcome.undo!()).toBe(true)
    expect(todo.lists.map((l) => l.list_id)).toEqual(['t1'])
    expect(todo.categories.map((c) => c.name)).toEqual(['Küche'])
    expect(todo.items.map((i) => i.item_id)).toEqual(['e1', 'e2'])
  })

  it('rejects an unknown list id without a card', async () => {
    const outcome = await setup(seed).run('delete_checklist', { list_id: 's1' })
    expect(outcome.isError).toBe(true)
    expect(outcome.deleteCard).toBeUndefined()
  })
})

describe('delete_shopping_list', () => {
  it('lays a card naming the list with its open and bought items', async () => {
    const { shopping, run } = setup()
    const outcome = await run('delete_shopping_list', { list_id: 's1' })
    expect(outcome.deleteCard!.what).toBe('Einkaufsliste „Einkauf“ mit 1 offenen und 1 gekauften Artikel')
    expect(shopping.lists).toHaveLength(1)
  })

  it('names a guest link on the list on the card', async () => {
    const { run } = setup({}, {}, { sharedListIds: ['s1'] })
    const outcome = await run('delete_shopping_list', { list_id: 's1' })
    expect(outcome.deleteCard!.what).toContain(
      '; ihr Gastlink endet und kommt mit Rückgängig nicht zurück',
    )
  })

  it('deletes once confirmed; taking it back returns the list with its categories and items, purchase history included', async () => {
    const { shopping, run } = setup()
    const outcome = await (await run('delete_shopping_list', { list_id: 's1' })).deleteCard!.confirm()
    expect(shopping.lists).toEqual([])
    expect(outcome.summary).toBe('✓ gelöscht: Einkaufsliste „Einkauf“ mit 1 offenen und 1 gekauften Artikel')
    expect(await outcome.undo!()).toBe(true)
    expect(shopping.lists.map((l) => l.list_id)).toEqual(['s1'])
    expect(shopping.categories.map((c) => c.category_id)).toEqual(['sc1'])
    expect(shopping.items).toMatchObject([
      { shopping_item_id: 'si1', purchased: false },
      { shopping_item_id: 'si2', purchased: true, times_purchased: 7 },
    ])
  })

  it('rejects a list that is no Einkaufsliste without a card', async () => {
    const outcome = await setup().run('delete_shopping_list', { list_id: 't1' })
    expect(outcome.isError).toBe(true)
    expect(outcome.deleteCard).toBeUndefined()
  })
})

describe('copy_checklist', () => {
  it('copies a list with its entries under a new name; taking it back deletes the copy', async () => {
    const { packing, run } = setup(
      {},
      { items: [{ item_id: 'a', list_id: 'p1', name: 'Socken', packed: true, packed_count: 1 }] },
    )
    const outcome = await run('copy_checklist', { list_id: 'p1', name: 'Sommer' })
    expect(packing.lists.map((l) => l.name)).toEqual(['Urlaub', 'Sommer'])
    expect(outcome.summary).toBe('✓ kopiert: Urlaub → Sommer')
    expect(outcome.result).toContain('copy-Sommer')
    expect(outcome.changed).toEqual([
      { id: 'copy-Sommer', page: { area: 'packing', listId: 'copy-Sommer' } },
    ])
    expect(await outcome.undo!()).toBe(true)
    expect(packing.lists.map((l) => l.name)).toEqual(['Urlaub'])
    expect(packing.items.map((i) => i.item_id)).toEqual(['a'])
  })

  it('rejects an unknown list id or an empty name', async () => {
    const { run } = setup()
    expect((await run('copy_checklist', { list_id: 'x', name: 'Y' })).isError).toBe(true)
    expect((await run('copy_checklist', { list_id: 'p1', name: ' ' })).isError).toBe(true)
  })
})

describe('reset_checklist', () => {
  const seed = {
    items: [
      { item_id: 'a', list_id: 'p1', name: 'Socken', quantity: 2, packed_count: 2, packed: true },
      { item_id: 'b', list_id: 'p1', name: 'Hemd', quantity: 3, packed_count: 1, packed: false },
      { item_id: 'c', list_id: 'p1', name: 'Hose' },
    ],
  }

  it('opens every entry of the list again, as one change that lights up the reset entries', async () => {
    const { packing, run } = setup({}, seed)
    const outcome = await run('reset_checklist', { list_id: 'p1' })
    expect(packing.items.map((i) => [i.packed, i.packed_count])).toEqual([
      [false, 0],
      [false, 0],
      [false, 0],
    ])
    expect(outcome.summary).toBe('✓ zurückgesetzt: Urlaub (2 Einträge wieder offen)')
    expect(outcome.changes).toHaveLength(1)
    expect(outcome.changed!.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('taking it back checks exactly the entries of before again, with their packed counts', async () => {
    const { packing, run } = setup({}, seed)
    const outcome = await run('reset_checklist', { list_id: 'p1' })
    expect(await outcome.undo!()).toBe(true)
    expect(packing.items).toMatchObject([
      { item_id: 'a', packed: true, packed_count: 2 },
      { item_id: 'b', packed: false, packed_count: 1 },
      { item_id: 'c', packed: false, packed_count: 0 },
    ])
  })

  it('changes nothing on a list where nothing is checked', async () => {
    const { run } = setup({}, { items: [{ item_id: 'c', list_id: 'p1', name: 'Hose' }] })
    const outcome = await run('reset_checklist', { list_id: 'p1' })
    expect(outcome.isError).toBeFalsy()
    expect(outcome.changes).toBeUndefined()
    expect(outcome.result).toContain('nichts abgehakt')
  })

  it('rejects an unknown list id', async () => {
    expect((await setup().run('reset_checklist', { list_id: 'x' })).isError).toBe(true)
  })
})

describe('checklist categories', () => {
  const seed = {
    items: [
      { item_id: 'g1', list_id: 'p1', name: 'Zahnbürste', category: 'Bad' },
      { item_id: 'g2', list_id: 'p1', name: 'Hose', category: 'Kleidung' },
    ],
    categories: [
      { list_id: 'p1', name: 'Bad' },
      { list_id: 'p1', name: 'Kleidung' },
    ],
  }

  it('create_checklist_category adds a category; taking it back removes it', async () => {
    const { packing, run } = setup({}, seed)
    const outcome = await run('create_checklist_category', { list_id: 'p1', name: 'Technik' })
    expect(packing.categories.map((c) => c.name)).toEqual(['Bad', 'Kleidung', 'Technik'])
    expect(outcome.summary).toBe('✓ neue Kategorie: Technik (Urlaub)')
    expect(outcome.changed).toEqual([
      { id: 'category:technik', page: { area: 'packing', listId: 'p1' } },
    ])
    expect(await outcome.undo!()).toBe(true)
    expect(packing.categories.map((c) => c.name)).toEqual(['Bad', 'Kleidung'])
  })

  it('create_checklist_category changes nothing when the category exists', async () => {
    const outcome = await setup({}, seed).run('create_checklist_category', {
      list_id: 'p1',
      name: 'bad',
    })
    expect(outcome.result).toContain('gibt es schon')
    expect(outcome.undo).toBeUndefined()
  })

  it('rename_checklist_category renames the category with its entries and takes it back', async () => {
    const { packing, run } = setup({}, seed)
    const outcome = await run('rename_checklist_category', {
      list_id: 'p1',
      category: 'bad',
      new_name: 'Badezimmer',
    })
    expect(packing.categories.map((c) => c.name)).toEqual(['Badezimmer', 'Kleidung'])
    expect(packing.items[0]!.category).toBe('Badezimmer')
    expect(outcome.summary).toBe('✓ Kategorie umbenannt: Bad → Badezimmer (Urlaub)')
    expect(await outcome.undo!()).toBe(true)
    expect(packing.categories.map((c) => c.name)).toEqual(['Bad', 'Kleidung'])
    expect(packing.items[0]!.category).toBe('Bad')
  })

  it('rename_checklist_category onto an existing name merges, and taking it back splits them again', async () => {
    const { packing, run } = setup({}, seed)
    const outcome = await run('rename_checklist_category', {
      list_id: 'p1',
      category: 'Bad',
      new_name: 'Kleidung',
    })
    expect(packing.categories.map((c) => c.name)).toEqual(['Kleidung'])
    expect(await outcome.undo!()).toBe(true)
    expect(packing.categories.map((c) => c.name).sort()).toEqual(['Bad', 'Kleidung'])
    expect(packing.items.map((i) => i.category)).toEqual(['Bad', 'Kleidung'])
  })

  it('delete_checklist_category lays a card; confirmed it keeps the entries uncategorised, and taking it back files them again', async () => {
    const { packing, run } = setup({}, seed)
    const first = await run('delete_checklist_category', { list_id: 'p1', category: 'Bad' })
    expect(first.deleteCard!.what).toBe('Kategorie Bad (Urlaub); 1 Eintrag bleibt ohne Kategorie')
    const outcome = await first.deleteCard!.confirm()
    expect(packing.categories.map((c) => c.name)).toEqual(['Kleidung'])
    expect(packing.items[0]!.category).toBeNull()
    expect(await outcome.undo!()).toBe(true)
    expect(packing.categories.map((c) => c.name).sort()).toEqual(['Bad', 'Kleidung'])
    expect(packing.items[0]!.category).toBe('Bad')
  })

  it('delete_checklist_category with entries deletes them too, and taking it back returns them', async () => {
    const { packing, run } = setup({}, seed)
    const first = await run('delete_checklist_category', {
      list_id: 'p1',
      category: 'Bad',
      with_entries: true,
    })
    expect(first.deleteCard!.what).toBe('Kategorie Bad (Urlaub) mit 1 Eintrag: Zahnbürste')
    const outcome = await first.deleteCard!.confirm()
    expect(names(packing)).toEqual(['Hose'])
    expect(await outcome.undo!()).toBe(true)
    expect(packing.items.map((i) => [i.item_id, i.category])).toContainEqual(['g1', 'Bad'])
  })

  it('says to Claude that a deleted category was empty, so no entry is claimed to have moved', async () => {
    const { run } = setup({}, { ...seed, categories: [...seed.categories, { list_id: 'p1', name: 'Leer' }] })
    const card = await run('delete_checklist_category', { list_id: 'p1', category: 'Leer' })
    const done = await card.deleteCard!.confirm()
    expect(done.result).toBe('Gelöscht: Kategorie Leer (Urlaub). Sie war leer; kein Eintrag hat sich geändert.')
  })

  it('rejects a category the list does not have', async () => {
    const { run } = setup({}, seed)
    for (const name of ['rename_checklist_category', 'delete_checklist_category']) {
      const outcome = await run(name, { list_id: 'p1', category: 'Garten', new_name: 'X' })
      expect(outcome.isError).toBe(true)
      expect(outcome.result).toContain('Garten')
    }
  })
})
