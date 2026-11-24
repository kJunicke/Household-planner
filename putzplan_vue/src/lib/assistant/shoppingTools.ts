/**
 * Die Werkzeuge des Assistenten für die Einkaufslisten: der Stand, den Claude
 * zu sehen bekommt, und die Werkzeuge selbst, samt Beschreibung für Claude,
 * Ausführung und Rücknahme.
 *
 * Ausgeführt wird über den shoppingStore, also genau wie beim Tippen in der
 * App: optimistisch, offline-fähig, per Echtzeit beim anderen sichtbar.
 */
import type { useShoppingStore } from '@/stores/shoppingStore'
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
  | 'loadLists'
  | 'loadItems'
  | 'createItem'
  | 'deleteItem'
  | 'restoreItem'
  | 'markPurchased'
  | 'markUnpurchased'
  | 'updateItem'
  | 'suggestCategoryFor'
>

/** Was Claude von den Listen sieht. Nur offene Artikel; gekaufte braucht er nicht. */
export function shoppingContext(store: ShoppingToolStore) {
  return store.lists.map((list) => ({
    list_id: list.list_id,
    name: list.name,
    open_items: store.items
      .filter((i) => i.list_id === list.list_id && !i.purchased)
      .map((i) => ({ id: i.shopping_item_id, name: i.name, quantity: i.quantity })),
  }))
}

/** Lädt die Listen, falls der Chat geöffnet wird, bevor die Einkaufsansicht es tat. */
export async function ensureShoppingLoaded(store: ShoppingToolStore) {
  if (store.lists.length === 0) await store.loadLists()
  if (store.items.length === 0) await store.loadItems()
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

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
      if (!(await store.markUnpurchased(id))) {
        failed.push(name)
        continue
      }
      if (quantity !== previousQuantity) await store.updateItem(id, { quantity })
      // Zurück auf gekauft. markPurchased zählt den Kauf dabei ein zweites Mal
      // mit; einen Weg zurück ohne Zählen hat der Store nicht.
      changes.push({
        summary: `✓ ${label} → ${list.name}`,
        undo: async () => {
          const bought = await store.markPurchased(id)
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
    if (await store.markPurchased(id)) {
      names.push(item.name)
      changed.push({ id, page: { area: 'shopping', listId: item.list_id } })
      changes.push({ summary: `✓ abgehakt: ${item.name}`, undo: () => store.markUnpurchased(id) })
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
 * Löscht erst nach der Karte im Chat (D7). Die Rücknahme legt den Artikel neu
 * an, mit Name, Menge, Kategorie und Zustand; er bekommt dabei eine neue ID.
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
            'ID der Liste aus dem Kontext. Nennt der Nutzer keine und gibt es mehr als eine ' +
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
    name: 'mark_shopping_items_purchased',
    description: 'Hakt offene Artikel als gekauft ab.',
    input_schema: {
      type: 'object',
      properties: {
        item_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'IDs offener Artikel aus dem Kontext. Passt der Name auf mehrere offene Artikel ' +
            'verschiedener Listen, frag nach, welcher gemeint ist.',
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
            'IDs der Artikel aus dem Kontext. Passt der Name auf mehrere Artikel verschiedener ' +
            'Listen, frag nach, welcher gemeint ist.',
        },
      },
      required: ['item_ids'],
    },
    execute: async (input) => deleteShoppingItems(store, input),
  },
]
