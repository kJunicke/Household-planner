import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ShoppingItem } from '@/types/ShoppingItem'
import type { ShoppingList } from '@/types/ShoppingList'
import type { PendingMutation } from '@/types/PendingMutation'
import { supabase } from '@/lib/supabase'
import { useHouseholdStore } from './householdStore'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

// localStorage Keys
const STORAGE_KEY_ITEMS = 'shopping_items_cache'
const STORAGE_KEY_QUEUE = 'shopping_mutation_queue'
const MAX_RETRIES = 5

/** Sentinel key for the "Unkategorisiert" bucket (items with category === null). */
export const UNCATEGORIZED = '__uncategorized__'

export interface ShoppingCategoryGroup {
  /** Real category label, or null for the Unkategorisiert bucket. */
  category: string | null
  /** Stable key for v-for (label or UNCATEGORIZED sentinel). */
  key: string
  label: string
  /** Unpurchased items in this category (priority first, then name). */
  items: ShoppingItem[]
  total: number
  isUncategorized: boolean
}

export interface ShoppingImportCandidate {
  sourceListId: string
  sourceListName: string
  category: string
  itemCount: number
  /** created_at of the source list — newest first in the picker. */
  sourceCreatedAt: string
}

export const useShoppingStore = defineStore('shopping', () => {
  // State
  const items = ref<ShoppingItem[]>([])
  const lists = ref<ShoppingList[]>([])
  const currentListId = ref<string | null>(null)
  const isLoading = ref(false)
  const mutationQueue = ref<PendingMutation[]>([])
  const isSyncing = ref(false)

  /**
   * Client-only empty categories the user just created via "+ Kategorie".
   * Keyed by list_id. They vanish on reload once they still have no items,
   * which is fine — an empty category carries no data (no category table).
   */
  const pendingCategories = ref<Record<string, string[]>>({})

  // Realtime subscription channels
  let realtimeChannel: RealtimeChannel | null = null
  let realtimeListsChannel: RealtimeChannel | null = null

  // ============================================================================
  // localStorage Helpers
  // ============================================================================

  const saveItemsToCache = () => {
    try {
      localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items.value))
    } catch (error) {
      console.error('Failed to save items to cache:', error)
    }
  }

  const loadItemsFromCache = () => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_ITEMS)
      if (cached) {
        items.value = JSON.parse(cached)
        console.log('📦 Loaded items from cache:', items.value.length)
      }
    } catch (error) {
      console.error('Failed to load items from cache:', error)
    }
  }

  const saveQueueToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(mutationQueue.value))
    } catch (error) {
      console.error('Failed to save queue to storage:', error)
    }
  }

  const loadQueueFromStorage = () => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_QUEUE)
      if (cached) {
        mutationQueue.value = JSON.parse(cached)
        console.log('📦 Loaded mutation queue from storage:', mutationQueue.value.length)
      }
    } catch (error) {
      console.error('Failed to load queue from storage:', error)
    }
  }

  // Auto-save items to cache on change
  watch(items, saveItemsToCache, { deep: true })

  // Auto-save queue to storage on change
  watch(mutationQueue, saveQueueToStorage, { deep: true })

  // ============================================================================
  // Getters (computed)
  // ============================================================================

  const currentListItems = computed(() => {
    if (!currentListId.value) return []
    return items.value.filter(item => item.list_id === currentListId.value)
  })

  const unpurchasedItems = computed(() => {
    return currentListItems.value
      .filter(item => !item.purchased)
      .sort((a, b) => {
        if (a.is_priority && !b.is_priority) return -1
        if (!a.is_priority && b.is_priority) return 1
        return a.name.localeCompare(b.name)
      })
  })

  const purchasedItems = computed(() => {
    return currentListItems.value
      .filter(item => item.purchased)
      .sort((a, b) => b.times_purchased - a.times_purchased)
  })

  /**
   * Unpurchased items grouped into category sections (the "Zu kaufen" area).
   * Purchased items are NOT grouped — they live in the global Gekauft block.
   * Ordering: named categories (creation order) → "Unkategorisiert" (always
   * last, always present). Within a section: by name. Priority is a visual
   * highlight only — it does not re-sort items to the top.
   */
  const itemsByCategory = computed<ShoppingCategoryGroup[]>(() => {
    const list = currentListItems.value.filter(i => !i.purchased)
    const groups = new Map<string, ShoppingItem[]>()
    const firstSeen = new Map<string, number>()

    list.forEach((it, idx) => {
      const key = it.category ?? UNCATEGORIZED
      if (!groups.has(key)) {
        groups.set(key, [])
        firstSeen.set(key, idx)
      }
      groups.get(key)!.push(it)
    })

    // Merge in client-only empty categories the user just created.
    const pending = currentListId.value ? pendingCategories.value[currentListId.value] ?? [] : []
    pending.forEach((cat, i) => {
      if (!groups.has(cat)) {
        groups.set(cat, [])
        firstSeen.set(cat, list.length + i)
      }
    })

    // Uncategorized is always present.
    if (!groups.has(UNCATEGORIZED)) {
      groups.set(UNCATEGORIZED, [])
      firstSeen.set(UNCATEGORIZED, Number.MAX_SAFE_INTEGER)
    }

    const result: ShoppingCategoryGroup[] = []
    for (const [key, its] of groups) {
      const sorted = [...its].sort((a, b) => a.name.localeCompare(b.name))
      const isUncategorized = key === UNCATEGORIZED
      result.push({
        category: isUncategorized ? null : key,
        key,
        label: isUncategorized ? 'Unkategorisiert' : key,
        items: sorted,
        total: its.length,
        isUncategorized,
      })
    }

    result.sort((a, b) => {
      if (a.isUncategorized) return 1
      if (b.isUncategorized) return -1
      return (firstSeen.get(a.key) ?? 0) - (firstSeen.get(b.key) ?? 0)
    })
    return result
  })

  /** Category labels present in the current list (named only, for the edit modal). */
  const categoryLabels = computed(() =>
    itemsByCategory.value.filter(g => !g.isUncategorized).map(g => g.label)
  )

  const hasPendingMutations = computed(() => mutationQueue.value.length > 0)

  // ============================================================================
  // Mutation Queue Helpers
  // ============================================================================

  const addToQueue = (mutation: Omit<PendingMutation, 'queueId' | 'timestamp' | 'retries'>) => {
    const queueItem: PendingMutation = {
      ...mutation,
      queueId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retries: 0
    }
    mutationQueue.value.push(queueItem)
    console.log('📝 Added to queue:', queueItem)
  }

  const removeFromQueue = (queueId: string) => {
    mutationQueue.value = mutationQueue.value.filter(m => m.queueId !== queueId)
  }

  // ============================================================================
  // Offline-Aware Mutations (with Optimistic Updates)
  // ============================================================================

  const createItemOptimistic = (
    name: string,
    listId: string,
    category: string | null,
    quantity: number
  ): ShoppingItem => {
    const householdStore = useHouseholdStore()
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const newItem: ShoppingItem = {
      shopping_item_id: tempId,
      household_id: householdStore.currentHousehold!.household_id,
      list_id: listId,
      name: name.trim(),
      category: category?.trim() || null,
      quantity: Math.max(1, Math.floor(quantity) || 1),
      purchased: false,
      is_priority: false,
      times_purchased: 0,
      last_purchased_at: null,
      last_purchased_by: null,
      created_at: new Date().toISOString()
    }

    items.value.push(newItem)
    return newItem
  }

  const updateItemOptimistic = (itemId: string, updates: Partial<ShoppingItem>) => {
    const index = items.value.findIndex(i => i.shopping_item_id === itemId)
    if (index !== -1) {
      items.value[index] = { ...items.value[index], ...updates }
    }
  }

  const deleteItemOptimistic = (itemId: string) => {
    items.value = items.value.filter(i => i.shopping_item_id !== itemId)
  }

  /**
   * After a queued create syncs, replace its optimistic temp row with the real
   * DB row and re-point every still-queued mutation that referenced the temp id.
   * If realtime already inserted the real row, just drop the temp duplicate.
   */
  const reconcileTempId = (tempId: string, realItem: ShoppingItem) => {
    const realExists = items.value.some(i => i.shopping_item_id === realItem.shopping_item_id)
    const tempIdx = items.value.findIndex(i => i.shopping_item_id === tempId)
    if (tempIdx !== -1) {
      if (realExists) {
        // Keep whatever optimistic edits sit on the temp row, drop the temp id.
        items.value.splice(tempIdx, 1)
      } else {
        // Preserve local edits (e.g. an offline toggle) layered on the temp row.
        const local = items.value[tempIdx]
        items.value[tempIdx] = {
          ...realItem,
          purchased: local.purchased,
          is_priority: local.is_priority,
          name: local.name,
          category: local.category,
          quantity: local.quantity
        }
      }
    }

    for (const m of mutationQueue.value) {
      if (m.payload.itemId === tempId) m.payload.itemId = realItem.shopping_item_id
    }
  }

  // ============================================================================
  // Sync Engine
  // ============================================================================

  const processMutation = async (mutation: PendingMutation): Promise<boolean> => {
    const householdStore = useHouseholdStore()

    try {
      if (mutation.operation === 'create') {
        const { data, error } = await supabase
          .from('shopping_items')
          .insert({
            name: mutation.payload.name!,
            household_id: householdStore.currentHousehold!.household_id,
            list_id: mutation.payload.listId!,
            category: mutation.payload.category ?? null,
            quantity: mutation.payload.quantity ?? 1
          })
          .select()
          .single()

        if (error) throw error

        // Temp-ID chaining: swap the optimistic temp row for the real one and
        // rewrite any already-queued follow-up mutations (toggle/edit/delete of
        // an item created while offline) to the freshly-minted real id.
        const tempId = mutation.payload.tempId
        if (tempId && data) reconcileTempId(tempId, data as ShoppingItem)

      } else if (mutation.operation === 'update') {
        const { error } = await supabase
          .from('shopping_items')
          .update(mutation.payload.updates!)
          .eq('shopping_item_id', mutation.payload.itemId!)

        if (error) throw error

      } else if (mutation.operation === 'delete') {
        const { error } = await supabase
          .from('shopping_items')
          .delete()
          .eq('shopping_item_id', mutation.payload.itemId!)

        if (error) throw error
      }

      console.log('✅ Synced mutation:', mutation.operation, mutation.payload)
      return true

    } catch (error) {
      console.error('❌ Failed to sync mutation:', mutation, error)
      mutation.lastError = error instanceof Error ? error.message : String(error)
      mutation.retries++
      return false
    }
  }

  const syncMutations = async () => {
    if (isSyncing.value || mutationQueue.value.length === 0) return

    console.log('🔄 Starting sync of', mutationQueue.value.length, 'mutations...')
    isSyncing.value = true

    const toastStore = useToastStore()
    const failedMutations: PendingMutation[] = []

    for (const mutation of mutationQueue.value) {
      if (mutation.retries >= MAX_RETRIES) {
        console.warn('⚠️ Max retries reached for mutation:', mutation)
        failedMutations.push(mutation)
        continue
      }

      const success = await processMutation(mutation)

      if (success) {
        removeFromQueue(mutation.queueId)
      } else {
        failedMutations.push(mutation)
      }
    }

    isSyncing.value = false

    if (failedMutations.length > 0) {
      console.warn('⚠️ Some mutations failed to sync:', failedMutations.length)
      toastStore.showToast(`${failedMutations.length} Änderung(en) konnten nicht synchronisiert werden`, 'error', 3000)
    } else if (mutationQueue.value.length === 0) {
      console.log('✅ All mutations synced successfully')
      toastStore.showToast('Einkaufsliste synchronisiert', 'success', 2000)
    }

    if (mutationQueue.value.length === 0) {
      await loadItems()
    }
  }

  // ============================================================================
  // List Actions
  // ============================================================================

  const loadLists = async () => {
    const householdStore = useHouseholdStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold) return

    try {
      const { data, error } = await supabase
        .from('shopping_lists')
        .select('*')
        .eq('household_id', householdStore.currentHousehold.household_id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) throw error

      lists.value = data || []

      // Select first list by default if none selected or current doesn't exist
      if (lists.value.length > 0) {
        const currentExists = currentListId.value && lists.value.some(l => l.list_id === currentListId.value)
        if (!currentExists) {
          currentListId.value = lists.value[0].list_id
        }
      } else {
        currentListId.value = null
      }

    } catch (error) {
      console.error('Error loading shopping lists:', error)
      toastStore.showToast('Fehler beim Laden der Listen', 'error')
    }
  }

  const createList = async (name: string) => {
    const householdStore = useHouseholdStore()
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold || !authStore.user) return null

    const trimmedName = name.trim()
    if (!trimmedName) return null

    try {
      const { data, error } = await supabase
        .from('shopping_lists')
        .insert({
          household_id: householdStore.currentHousehold.household_id,
          name: trimmedName,
          sort_order: lists.value.length,
          created_by: authStore.user.id
        })
        .select()
        .single()

      if (error) throw error

      lists.value.push(data)
      currentListId.value = data.list_id
      return data

    } catch (error) {
      console.error('Error creating shopping list:', error)
      toastStore.showToast('Fehler beim Erstellen der Liste', 'error')
      return null
    }
  }

  const renameList = async (listId: string, name: string) => {
    const toastStore = useToastStore()
    const trimmedName = name.trim()
    if (!trimmedName) return false

    try {
      const { error } = await supabase
        .from('shopping_lists')
        .update({ name: trimmedName })
        .eq('list_id', listId)

      if (error) throw error

      const idx = lists.value.findIndex(l => l.list_id === listId)
      if (idx !== -1) lists.value[idx] = { ...lists.value[idx], name: trimmedName }

      return true

    } catch (error) {
      console.error('Error renaming shopping list:', error)
      toastStore.showToast('Fehler beim Umbenennen der Liste', 'error')
      return false
    }
  }

  const deleteList = async (listId: string) => {
    const toastStore = useToastStore()

    if (lists.value.length <= 1) {
      toastStore.showToast('Die letzte Liste kann nicht gelöscht werden', 'error')
      return false
    }

    try {
      const { error } = await supabase
        .from('shopping_lists')
        .delete()
        .eq('list_id', listId)

      if (error) throw error

      lists.value = lists.value.filter(l => l.list_id !== listId)
      items.value = items.value.filter(i => i.list_id !== listId)

      // Switch to first remaining list
      if (currentListId.value === listId) {
        currentListId.value = lists.value[0]?.list_id ?? null
      }

      return true

    } catch (error) {
      console.error('Error deleting shopping list:', error)
      toastStore.showToast('Fehler beim Löschen der Liste', 'error')
      return false
    }
  }

  // ============================================================================
  // Item Actions
  // ============================================================================

  const loadItems = async () => {
    console.log('Loading shopping items...')

    loadItemsFromCache()

    if (isLoading.value) {
      console.log('Already loading shopping items, skipping...')
      return
    }

    const householdStore = useHouseholdStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold) {
      items.value = []
      return
    }

    isLoading.value = true

    try {
      const { data, error } = await supabase
        .from('shopping_items')
        .select('*')
        .eq('household_id', householdStore.currentHousehold.household_id)

      if (error) throw error

      // Reconcile with the server WITHOUT clobbering in-flight optimistic state:
      // items whose mutation is still queued keep their local (optimistic) copy,
      // and temp rows for not-yet-synced creates are preserved. Prevents a
      // concurrent reload (e.g. from another op's sync) from reverting a toggle
      // that hasn't reached the DB yet.
      const rows = data || []
      const pendingIds = new Set(
        mutationQueue.value.map(m => m.payload.itemId).filter(Boolean) as string[]
      )
      const merged = rows.map(row =>
        pendingIds.has(row.shopping_item_id)
          ? items.value.find(i => i.shopping_item_id === row.shopping_item_id) ?? row
          : row
      )
      const tempRows = items.value.filter(i => i.shopping_item_id.startsWith('temp_'))
      items.value = [...merged, ...tempRows]
      console.log('Loaded shopping items:', items.value.length)

      loadQueueFromStorage()

      if (mutationQueue.value.length > 0) {
        await syncMutations()
      }

    } catch (error) {
      console.error('Error loading shopping items:', error)
      if (items.value.length === 0) {
        toastStore.showToast('Fehler beim Laden der Einkaufsliste', 'error')
      }
    } finally {
      isLoading.value = false
    }
  }

  const createItem = async (name: string, category: string | null = null, quantity = 1) => {
    const householdStore = useHouseholdStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold) {
      toastStore.showToast('Fehler: Kein Haushalt ausgewählt', 'error')
      return null
    }

    if (!name.trim()) {
      toastStore.showToast('Artikel-Name darf nicht leer sein', 'error')
      return null
    }

    if (!currentListId.value) {
      toastStore.showToast('Bitte zuerst eine Liste auswählen', 'error')
      return null
    }

    const cat = category?.trim() || null
    const qty = Math.max(1, Math.floor(quantity) || 1)
    const tempItem = createItemOptimistic(name, currentListId.value, cat, qty)

    addToQueue({
      operation: 'create',
      payload: {
        name: name.trim(),
        listId: currentListId.value,
        category: cat,
        quantity: qty,
        tempId: tempItem.shopping_item_id
      }
    })

    if (navigator.onLine) {
      await syncMutations()
    } else {
      toastStore.showToast('Offline: Wird synchronisiert sobald online', 'info', 3000)
    }

    return tempItem
  }

  /** Edit-modal save: name / category / quantity. Fully offline-capable. */
  const updateItem = async (
    itemId: string,
    patch: { name?: string; category?: string | null; quantity?: number }
  ) => {
    const item = items.value.find(i => i.shopping_item_id === itemId)
    if (!item) return false

    const updates: Partial<ShoppingItem> = {}
    if (patch.name !== undefined) updates.name = patch.name.trim()
    if (patch.category !== undefined) updates.category = patch.category?.trim() || null
    if (patch.quantity !== undefined) updates.quantity = Math.max(1, Math.floor(patch.quantity) || 1)
    if (Object.keys(updates).length === 0) return false

    updateItemOptimistic(itemId, updates)
    addToQueue({ operation: 'update', payload: { itemId, updates } })

    if (navigator.onLine) await syncMutations()
    return true
  }

  const togglePriority = async (itemId: string) => {
    const toastStore = useToastStore()

    const item = items.value.find(i => i.shopping_item_id === itemId)
    if (!item) {
      toastStore.showToast('Artikel nicht gefunden', 'error')
      return false
    }

    const newPriority = !item.is_priority
    updateItemOptimistic(itemId, { is_priority: newPriority })

    addToQueue({
      operation: 'update',
      payload: { itemId, updates: { is_priority: newPriority } }
    })

    if (navigator.onLine) await syncMutations()

    return true
  }

  const markPurchased = async (itemId: string) => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    if (!authStore.user) {
      toastStore.showToast('Fehler: Nicht angemeldet', 'error')
      return false
    }

    const item = items.value.find(i => i.shopping_item_id === itemId)
    if (!item) {
      toastStore.showToast('Artikel nicht gefunden', 'error')
      return false
    }

    const now = new Date().toISOString()
    updateItemOptimistic(itemId, {
      purchased: true,
      is_priority: false,
      times_purchased: item.times_purchased + 1,
      last_purchased_at: now,
      last_purchased_by: authStore.user.id
    })

    addToQueue({
      operation: 'update',
      payload: {
        itemId,
        updates: {
          purchased: true,
          is_priority: false,
          times_purchased: item.times_purchased + 1,
          last_purchased_at: now,
          last_purchased_by: authStore.user.id
        }
      }
    })

    if (navigator.onLine) await syncMutations()

    return true
  }

  const markUnpurchased = async (itemId: string) => {
    updateItemOptimistic(itemId, { purchased: false })

    addToQueue({
      operation: 'update',
      payload: { itemId, updates: { purchased: false } }
    })

    if (navigator.onLine) await syncMutations()

    return true
  }

  const deleteItem = async (itemId: string) => {
    const toastStore = useToastStore()

    deleteItemOptimistic(itemId)

    addToQueue({
      operation: 'delete',
      payload: { itemId }
    })

    if (navigator.onLine) {
      await syncMutations()
    } else {
      toastStore.showToast('Offline: Wird synchronisiert sobald online', 'info', 3000)
    }

    return true
  }

  // ============================================================================
  // Categories (client-only pending buckets + name reuse)
  // ============================================================================

  /** Register a just-created empty category so its section renders for quick-add. */
  const addCategory = (name: string) => {
    if (!currentListId.value) return
    const trimmed = name.trim()
    if (!trimmed) return
    const listId = currentListId.value
    const existing = pendingCategories.value[listId] ?? []
    const already = existing.some(c => c.toLowerCase() === trimmed.toLowerCase())
      || currentListItems.value.some(i => (i.category ?? '').toLowerCase() === trimmed.toLowerCase())
    if (!already) {
      pendingCategories.value = { ...pendingCategories.value, [listId]: [...existing, trimmed] }
    }
  }

  /**
   * Distinct (category × source list) across the household, excluding the current
   * list and the Uncategorized bucket, filtered by query, newest list first.
   * The picker collapses these to distinct names (shopping reuses only the NAME,
   * never the source items — those may already be checked off elsewhere).
   */
  const categoryImportCandidates = (query: string): ShoppingImportCandidate[] => {
    const q = query.trim().toLowerCase()
    const listName = new Map(lists.value.map(l => [l.list_id, l]))
    const buckets = new Map<string, ShoppingImportCandidate>()

    for (const item of items.value) {
      if (item.list_id === currentListId.value) continue
      if (!item.category) continue
      if (q && !item.category.toLowerCase().includes(q)) continue
      const list = listName.get(item.list_id)
      if (!list) continue
      const key = `${item.list_id}::${item.category}`
      const existing = buckets.get(key)
      if (existing) {
        existing.itemCount++
      } else {
        buckets.set(key, {
          sourceListId: item.list_id,
          sourceListName: list.name,
          category: item.category,
          itemCount: 1,
          sourceCreatedAt: list.created_at,
        })
      }
    }

    return [...buckets.values()].sort((a, b) =>
      b.sourceCreatedAt.localeCompare(a.sourceCreatedAt)
    )
  }

  /** Rename a category → re-labels every unpurchased item carrying it (offline-capable). */
  const renameCategory = async (oldName: string, newName: string) => {
    const toastStore = useToastStore()
    if (!currentListId.value) return
    const listId = currentListId.value
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return

    // Rename a client-only pending (empty) category too.
    const pending = pendingCategories.value[listId] ?? []
    if (pending.some(c => c.toLowerCase() === oldName.toLowerCase())) {
      pendingCategories.value = {
        ...pendingCategories.value,
        [listId]: pending.map(c => (c.toLowerCase() === oldName.toLowerCase() ? trimmed : c))
      }
    }

    const affected = items.value.filter(i => i.list_id === listId && i.category === oldName)
    for (const item of affected) {
      updateItemOptimistic(item.shopping_item_id, { category: trimmed })
      addToQueue({ operation: 'update', payload: { itemId: item.shopping_item_id, updates: { category: trimmed } } })
    }

    if (navigator.onLine) await syncMutations()
    toastStore.showToast('Kategorie umbenannt', 'success', 2000)
  }

  /**
   * Delete a category's still-to-buy items. Purchased items keep their category
   * label (they live in the global Gekauft history block) — deleting them here
   * would silently drop purchase history, so they're left untouched.
   */
  const deleteCategory = async (category: string) => {
    const toastStore = useToastStore()
    if (!currentListId.value) return
    const listId = currentListId.value

    // Drop a client-only pending (empty) category.
    const pending = pendingCategories.value[listId] ?? []
    if (pending.some(c => c.toLowerCase() === category.toLowerCase())) {
      pendingCategories.value = {
        ...pendingCategories.value,
        [listId]: pending.filter(c => c.toLowerCase() !== category.toLowerCase())
      }
    }

    const affected = items.value.filter(
      i => i.list_id === listId && i.category === category && !i.purchased
    )
    for (const item of affected) {
      deleteItemOptimistic(item.shopping_item_id)
      addToQueue({ operation: 'delete', payload: { itemId: item.shopping_item_id } })
    }

    if (navigator.onLine) await syncMutations()
    toastStore.showToast('Kategorie gelöscht', 'success', 2000)
  }

  // ============================================================================
  // REALTIME
  // ============================================================================

  const subscribeToItems = () => {
    const householdStore = useHouseholdStore()

    if (!householdStore.currentHousehold) {
      console.warn('Cannot subscribe: No current household')
      return
    }

    if (realtimeChannel) supabase.removeChannel(realtimeChannel)
    if (realtimeListsChannel) supabase.removeChannel(realtimeListsChannel)

    const hhId = householdStore.currentHousehold.household_id

    realtimeChannel = supabase
      .channel(`shopping-items-changes-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${hhId}` },
        (payload) => {
          console.log('📡 Realtime shopping items event:', payload)

          if (payload.eventType === 'INSERT') {
            const newItem = payload.new as ShoppingItem
            if (!items.value.find(i => i.shopping_item_id === newItem.shopping_item_id)) {
              items.value.push(newItem)
            }
          }

          if (payload.eventType === 'UPDATE') {
            const updatedItem = payload.new as ShoppingItem
            const index = items.value.findIndex(i => i.shopping_item_id === updatedItem.shopping_item_id)
            if (index !== -1) items.value[index] = updatedItem
          }

          if (payload.eventType === 'DELETE') {
            const deletedItem = payload.old as ShoppingItem
            items.value = items.value.filter(i => i.shopping_item_id !== deletedItem.shopping_item_id)
          }
        }
      )
      .subscribe()

    realtimeListsChannel = supabase
      .channel(`shopping-lists-changes-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_lists', filter: `household_id=eq.${hhId}` },
        (payload) => {
          console.log('📡 Realtime shopping lists event:', payload)

          if (payload.eventType === 'INSERT') {
            const newList = payload.new as ShoppingList
            if (!lists.value.find(l => l.list_id === newList.list_id)) {
              lists.value.push(newList)
            }
          }

          if (payload.eventType === 'UPDATE') {
            const updatedList = payload.new as ShoppingList
            const index = lists.value.findIndex(l => l.list_id === updatedList.list_id)
            if (index !== -1) lists.value[index] = updatedList
          }

          if (payload.eventType === 'DELETE') {
            const deletedList = payload.old as ShoppingList
            lists.value = lists.value.filter(l => l.list_id !== deletedList.list_id)
            items.value = items.value.filter(i => i.list_id !== deletedList.list_id)
            if (currentListId.value === deletedList.list_id) {
              currentListId.value = lists.value[0]?.list_id ?? null
            }
          }
        }
      )
      .subscribe()
  }

  const unsubscribeFromItems = () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
    if (realtimeListsChannel) {
      supabase.removeChannel(realtimeListsChannel)
      realtimeListsChannel = null
    }
  }

  // ============================================================================
  // Return - Public API
  // ============================================================================

  return {
    items,
    lists,
    currentListId,
    isLoading,
    isSyncing,
    pendingCategories,
    hasPendingMutations,
    currentListItems,
    unpurchasedItems,
    purchasedItems,
    itemsByCategory,
    categoryLabels,
    loadLists,
    createList,
    renameList,
    deleteList,
    loadItems,
    createItem,
    updateItem,
    togglePriority,
    markPurchased,
    markUnpurchased,
    deleteItem,
    addCategory,
    categoryImportCandidates,
    renameCategory,
    deleteCategory,
    subscribeToItems,
    unsubscribeFromItems,
    syncMutations
  }
})
