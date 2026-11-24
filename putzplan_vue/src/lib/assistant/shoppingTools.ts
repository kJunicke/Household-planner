/**
 * Die Werkzeuge des Assistenten für die Einkaufslisten: der Stand, den Claude
 * zu sehen bekommt, und die Ausführer für seine Aufrufe.
 *
 * Name und Felder jedes Werkzeugs stehen ein zweites Mal in
 * supabase/functions/assistant/index.ts (`TOOLS`) — dort beschrieben, hier
 * ausgeführt. Wer eins ändert, ändert beide.
 *
 * Ausgeführt wird über den shoppingStore, also genau wie beim Tippen in der
 * App: optimistisch, offline-fähig, per Echtzeit beim anderen sichtbar.
 */
import type { useShoppingStore } from '@/stores/shoppingStore'
import type { ToolOutcome } from './runAssistant'

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

  const wanted = Array.isArray(input.items) ? input.items : []
  const done: string[] = []
  // Der Store meldet einen Fehlschlag (z. B. abgemeldet) nur per Rückgabewert;
  // ohne diese Liste stünde ein „✓“ für etwas, das nie geschah.
  const failed: string[] = []
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
      if (!(await store.markUnpurchased(purchased.shopping_item_id))) {
        failed.push(name)
        continue
      }
      if (quantity !== purchased.quantity) {
        await store.updateItem(purchased.shopping_item_id, { quantity })
      }
      done.push(label)
      continue
    }
    if (await store.createItem(name, store.suggestCategoryFor(name), quantity, listId)) {
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
  for (const id of ids) {
    const item = store.items.find((i) => i.shopping_item_id === id && !i.purchased)
    if (!item) {
      unknown.push(id)
      continue
    }
    if (await store.markPurchased(id)) names.push(item.name)
    else failed.push(item.name)
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
  }
}

const executors: Record<
  string,
  (store: ShoppingToolStore, input: Record<string, unknown>) => Promise<ToolOutcome>
> = {
  add_shopping_items: addShoppingItems,
  mark_shopping_items_purchased: markShoppingItemsPurchased,
}

export async function executeShoppingTool(
  store: ShoppingToolStore,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const run = executors[name]
  if (!run) return { result: `Unbekanntes Werkzeug ${name}`, isError: true }
  return run(store, input)
}
