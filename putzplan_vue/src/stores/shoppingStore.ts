import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ShoppingItem } from '@/types/ShoppingItem'
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
  const isLoading = ref(false)
  const mutationQueue = ref<PendingMutation[]>([])
  const isSyncing = ref(false)

  // Realtime subscription channel
  let realtimeChannel: RealtimeChannel | null = null

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

  const unpurchasedItems = computed(() => {
    return items.value
      .filter(item => !item.purchased)
      .sort((a, b) => {
        // Priority items first
        if (a.is_priority && !b.is_priority) return -1
        if (!a.is_priority && b.is_priority) return 1
        // Then sort alphabetically
        return a.name.localeCompare(b.name)
      })
  })

  const purchasedItems = computed(() => {
    return items.value
      .filter(item => item.purchased)
      .sort((a, b) => {
        // Sort by times_purchased descending (most purchased first)
        return b.times_purchased - a.times_purchased
      })
  })

  const hasPendingMutations = computed(() => mutationQueue.value.length > 0)

  // ============================================================================
  // Mutation Queue Helpers
  // ============================================================================

  const isTemporaryId = (id: string): boolean => {
    return id.startsWith('temp_')
  }

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

  const createItemOptimistic = (name: string): ShoppingItem => {
    const householdStore = useHouseholdStore()

    // Generate temporary ID
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const newItem: ShoppingItem = {
      shopping_item_id: tempId,
      household_id: householdStore.currentHousehold!.household_id,
      name: name.trim(),
      purchased: false,
      is_priority: false,
      times_purchased: 0,
      last_purchased_at: null,
      last_purchased_by: null,
      created_at: new Date().toISOString()
    }

    // Optimistic update
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
            household_id: householdStore.currentHousehold!.household_id
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
    if (isSyncing.value || mutationQueue.value.length === 0) {
      return
    }

    console.log('🔄 Starting sync of', mutationQueue.value.length, 'mutations...')
    isSyncing.value = true

    const toastStore = useToastStore()
    const failedMutations: PendingMutation[] = []

    for (const mutation of mutationQueue.value) {
      // Exponential backoff check
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

    // Reload items from server after sync
    if (mutationQueue.value.length === 0) {
      await loadItems()
    }
  }

  // ============================================================================
  // Actions
  // ============================================================================

  const loadItems = async () => {
    console.log('Loading shopping items...')

    // Load from cache first (instant UI)
    loadItemsFromCache()

    // Verhindere parallele Calls
    if (isLoading.value) {
      console.log('Already loading shopping items, skipping...')
      return
    }

    const householdStore = useHouseholdStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold) {
      console.warn('No current household, cannot load shopping items')
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
      console.log('Loaded shopping items:', items.value)

      // Load queue from storage
      loadQueueFromStorage()

      // Auto-sync pending mutations
      if (mutationQueue.value.length > 0) {
        await syncMutations()
      }

    } catch (error) {
      console.error('Error loading shopping items:', error)
      // Don't show error if we have cached data
      if (items.value.length === 0) {
        toastStore.showToast('Fehler beim Laden der Einkaufsliste', 'error')
      }
    } finally {
      isLoading.value = false
    }
  }

  // CREATE - Neues Item erstellen
  const createItem = async (name: string) => {
    const householdStore = useHouseholdStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold) {
      console.error('Cannot create item: No current household')
      toastStore.showToast('Fehler: Kein Haushalt ausgewählt', 'error')
      return null
    }

    if (!name.trim()) {
      console.error('Cannot create item: Name is empty')
      toastStore.showToast('Artikel-Name darf nicht leer sein', 'error')
      return null
    }

    // Optimistic update
    const tempItem = createItemOptimistic(name)

    // Add to queue for sync
    addToQueue({
      operation: 'create',
      payload: { name: name.trim() }
    })

    // Try sync immediately if online
    if (navigator.onLine) {
      await syncMutations()
    } else {
      toastStore.showToast('Offline: Wird synchronisiert sobald online', 'info', 3000)
    }

    return tempItem
  }

  // TOGGLE PRIORITY - Item als prioritär markieren/demarkieren
  const togglePriority = async (itemId: string) => {
    const toastStore = useToastStore()

    const item = items.value.find(i => i.shopping_item_id === itemId)
    if (!item) {
      console.error('Cannot toggle priority: Item not found')
      toastStore.showToast('Artikel nicht gefunden', 'error')
      return false
    }

    // Skip update mutations for temporary IDs
    if (isTemporaryId(itemId)) {
      console.warn('⚠️ Cannot update item with temporary ID, waiting for sync:', itemId)
      return false
    }

    const newPriority = !item.is_priority

    // Optimistic update
    updateItemOptimistic(itemId, { is_priority: newPriority })

    // Add to queue
    addToQueue({
      operation: 'update',
      payload: {
        itemId,
        updates: { is_priority: newPriority }
      }
    })

    // Try sync
    if (navigator.onLine) {
      await syncMutations()
    }

    return true
  }

  // MARK PURCHASED - Item als gekauft markieren
  const markPurchased = async (itemId: string) => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    if (!authStore.user) {
      console.error('Cannot mark purchased: No user logged in')
      toastStore.showToast('Fehler: Nicht angemeldet', 'error')
      return false
    }

    const item = items.value.find(i => i.shopping_item_id === itemId)
    if (!item) {
      console.error('Cannot mark purchased: Item not found')
      toastStore.showToast('Artikel nicht gefunden', 'error')
      return false
    }
    // Skip update mutations for temporary IDs
    if (isTemporaryId(itemId)) {
      console.warn('⚠️ Cannot update item with temporary ID, waiting for sync:', itemId)
      return false
    }


    // Optimistic update
    const now = new Date().toISOString()
    updateItemOptimistic(itemId, {
      purchased: true,
      is_priority: false,
      times_purchased: item.times_purchased + 1,
      last_purchased_at: now,
      last_purchased_by: authStore.user.id
    })

    // Add to queue
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

    // Try sync
    if (navigator.onLine) {
      await syncMutations()
    }

    return true
  }

  // MARK UNPURCHASED - Item zurück auf Todo-Liste
  const markUnpurchased = async (itemId: string) => {
    // Skip update mutations for temporary IDs
    if (isTemporaryId(itemId)) {
      console.warn('⚠️ Cannot update item with temporary ID, waiting for sync:', itemId)
      return false
    }

    // Optimistic update
    updateItemOptimistic(itemId, { purchased: false })

    // Add to queue
    addToQueue({
      operation: 'update',
      payload: {
        itemId,
        updates: { purchased: false }
      }
    })

    // Try sync
    if (navigator.onLine) {
      await syncMutations()
    }

    return true
  }

  // DELETE - Item permanent löschen
  const deleteItem = async (itemId: string) => {
    const toastStore = useToastStore()

    // Optimistic update
    deleteItemOptimistic(itemId)

    // Add to queue
    addToQueue({
      operation: 'delete',
      payload: { itemId }
    })

    // Try sync
    if (navigator.onLine) {
      await syncMutations()
    } else {
      toastStore.showToast('Offline: Wird synchronisiert sobald online', 'info', 3000)
    }

    return true
  }

  // ============================================================================
  // REALTIME - Subscribe zu Änderungen an shopping_items
  // ============================================================================

  const subscribeToItems = () => {
    const householdStore = useHouseholdStore()

    if (!householdStore.currentHousehold) {
      console.warn('Cannot subscribe: No current household')
      return
    }

    // Alte Subscription cleanup
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
    }

    console.log('🔴 Subscribing to shopping items for household:', householdStore.currentHousehold.household_id)

    // Neuen Channel erstellen & filtern auf household_id
    realtimeChannel = supabase
      .channel(`shopping-items-changes-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'shopping_items',
          filter: `household_id=eq.${householdStore.currentHousehold.household_id}`
        },
        (payload) => {
          console.log('📡 Realtime shopping items event:', payload)

          // INSERT - Neues Item wurde erstellt
          if (payload.eventType === 'INSERT') {
            const newItem = payload.new as ShoppingItem
            if (!items.value.find(i => i.shopping_item_id === newItem.shopping_item_id)) {
              items.value.push(newItem)
            }
          }

          // UPDATE - Item wurde geändert
          if (payload.eventType === 'UPDATE') {
            const updatedItem = payload.new as ShoppingItem
            const index = items.value.findIndex(i => i.shopping_item_id === updatedItem.shopping_item_id)
            if (index !== -1) {
              items.value[index] = updatedItem
            }
          }

          // DELETE - Item wurde gelöscht
          if (payload.eventType === 'DELETE') {
            const deletedItem = payload.old as ShoppingItem
            items.value = items.value.filter(i => i.shopping_item_id !== deletedItem.shopping_item_id)
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status:', status)

        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to shopping items')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Channel subscription error')
        } else if (status === 'TIMED_OUT') {
          console.error('❌ Subscription timed out')
        } else if (status === 'CLOSED') {
          console.warn('⚠️ Channel was closed')
        }
      })
  }

  // REALTIME - Unsubscribe von Änderungen
  const unsubscribeFromItems = () => {
    if (realtimeChannel) {
      console.log('🔴 Unsubscribing from shopping items')
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  // ============================================================================
  // Return - Public API
  // ============================================================================

  return {
    items,
    isLoading,
    isSyncing,
    hasPendingMutations,
    unpurchasedItems,
    purchasedItems,
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
