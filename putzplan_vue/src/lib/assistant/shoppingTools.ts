/**
 * Die Werkzeuge des Assistenten für die Einkaufslisten, samt Beschreibung für
 * Claude, Ausführung und Rücknahme. Was auf einer Liste steht, holt Claude über
 * `read_shopping_list`; die Übersicht nennt nur die Listen.
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
  | 'markPurchased'
  | 'markUnpurchased'
  | 'updateItem'
  | 'suggestCategoryFor'
>

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
]
