import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { ShoppingItem } from '@/types/ShoppingItem'
import { supabase } from '@/lib/supabase'
import { useHouseholdStore } from './householdStore'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

export const useShoppingStore = defineStore('shopping', () => {
  // State
  const items = ref<ShoppingItem[]>([])
  const isLoading = ref(false)

  // Realtime subscription channel
  let realtimeChannel: RealtimeChannel | null = null

  // Getters (computed)
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
        // Sort by last_purchased_at descending (newest first)
        if (!a.last_purchased_at) return 1
        if (!b.last_purchased_at) return -1
        return new Date(b.last_purchased_at).getTime() - new Date(a.last_purchased_at).getTime()
      })
  })

  // Actions
  const loadItems = async () => {
    console.log('Loading shopping items...')

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
    } catch (error) {
      console.error('Error loading shopping items:', error)
      toastStore.showToast('Fehler beim Laden der Einkaufsliste', 'error')
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

    isLoading.value = true

    const { data, error } = await supabase
      .from('shopping_items')
      .insert({
        name: name.trim(),
        household_id: householdStore.currentHousehold.household_id
      })
      .select()
      .single()

    isLoading.value = false

    if (error) {
      console.error('Error creating shopping item:', error)
      toastStore.showToast('Fehler beim Hinzufügen des Artikels', 'error')
      return null
    }

    // Lokalen State aktualisieren - nur wenn nicht schon vorhanden (Race Condition mit Realtime)
    if (!items.value.find(i => i.shopping_item_id === data.shopping_item_id)) {
      items.value.push(data)
    }
    toastStore.showToast('Artikel hinzugefügt', 'success', 2000)
    return data
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

    isLoading.value = true

    const { error } = await supabase
      .from('shopping_items')
      .update({
        is_priority: !item.is_priority
      })
      .eq('shopping_item_id', itemId)

    isLoading.value = false

    if (error) {
      console.error('Error toggling priority:', error)
      toastStore.showToast('Fehler beim Setzen der Priorität', 'error')
      return false
    }

    // Lokalen State aktualisieren
    const itemIndex = items.value.findIndex(i => i.shopping_item_id === itemId)
    if (itemIndex !== -1) {
      items.value[itemIndex].is_priority = !items.value[itemIndex].is_priority
    }

    return true
  }

  // MARK PURCHASED - Item als gekauft markieren
  // Inkrementiert times_purchased, setzt purchased = true und Timestamps
  // Priority wird automatisch vom DB-Trigger entfernt
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

    isLoading.value = true

    const { error } = await supabase
      .from('shopping_items')
      .update({
        purchased: true,
        times_purchased: item.times_purchased + 1,
        last_purchased_at: new Date().toISOString(),
        last_purchased_by: authStore.user.id
      })
      .eq('shopping_item_id', itemId)

    isLoading.value = false

    if (error) {
      console.error('Error marking item purchased:', error)
      toastStore.showToast('Fehler beim Abhaken des Artikels', 'error')
      return false
    }

    // Lokalen State aktualisieren
    const itemIndex = items.value.findIndex(i => i.shopping_item_id === itemId)
    if (itemIndex !== -1) {
      items.value[itemIndex].purchased = true
      items.value[itemIndex].is_priority = false // Trigger entfernt Priorität
      items.value[itemIndex].times_purchased += 1
      items.value[itemIndex].last_purchased_at = new Date().toISOString()
      items.value[itemIndex].last_purchased_by = authStore.user.id
    }

    return true
  }

  // MARK UNPURCHASED - Item zurück auf Todo-Liste
  // Setzt nur purchased = false, lässt times_purchased unverändert
  const markUnpurchased = async (itemId: string) => {
    const toastStore = useToastStore()
    isLoading.value = true

    const { error } = await supabase
      .from('shopping_items')
      .update({
        purchased: false
      })
      .eq('shopping_item_id', itemId)

    isLoading.value = false

    if (error) {
      console.error('Error marking item unpurchased:', error)
      toastStore.showToast('Fehler beim Zurücksetzen des Artikels', 'error')
      return false
    }

    // Lokalen State aktualisieren
    const itemIndex = items.value.findIndex(i => i.shopping_item_id === itemId)
    if (itemIndex !== -1) {
      items.value[itemIndex].purchased = false
    }

    return true
  }

  // DELETE - Item permanent löschen
  const deleteItem = async (itemId: string) => {
    const toastStore = useToastStore()
    isLoading.value = true

    const { error } = await supabase
      .from('shopping_items')
      .delete()
      .eq('shopping_item_id', itemId)

    isLoading.value = false

    if (error) {
      console.error('Error deleting shopping item:', error)
      toastStore.showToast('Fehler beim Löschen des Artikels', 'error')
      return false
    }

    // Lokalen State aktualisieren
    items.value = items.value.filter(i => i.shopping_item_id !== itemId)
    toastStore.showToast('Artikel gelöscht', 'success', 2000)
    return true
  }

  // REALTIME - Subscribe zu Änderungen an shopping_items
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

  // Return - Public API
  return {
    items,
    isLoading,
    unpurchasedItems,
    purchasedItems,
    loadItems,
    createItem,
    togglePriority,
    markPurchased,
    markUnpurchased,
    deleteItem,
    subscribeToItems,
    unsubscribeFromItems
  }
})
