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

export const useShoppingStore = defineStore('shopping', () => {
  // State
  const items = ref<ShoppingItem[]>([])
  const lists = ref<ShoppingList[]>([])
  const currentListId = ref<string | null>(null)
  const isLoading = ref(false)
  const mutationQueue = ref<PendingMutation[]>([])
  const isSyncing = ref(false)

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

  const hasPendingMutations = computed(() => mutationQueue.value.length > 0)

  // ============================================================================
  // Mutation Queue Helpers
  // ============================================================================

  const isTemporaryId = (id: string): boolean => id.startsWith('temp_')

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

  const createItemOptimistic = (name: string, listId: string): ShoppingItem => {
    const householdStore = useHouseholdStore()
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const newItem: ShoppingItem = {
      shopping_item_id: tempId,
      household_id: householdStore.currentHousehold!.household_id,
      list_id: listId,
      name: name.trim(),
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

  // ============================================================================
  // Sync Engine
  // ============================================================================

  const processMutation = async (mutation: PendingMutation): Promise<boolean> => {
    const householdStore = useHouseholdStore()

    try {
      if (mutation.operation === 'create') {
        const { error } = await supabase
          .from('shopping_items')
          .insert({
            name: mutation.payload.name!,
            household_id: householdStore.currentHousehold!.household_id,
            list_id: mutation.payload.listId!
          })

        if (error) throw error

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

      items.value = data || []
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

  const createItem = async (name: string) => {
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

    const tempItem = createItemOptimistic(name, currentListId.value)

    addToQueue({
      operation: 'create',
      payload: { name: name.trim(), listId: currentListId.value }
    })

    if (navigator.onLine) {
      await syncMutations()
    } else {
      toastStore.showToast('Offline: Wird synchronisiert sobald online', 'info', 3000)
    }

    return tempItem
  }

  const togglePriority = async (itemId: string) => {
    const toastStore = useToastStore()

    const item = items.value.find(i => i.shopping_item_id === itemId)
    if (!item) {
      toastStore.showToast('Artikel nicht gefunden', 'error')
      return false
    }

    if (isTemporaryId(itemId)) {
      console.warn('⚠️ Cannot update item with temporary ID, waiting for sync:', itemId)
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

    if (isTemporaryId(itemId)) {
      console.warn('⚠️ Cannot update item with temporary ID, waiting for sync:', itemId)
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
    if (isTemporaryId(itemId)) {
      console.warn('⚠️ Cannot update item with temporary ID, waiting for sync:', itemId)
      return false
    }

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
    hasPendingMutations,
    unpurchasedItems,
    purchasedItems,
    loadLists,
    createList,
    renameList,
    deleteList,
    loadItems,
    createItem,
    togglePriority,
    markPurchased,
    markUnpurchased,
    deleteItem,
    subscribeToItems,
    unsubscribeFromItems,
    syncMutations
  }
})
