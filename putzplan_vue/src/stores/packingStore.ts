import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { PackingList } from '@/types/PackingList'
import type { PackingItem } from '@/types/PackingItem'
import { supabase } from '@/lib/supabase'
import { useHouseholdStore } from './householdStore'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

/** Sentinel key for the "Unkategorisiert" bucket (items with category === null). */
export const UNCATEGORIZED = '__uncategorized__'

export interface CategoryGroup {
  /** Real category label, or null for the Unkategorisiert bucket. */
  category: string | null
  /** Stable key for v-for (label or UNCATEGORIZED sentinel). */
  key: string
  label: string
  items: PackingItem[]
  /** Count of items whose `packed` flag is true. */
  packedCount: number
  total: number
  isComplete: boolean
  isUncategorized: boolean
}

export interface ImportCandidate {
  sourceListId: string
  sourceListName: string
  category: string
  itemCount: number
  /** created_at of the source list — newest first in the picker. */
  sourceCreatedAt: string
}

export const usePackingStore = defineStore('packing', () => {
  const lists = ref<PackingList[]>([])
  const items = ref<PackingItem[]>([])
  const currentListId = ref<string | null>(null)
  const isLoading = ref(false)

  /**
   * Client-only empty categories the user just created via "+ Kategorie".
   * Keyed by list_id. They vanish on reload once they still have no items,
   * which is fine — an empty category carries no data (no category table).
   */
  const pendingCategories = ref<Record<string, string[]>>({})

  let realtimeListsChannel: RealtimeChannel | null = null
  let realtimeItemsChannel: RealtimeChannel | null = null

  // ============================================================================
  // Getters
  // ============================================================================

  const currentList = computed(() =>
    lists.value.find(l => l.list_id === currentListId.value) ?? null
  )

  const currentListItems = computed(() => {
    if (!currentListId.value) return []
    return items.value.filter(i => i.list_id === currentListId.value)
  })

  /**
   * Items grouped into category sections.
   * Ordering: incomplete named categories (creation order) → complete named
   * categories → "Unkategorisiert" (always last, always present).
   * Within a section: unpacked first, packed last, each by created_at.
   */
  const itemsByCategory = computed<CategoryGroup[]>(() => {
    const list = currentListItems.value
    const groups = new Map<string, PackingItem[]>()
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
        firstSeen.set(cat, list.length + i) // newest → end of the incomplete band
      }
    })

    // Uncategorized is always present.
    if (!groups.has(UNCATEGORIZED)) {
      groups.set(UNCATEGORIZED, [])
      firstSeen.set(UNCATEGORIZED, Number.MAX_SAFE_INTEGER)
    }

    const result: CategoryGroup[] = []
    for (const [key, its] of groups) {
      const sorted = [...its].sort((a, b) => {
        if (a.packed !== b.packed) return a.packed ? 1 : -1
        return a.created_at.localeCompare(b.created_at)
      })
      const packedCount = its.filter(i => i.packed).length
      const total = its.length
      const isUncategorized = key === UNCATEGORIZED
      result.push({
        category: isUncategorized ? null : key,
        key,
        label: isUncategorized ? 'Unkategorisiert' : key,
        items: sorted,
        packedCount,
        total,
        isComplete: total > 0 && packedCount === total,
        isUncategorized,
      })
    }

    result.sort((a, b) => {
      if (a.isUncategorized) return 1
      if (b.isUncategorized) return -1
      if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1
      return (firstSeen.get(a.key) ?? 0) - (firstSeen.get(b.key) ?? 0)
    })
    return result
  })

  /** Overall progress: fully-packed items / total, consistent with X/Y headers. */
  const overallProgress = computed(() => {
    const list = currentListItems.value
    const total = list.length
    const packed = list.filter(i => i.packed).length
    return { packed, total, percent: total ? Math.round((packed / total) * 100) : 0 }
  })

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

  /** Create a new list as a copy of an existing one (items + category + quantity, reset packed). */
  const copyList = async (sourceListId: string, newName: string) => {
    const householdStore = useHouseholdStore()
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold || !authStore.user) return null

    try {
      const { data: newList, error: listError } = await supabase
        .from('packing_lists')
        .insert({
          household_id: householdStore.currentHousehold.household_id,
          name: newName.trim(),
          created_by: authStore.user.id
        })
        .select()
        .single()

      if (listError) throw listError

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
          .from('packing_items')
          .insert(rows)
          .select()

        if (itemsError) throw itemsError
        if (inserted) items.value.push(...inserted)
      }

      lists.value.push(newList)
      currentListId.value = newList.list_id
      toastStore.showToast('Liste kopiert', 'success', 2000)
      return newList
    } catch (error) {
      console.error('Error copying packing list:', error)
      toastStore.showToast('Fehler beim Kopieren der Liste', 'error')
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
        .from('packing_lists')
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
        .from('packing_lists')
        .delete()
        .eq('list_id', listId)

      if (error) throw error

      lists.value = lists.value.filter(l => l.list_id !== listId)
      items.value = items.value.filter(i => i.list_id !== listId)
      delete pendingCategories.value[listId]

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
  // Categories (client-only pending buckets + import candidates)
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
   */
  const categoryImportCandidates = (query: string): ImportCandidate[] => {
    const q = query.trim().toLowerCase()
    const listName = new Map(lists.value.map(l => [l.list_id, l]))
    const buckets = new Map<string, ImportCandidate>()

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

  /** Source items for an import candidate (used by the confirmation modal). */
  const importPreview = (sourceListId: string, category: string): PackingItem[] =>
    items.value.filter(i => i.list_id === sourceListId && i.category === category)

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

    // Merge onto an existing category's EXACT casing if one matches
    // case-insensitively — otherwise a "Bad" import next to "bad" would
    // split into two parallel sections with different hash colors.
    const existingLabel = currentListItems.value
      .map(i => i.category)
      .find(c => !!c && c.toLowerCase() === requestedLabel.toLowerCase())
    const finalLabel = existingLabel ?? (requestedLabel || null)

    const existingNames = new Set(
      currentListItems.value
        .filter(i => (i.category ?? '').toLowerCase() === requestedLabel.toLowerCase())
        .map(i => i.name.trim().toLowerCase())
    )

    const rows = source
      .filter(i => !existingNames.has(i.name.trim().toLowerCase()))
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
      toastStore.showToast('Alle Items bereits vorhanden', 'info', 2000)
      return
    }

    try {
      const { data, error } = await supabase
        .from('packing_items')
        .insert(rows)
        .select()

      if (error) throw error
      if (data) items.value.push(...data)
      toastStore.showToast(`${rows.length} Items übernommen`, 'success', 2000)
    } catch (error) {
      console.error('Error importing category:', error)
      toastStore.showToast('Fehler beim Übernehmen der Kategorie', 'error')
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

  const addItem = async (name: string, category: string | null = null, quantity = 1) => {
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    if (!currentListId.value || !authStore.user) return null

    const cat = category?.trim() || null
    const qty = Math.max(1, Math.floor(quantity) || 1)

    try {
      const { data, error } = await supabase
        .from('packing_items')
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
      return data
    } catch (error) {
      console.error('Error adding packing item:', error)
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

  /** Edit-modal save: name / category / quantity (clamps packed_count to quantity). */
  const updateItem = async (
    itemId: string,
    patch: { name?: string; category?: string | null; quantity?: number }
  ) => {
    await patchItem(itemId, item => {
      const next: Partial<PackingItem> = {}
      if (patch.name !== undefined) next.name = patch.name.trim()
      if (patch.category !== undefined) next.category = patch.category?.trim() || null
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
    mutate: (item: PackingItem) => Partial<PackingItem> | null
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
        .from('packing_items')
        .update(patch)
        .eq('item_id', itemId)

      if (error) throw error
    } catch (error) {
      console.error('Error updating packing item:', error)
      // Re-sync from the DB (source of truth) rather than blindly restoring the
      // pre-patch snapshot — a concurrent successful update (e.g. a rapid second
      // stepper tap) must not be clobbered by this failed one's revert.
      const { data } = await supabase
        .from('packing_items')
        .select('*')
        .eq('item_id', itemId)
        .maybeSingle()
      const revertIdx = items.value.findIndex(i => i.item_id === itemId)
      if (revertIdx !== -1) {
        if (data) items.value[revertIdx] = data as PackingItem
        else items.value[revertIdx] = prev
      }
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

  /** Reset a whole list: packed_count → 0 AND packed → false for every item. */
  const resetAllUnpacked = async (listId: string) => {
    const toastStore = useToastStore()
    const prev = items.value.map(i => ({ ...i }))

    items.value = items.value.map(i =>
      i.list_id === listId ? { ...i, packed: false, packed_count: 0 } : i
    )

    try {
      const { error } = await supabase
        .from('packing_items')
        .update({ packed: false, packed_count: 0 })
        .eq('list_id', listId)

      if (error) throw error
      toastStore.showToast('Alle als ungepackt markiert', 'success', 2000)
    } catch (error) {
      console.error('Error resetting packing items:', error)
      items.value = prev
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
    pendingCategories,
    currentList,
    currentListItems,
    itemsByCategory,
    overallProgress,
    loadLists,
    createList,
    copyList,
    renameList,
    updateNotes,
    deleteList,
    addCategory,
    categoryImportCandidates,
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
    unsubscribe
  }
})
