import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Settlement, SettlementMethod } from '@/types/Settlement'
import { supabase } from '@/lib/supabase'
import { useHouseholdStore } from './householdStore'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import { useTaskStore } from './taskStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface CompletionForBalance {
  user_id: string
  effort_override: number
}

export const useSettlementStore = defineStore('settlement', () => {
  const settlements = ref<Settlement[]>([])
  const completions = ref<CompletionForBalance[]>([])
  const isLoading = ref(false)

  let realtimeChannel: RealtimeChannel | null = null

  // ============================================================================
  // Getters
  // ============================================================================

  /**
   * Total points per user across all-time completions (no time filter — balance is cumulative).
   */
  const pointsByUser = computed(() => {
    const map = new Map<string, number>()
    for (const c of completions.value) {
      map.set(c.user_id, (map.get(c.user_id) ?? 0) + c.effort_override)
    }
    return map
  })

  /**
   * For each ordered pair (userId, otherUserId), the settled points
   * where from_user_id = userId compensated to_user_id = otherUserId.
   */
  const settledByPair = computed(() => {
    const map = new Map<string, number>()
    for (const s of settlements.value) {
      const key = `${s.from_user_id}__${s.to_user_id}`
      map.set(key, (map.get(key) ?? 0) + s.points_settled)
    }
    return map
  })

  /**
   * Open balance between every unique user pair in the household.
   * balances[i] = { userAId, userBId, balance }
   *   balance > 0 → userA is ahead (userB owes userA)
   *   balance < 0 → userB is ahead (userA owes userB)
   * Only pairs with a non-zero balance are included.
   */
  const pairBalances = computed(() => {
    const householdStore = useHouseholdStore()
    const members = householdStore.householdMembers
    const result: { userAId: string; userBId: string; balance: number }[] = []

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i].user_id
        const b = members[j].user_id

        const ptsA = pointsByUser.value.get(a) ?? 0
        const ptsB = pointsByUser.value.get(b) ?? 0
        const grossDiff = ptsA - ptsB

        // Settled: A compensated B (reduces A's advantage); B compensated A (increases A's advantage)
        const settledAtoB = settledByPair.value.get(`${a}__${b}`) ?? 0
        const settledBtoA = settledByPair.value.get(`${b}__${a}`) ?? 0
        const netBalance = grossDiff - settledAtoB + settledBtoA

        if (netBalance !== 0) {
          result.push({ userAId: a, userBId: b, balance: netBalance })
        }
      }
    }

    return result
  })

  const sortedSettlements = computed(() =>
    [...settlements.value].sort(
      (a, b) => new Date(b.settled_at).getTime() - new Date(a.settled_at).getTime()
    )
  )

  // ============================================================================
  // Actions
  // ============================================================================

  const loadSettlements = async () => {
    const householdStore = useHouseholdStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold) return

    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .eq('household_id', householdStore.currentHousehold.household_id)
        .order('settled_at', { ascending: false })

      if (error) throw error
      settlements.value = data || []
    } catch (error) {
      console.error('Error loading settlements:', error)
      toastStore.showToast('Fehler beim Laden der Ausgleiche', 'error')
    } finally {
      isLoading.value = false
    }
  }

  const loadCompletions = async () => {
    const taskStore = useTaskStore()
    const raw = await taskStore.fetchCompletions()
    completions.value = (raw as CompletionForBalance[]).filter(
      c => typeof c.effort_override === 'number'
    )
  }

  const createSettlement = async (payload: {
    fromUserId: string
    toUserId: string
    pointsSettled: number
    method: SettlementMethod
    description?: string
    settledAt?: string
  }) => {
    const householdStore = useHouseholdStore()
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold || !authStore.user) return null

    try {
      const { data, error } = await supabase
        .from('settlements')
        .insert({
          household_id: householdStore.currentHousehold.household_id,
          from_user_id: payload.fromUserId,
          to_user_id: payload.toUserId,
          points_settled: payload.pointsSettled,
          method: payload.method,
          description: payload.description?.trim() || null,
          settled_at: payload.settledAt ?? new Date().toISOString(),
          created_by: authStore.user.id
        })
        .select()
        .single()

      if (error) throw error

      settlements.value.unshift(data)
      toastStore.showToast('Ausgleich eingetragen', 'success', 2000)
      return data
    } catch (error) {
      console.error('Error creating settlement:', error)
      toastStore.showToast('Fehler beim Eintragen des Ausgleichs', 'error')
      return null
    }
  }

  const deleteSettlement = async (settlementId: string) => {
    const toastStore = useToastStore()

    try {
      const { error } = await supabase
        .from('settlements')
        .delete()
        .eq('settlement_id', settlementId)

      if (error) throw error

      settlements.value = settlements.value.filter(s => s.settlement_id !== settlementId)
      toastStore.showToast('Ausgleich gelöscht', 'success', 2000)
    } catch (error) {
      console.error('Error deleting settlement:', error)
      toastStore.showToast('Fehler beim Löschen — nur eigene Einträge der letzten 5 Minuten können gelöscht werden', 'error')
    }
  }

  // ============================================================================
  // Realtime
  // ============================================================================

  const subscribe = () => {
    const householdStore = useHouseholdStore()
    if (!householdStore.currentHousehold) return

    if (realtimeChannel) supabase.removeChannel(realtimeChannel)

    realtimeChannel = supabase
      .channel(`settlements-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settlements',
          filter: `household_id=eq.${householdStore.currentHousehold.household_id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const s = payload.new as Settlement
            if (!settlements.value.find(x => x.settlement_id === s.settlement_id)) {
              settlements.value.unshift(s)
            }
          }
          if (payload.eventType === 'UPDATE') {
            const s = payload.new as Settlement
            const idx = settlements.value.findIndex(x => x.settlement_id === s.settlement_id)
            if (idx !== -1) settlements.value[idx] = s
          }
          if (payload.eventType === 'DELETE') {
            const s = payload.old as Settlement
            settlements.value = settlements.value.filter(x => x.settlement_id !== s.settlement_id)
          }
        }
      )
      .subscribe()
  }

  const unsubscribe = () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  return {
    settlements,
    isLoading,
    pairBalances,
    sortedSettlements,
    pointsByUser,
    loadSettlements,
    loadCompletions,
    createSettlement,
    deleteSettlement,
    subscribe,
    unsubscribe
  }
})
