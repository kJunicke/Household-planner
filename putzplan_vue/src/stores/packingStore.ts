import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { PackingList } from '@/types/PackingList'
import type { PackingItem } from '@/types/PackingItem'
import { supabase } from '@/lib/supabase'
import { useHouseholdStore } from './householdStore'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

export const usePackingStore = defineStore('packing', () => {
  const lists = ref<PackingList[]>([])
  const items = ref<PackingItem[]>([])
  const currentListId = ref<string | null>(null)
  const isLoading = ref(false)

  let realtimeListsChannel: RealtimeChannel | null = null
  let realtimeItemsChannel: RealtimeChannel | null = null

  // ============================================================================
  // Getters
  // ============================================================================

  const currentListItems = computed(() => {
    if (!currentListId.value) return []
    return items.value.filter(i => i.list_id === currentListId.value)
  })

  const unpackedItems = computed(() =>
    currentListItems.value.filter(i => !i.packed)
  )

  const packedItems = computed(() =>
    currentListItems.value.filter(i => i.packed)
  )

  // ============================================================================
  // Lists
  // ============================================================================

  const loadLists = async () => {
    const householdStore = useHouseholdStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold) return

    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('packing_lists')
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
      console.error('Error loading packing lists:', error)
      toastStore.showToast('Fehler beim Laden der Packlisten', 'error')
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
        .from('packing_lists')
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
      return data
    } catch (error) {
      console.error('Error creating packing list:', error)
      toastStore.showToast('Fehler beim Erstellen der Packliste', 'error')
      return null
    }
  }

  const renameList = async (listId: string, name: string) => {
    const toastStore = useToastStore()

    try {
      const { error } = await supabase
        .from('packing_lists')
        .update({ name: name.trim() })
        .eq('list_id', listId)

      if (error) throw error

      const idx = lists.value.findIndex(l => l.list_id === listId)
      if (idx !== -1) lists.value[idx] = { ...lists.value[idx], name: name.trim() }
      toastStore.showToast('Liste umbenannt', 'success', 2000)
    } catch (error) {
      console.error('Error renaming packing list:', error)
      toastStore.showToast('Fehler beim Umbenennen', 'error')
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
        .from('packing_lists')
        .delete()
        .eq('list_id', listId)

      if (error) throw error

      lists.value = lists.value.filter(l => l.list_id !== listId)
      items.value = items.value.filter(i => i.list_id !== listId)

      if (currentListId.value === listId) {
        currentListId.value = lists.value[0]?.list_id ?? null
      }
      toastStore.showToast('Liste gelöscht', 'success', 2000)
    } catch (error) {
      console.error('Error deleting packing list:', error)
      toastStore.showToast('Fehler beim Löschen der Liste', 'error')
    }
  }

  // ============================================================================
  // Items
  // ============================================================================

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
        .from('packing_items')
        .select('*')
        .in('list_id', listIds)
        .order('created_at', { ascending: true })

      if (error) throw error

      items.value = data || []
    } catch (error) {
      console.error('Error loading packing items:', error)
      toastStore.showToast('Fehler beim Laden der Packliste', 'error')
    }
  }

  const addItem = async (name: string) => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    if (!currentListId.value || !authStore.user) return null

    try {
      const { data, error } = await supabase
        .from('packing_items')
        .insert({
          list_id: currentListId.value,
          name: name.trim(),
          packed: false,
          created_by: authStore.user.id
        })
        .select()
        .single()

      if (error) throw error

      items.value.push(data)
      return data
    } catch (error) {
      console.error('Error adding packing item:', error)
      toastStore.showToast('Fehler beim Hinzufügen', 'error')
      return null
    }
  }

  const togglePacked = async (itemId: string) => {
    const toastStore = useToastStore()
    const item = items.value.find(i => i.item_id === itemId)
    if (!item) return

    const newPacked = !item.packed

    // Optimistic update
    const idx = items.value.findIndex(i => i.item_id === itemId)
    items.value[idx] = { ...item, packed: newPacked }

    try {
      const { error } = await supabase
        .from('packing_items')
        .update({ packed: newPacked })
        .eq('item_id', itemId)

      if (error) throw error
    } catch (error) {
      console.error('Error toggling packed:', error)
      items.value[idx] = item // revert
      toastStore.showToast('Fehler beim Aktualisieren', 'error')
    }
  }

  const removeItem = async (itemId: string) => {
    const toastStore = useToastStore()

    try {
      const { error } = await supabase
        .from('packing_items')
        .delete()
        .eq('item_id', itemId)

      if (error) throw error

      items.value = items.value.filter(i => i.item_id !== itemId)
    } catch (error) {
      console.error('Error removing packing item:', error)
      toastStore.showToast('Fehler beim Löschen', 'error')
    }
  }

  const resetAllUnpacked = async (listId: string) => {
    const toastStore = useToastStore()

    try {
      const { error } = await supabase
        .from('packing_items')
        .update({ packed: false })
        .eq('list_id', listId)

      if (error) throw error

      items.value = items.value.map(i =>
        i.list_id === listId ? { ...i, packed: false } : i
      )
      toastStore.showToast('Alle als ungepackt markiert', 'success', 2000)
    } catch (error) {
      console.error('Error resetting packing items:', error)
      toastStore.showToast('Fehler beim Zurücksetzen', 'error')
    }
  }

  // ============================================================================
  // Realtime
  // ============================================================================

  const subscribe = () => {
    const householdStore = useHouseholdStore()
    if (!householdStore.currentHousehold) return

    const householdId = householdStore.currentHousehold.household_id

    if (realtimeListsChannel) supabase.removeChannel(realtimeListsChannel)
    if (realtimeItemsChannel) supabase.removeChannel(realtimeItemsChannel)

    realtimeListsChannel = supabase
      .channel(`packing-lists-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'packing_lists', filter: `household_id=eq.${householdId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newList = payload.new as PackingList
            if (!lists.value.find(l => l.list_id === newList.list_id)) {
              lists.value.push(newList)
            }
          }
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as PackingList
            const idx = lists.value.findIndex(l => l.list_id === updated.list_id)
            if (idx !== -1) lists.value[idx] = updated
          }
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as PackingList
            lists.value = lists.value.filter(l => l.list_id !== deleted.list_id)
            items.value = items.value.filter(i => i.list_id !== deleted.list_id)
            if (currentListId.value === deleted.list_id) {
              currentListId.value = lists.value[0]?.list_id ?? null
            }
          }
        }
      )
      .subscribe()

    realtimeItemsChannel = supabase
      .channel(`packing-items-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'packing_items' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newItem = payload.new as PackingItem
            if (!items.value.find(i => i.item_id === newItem.item_id)) {
              items.value.push(newItem)
            }
          }
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as PackingItem
            const idx = items.value.findIndex(i => i.item_id === updated.item_id)
            if (idx !== -1) items.value[idx] = updated
          }
          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as PackingItem
            items.value = items.value.filter(i => i.item_id !== deleted.item_id)
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
  }

  // ============================================================================
  // Public API
  // ============================================================================

  return {
    lists,
    items,
    currentListId,
    isLoading,
    currentListItems,
    unpackedItems,
    packedItems,
    loadLists,
    createList,
    renameList,
    deleteList,
    loadItems,
    addItem,
    togglePacked,
    removeItem,
    resetAllUnpacked,
    subscribe,
    unsubscribe
  }
})
