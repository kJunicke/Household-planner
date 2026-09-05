import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { ChecklistItem, ChecklistList, CategoryGroup } from '@/types/Checklist'
import type { CategoryRow } from '@/types/CategoryRow'
import type { CategoryOption } from '@/types/CategoryOption'
import type { ImportSource } from '@/types/CategoryImport'
import type { PendingMutation } from '@/types/PendingMutation'
import {
  buildCategoryOptions,
  categoryKey,
  compareCategoryGroups,
  normalizeCategoryName,
  orphanSortOrder,
} from '@/lib/categoryOrder'
import { createMutationQueue } from '@/lib/mutationQueue'
import { supabase } from '@/lib/supabase'
import { useHouseholdStore } from './householdStore'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Store factory for the shared **Checkliste** data layer: list CRUD, entry
 * ("Eintrag") CRUD, categories, realtime and category grouping. Parametrised
 * with the three table names, so Packliste and To-do each get one instance.
 *
 * The tables must carry the exact packing column set → see `types/Checklist.ts`.
 *
 * Offline: Kategorie-Mutationen (anlegen, umbenennen, löschen, umhängen) laufen
 * über die Warteschlange aus `@/lib/mutationQueue` und überleben damit einen
 * Netzausfall. Abhaken, Stepper und Hinzufügen schreiben weiter direkt mit
 * optimistischem Revert — das war schon vorher so und ändert sich hier nicht.
 */
export interface ChecklistStoreConfig {
  /** Pinia store id — must stay stable per instance ('packing', 'todo', …). */
  storeId: string
  /** Table holding the lists, e.g. 'packing_lists'. */
  listsTable: string
  /** Table holding the entries, e.g. 'packing_items'. */
  itemsTable: string
  /** Table holding the categories, e.g. 'packing_categories'. */
  categoriesTable: string
  /** Prefix for the three realtime channel names, e.g. 'packing'. */
  channelPrefix: string
  /** User-facing texts that name the list type. Everything else is generic. */
  labels: {
    /** Toast on a failed list load — e.g. 'Fehler beim Laden der Packlisten'. */
    loadListsError: string
    /** Toast on a failed list insert — e.g. 'Fehler beim Erstellen der Packliste'. */
    createListError: string
    /** Toast on a failed entry load — e.g. 'Fehler beim Laden der Packliste'. */
    loadItemsError: string
    /** Toast after a successful reset — e.g. 'Alle als ungepackt markiert'. */
    resetSuccess: string
    /** Toast after the queue drained — e.g. 'Packliste synchronisiert'. */
    syncSuccess: string
  }
}

const tempId = () => `temp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

export function createChecklistStore(config: ChecklistStoreConfig) {
  const { listsTable, itemsTable, categoriesTable, channelPrefix, labels } = config

  return defineStore(config.storeId, () => {
    const lists = ref<ChecklistList[]>([])
    const items = ref<ChecklistItem[]>([])
    /** Kategorien des Haushalts — eigenständige Zeilen, auch ohne Einträge. */
    const categories = ref<CategoryRow[]>([])
    const currentListId = ref<string | null>(null)
    const isLoading = ref(false)

    let realtimeListsChannel: RealtimeChannel | null = null
    let realtimeItemsChannel: RealtimeChannel | null = null
    let realtimeCategoriesChannel: RealtimeChannel | null = null

    // ==========================================================================
    // Offline-Warteschlange
    // ==========================================================================

    const queue = createMutationQueue({
      storageKey: `${config.storeId}_mutation_queue`,
      syncSourceKey: config.storeId,
      process: (m) => processMutation(m),
      onDrained: async () => {
        await loadItems()
        await loadCategories()
      },
      successToast: labels.syncSuccess,
    })

    const hasPendingMutations = queue.hasPending
    const isSyncing = queue.isSyncing

    // ==========================================================================
    // Getters
    // ==========================================================================

    const currentList = computed(() =>
      lists.value.find(l => l.list_id === currentListId.value) ?? null
    )

    const currentListItems = computed(() => {
      if (!currentListId.value) return []
      return items.value.filter(i => i.list_id === currentListId.value)
    })

    /**
     * Kategorienzeilen der aktuellen Liste in ihrer gespeicherten Reihenfolge.
     * Je normalisiertem Namen bleibt genau eine übrig, und die echte Zeile
     * schlägt die optimistische `temp_`-Zeile: Nach einem Realtime-Insert des
     * eigenen Anlegens liegen beide kurz nebeneinander, und die Combobox darf
     * denselben Namen nicht doppelt anbieten.
     */
    const currentListCategories = computed<CategoryRow[]>(() => {
      if (!currentListId.value) return []
      const sorted = categories.value
        .filter(c => c.list_id === currentListId.value)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

      const byKey = new Map<string, CategoryRow>()
      for (const row of sorted) {
        const key = normalizeCategoryName(row.name)
        const seen = byKey.get(key)
        if (!seen) {
          byKey.set(key, row)
          continue
        }
        if (seen.category_id.startsWith('temp_') && !row.category_id.startsWith('temp_')) {
          byKey.set(key, row)
        }
      }
      return sorted.filter(row => byKey.get(normalizeCategoryName(row.name)) === row)
    })

    /** Vorschläge für die Kategorie-Combobox: eigene Liste zuerst, fremde mit Herkunft. */
    const categorySuggestions = computed<CategoryOption[]>(() =>
      buildCategoryOptions(
        categories.value,
        currentListId.value,
        new Map(lists.value.map(l => [l.list_id, l.name]))
      )
    )

    /**
     * Einträge in Sektionen. Die Sektionen kommen aus der Kategorientabelle;
     * Einträge mit einem Namen ohne passende Zeile (Altdaten, Wettlauf beim
     * Sync) bekommen trotzdem eine Sektion, damit nichts unsichtbar wird.
     * Innerhalb einer Sektion: offene zuerst, dann erledigte, je `created_at`.
     * Die Reihenfolge der Sektionen liefert `compareCategoryGroups`.
     */
    const itemsByCategory = computed<CategoryGroup[]>(() => {
      const list = currentListItems.value
      const groups = new Map<string, CategoryGroup>()

      const bucket = (label: string | null, sortOrder: number) => {
        const key = categoryKey(label)
        let group = groups.get(key)
        if (!group) {
          group = {
            category: label,
            key,
            label: label ?? 'Unkategorisiert',
            items: [],
            doneCount: 0,
            total: 0,
            isComplete: false,
            isUncategorized: label === null,
            sortOrder,
          }
          groups.set(key, group)
        }
        return group
      }

      // Unkategorisiert ist immer vorhanden; die Rangfolge kommt aus dem Vergleicher.
      bucket(null, 0)
      const rows = currentListCategories.value
      rows.forEach(c => bucket(c.name, c.sort_order))

      // Der kanonische Name kommt aus der Zeile — sonst bestimmt der erste
      // Eintrag die Schreibweise der Überschrift („bad" statt „Bad").
      const labelByKey = new Map(rows.map(c => [normalizeCategoryName(c.name), c.name]))

      list.forEach((it, idx) => {
        const raw = it.category ?? null
        const label = raw === null ? null : labelByKey.get(normalizeCategoryName(raw)) ?? raw
        const group = bucket(label, orphanSortOrder(idx, list.length))
        group.items.push(it)
        group.total++
        if (it.packed) group.doneCount++
      })

      const result = [...groups.values()]
      result.forEach(g => {
        g.items.sort((a, b) => {
          if (a.packed !== b.packed) return a.packed ? 1 : -1
          return a.created_at.localeCompare(b.created_at)
        })
        g.isComplete = g.total > 0 && g.doneCount === g.total
      })
      result.sort(compareCategoryGroups)
      return result
    })

    /** Overall progress: fully-packed items / total, consistent with X/Y headers. */
    const overallProgress = computed(() => {
      const list = currentListItems.value
      const total = list.length
      const packed = list.filter(i => i.packed).length
      return { packed, total, percent: total ? Math.round((packed / total) * 100) : 0 }
    })

    // ==========================================================================
    // Optimistische Helfer
    // ==========================================================================

    const updateItemOptimistic = (itemId: string, updates: Partial<ChecklistItem>) => {
      const idx = items.value.findIndex(i => i.item_id === itemId)
      if (idx !== -1) items.value[idx] = { ...items.value[idx], ...updates }
    }

    const deleteItemOptimistic = (itemId: string) => {
      items.value = items.value.filter(i => i.item_id !== itemId)
    }

    /**
     * Nach dem Sync die optimistische Kategorienzeile durch die echte ersetzen
     * und alle noch wartenden Mutationen auf die neue ID umbiegen.
     *
     * Der Name bleibt der lokale: offline anlegen ("Bad") und sofort
     * umbenennen ("Badezimmer") erzeugt ein `update`, das noch in der
     * Warteschlange wartet, während der Server hier mit dem alten Namen
     * ("Bad") antwortet. Übernähmen wir `real.name`, würde die Zeile kurz
     * auf "Bad" zurückspringen, bis das wartende Update durchläuft — die
     * Einträge tragen aber schon "Badezimmer". Also den lokalen Namen halten,
     * falls es die temp-Zeile noch gibt.
     */
    const reconcileTempCategory = (temp: string, real: CategoryRow) => {
      const localRow = categories.value.find(c => c.category_id === temp)
      const merged = localRow ? { ...real, name: localRow.name ?? real.name } : real

      const realExists = categories.value.some(c => c.category_id === real.category_id)
      categories.value = categories.value.filter(
        c => c.category_id !== temp && (!realExists || c.category_id !== real.category_id)
      )
      categories.value.push(merged)

      queue.rewrite(m => {
        if (m.payload.categoryId === temp) m.payload.categoryId = real.category_id
      })
    }

    // ==========================================================================
    // Queue-Verarbeitung
    // ==========================================================================

    /**
     * Kategorien-Mutationen. Ein Verstoß gegen die Namens-Eindeutigkeit gilt als
     * Erfolg: Es gibt die Kategorie bereits (zweites Gerät, doppelter Offline-Sync),
     * also still mit der bestehenden Zeile verschmelzen statt zu meckern.
     */
    const processCategoryMutation = async (m: PendingMutation): Promise<boolean> => {
      const householdStore = useHouseholdStore()
      const { categoryId, tempCategoryId } = m.payload

      if (m.operation === 'create') {
        const listId = m.payload.listId!
        const name = m.payload.name!
        const { data, error } = await supabase
          .from(categoriesTable)
          .insert({
            household_id: householdStore.currentHousehold!.household_id,
            list_id: listId,
            name,
            sort_order: m.payload.sortOrder ?? 0,
          })
          .select()
          .single()

        if (error) {
          if (error.code !== '23505') throw error
          const { data: existing } = await supabase
            .from(categoriesTable)
            .select('*')
            .eq('list_id', listId)
            .ilike('name', name)
            .single()
          if (existing && tempCategoryId) reconcileTempCategory(tempCategoryId, existing)
          return true
        }

        if (tempCategoryId && data) reconcileTempCategory(tempCategoryId, data)
        return true
      }

      if (m.operation === 'update') {
        const { error } = await supabase
          .from(categoriesTable)
          .update(m.payload.updates!)
          .eq('category_id', categoryId!)
        if (error && error.code !== '23505') throw error
        return true
      }

      const { error } = await supabase
        .from(categoriesTable)
        .delete()
        .eq('category_id', categoryId!)
      if (error) throw error
      return true
    }

    /**
     * Eine wartende Mutation ausführen. `false` heißt „liegen lassen, kein
     * Fehlversuch"; geworfene Fehler zählt die Warteschlange als Fehlversuch.
     *
     * `create` gibt es hier nur für Kategorien: `addItem` schreibt direkt (wie
     * bisher) und meldet offline einen Fehler.
     */
    const processMutation = async (m: PendingMutation): Promise<boolean> => {
      if (m.payload.entity === 'category') {
        // Noch eine temp-ID heißt: das zugehörige Anlegen steht in derselben
        // Warteschlange und ist noch nicht durch. Liegen lassen — das Anlegen
        // biegt die ID gleich um.
        if (m.payload.categoryId?.startsWith('temp_')) return false
        return await processCategoryMutation(m)
      }

      if (m.operation === 'update') {
        const { error } = await supabase
          .from(itemsTable)
          .update(m.payload.updates!)
          .eq('item_id', m.payload.itemId!)
        if (error) throw error
        return true
      }

      if (m.operation === 'delete') {
        const { error } = await supabase
          .from(itemsTable)
          .delete()
          .eq('item_id', m.payload.itemId!)
        if (error) throw error
        return true
      }

      // 'create' für Einträge kennt die Warteschlange nicht — sie darf die
      // Mutation trotzdem nicht ewig behalten. Das ist eine bewusste
      // Wegwerf-Entscheidung: heute erzeugt nichts diese Mutation; sie zu
      // behalten würde die Warteschlange dauerhaft blockieren. Trotzdem
      // nicht stumm bleiben, falls sich das mal ändert.
      console.warn(`${itemsTable}: unsupported queued create, dropping`, m)
      useToastStore().showToast('Ein Eintrag konnte nicht synchronisiert werden', 'error')
      return true
    }

    // ==========================================================================
    // Lists
    // ==========================================================================

    const loadLists = async () => {
      const householdStore = useHouseholdStore()
      const toastStore = useToastStore()

      if (!householdStore.currentHousehold) return

      isLoading.value = true
      try {
        const { data, error } = await supabase
          .from(listsTable)
          .select('*')
          .eq('household_id', householdStore.currentHousehold.household_id)
          .order('created_at', { ascending: true })

        if (error) throw error

        lists.value = data || []

        if (lists.value.length > 0) {
          const currentExists = currentListId.value && lists.value.some(l => l.list_id === currentListId.value)
          if (!currentExists) {
            currentListId.value = lists.value[0].list_id
          }
        } else {
          currentListId.value = null
        }
      } catch (error) {
        console.error(`Error loading ${listsTable}:`, error)
        toastStore.showToast(labels.loadListsError, 'error')
      } finally {
        isLoading.value = false
      }
    }

    const createList = async (name: string) => {
      const householdStore = useHouseholdStore()
      const authStore = useAuthStore()
      const toastStore = useToastStore()

      if (!householdStore.currentHousehold || !authStore.user) return null

      try {
        const { data, error } = await supabase
          .from(listsTable)
          .insert({
            household_id: householdStore.currentHousehold.household_id,
            name: name.trim(),
            created_by: authStore.user.id
          })
          .select()
          .single()

        if (error) throw error

        lists.value.push(data)
        currentListId.value = data.list_id
        return data as ChecklistList
      } catch (error) {
        console.error(`Error creating ${listsTable} row:`, error)
        toastStore.showToast(labels.createListError, 'error')
        return null
      }
    }

    /**
     * Create a new list as a copy of an existing one: erst die Kategorienzeilen
     * (mit ihrer `sort_order`, auch die leeren), dann die Einträge (Kategorie +
     * Menge, `packed` zurückgesetzt). Verwaiste Kategorienamen der Quelle
     * (Eintrag ohne Zeile) werden nicht zu Zeilen — sie erscheinen in der Kopie
     * wie in der Quelle als Waisensektion.
     */
    const copyList = async (sourceListId: string, newName: string) => {
      const householdStore = useHouseholdStore()
      const authStore = useAuthStore()
      const toastStore = useToastStore()

      if (!householdStore.currentHousehold || !authStore.user) return null

      try {
        const { data: newList, error: listError } = await supabase
          .from(listsTable)
          .insert({
            household_id: householdStore.currentHousehold.household_id,
            name: newName.trim(),
            created_by: authStore.user.id
          })
          .select()
          .single()

        if (listError) throw listError

        const sourceCategories = categories.value.filter(
          c => c.list_id === sourceListId && !c.category_id.startsWith('temp_')
        )
        if (sourceCategories.length > 0) {
          const catRows = sourceCategories.map(c => ({
            household_id: householdStore.currentHousehold!.household_id,
            list_id: newList.list_id,
            name: c.name,
            sort_order: c.sort_order,
          }))
          const { data: insertedCats, error: catError } = await supabase
            .from(categoriesTable)
            .insert(catRows)
            .select()

          if (catError) throw catError
          if (insertedCats) categories.value.push(...insertedCats)
        }

        const sourceItems = items.value.filter(i => i.list_id === sourceListId)
        if (sourceItems.length > 0) {
          const rows = sourceItems.map(i => ({
            list_id: newList.list_id,
            name: i.name,
            category: i.category,
            quantity: i.quantity,
            packed_count: 0,
            packed: false,
            created_by: authStore.user!.id
          }))
          const { data: inserted, error: itemsError } = await supabase
            .from(itemsTable)
            .insert(rows)
            .select()

          if (itemsError) throw itemsError
          if (inserted) items.value.push(...inserted)
        }

        lists.value.push(newList)
        currentListId.value = newList.list_id
        toastStore.showToast('Liste kopiert', 'success', 2000)
        return newList as ChecklistList
      } catch (error) {
        console.error(`Error copying ${listsTable} row:`, error)
        toastStore.showToast('Fehler beim Kopieren der Liste', 'error')
        return null
      }
    }

    const renameList = async (listId: string, name: string) => {
      const toastStore = useToastStore()

      try {
        const { error } = await supabase
          .from(listsTable)
          .update({ name: name.trim() })
          .eq('list_id', listId)

        if (error) throw error

        const idx = lists.value.findIndex(l => l.list_id === listId)
        if (idx !== -1) lists.value[idx] = { ...lists.value[idx], name: name.trim() }
        toastStore.showToast('Liste umbenannt', 'success', 2000)
      } catch (error) {
        console.error(`Error renaming ${listsTable} row:`, error)
        toastStore.showToast('Fehler beim Umbenennen', 'error')
      }
    }

    const updateNotes = async (listId: string, notes: string) => {
      const toastStore = useToastStore()
      const trimmed = notes.trim()
      const value = trimmed.length > 0 ? trimmed : null

      // Optimistic
      const idx = lists.value.findIndex(l => l.list_id === listId)
      const prev = idx !== -1 ? lists.value[idx] : null
      if (idx !== -1) lists.value[idx] = { ...lists.value[idx], notes: value }

      try {
        const { error } = await supabase
          .from(listsTable)
          .update({ notes: value })
          .eq('list_id', listId)

        if (error) throw error
      } catch (error) {
        console.error('Error updating notes:', error)
        if (idx !== -1 && prev) lists.value[idx] = prev
        toastStore.showToast('Fehler beim Speichern der Notiz', 'error')
      }
    }

    const deleteList = async (listId: string) => {
      const toastStore = useToastStore()

      if (lists.value.length <= 1) {
        toastStore.showToast('Die letzte Liste kann nicht gelöscht werden', 'error')
        return
      }

      try {
        const { error } = await supabase
          .from(listsTable)
          .delete()
          .eq('list_id', listId)

        if (error) throw error

        lists.value = lists.value.filter(l => l.list_id !== listId)
        items.value = items.value.filter(i => i.list_id !== listId)
        categories.value = categories.value.filter(c => c.list_id !== listId)

        if (currentListId.value === listId) {
          currentListId.value = lists.value[0]?.list_id ?? null
        }
        toastStore.showToast('Liste gelöscht', 'success', 2000)
      } catch (error) {
        console.error(`Error deleting ${listsTable} row:`, error)
        toastStore.showToast('Fehler beim Löschen der Liste', 'error')
      }
    }

    // ==========================================================================
    // Kategorien
    // ==========================================================================

    const loadCategories = async () => {
      const householdStore = useHouseholdStore()
      if (!householdStore.currentHousehold) {
        categories.value = []
        return
      }

      try {
        const { data, error } = await supabase
          .from(categoriesTable)
          .select('*')
          .eq('household_id', householdStore.currentHousehold.household_id)
          .order('sort_order', { ascending: true })

        if (error) throw error

        // Noch nicht synchronisierte Zeilen überleben den Neuabgleich.
        const pending = categories.value.filter(c => c.category_id.startsWith('temp_'))
        categories.value = [...(data ?? []), ...pending]
      } catch (error) {
        console.error(`Error loading ${categoriesTable}:`, error)
      }
    }

    /** Kategorienzeile der aktuellen Liste zu einem Namen (getrimmt, case-insensitiv). */
    const findCategoryRow = (name: string): CategoryRow | null => {
      const key = normalizeCategoryName(name)
      if (!key) return null
      return currentListCategories.value.find(c => normalizeCategoryName(c.name) === key) ?? null
    }

    /** Einträge der aktuellen Liste mit diesem Kategorienamen — erledigte eingeschlossen. */
    const itemsInCategory = (category: string) => {
      const key = normalizeCategoryName(category)
      return items.value.filter(
        i => i.list_id === currentListId.value && normalizeCategoryName(i.category ?? '') === key
      )
    }

    /**
     * Kategorie anlegen, optional mit Einträgen, die im selben Zug umgehängt
     * werden. Die Zuordnung läuft über den Namen — deshalb braucht das Umhängen
     * keine fertige Kategorie-ID und funktioniert auch offline.
     * Rückgabe: der kanonische Name (bestehende Schreibweise schlägt die getippte).
     */
    const createCategory = async (
      name: string,
      itemIds: string[] = [],
      opts: { importFrom?: ImportSource } = {}
    ): Promise<string | null> => {
      if (!currentListId.value) return null
      const householdStore = useHouseholdStore()
      if (!householdStore.currentHousehold) return null

      const trimmed = name.trim()
      if (!trimmed) return null

      const listId = currentListId.value
      const existing = findCategoryRow(trimmed)
      const target = existing?.name ?? trimmed

      if (!existing) {
        const temp = tempId()
        const sortOrder = currentListCategories.value.length
        categories.value.push({
          category_id: temp,
          household_id: householdStore.currentHousehold.household_id,
          list_id: listId,
          name: trimmed,
          sort_order: sortOrder,
          created_at: new Date().toISOString(),
        })
        queue.add({
          operation: 'create',
          payload: { entity: 'category', listId, name: trimmed, sortOrder, tempCategoryId: temp },
        })
        // Deckt den Fall ab, dass jemand einen unbekannten Namen tippt und speichert,
        // ohne die Vorschlagsliste je zu benutzen — sonst entsteht die Kategorie stumm.
        useToastStore().showToast(`Kategorie „${trimmed}" angelegt`, 'success', 2000)
      }

      for (const itemId of itemIds) {
        updateItemOptimistic(itemId, { category: target })
        queue.add({ operation: 'update', payload: { itemId, updates: { category: target } } })
      }

      if (navigator.onLine) await queue.sync()

      if (opts.importFrom) {
        await importCategory(opts.importFrom.listId, target, target)
      }

      return target
    }

    /**
     * Kategorie umbenennen. Drei Fälle, die der eindeutige `lower(name)`-Index
     * erzwingt:
     * 1. nur die Schreibweise ändert sich („bad" → „Bad") — erlaubt, keine
     *    Kollisionsprüfung, sonst wäre der Fall unmöglich;
     * 2. der Zielname gehört schon einer anderen Zeile — dann verschmelzen;
     * 3. sonst normales Umbenennen von Zeile und Einträgen.
     * Die Einträge werden immer mitgezogen, erledigte eingeschlossen — sonst
     * taucht die alte Sektion beim Zurücksetzen wieder auf.
     */
    const renameCategory = async (oldName: string, newName: string) => {
      const toastStore = useToastStore()
      if (!currentListId.value) return

      const trimmed = newName.trim()
      if (!trimmed || trimmed === oldName.trim()) return

      const row = findCategoryRow(oldName)
      const isCaseOnly = normalizeCategoryName(trimmed) === normalizeCategoryName(oldName)
      const conflict = isCaseOnly
        ? null
        : currentListCategories.value.find(
            c =>
              normalizeCategoryName(c.name) === normalizeCategoryName(trimmed) &&
              c.category_id !== row?.category_id
          ) ?? null

      // Fall 2: verschmelzen — die bestehende Zeile bleibt, ihre Schreibweise gewinnt.
      const target = conflict ? conflict.name : trimmed

      const affected = itemsInCategory(oldName)

      if (conflict) {
        if (row) {
          categories.value = categories.value.filter(c => c.category_id !== row.category_id)
          queue.add({ operation: 'delete', payload: { entity: 'category', categoryId: row.category_id } })
        }
      } else if (row) {
        const idx = categories.value.findIndex(c => c.category_id === row.category_id)
        if (idx !== -1) categories.value[idx] = { ...categories.value[idx], name: target }
        queue.add({
          operation: 'update',
          payload: { entity: 'category', categoryId: row.category_id, updates: { name: target } },
        })
      }

      for (const item of affected) {
        updateItemOptimistic(item.item_id, { category: target })
        queue.add({ operation: 'update', payload: { itemId: item.item_id, updates: { category: target } } })
      }

      if (navigator.onLine) await queue.sync()
      toastStore.showToast(
        conflict ? `Mit „${target}" zusammengeführt` : 'Kategorie umbenannt',
        'success',
        2000
      )
    }

    /**
     * Kategorie löschen — in zwei Varianten. `withItems` löscht **alle** Einträge
     * der Kategorie, erledigte eingeschlossen (Lead-Entscheidung E2: die
     * Checkliste führt keine Historie, anders als der Einkauf). Ohne `withItems`
     * verlieren die Einträge nur ihre Zuordnung.
     */
    const deleteCategory = async (category: string, options: { withItems?: boolean } = {}) => {
      const toastStore = useToastStore()
      if (!currentListId.value) return

      const row = findCategoryRow(category)
      if (row) {
        categories.value = categories.value.filter(c => c.category_id !== row.category_id)
        queue.add({ operation: 'delete', payload: { entity: 'category', categoryId: row.category_id } })
      }

      for (const item of itemsInCategory(category)) {
        if (options.withItems) {
          deleteItemOptimistic(item.item_id)
          queue.add({ operation: 'delete', payload: { itemId: item.item_id } })
        } else {
          updateItemOptimistic(item.item_id, { category: null })
          queue.add({ operation: 'update', payload: { itemId: item.item_id, updates: { category: null } } })
        }
      }

      if (navigator.onLine) await queue.sync()
      toastStore.showToast('Kategorie gelöscht', 'success', 2000)
    }

    /** Eintrag in eine andere Kategorie hängen (Ziehen) — offline-fähig. */
    const moveItemToCategory = async (itemId: string, category: string | null) => {
      const trimmed = category?.trim() || null
      const target = trimmed === null ? null : findCategoryRow(trimmed)?.name ?? trimmed

      const item = items.value.find(i => i.item_id === itemId)
      if (!item || (item.category ?? null) === target) return

      updateItemOptimistic(itemId, { category: target })
      queue.add({ operation: 'update', payload: { itemId, updates: { category: target } } })

      if (navigator.onLine) await queue.sync()
    }

    /**
     * Vorschlag für die Zielkategorie eines Eintragsnamens: jüngste Verwendung
     * desselben Namens in der aktuellen Liste, sonst in den übrigen Listen des
     * Haushalts, sonst keiner.
     */
    const suggestCategoryFor = (itemName: string): string | null => {
      const key = normalizeCategoryName(itemName)
      if (!key) return null

      const matches = items.value
        .filter(i => normalizeCategoryName(i.name) === key && i.category)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))

      const inCurrentList = matches.find(i => i.list_id === currentListId.value)
      return (inCurrentList ?? matches[0])?.category ?? null
    }

    /**
     * Fremde Listen, die Einträge mit diesem Kategorienamen haben. Neueste
     * Liste zuerst.
     */
    const importSourcesFor = (name: string): ImportSource[] => {
      const key = normalizeCategoryName(name)
      if (!key) return []

      const listById = new Map(lists.value.map(l => [l.list_id, l]))
      const counts = new Map<string, number>()

      for (const item of items.value) {
        if (item.list_id === currentListId.value) continue
        if (normalizeCategoryName(item.category ?? '') !== key) continue
        if (!listById.has(item.list_id)) continue
        counts.set(item.list_id, (counts.get(item.list_id) ?? 0) + 1)
      }

      return [...counts.entries()]
        .filter(([, count]) => count > 0)
        .map(([listId, count]) => ({ listId, listName: listById.get(listId)!.name, count }))
        .sort((a, b) =>
          listById.get(b.listId)!.created_at.localeCompare(listById.get(a.listId)!.created_at)
        )
    }

    /** Source items for an import candidate (used by the confirmation modal). */
    const importPreview = (sourceListId: string, category: string): ChecklistItem[] => {
      const key = normalizeCategoryName(category)
      return items.value.filter(
        i => i.list_id === sourceListId && normalizeCategoryName(i.category ?? '') === key
      )
    }

    /**
     * Copy a category's items from a source list into the current list.
     * `targetCategory` lets the caller merge into an existing/renamed category.
     * Exact name dupes (case-insensitive, trimmed) already in the target
     * category are skipped.
     */
    const importCategory = async (
      sourceListId: string,
      category: string,
      targetCategory: string = category
    ) => {
      const authStore = useAuthStore()
      const toastStore = useToastStore()
      if (!currentListId.value || !authStore.user) return

      const target = currentListId.value
      const requestedLabel = targetCategory.trim()
      const source = importPreview(sourceListId, category)

      // Auf die Schreibweise der bestehenden Zeile bzw. eines bestehenden
      // Eintrags einschwenken — sonst stünde ein „Bad"-Import neben „bad".
      const existingLabel =
        findCategoryRow(requestedLabel)?.name ??
        currentListItems.value
          .map(i => i.category)
          .find(c => !!c && normalizeCategoryName(c) === normalizeCategoryName(requestedLabel))
      const finalLabel = existingLabel ?? (requestedLabel || null)

      const existingNames = new Set(
        currentListItems.value
          .filter(i => normalizeCategoryName(i.category ?? '') === normalizeCategoryName(requestedLabel))
          .map(i => normalizeCategoryName(i.name))
      )

      const rows = source
        .filter(i => !existingNames.has(normalizeCategoryName(i.name)))
        .map(i => ({
          list_id: target,
          name: i.name,
          category: finalLabel,
          quantity: i.quantity,
          packed_count: 0,
          packed: false,
          created_by: authStore.user!.id
        }))

      if (rows.length === 0) {
        toastStore.showToast('Alle Einträge bereits vorhanden', 'info', 2000)
        return
      }

      try {
        const { data, error } = await supabase
          .from(itemsTable)
          .insert(rows)
          .select()

        if (error) throw error
        if (data) items.value.push(...data)
        toastStore.showToast(`${rows.length} Einträge übernommen`, 'success', 2000)
      } catch (error) {
        console.error('Error importing category:', error)
        toastStore.showToast('Fehler beim Übernehmen der Kategorie', 'error')
      }
    }

    // ==========================================================================
    // Items (Einträge)
    // ==========================================================================

    const loadItems = async () => {
      const householdStore = useHouseholdStore()
      const toastStore = useToastStore()

      if (!householdStore.currentHousehold) return

      try {
        const listIds = lists.value.map(l => l.list_id)
        if (listIds.length === 0) {
          items.value = []
          return
        }

        const { data, error } = await supabase
          .from(itemsTable)
          .select('*')
          .in('list_id', listIds)
          .order('created_at', { ascending: true })

        if (error) throw error

        // Einträge mit wartender Mutation behalten ihre lokale (optimistische)
        // Kopie: sonst nimmt ein Neuabgleich eine Änderung zurück, die noch gar
        // nicht in der Datenbank angekommen ist.
        const rows = (data || []) as ChecklistItem[]
        const pendingIds = queue.pendingItemIds()
        items.value = rows.map(row =>
          pendingIds.has(row.item_id)
            ? items.value.find(i => i.item_id === row.item_id) ?? row
            : row
        )

        if (queue.hasPending.value) await queue.sync()
      } catch (error) {
        console.error(`Error loading ${itemsTable}:`, error)
        toastStore.showToast(labels.loadItemsError, 'error')
      }
    }

    const addItem = async (name: string, category: string | null = null, quantity = 1) => {
      const authStore = useAuthStore()
      const toastStore = useToastStore()

      if (!currentListId.value || !authStore.user) return null

      const raw = category?.trim() || null
      const cat = raw === null ? null : findCategoryRow(raw)?.name ?? raw
      const qty = Math.max(1, Math.floor(quantity) || 1)

      try {
        const { data, error } = await supabase
          .from(itemsTable)
          .insert({
            list_id: currentListId.value,
            name: name.trim(),
            category: cat,
            quantity: qty,
            packed_count: 0,
            packed: false,
            created_by: authStore.user.id
          })
          .select()
          .single()

        if (error) throw error

        items.value.push(data)
        return data as ChecklistItem
      } catch (error) {
        console.error(`Error adding ${itemsTable} row:`, error)
        toastStore.showToast('Fehler beim Hinzufügen', 'error')
        return null
      }
    }

    /** Body-tap: flip the done flag only. Never touches packed_count. */
    const togglePacked = async (itemId: string) => {
      await patchItem(itemId, item => ({ packed: !item.packed }))
    }

    /** Stepper [＋]: +1 progress; hitting full auto-marks done (never demotes). */
    const incrementPacked = async (itemId: string) => {
      await patchItem(itemId, item => {
        if (item.packed_count >= item.quantity) return null
        const packed_count = item.packed_count + 1
        const packed = packed_count >= item.quantity ? true : item.packed
        return { packed_count, packed }
      })
    }

    /** Stepper [–]: -1 progress; dropping below full takes "done" back. */
    const decrementPacked = async (itemId: string) => {
      await patchItem(itemId, item => {
        if (item.packed_count <= 0) return null
        const packed_count = item.packed_count - 1
        // After a decrement the count is always below quantity → no longer done.
        return { packed_count, packed: false }
      })
    }

    /**
     * Edit-modal save: name / category / quantity (clamps packed_count to quantity).
     * Die Kategorie wird auf die Schreibweise der bestehenden Zeile gezogen —
     * sonst entstehen „bad"/„Bad"-Sektionen: der Eimer normalisiert zwar, das
     * Label käme aber vom ersten Treffer.
     */
    const updateItem = async (
      itemId: string,
      patch: { name?: string; category?: string | null; quantity?: number }
    ) => {
      await patchItem(itemId, item => {
        const next: Partial<ChecklistItem> = {}
        if (patch.name !== undefined) next.name = patch.name.trim()
        if (patch.category !== undefined) {
          const raw = patch.category?.trim() || null
          next.category = raw === null ? null : findCategoryRow(raw)?.name ?? raw
        }
        if (patch.quantity !== undefined) {
          const qty = Math.max(1, Math.floor(patch.quantity) || 1)
          next.quantity = qty
          if (item.packed_count > qty) next.packed_count = qty
        }
        return next
      })
    }

    /**
     * Shared optimistic patch helper. `mutate` returns the DB patch to apply,
     * or null to abort (no-op). Reverts local state on error.
     */
    const patchItem = async (
      itemId: string,
      mutate: (item: ChecklistItem) => Partial<ChecklistItem> | null
    ) => {
      const toastStore = useToastStore()
      const idx = items.value.findIndex(i => i.item_id === itemId)
      if (idx === -1) return
      const item = items.value[idx]

      const patch = mutate(item)
      if (!patch || Object.keys(patch).length === 0) return

      const prev = item
      items.value[idx] = { ...item, ...patch }

      try {
        const { error } = await supabase
          .from(itemsTable)
          .update(patch)
          .eq('item_id', itemId)

        if (error) throw error
      } catch (error) {
        console.error(`Error updating ${itemsTable} row:`, error)
        // Re-sync from the DB (source of truth) rather than blindly restoring the
        // pre-patch snapshot — a concurrent successful update (e.g. a rapid second
        // stepper tap) must not be clobbered by this failed one's revert.
        const { data } = await supabase
          .from(itemsTable)
          .select('*')
          .eq('item_id', itemId)
          .maybeSingle()
        const revertIdx = items.value.findIndex(i => i.item_id === itemId)
        if (revertIdx !== -1) {
          if (data) items.value[revertIdx] = data as ChecklistItem
          else items.value[revertIdx] = prev
        }
        toastStore.showToast('Fehler beim Aktualisieren', 'error')
      }
    }

    const removeItem = async (itemId: string) => {
      const toastStore = useToastStore()

      try {
        const { error } = await supabase
          .from(itemsTable)
          .delete()
          .eq('item_id', itemId)

        if (error) throw error

        items.value = items.value.filter(i => i.item_id !== itemId)
      } catch (error) {
        console.error(`Error removing ${itemsTable} row:`, error)
        toastStore.showToast('Fehler beim Löschen', 'error')
      }
    }

    /** Reset a whole list: packed_count → 0 AND packed → false for every item. */
    const resetAllUnpacked = async (listId: string) => {
      const toastStore = useToastStore()
      const prev = items.value.map(i => ({ ...i }))

      items.value = items.value.map(i =>
        i.list_id === listId ? { ...i, packed: false, packed_count: 0 } : i
      )

      try {
        const { error } = await supabase
          .from(itemsTable)
          .update({ packed: false, packed_count: 0 })
          .eq('list_id', listId)

        if (error) throw error
        toastStore.showToast(labels.resetSuccess, 'success', 2000)
      } catch (error) {
        console.error(`Error resetting ${itemsTable}:`, error)
        items.value = prev
        toastStore.showToast('Fehler beim Zurücksetzen', 'error')
      }
    }

    // ==========================================================================
    // Realtime
    // ==========================================================================

    const subscribe = () => {
      const householdStore = useHouseholdStore()
      if (!householdStore.currentHousehold) return

      const householdId = householdStore.currentHousehold.household_id

      if (realtimeListsChannel) supabase.removeChannel(realtimeListsChannel)
      if (realtimeItemsChannel) supabase.removeChannel(realtimeItemsChannel)
      if (realtimeCategoriesChannel) supabase.removeChannel(realtimeCategoriesChannel)

      realtimeListsChannel = supabase
        .channel(`${channelPrefix}-lists-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: listsTable, filter: `household_id=eq.${householdId}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const newList = payload.new as ChecklistList
              if (!lists.value.find(l => l.list_id === newList.list_id)) {
                lists.value.push(newList)
              }
            }
            if (payload.eventType === 'UPDATE') {
              const updated = payload.new as ChecklistList
              const idx = lists.value.findIndex(l => l.list_id === updated.list_id)
              if (idx !== -1) lists.value[idx] = updated
            }
            if (payload.eventType === 'DELETE') {
              const deleted = payload.old as ChecklistList
              lists.value = lists.value.filter(l => l.list_id !== deleted.list_id)
              items.value = items.value.filter(i => i.list_id !== deleted.list_id)
              categories.value = categories.value.filter(c => c.list_id !== deleted.list_id)
              if (currentListId.value === deleted.list_id) {
                currentListId.value = lists.value[0]?.list_id ?? null
              }
            }
          }
        )
        .subscribe()

      // Die Item-Kanäle bleiben ungefiltert: `*_items` hat keine household_id,
      // RLS filtert. Der Kategorie-Kanal filtert wie im Einkauf über household_id
      // — DELETE-Ereignisse kommen dort nur mit REPLICA IDENTITY FULL an.
      realtimeItemsChannel = supabase
        .channel(`${channelPrefix}-items-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: itemsTable },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const newItem = payload.new as ChecklistItem
              if (!items.value.find(i => i.item_id === newItem.item_id)) {
                items.value.push(newItem)
              }
            }
            if (payload.eventType === 'UPDATE') {
              const updated = payload.new as ChecklistItem
              const idx = items.value.findIndex(i => i.item_id === updated.item_id)
              if (idx !== -1) items.value[idx] = updated
            }
            if (payload.eventType === 'DELETE') {
              const deleted = payload.old as ChecklistItem
              items.value = items.value.filter(i => i.item_id !== deleted.item_id)
            }
          }
        )
        .subscribe()

      realtimeCategoriesChannel = supabase
        .channel(`${channelPrefix}-categories-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: categoriesTable, filter: `household_id=eq.${householdId}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as CategoryRow
              if (!categories.value.some(c => c.category_id === row.category_id)) {
                categories.value.push(row)
              }
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as CategoryRow
              const idx = categories.value.findIndex(c => c.category_id === row.category_id)
              if (idx !== -1) categories.value[idx] = row
            }
            if (payload.eventType === 'DELETE') {
              const row = payload.old as CategoryRow
              categories.value = categories.value.filter(c => c.category_id !== row.category_id)
            }
          }
        )
        .subscribe()
    }

    const unsubscribe = () => {
      if (realtimeListsChannel) {
        supabase.removeChannel(realtimeListsChannel)
        realtimeListsChannel = null
      }
      if (realtimeItemsChannel) {
        supabase.removeChannel(realtimeItemsChannel)
        realtimeItemsChannel = null
      }
      if (realtimeCategoriesChannel) {
        supabase.removeChannel(realtimeCategoriesChannel)
        realtimeCategoriesChannel = null
      }
    }

    // ==========================================================================
    // Public API
    // ==========================================================================

    return {
      lists,
      items,
      categories,
      currentListId,
      isLoading,
      isSyncing,
      hasPendingMutations,
      currentList,
      currentListItems,
      currentListCategories,
      categorySuggestions,
      itemsByCategory,
      overallProgress,
      loadLists,
      createList,
      copyList,
      renameList,
      updateNotes,
      deleteList,
      loadCategories,
      createCategory,
      renameCategory,
      deleteCategory,
      moveItemToCategory,
      findCategoryRow,
      itemsInCategory,
      suggestCategoryFor,
      importSourcesFor,
      importPreview,
      importCategory,
      loadItems,
      addItem,
      togglePacked,
      incrementPacked,
      decrementPacked,
      updateItem,
      removeItem,
      resetAllUnpacked,
      subscribe,
      unsubscribe,
      syncMutations: queue.sync
    }
  })
}

/** Instance type of a checklist store — the shape `ChecklistView` expects. */
export type ChecklistStore = ReturnType<ReturnType<typeof createChecklistStore>>
