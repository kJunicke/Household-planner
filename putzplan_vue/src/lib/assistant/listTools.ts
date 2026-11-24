/**
 * Die Werkzeuge des Assistenten für Packlisten und To-do-Listen, samt
 * Beschreibung für Claude, Ausführung und Rücknahme. Beide Listenarten teilen
 * denselben Store-Baukasten (`createChecklistStore`), darum gilt jedes
 * Werkzeug für beide; welche gemeint ist, folgt aus der list_id. Dazu Listen
 * anlegen und umbenennen, auch Einkaufslisten.
 *
 * Wortwahl nach dem Glossar: ein Element einer To-do-Liste ist ein
 * **Eintrag**, nie eine Aufgabe (Aufgaben hängen an der Pinnwand).
 *
 * Kategorien hängen in den Stores an der offenen Liste (`currentListId`).
 * Ein Werkzeug öffnet darum die Liste, an der es arbeitet; die App folgt dem
 * Chat ohnehin dorthin.
 */
import type { ChecklistStore } from '@/stores/createChecklistStore'
import type { useShoppingStore } from '@/stores/shoppingStore'
import type { ChecklistItem, ChecklistList } from '@/types/Checklist'
import { categoryKey, normalizeCategoryName } from '@/lib/categoryOrder'
import {
  undoAll,
  type AssistantPage,
  type AssistantTool,
  type Change,
  type ChangedEntry,
  type ToolOutcome,
} from './tools'

/** Der Teil eines Checklisten-Stores (Packliste, To-do), den die Werkzeuge brauchen. */
export type ChecklistToolStore = Pick<
  ChecklistStore,
  | 'lists'
  | 'items'
  | 'categories'
  | 'currentListId'
  | 'loadLists'
  | 'loadItems'
  | 'loadCategories'
  | 'createList'
  | 'renameList'
  | 'updateNotes'
  | 'deleteList'
  | 'addItem'
  | 'updateItem'
  | 'togglePacked'
  | 'removeItem'
  | 'restore'
  | 'createCategory'
  | 'renameCategory'
  | 'deleteCategory'
  | 'moveItemToCategory'
>

export interface ListToolStores {
  shopping: Pick<
    ReturnType<typeof useShoppingStore>,
    'lists' | 'currentListId' | 'createList' | 'renameList' | 'deleteList'
  >
  packing: ChecklistToolStore
  todo: ChecklistToolStore
}

type Kind = 'packing' | 'todo'
const KIND_LABEL: Record<Kind, string> = { packing: 'Packliste', todo: 'To-do-Liste' }

/** Woran die Ansicht eine geänderte Kategorie erkennt, um ihre Kopfzeile aufleuchten zu lassen. */
export const categoryHighlightId = (name: string | null) => `category:${categoryKey(name)}`

interface Found {
  kind: Kind
  store: ChecklistToolStore
  list: ChecklistList
  page: AssistantPage
}

/** Lädt, was noch keine Ansicht geladen hat: der Chat kann auf jeder Seite offen sein. */
async function ensureLoaded(store: ChecklistToolStore) {
  if (store.lists.length === 0) await store.loadLists()
  if (store.items.length === 0 && store.lists.length > 0) await store.loadItems()
  if (store.categories.length === 0) await store.loadCategories()
}

async function findList(stores: ListToolStores, listId: string): Promise<Found | null> {
  for (const kind of ['packing', 'todo'] as const) {
    const store = stores[kind]
    await ensureLoaded(store)
    const list = store.lists.find((l) => l.list_id === listId)
    if (list) return { kind, store, list, page: { area: kind, listId } }
  }
  return null
}

async function findEntry(stores: ListToolStores, entryId: string) {
  for (const kind of ['packing', 'todo'] as const) {
    const store = stores[kind]
    await ensureLoaded(store)
    const entry = store.items.find((i) => i.item_id === entryId)
    const list = entry && store.lists.find((l) => l.list_id === entry.list_id)
    if (entry && list) {
      const page: AssistantPage = { area: kind, listId: list.list_id }
      return { kind, store, list, page, entry }
    }
  }
  return null
}

const unknownList = (listId: string): ToolOutcome => ({
  result: `Unbekannte list_id ${listId} (keine Packliste und keine To-do-Liste)`,
  isError: true,
})

const sameName = (a: string, b: string) => normalizeCategoryName(a) === normalizeCategoryName(b)

const label = (name: string, quantity: number) => (quantity > 1 ? `${quantity}× ${name}` : name)

const categoryRow = (store: ChecklistToolStore, listId: string, name: string) =>
  store.categories.find((c) => c.list_id === listId && sameName(c.name, name))

/** Ergebnis eines schreibenden Werkzeugs aus seinen einzelnen Änderungen. */
function outcomeOf(
  done: string[],
  failed: string[],
  changes: Change[],
  changed: ChangedEntry[],
  texts: { result: string; summary: string; nothing: string; failedSummary: string },
): ToolOutcome {
  const notDone = failed.length ? ` Fehlgeschlagen: ${failed.join(', ')}` : ''
  if (done.length === 0) {
    return {
      result: `${texts.nothing}${notDone}`,
      isError: true,
      ...(failed.length ? { summary: `✗ ${texts.failedSummary}: ${failed.join(', ')}` } : {}),
    }
  }
  return {
    result: `${texts.result}.${notDone}`,
    summary: texts.summary,
    ...(changes.length ? { undo: undoAll(changes.map((c) => c.undo)), changes, changed } : {}),
  }
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

async function readChecklist(stores: ListToolStores, input: Record<string, unknown>) {
  const listId = String(input.list_id ?? '')
  const found = await findList(stores, listId)
  if (!found) return unknownList(listId)
  const { store, list, kind } = found
  const entries = store.items.filter((i) => i.list_id === listId)
  const line = (i: ChecklistItem) => {
    const amount = i.quantity > 1 ? ` ${i.packed_count}/${i.quantity}` : ''
    const category = i.category ? ` [${i.category}]` : ''
    return `- ${i.name}${amount}${category} (id ${i.item_id})`
  }
  const open = entries.filter((i) => !i.packed)
  const done = entries.filter((i) => i.packed)
  const categories = store.categories
    .filter((c) => c.list_id === listId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => c.name)
  return {
    result: [
      `${KIND_LABEL[kind]} „${list.name}“ (id ${listId})`,
      ...(list.notes ? [`Notiz zur Liste: ${list.notes}`] : []),
      `Kategorien: ${categories.length ? categories.join(', ') : 'keine'}`,
      open.length ? `Offen:\n${open.map(line).join('\n')}` : 'Offen: nichts',
      done.length ? `Erledigt:\n${done.map(line).join('\n')}` : 'Erledigt: nichts',
    ].join('\n'),
  }
}

// ---------------------------------------------------------------------------
// Einträge
// ---------------------------------------------------------------------------

/**
 * Legt die Kategorie an, falls es sie auf der Liste noch nicht gibt, wie beim
 * Speichern von Hand. Gibt den kanonischen Namen zurück und, wenn sie neu ist,
 * die Änderung dazu.
 */
async function ensureCategory(found: Found, name: string) {
  const { store, list, page } = found
  const existing = categoryRow(store, list.list_id, name)
  if (existing) return { name: existing.name }
  const created = await store.createCategory(name, [], { silent: true })
  if (!created) return { name: null }
  const change: Change = {
    summary: `✓ neue Kategorie: ${created} (${list.name})`,
    undo: async () => {
      store.currentListId = list.list_id
      await store.deleteCategory(created, { silent: true })
      return true
    },
  }
  return { name: created, change, changed: { id: categoryHighlightId(created), page } }
}

async function addEntries(stores: ListToolStores, input: Record<string, unknown>) {
  const listId = String(input.list_id ?? '')
  const found = await findList(stores, listId)
  if (!found) return unknownList(listId)
  const { store, list, page } = found
  store.currentListId = listId

  const wanted = Array.isArray(input.entries) ? input.entries : []
  const done: string[] = []
  const failed: string[] = []
  const changes: Change[] = []
  const changed: ChangedEntry[] = []
  for (const raw of wanted as { name?: unknown; quantity?: unknown; category?: unknown }[]) {
    const name = String(raw.name ?? '').trim()
    if (!name) continue
    const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1))
    if (store.items.some((i) => i.list_id === listId && !i.packed && sameName(i.name, name))) {
      done.push(`${name} (stand schon drauf)`)
      continue
    }
    let category: string | null = null
    const wantedCategory = typeof raw.category === 'string' ? raw.category.trim() : ''
    if (wantedCategory) {
      const ensured = await ensureCategory(found, wantedCategory)
      category = ensured.name
      if (ensured.change) {
        changes.push(ensured.change)
        changed.push(ensured.changed)
      }
    }
    const entry = await store.addItem(name, category, quantity)
    if (!entry) {
      failed.push(name)
      continue
    }
    const id = entry.item_id
    changes.push({
      summary: `✓ ${label(name, quantity)} → ${list.name}`,
      undo: () => store.removeItem(id),
    })
    changed.push({ id, page })
    done.push(label(name, quantity))
  }
  if (done.length === 0 && failed.length === 0) {
    return { result: 'Keine Einträge angegeben', isError: true }
  }
  return outcomeOf(done, failed, changes, changed, {
    result: `Erledigt auf „${list.name}“: ${done.join(', ')}`,
    summary: `✓ ${done.join(', ')} → ${list.name}`,
    nothing: 'Nichts hinzugefügt.',
    failedSummary: 'nicht hinzugefügt',
  })
}

const idsOf = (input: Record<string, unknown>) =>
  Array.isArray(input.entry_ids) ? (input.entry_ids as unknown[]).map(String) : []

async function updateEntries(stores: ListToolStores, input: Record<string, unknown>) {
  const wanted = (Array.isArray(input.entries) ? input.entries : []) as {
    entry_id?: unknown
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
    const id = String(raw.entry_id ?? '')
    const found = await findEntry(stores, id)
    if (!found) {
      unknown.push(id)
      continue
    }
    const { store, list, entry, page } = found
    store.currentListId = list.list_id
    const before = { name: entry.name, quantity: entry.quantity, category: entry.category }
    const patch: { name?: string; quantity?: number; category?: string | null } = {}
    const what: string[] = []
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (name && name !== entry.name) {
      patch.name = name
      what.push(`„${name}“`)
    }
    if (raw.quantity !== undefined) {
      const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1))
      if (quantity !== entry.quantity) {
        patch.quantity = quantity
        what.push(`×${quantity}`)
      }
    }
    if (typeof raw.category === 'string' || raw.category === null) {
      const wantedCategory = (raw.category ?? '').trim()
      let category: string | null = null
      if (wantedCategory) {
        const ensured = await ensureCategory(found, wantedCategory)
        category = ensured.name
        if (ensured.change) {
          changes.push(ensured.change)
          changed.push(ensured.changed)
        }
      }
      if (category !== entry.category) {
        patch.category = category
        what.push(category ? `Kategorie ${category}` : 'ohne Kategorie')
      }
    }
    if (what.length === 0) {
      done.push(`${entry.name} (unverändert)`)
      continue
    }
    if (!(await store.updateItem(id, patch))) {
      failed.push(entry.name)
      continue
    }
    const line = `${before.name} → ${what.join(', ')}`
    changes.push({
      summary: `✓ geändert: ${line}`,
      undo: () => {
        store.currentListId = list.list_id
        return store.updateItem(id, before)
      },
    })
    changed.push({ id, page })
    done.push(line)
  }
  if (unknown.length && done.length === 0 && failed.length === 0) {
    return { result: `Unbekannte entry_ids: ${unknown.join(', ')}`, isError: true }
  }
  const outcome = outcomeOf(done, failed, changes, changed, {
    result: `Geändert: ${done.join('; ')}`,
    summary: `✓ geändert: ${done.join('; ')}`,
    nothing: 'Nichts geändert.',
    failedSummary: 'nicht geändert',
  })
  if (!unknown.length) return outcome
  return { ...outcome, result: `${outcome.result} Unbekannte entry_ids: ${unknown.join(', ')}` }
}

async function checkEntries(stores: ListToolStores, input: Record<string, unknown>) {
  const done = input.done !== false
  const verb = done ? 'abgehakt' : 'wieder offen'
  const names: string[] = []
  const already: string[] = []
  const unknown: string[] = []
  const failed: string[] = []
  const changes: Change[] = []
  const changed: ChangedEntry[] = []
  for (const id of idsOf(input)) {
    const found = await findEntry(stores, id)
    if (!found) {
      unknown.push(id)
      continue
    }
    const { store, entry, page } = found
    if (entry.packed === done) {
      already.push(entry.name)
      continue
    }
    if (!(await store.togglePacked(id))) {
      failed.push(entry.name)
      continue
    }
    names.push(entry.name)
    changed.push({ id, page })
    changes.push({
      summary: `✓ ${verb}: ${entry.name}`,
      // Nur zurückschalten, wenn es noch so steht; sonst schaltete es in die falsche Richtung.
      undo: async () => {
        const now = store.items.find((i) => i.item_id === id)
        if (!now) return false
        return now.packed === done ? store.togglePacked(id) : true
      },
    })
  }
  const notes =
    (already.length ? ` Stand schon so: ${already.join(', ')}.` : '') +
    (unknown.length ? ` Unbekannte entry_ids: ${unknown.join(', ')}.` : '')
  if (names.length === 0 && failed.length === 0) {
    return { result: `Nichts geändert.${notes}`, isError: unknown.length > 0 }
  }
  const outcome = outcomeOf(names, failed, changes, changed, {
    result: `${done ? 'Abgehakt' : 'Wieder offen'}: ${names.join(', ')}`,
    summary: `✓ ${verb}: ${names.join(', ')}`,
    nothing: 'Nichts geändert.',
    failedSummary: `nicht ${verb}`,
  })
  return { ...outcome, result: `${outcome.result}${notes}` }
}

/** „Zahnbürste, 2× Handtuch (Urlaub)“ */
const describeEntries = (entries: ChecklistItem[], listName: string) =>
  `${entries.map((e) => label(e.name, e.quantity)).join(', ')} (${listName})`

async function deleteEntries(
  stores: ListToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const ids = idsOf(input)
  const found = await Promise.all(ids.map((id) => findEntry(stores, id)))
  const unknown = ids.filter((_, n) => !found[n])
  if (unknown.length)
    return { result: `Unbekannte entry_ids: ${unknown.join(', ')}`, isError: true }
  // Der Stand von jetzt: was die Karte nennt, wird gelöscht und zurückgeholt.
  const targets = found.map((f) => ({ ...f!, entry: { ...f!.entry } }))
  if (targets.length === 0) return { result: 'Keine Einträge angegeben', isError: true }
  const byList = new Map<string, typeof targets>()
  for (const t of targets) byList.set(t.list.list_id, [...(byList.get(t.list.list_id) ?? []), t])
  const what = [...byList.values()]
    .map((ts) =>
      describeEntries(
        ts.map((t) => t.entry),
        ts[0]!.list.name,
      ),
    )
    .join('; ')

  return {
    result: 'Wartet auf die Bestätigung des Nutzers.',
    deleteCard: {
      what,
      confirm: async () => {
        const done: string[] = []
        const failed: string[] = []
        const changes: Change[] = []
        for (const { store, entry, list } of targets) {
          if (!(await store.removeItem(entry.item_id))) {
            failed.push(entry.name)
            continue
          }
          const line = describeEntries([entry], list.name)
          done.push(line)
          changes.push({
            summary: `✓ gelöscht: ${line}`,
            undo: () => store.restore({ items: [entry] }),
          })
        }
        return outcomeOf(done, failed, changes, [], {
          result: `Gelöscht: ${done.join('; ')}`,
          summary: `✓ gelöscht: ${done.join('; ')}`,
          nothing: 'Nichts gelöscht.',
          failedSummary: 'nicht gelöscht',
        })
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Listen
// ---------------------------------------------------------------------------

const NEW_KIND = {
  einkauf: { area: 'shopping', label: 'Einkaufsliste' },
  packliste: { area: 'packing', label: 'Packliste' },
  todo: { area: 'todo', label: 'To-do-Liste' },
} as const

async function createList(stores: ListToolStores, input: Record<string, unknown>) {
  const kind = NEW_KIND[String(input.kind) as keyof typeof NEW_KIND]
  if (!kind) return { result: `Unbekannte Listenart ${String(input.kind)}`, isError: true }
  const name = String(input.name ?? '').trim()
  if (!name) return { result: 'Kein Name angegeben', isError: true }
  const created =
    kind.area === 'shopping'
      ? await stores.shopping.createList(name)
      : await stores[kind.area].createList(name)
  if (!created) {
    return { result: 'Anlegen fehlgeschlagen', isError: true, summary: `✗ nicht angelegt: ${name}` }
  }
  const listId = created.list_id
  const summary = `✓ neue ${kind.label}: ${name}`
  // Was seither auf der Liste steht, geht mit ihr.
  const undo = () =>
    kind.area === 'shopping'
      ? stores.shopping.deleteList(listId)
      : stores[kind.area].deleteList(listId, { silent: true })
  return {
    result: `${kind.label} „${name}“ angelegt (id ${listId}).`,
    summary,
    undo,
    changes: [{ summary, undo }],
    changed: [{ id: listId, page: { area: kind.area, listId } }],
  }
}

/** Eine Liste jeder Art, für das Umbenennen. */
function findAnyList(stores: ListToolStores, listId: string) {
  const shopping = stores.shopping.lists.find((l) => l.list_id === listId)
  if (shopping) {
    return {
      name: shopping.name,
      area: 'shopping' as const,
      rename: (name: string) => stores.shopping.renameList(listId, name),
    }
  }
  for (const kind of ['packing', 'todo'] as const) {
    const list = stores[kind].lists.find((l) => l.list_id === listId)
    if (list) {
      return {
        name: list.name,
        area: kind,
        rename: (name: string) => stores[kind].renameList(listId, name, { silent: true }),
      }
    }
  }
  return null
}

async function renameList(stores: ListToolStores, input: Record<string, unknown>) {
  const listId = String(input.list_id ?? '')
  await Promise.all([ensureLoaded(stores.packing), ensureLoaded(stores.todo)])
  const list = findAnyList(stores, listId)
  if (!list) return { result: `Unbekannte list_id ${listId}`, isError: true }
  const name = String(input.name ?? '').trim()
  if (!name) return { result: 'Kein Name angegeben', isError: true }
  const before = list.name
  if (!(await list.rename(name))) {
    return {
      result: 'Umbenennen fehlgeschlagen',
      isError: true,
      summary: `✗ nicht umbenannt: ${before}`,
    }
  }
  const summary = `✓ umbenannt: ${before} → ${name}`
  const undo = () => list.rename(before)
  return {
    result: `Umbenannt: „${before}“ heißt jetzt „${name}“.`,
    summary,
    undo,
    changes: [{ summary, undo }],
    changed: [{ id: listId, page: { area: list.area, listId } }],
  }
}

async function setListNote(stores: ListToolStores, input: Record<string, unknown>) {
  const listId = String(input.list_id ?? '')
  const found = await findList(stores, listId)
  if (!found) return unknownList(listId)
  const { store, list, page } = found
  const before = list.notes ?? ''
  const note = String(input.note ?? '')
  if (!(await store.updateNotes(listId, note))) {
    return {
      result: 'Speichern fehlgeschlagen',
      isError: true,
      summary: '✗ Notiz nicht gespeichert',
    }
  }
  const summary = `✓ Notiz zur Liste ${list.name}`
  const undo = () => store.updateNotes(listId, before)
  return {
    result: `Notiz zur Liste „${list.name}“ gespeichert.`,
    summary,
    undo,
    changes: [{ summary, undo }],
    changed: [{ id: listId, page }],
  }
}

const countEntries = (n: number) => (n === 1 ? '1 Eintrag' : `${n} Einträge`)
const withEntries = (n: number) =>
  n === 0 ? 'ohne Einträge' : n === 1 ? 'mit 1 Eintrag' : `mit ${n} Einträgen`

async function deleteChecklist(
  stores: ListToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const listId = String(input.list_id ?? '')
  const found = await findList(stores, listId)
  if (!found) return unknownList(listId)
  const { store, kind } = found
  // Der Stand von jetzt, zum Zurückholen mit denselben IDs. Gastlinks auf die
  // Liste löscht die Datenbank mit; die kommen nicht zurück.
  const list = { ...found.list }
  const categories = store.categories.filter((c) => c.list_id === listId).map((c) => ({ ...c }))
  const entries = store.items.filter((i) => i.list_id === listId).map((i) => ({ ...i }))
  const what = `${KIND_LABEL[kind]} „${list.name}“ ${withEntries(entries.length)}`
  return {
    result: 'Wartet auf die Bestätigung des Nutzers.',
    deleteCard: {
      what,
      confirm: async () => {
        if (!(await store.deleteList(listId, { silent: true }))) {
          return {
            result: 'Löschen fehlgeschlagen',
            isError: true,
            summary: `✗ nicht gelöscht: ${what}`,
          }
        }
        const summary = `✓ gelöscht: ${what}`
        const undo = () => store.restore({ list, categories, items: entries })
        return { result: `Gelöscht: ${what}.`, summary, undo, changes: [{ summary, undo }] }
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Kategorien
// ---------------------------------------------------------------------------

/** Liste und Kategorie zu einer Eingabe mit list_id und category; die Liste wird die offene. */
async function findCategory(stores: ListToolStores, input: Record<string, unknown>) {
  const listId = String(input.list_id ?? '')
  const found = await findList(stores, listId)
  if (!found) return { error: unknownList(listId) }
  const name = String(input.category ?? '').trim()
  const row = categoryRow(found.store, listId, name)
  if (!row) {
    return {
      error: {
        result: `Die Liste „${found.list.name}“ hat keine Kategorie ${name}`,
        isError: true,
      },
    }
  }
  found.store.currentListId = listId
  const entries = found.store.items
    .filter((i) => i.list_id === listId && i.category !== null && sameName(i.category, row.name))
    .map((i) => ({ ...i }))
  return { found, row: { ...row }, entries }
}

async function createCategory(stores: ListToolStores, input: Record<string, unknown>) {
  const listId = String(input.list_id ?? '')
  const found = await findList(stores, listId)
  if (!found) return unknownList(listId)
  const name = String(input.name ?? '').trim()
  if (!name) return { result: 'Kein Name angegeben', isError: true }
  found.store.currentListId = listId
  const ensured = await ensureCategory(found, name)
  if (!ensured.name) {
    return { result: 'Anlegen fehlgeschlagen', isError: true, summary: `✗ nicht angelegt: ${name}` }
  }
  if (!ensured.change) {
    return { result: `Die Kategorie ${ensured.name} gibt es schon auf „${found.list.name}“.` }
  }
  return {
    result: `Kategorie ${ensured.name} auf „${found.list.name}“ angelegt.`,
    summary: ensured.change.summary,
    undo: ensured.change.undo,
    changes: [ensured.change],
    changed: [ensured.changed],
  }
}

async function renameCategory(stores: ListToolStores, input: Record<string, unknown>) {
  const target = await findCategory(stores, input)
  if (target.error) return target.error
  const { found, row, entries } = target
  const { store, list, page } = found
  const newName = String(input.new_name ?? '').trim()
  if (!newName) return { result: 'Kein neuer Name angegeben', isError: true }
  const merged = store.categories.find(
    (c) =>
      c.list_id === list.list_id && sameName(c.name, newName) && c.category_id !== row.category_id,
  )
  const finalName = merged?.name ?? newName
  await store.renameCategory(row.name, newName, { silent: true })
  const summary = `✓ Kategorie ${merged ? 'zusammengeführt' : 'umbenannt'}: ${row.name} → ${finalName} (${list.name})`
  const undo = async () => {
    store.currentListId = list.list_id
    if (!merged) {
      await store.renameCategory(finalName, row.name, { silent: true })
      return true
    }
    // Zusammengeführt: die alte Kategorie zurückholen und ihre Einträge wieder einsortieren.
    if (!(await store.restore({ categories: [row] }))) return false
    for (const entry of entries) await store.moveItemToCategory(entry.item_id, row.name)
    return true
  }
  return {
    result: merged
      ? `Kategorie ${row.name} mit ${finalName} zusammengeführt.`
      : `Kategorie ${row.name} heißt jetzt ${finalName}.`,
    summary,
    undo,
    changes: [{ summary, undo }],
    changed: [{ id: categoryHighlightId(finalName), page }],
  }
}

async function deleteCategory(
  stores: ListToolStores,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const target = await findCategory(stores, input)
  if (target.error) return target.error
  const { found, row, entries } = target
  const { store, list } = found
  const withItems = input.with_entries === true
  const where = `Kategorie ${row.name} (${list.name})`
  const what = withItems
    ? entries.length
      ? `${where} ${withEntries(entries.length)}: ${entries.map((e) => e.name).join(', ')}`
      : where
    : entries.length
      ? `${where}; ${countEntries(entries.length)} ${entries.length === 1 ? 'bleibt' : 'bleiben'} ohne Kategorie`
      : where
  return {
    result: 'Wartet auf die Bestätigung des Nutzers.',
    deleteCard: {
      what,
      confirm: async () => {
        store.currentListId = list.list_id
        await store.deleteCategory(row.name, { withItems, silent: true })
        const summary = `✓ Kategorie gelöscht: ${row.name} (${list.name})`
        const undo = async () => {
          store.currentListId = list.list_id
          if (withItems) return store.restore({ categories: [row], items: entries })
          if (!(await store.restore({ categories: [row] }))) return false
          for (const entry of entries) await store.moveItemToCategory(entry.item_id, row.name)
          return true
        }
        return { result: `Gelöscht: ${what}.`, summary, undo, changes: [{ summary, undo }] }
      },
    },
  }
}

export const checklistTools = (stores: ListToolStores): AssistantTool[] => [
  {
    name: 'read_checklist',
    description:
      'Zeigt, was auf einer Packliste oder To-do-Liste steht: offene und erledigte Einträge je ' +
      'mit ID, Menge und Kategorie, dazu die Kategorien und die Notiz zur Liste. Nutze es für ' +
      'Fragen nach dem Inhalt und bevor du Einträge änderst, abhakst oder löschst.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'ID der Packliste oder To-do-Liste' },
      },
      required: ['list_id'],
    },
    execute: (input) => readChecklist(stores, input),
  },
  {
    name: 'add_checklist_entries',
    description:
      'Setzt Einträge auf eine Packliste oder To-do-Liste. Ein offener Eintrag gleichen Namens ' +
      'bleibt, wie er ist. Eine genannte Kategorie, die es auf der Liste noch nicht gibt, wird ' +
      'angelegt.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: {
          type: 'string',
          description:
            'ID der Liste aus der Übersicht. Ist nicht klar, welche Liste gemeint ist, frag nach.',
        },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Name des Eintrags, kurz' },
              quantity: { type: 'integer', minimum: 1, description: 'Menge, Standard 1' },
              category: { type: 'string', description: 'Kategorie, optional' },
            },
            required: ['name'],
          },
        },
      },
      required: ['list_id', 'entries'],
    },
    execute: (input) => addEntries(stores, input),
  },
  {
    name: 'update_checklist_entries',
    description:
      'Ändert Einträge auf Packlisten oder To-do-Listen: Name, Menge oder Kategorie (einsortieren; ' +
      'leere Kategorie = ohne Kategorie). Nur die genannten Felder ändern sich. Eine neue ' +
      'Kategorie wird angelegt.',
    input_schema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entry_id: { type: 'string', description: 'ID aus read_checklist' },
              name: { type: 'string' },
              quantity: { type: 'integer', minimum: 1 },
              category: { type: 'string' },
            },
            required: ['entry_id'],
          },
        },
      },
      required: ['entries'],
    },
    execute: (input) => updateEntries(stores, input),
  },
  {
    name: 'check_checklist_entries',
    description:
      'Hakt Einträge auf Packlisten oder To-do-Listen ab (erledigt, gepackt), oder mit done: false ' +
      'öffnet es sie wieder.',
    input_schema: {
      type: 'object',
      properties: {
        entry_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'IDs aus read_checklist. Passt der Name auf mehrere Einträge verschiedener Listen, ' +
            'frag nach.',
        },
        done: { type: 'boolean', description: 'true = abhaken (Standard), false = wieder öffnen' },
      },
      required: ['entry_ids'],
    },
    execute: (input) => checkEntries(stores, input),
  },
  {
    name: 'delete_checklist_entries',
    description:
      'Löscht Einträge ganz von ihrer Packliste oder To-do-Liste. Abhaken ist etwas anderes: dafür ' +
      'check_checklist_entries. Vor dem Löschen zeigt die App eine Karte mit „Löschen“ und ' +
      '„Abbrechen“; frag darum nicht selbst nach und melde das Löschen erst, wenn das Ergebnis ' +
      'es bestätigt.',
    input_schema: {
      type: 'object',
      properties: {
        entry_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs aus read_checklist',
        },
      },
      required: ['entry_ids'],
    },
    execute: (input) => deleteEntries(stores, input),
  },
  {
    name: 'create_list',
    description: 'Legt eine neue Liste an: Einkaufsliste, Packliste oder To-do-Liste.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: Object.keys(NEW_KIND) },
        name: { type: 'string', description: 'Name der Liste' },
      },
      required: ['kind', 'name'],
    },
    execute: (input) => createList(stores, input),
  },
  {
    name: 'rename_list',
    description: 'Benennt eine Liste um: Einkaufsliste, Packliste oder To-do-Liste.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'ID der Liste aus der Übersicht' },
        name: { type: 'string', description: 'Neuer Name' },
      },
      required: ['list_id', 'name'],
    },
    execute: (input) => renameList(stores, input),
  },
  {
    name: 'set_list_note',
    description:
      'Ersetzt das Notizfeld einer Packliste oder To-do-Liste (die Notiz zur Liste, nicht die ' +
      'Seite Notizen). Zum Ergänzen erst mit read_checklist den bisherigen Text holen.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'ID der Packliste oder To-do-Liste' },
        note: { type: 'string', description: 'Der ganze neue Text; leer löscht die Notiz' },
      },
      required: ['list_id', 'note'],
    },
    execute: (input) => setListNote(stores, input),
  },
  {
    name: 'delete_checklist',
    description:
      'Löscht eine ganze Packliste oder To-do-Liste mit allen Einträgen. Vor dem Löschen zeigt ' +
      'die App eine Karte mit „Löschen“ und „Abbrechen“; frag darum nicht selbst nach.',
    input_schema: {
      type: 'object',
      properties: { list_id: { type: 'string', description: 'ID der Liste aus der Übersicht' } },
      required: ['list_id'],
    },
    execute: (input) => deleteChecklist(stores, input),
  },
  {
    name: 'create_checklist_category',
    description: 'Legt auf einer Packliste oder To-do-Liste eine leere Kategorie an.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string' },
        name: { type: 'string', description: 'Name der Kategorie' },
      },
      required: ['list_id', 'name'],
    },
    execute: (input) => createCategory(stores, input),
  },
  {
    name: 'rename_checklist_category',
    description:
      'Benennt eine Kategorie einer Packliste oder To-do-Liste um, ihre Einträge ziehen mit. ' +
      'Gibt es den neuen Namen schon, werden beide zusammengeführt.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string' },
        category: { type: 'string', description: 'Bisheriger Name, wie in read_checklist' },
        new_name: { type: 'string' },
      },
      required: ['list_id', 'category', 'new_name'],
    },
    execute: (input) => renameCategory(stores, input),
  },
  {
    name: 'delete_checklist_category',
    description:
      'Löscht eine Kategorie einer Packliste oder To-do-Liste. Ihre Einträge bleiben ohne ' +
      'Kategorie stehen, außer with_entries ist true: dann gehen sie mit. Vor dem Löschen zeigt ' +
      'die App eine Karte mit „Löschen“ und „Abbrechen“; frag darum nicht selbst nach.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string' },
        category: { type: 'string', description: 'Name, wie in read_checklist' },
        with_entries: {
          type: 'boolean',
          description: 'Nur true, wenn der Nutzer ausdrücklich auch die Einträge löschen will',
        },
      },
      required: ['list_id', 'category'],
    },
    execute: (input) => deleteCategory(stores, input),
  },
]
