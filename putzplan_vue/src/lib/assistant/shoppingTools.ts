/**
 * Die Werkzeuge des Assistenten für die Einkaufslisten, samt Beschreibung für
 * Claude, Ausführung und Rücknahme. Was auf einer Liste steht, holt Claude über
 * `read_shopping_list`; die Übersicht nennt nur die Listen.
 *
 * Ausgeführt wird über den shoppingStore, also genau wie beim Tippen in der
 * App: optimistisch, offline-fähig, per Echtzeit beim anderen sichtbar.
 */
import type { useShoppingStore } from '@/stores/shoppingStore'
import { normalizeCategoryName } from '@/lib/categoryOrder'
import { categoryHighlightId } from './listTools'
import {
  undoAll,
  type AssistantTool,
  type Change,
  type ChangedEntry,
  type ToolOutcome,
} from './tools'

/**
 * Der Teil des shoppingStore, den die Werkzeuge brauchen. Hereingereicht statt
 * selbst geholt, damit die Tests einen gefälschten Store geben können.
 */
export type ShoppingToolStore = Pick<
  ReturnType<typeof useShoppingStore>,
  | 'lists'
  | 'items'
  | 'categories'
  | 'currentListId'
  | 'loadLists'
  | 'loadItems'
  | 'createItem'
  | 'deleteItem'
  | 'restoreItem'
  | 'markPurchased'
  | 'markUnpurchased'
  | 'setPurchaseState'
  | 'updateItem'
  | 'createCategory'
  | 'deleteCategory'
  | 'suggestCategoryFor'
>

/** Lädt die Listen, falls der Chat geöffnet wird, bevor die Einkaufsansicht es tat. */
export async function ensureShoppingLoaded(store: ShoppingToolStore) {
  if (store.lists.length === 0) await store.loadLists()
  if (store.items.length === 0) await store.loadItems()
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Der Kaufstand eines Artikels, zum genauen Zurückstellen. */
const purchaseState = (item: ShoppingToolStore['items'][number]) => ({
  purchased: item.purchased,
  times_purchased: item.times_purchased,
  last_purchased_at: item.last_purchased_at,
  last_purchased_by: item.last_purchased_by,
})

/**
 * Ein neuer Artikel trägt erst eine vorläufige ID, die der Store nach dem
 * Speichern gegen die echte tauscht. Die Rücknahme sucht ihn darum notfalls
 * über Liste und Namen.
 */
const findCreated = (store: ShoppingToolStore, id: string, listId: string, name: string) =>
  store.items.find((i) => i.shopping_item_id === id) ??
  store.items.find((i) => i.list_id === listId && !i.purchased && sameName(i.name, name))

/**
 * Dieselbe Regel wie `handleAddItem` in ShoppingView: offen → nichts tun,
 * gekauft → wieder öffnen, sonst neu anlegen mit der Kategorie aus der
 * Kaufhistorie.
 */
async function addShoppingItems(
  store: ShoppingToolStore,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const listId = String(input.list_id ?? '')
  const list = store.lists.find((l) => l.list_id === listId)
  if (!list) return { result: `Unbekannte list_id ${listId}`, isError: true }
  const page = { area: 'shopping', listId } as const

  const wanted = Array.isArray(input.items) ? input.items : []
  const done: string[] = []
  // Der Store meldet einen Fehlschlag (z. B. abgemeldet) nur per Rückgabewert;
  // ohne diese Liste stünde ein „✓“ für etwas, das nie geschah.
  const failed: string[] = []
  const changed: ChangedEntry[] = []
  const changes: Change[] = []
  for (const raw of wanted as { name?: unknown; quantity?: unknown }[]) {
    const name = String(raw.name ?? '').trim()
    if (!name) continue
    const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1))
    const onList = store.items.filter((i) => i.list_id === listId && sameName(i.name, name))

    if (onList.some((i) => !i.purchased)) {
      done.push(`${name} (stand schon drauf)`)
      continue
    }
    const label = quantity > 1 ? `${quantity}× ${name}` : name
    const purchased = onList.find((i) => i.purchased)
    if (purchased) {
      const id = purchased.shopping_item_id
      const previousQuantity = purchased.quantity
      const before = purchaseState(purchased)
      if (!(await store.markUnpurchased(id))) {
        failed.push(name)
        continue
      }
      if (quantity !== previousQuantity) await store.updateItem(id, { quantity })
      // Zurück auf gekauft, mit dem Kaufzähler von vorher: markPurchased
      // zählte einen Kauf, den es nie gab.
      changes.push({
        summary: `✓ ${label} → ${list.name}`,
        undo: async () => {
          const bought = await store.setPurchaseState(id, before)
          if (quantity === previousQuantity) return bought
          return (await store.updateItem(id, { quantity: previousQuantity })) && bought
        },
      })
      changed.push({ id, page })
      done.push(label)
      continue
    }
    const created = await store.createItem({
      name,
      category: store.suggestCategoryFor(name),
      quantity,
      listId,
    })
    if (created) {
      const tempId = created.shopping_item_id
      changes.push({
        summary: `✓ ${label} → ${list.name}`,
        undo: async () => {
          const item = findCreated(store, tempId, listId, name)
          return item ? store.deleteItem(item.shopping_item_id) : false
        },
      })
      changed.push({ id: tempId, page })
      done.push(label)
    } else {
      failed.push(name)
    }
  }

  const notDone = failed.length ? ` Fehlgeschlagen: ${failed.join(', ')}` : ''
  if (done.length === 0) {
    if (failed.length === 0) return { result: 'Keine Artikel angegeben', isError: true }
    return {
      result: `Nichts hinzugefügt.${notDone}`,
      isError: true,
      summary: `✗ nicht hinzugefügt: ${failed.join(', ')}`,
    }
  }
  return {
    result: `Erledigt auf „${list.name}“: ${done.join(', ')}.${notDone}`,
    summary: `✓ ${done.join(', ')} → ${list.name}`,
    ...(changes.length ? { undo: undoAll(changes.map((c) => c.undo)), changed, changes } : {}),
  }
}

async function markShoppingItemsPurchased(
  store: ShoppingToolStore,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const ids = Array.isArray(input.item_ids) ? (input.item_ids as unknown[]).map(String) : []
  const names: string[] = []
  const unknown: string[] = []
  const failed: string[] = []
  const changed: ChangedEntry[] = []
  const changes: Change[] = []
  for (const id of ids) {
    const item = store.items.find((i) => i.shopping_item_id === id && !i.purchased)
    if (!item) {
      unknown.push(id)
      continue
    }
    const before = purchaseState(item)
    if (await store.markPurchased(id)) {
      names.push(item.name)
      changed.push({ id, page: { area: 'shopping', listId: item.list_id } })
      // Offen wie vorher, samt Kaufzähler, letztem Kauf und Käufer.
      changes.push({
        summary: `✓ abgehakt: ${item.name}`,
        undo: () => store.setPurchaseState(id, before),
      })
    } else {
      failed.push(item.name)
    }
  }

  const missing =
    (unknown.length ? ` Nicht gefunden oder schon gekauft: ${unknown.join(', ')}` : '') +
    (failed.length ? ` Fehlgeschlagen: ${failed.join(', ')}` : '')
  if (names.length === 0) {
    return {
      result: `Nichts abgehakt.${missing}`,
      isError: true,
      ...(failed.length ? { summary: `✗ nicht abgehakt: ${failed.join(', ')}` } : {}),
    }
  }
  return {
    result: `Abgehakt: ${names.join(', ')}.${missing}`,
    summary: `✓ abgehakt: ${names.join(', ')}`,
    undo: undoAll(changes.map((c) => c.undo)),
    changed,
    changes,
  }
}

/**
 * Ändert Name, Menge oder Kategorie von Artikeln, wie „Bearbeiten“ von Hand.
 * Eine Kategorie, die es auf der Liste noch nicht gibt, wird angelegt; das ist
 * eine eigene Änderung, die ihre Rücknahme wieder entfernt.
 */
async function updateShoppingItems(
  store: ShoppingToolStore,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const wanted = (Array.isArray(input.items) ? input.items : []) as {
    item_id?: unknown
    name?: unknown
    quantity?: unknown
    category?: unknown
  }[]
  const unknown: string[] = []
  const done: string[] = []
  const failed: string[] = []
  const changes: Change[] = []
  const changed: ChangedEntry[] = []
  for (const raw of wanted) {
    const id = String(raw.item_id ?? '')
    const item = store.items.find((i) => i.shopping_item_id === id)
    const list = item && store.lists.find((l) => l.list_id === item.list_id)
    if (!item || !list) {
      unknown.push(id)
      continue
    }
    const page = { area: 'shopping', listId: list.list_id } as const
    const before = { name: item.name, quantity: item.quantity, category: item.category }
    const patch: { name?: string; quantity?: number; category?: string | null } = {}
    const what: string[] = []
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (name && name !== item.name) {
      patch.name = name
      what.push(`„${name}“`)
    }
    if (raw.quantity !== undefined) {
      const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1))
      if (quantity !== item.quantity) {
        patch.quantity = quantity
        what.push(`×${quantity}`)
      }
    }
    if (typeof raw.category === 'string' || raw.category === null) {
      const wantedCategory = (raw.category ?? '').trim()
      let category: string | null = null
      if (wantedCategory) {
        // Kategorien hängen im Store an der offenen Liste; die App folgt ohnehin dorthin.
        store.currentListId = list.list_id
        const isNew = !store.categories.some(
          (c) =>
            c.list_id === list.list_id &&
            normalizeCategoryName(c.name) === normalizeCategoryName(wantedCategory),
        )
        category = await store.createCategory(wantedCategory, [], { quiet: true })
        if (!category) {
          failed.push(item.name)
          continue
        }
        if (isNew) {
          const created = category
          changes.push({
            summary: `✓ neue Kategorie: ${created} (${list.name})`,
            undo: async () => {
              store.currentListId = list.list_id
              await store.deleteCategory(created, { quiet: true })
              return true
            },
          })
          // `changed` steht parallel zu `changes`: so nimmt das Rückgängig des
          // Artikels genau den Artikel aus dem Aufleuchten (A6: Pfeffer leuchtete weiter).
          changed.push({ id: categoryHighlightId(created), page })
        }
      }
      if (category !== item.category) {
        patch.category = category
        what.push(category ? `Kategorie ${category}` : 'ohne Kategorie')
      }
    }
    if (what.length === 0) {
      done.push(`${item.name} (unverändert)`)
      continue
    }
    if (!(await store.updateItem(id, patch))) {
      failed.push(item.name)
      continue
    }
    const line = `${before.name} → ${what.join(', ')}`
    changes.push({ summary: `✓ geändert: ${line}`, undo: () => store.updateItem(id, before) })
    changed.push({ id, page })
    done.push(line)
  }
  const unknownNote = unknown.length ? ` Unbekannte item_ids: ${unknown.join(', ')}` : ''
  const notDone = failed.length ? ` Fehlgeschlagen: ${failed.join(', ')}` : ''
  if (done.length === 0) {
    return {
      result: `Nichts geändert.${unknownNote}${notDone}`,
      isError: true,
      ...(failed.length ? { summary: `✗ nicht geändert: ${failed.join(', ')}` } : {}),
    }
  }
  return {
    result: `Geändert: ${done.join('; ')}.${unknownNote}${notDone}`,
    summary: `✓ geändert: ${done.join('; ')}`,
    ...(changes.length ? { undo: undoAll(changes.map((c) => c.undo)), changed, changes } : {}),
  }
}

/** Gekaufte Artikel sammeln sich über Jahre; Claude bekommt nur die jüngsten. */
const MAX_BOUGHT_SHOWN = 30

function readShoppingList(store: ShoppingToolStore, input: Record<string, unknown>): ToolOutcome {
  const listId = String(input.list_id ?? '')
  const list = store.lists.find((l) => l.list_id === listId)
  if (!list) return { result: `Unbekannte list_id ${listId}`, isError: true }
  const onList = store.items.filter((i) => i.list_id === listId)
  const line = (i: (typeof onList)[number]) =>
    `- ${i.name} ×${i.quantity} (id ${i.shopping_item_id})`
  const open = onList.filter((i) => !i.purchased)
  const bought = onList
    .filter((i) => i.purchased)
    .sort((a, b) => (b.last_purchased_at ?? '').localeCompare(a.last_purchased_at ?? ''))
  const shown = bought.slice(0, MAX_BOUGHT_SHOWN)
  const boughtTitle =
    shown.length < bought.length
      ? `Gekauft (die letzten ${shown.length} von ${bought.length}):`
      : 'Gekauft:'
  return {
    result: [
      `Liste „${list.name}“ (id ${listId})`,
      open.length ? `Offen:\n${open.map(line).join('\n')}` : 'Offen: nichts',
      bought.length ? `${boughtTitle}\n${shown.map(line).join('\n')}` : 'Gekauft: nichts',
    ].join('\n'),
  }
}

type ShoppingItem = ShoppingToolStore['items'][number]

const itemLabel = (item: ShoppingItem) =>
  item.quantity > 1 ? `${item.quantity}× ${item.name}` : item.name

/** „2× Zucker, Mehl (Einkauf)“; über mehrere Listen mit „;“ getrennt. */
function describeItems(store: ShoppingToolStore, items: ShoppingItem[]) {
  const byList = new Map<string, ShoppingItem[]>()
  for (const item of items) byList.set(item.list_id, [...(byList.get(item.list_id) ?? []), item])
  return [...byList]
    .map(([listId, onList]) => {
      const list = store.lists.find((l) => l.list_id === listId)?.name ?? 'Liste'
      return `${onList.map(itemLabel).join(', ')} (${list})`
    })
    .join('; ')
}

/**
 * Löscht erst nach der Karte im Chat: ein Versprecher soll nichts wegwerfen,
 * und ein getipptes „ja“ reicht dafür nicht, nur der Knopf. Die Rücknahme legt
 * den Artikel neu an, mit Name, Menge, Kategorie, Zustand und Kaufhistorie; er
 * bekommt dabei eine neue ID.
 */
function deleteShoppingItems(
  store: ShoppingToolStore,
  input: Record<string, unknown>,
): ToolOutcome {
  const ids = Array.isArray(input.item_ids) ? (input.item_ids as unknown[]).map(String) : []
  const unknown = ids.filter((id) => !store.items.some((i) => i.shopping_item_id === id))
  if (unknown.length) return { result: `Unbekannte item_ids: ${unknown.join(', ')}`, isError: true }
  // Der Stand von jetzt: das, was die Karte nennt, ist das, was gelöscht und zurückgeholt wird.
  const items = ids
    .map((id) => store.items.find((i) => i.shopping_item_id === id)!)
    .map((item) => ({ ...item }))
  if (items.length === 0) return { result: 'Keine Artikel angegeben', isError: true }

  return {
    result: 'Wartet auf die Bestätigung des Nutzers.',
    deleteCard: {
      what: describeItems(store, items),
      confirm: async () => {
        const deleted: ShoppingItem[] = []
        const failed: string[] = []
        for (const item of items) {
          if (await store.deleteItem(item.shopping_item_id)) deleted.push(item)
          else failed.push(item.name)
        }
        const notDone = failed.length ? ` Fehlgeschlagen: ${failed.join(', ')}` : ''
        if (deleted.length === 0) {
          return {
            result: `Nichts gelöscht.${notDone}`,
            isError: true,
            summary: `✗ nicht gelöscht: ${failed.join(', ')}`,
          }
        }
        const changes: Change[] = deleted.map((item) => ({
          summary: `✓ gelöscht: ${describeItems(store, [item])}`,
          undo: async () => !!(await store.restoreItem(item)),
        }))
        return {
          result: `Gelöscht: ${describeItems(store, deleted)}.${notDone}`,
          summary: `✓ gelöscht: ${describeItems(store, deleted)}`,
          undo: undoAll(changes.map((c) => c.undo)),
          changes,
        }
      },
    },
  }
}

export const shoppingTools = (store: ShoppingToolStore): AssistantTool[] => [
  {
    name: 'read_shopping_list',
    description:
      'Zeigt, was auf einer Einkaufsliste steht: die offenen Artikel und die zuletzt gekauften, ' +
      'je mit ID. Nutze es für Fragen nach dem Inhalt und bevor du Artikel abhakst.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'ID der Einkaufsliste aus der Übersicht' },
      },
      required: ['list_id'],
    },
    execute: async (input) => readShoppingList(store, input),
  },
  {
    name: 'add_shopping_items',
    description:
      'Setzt Artikel auf eine Einkaufsliste. Ein schon gekaufter Artikel gleichen Namens wird ' +
      'wieder geöffnet statt doppelt angelegt; ein schon offener bleibt, wie er ist.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: {
          type: 'string',
          description:
            'ID der Liste aus der Übersicht. Nennt der Nutzer keine und gibt es mehr als eine ' +
            'Liste, frag nach, statt eine zu wählen.',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Artikelname, kurz, im Singular wie auf einem Einkaufszettel',
              },
              quantity: { type: 'integer', minimum: 1, description: 'Menge, Standard 1' },
            },
            required: ['name'],
          },
        },
      },
      required: ['list_id', 'items'],
    },
    execute: (input) => addShoppingItems(store, input),
  },
  {
    name: 'update_shopping_items',
    description:
      'Ändert Artikel einer Einkaufsliste: Name, Menge oder Kategorie (einsortieren; leere ' +
      'Kategorie = ohne Kategorie). Nur die genannten Felder ändern sich. Eine neue Kategorie ' +
      'wird auf der Liste des Artikels angelegt.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'string', description: 'ID aus read_shopping_list' },
              name: { type: 'string' },
              quantity: { type: 'integer', minimum: 1 },
              category: { type: 'string' },
            },
            required: ['item_id'],
          },
        },
      },
      required: ['items'],
    },
    execute: (input) => updateShoppingItems(store, input),
  },
  {
    name: 'mark_shopping_items_purchased',
    description: 'Hakt offene Artikel als gekauft ab.',
    input_schema: {
      type: 'object',
      properties: {
        item_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'IDs offener Artikel aus read_shopping_list. Passt der Name auf mehrere offene ' +
            'Artikel verschiedener Listen, frag nach, welcher gemeint ist.',
        },
      },
      required: ['item_ids'],
    },
    execute: (input) => markShoppingItemsPurchased(store, input),
  },
  {
    name: 'delete_shopping_items',
    description:
      'Löscht Artikel ganz von ihrer Einkaufsliste, z. B. bei „lösch den Zucker“ oder „der Zucker ' +
      'kann runter“. Gekauft ist etwas anderes: dafür mark_shopping_items_purchased. Vor dem ' +
      'Löschen zeigt die App dem Nutzer eine Karte mit „Löschen“ und „Abbrechen“; frag darum ' +
      'nicht selbst nach, und melde das Löschen erst, wenn das Ergebnis es bestätigt.',
    input_schema: {
      type: 'object',
      properties: {
        item_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'IDs der Artikel aus read_shopping_list. Passt der Name auf mehrere Artikel verschiedener ' +
            'Listen, frag nach, welcher gemeint ist.',
        },
      },
      required: ['item_ids'],
    },
    execute: async (input) => deleteShoppingItems(store, input),
  },
]
