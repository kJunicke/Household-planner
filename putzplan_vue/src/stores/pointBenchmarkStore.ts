import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { PointBenchmark } from '@/types/PointBenchmark'
import { supabase } from '@/lib/supabase'
import { onSessionEnd } from '@/lib/sessionEnd'
import { quickOptions } from '@/lib/taskPoints'
import { useHouseholdStore } from './householdStore'

/**
 * Startbestand der Schnelloptionen — dieselben Zahlen, die die Migration
 * 20261119120000 jedem Haushalt anlegt. Gezeigt, solange die Richtwerte noch
 * nicht geladen sind (etwa beim Offline-Start), damit die Punktwahl nie ohne
 * Knöpfe dasteht.
 */
const STARTER_QUICK_OPTIONS = [1, 2, 3, 5, 8, 12]

/**
 * **Richtwerte** des Haushalts (Tabelle `point_benchmarks`): Laden und Realtime.
 *
 * Der Store verwaltet sich selbst: sobald ein Haushalt da ist, lädt er und
 * abonniert die Änderungen; wechselt oder endet der Haushalt, räumt er ab. Wer
 * ihn benutzt (die Punktwahl, die Pflege in den Einstellungen), ruft nichts auf.
 * Nachgeladen wird bei jedem (Wieder-)Beitritt des Kanals und beim Zurückkehren
 * auf den Tab — so holt ein Gerät nach, was es während eines Abrisses verpasst hat.
 */
export const usePointBenchmarkStore = defineStore('pointBenchmark', () => {
  const benchmarks = ref<PointBenchmark[]>([])
  const loaded = ref(false)

  let channel: RealtimeChannel | null = null
  let visibilityHandler: (() => void) | null = null
  // Antworten eines Ladelaufs für einen inzwischen verlassenen Haushalt verwerfen.
  let activeHouseholdId: string | null = null

  /** Punktzahlen der Schnelloptionen, aufsteigend (vor dem ersten Laden der Startbestand). */
  const quickOptionPoints = computed(() =>
    loaded.value ? quickOptions(benchmarks.value) : STARTER_QUICK_OPTIONS,
  )

  const load = async () => {
    const householdId = activeHouseholdId
    if (!householdId) return
    const { data, error } = await supabase
      .from('point_benchmarks')
      .select('*')
      .eq('household_id', householdId)
      .order('points', { ascending: true })
    if (householdId !== activeHouseholdId) return
    if (error) {
      // Kein Toast: die Punktwahl funktioniert ohne Richtwerte weiter (freies
      // Feld, Startbestand als Knöpfe); der nächste Beitritt lädt erneut.
      console.error('Error loading point benchmarks:', error)
      return
    }
    benchmarks.value = (data ?? []) as PointBenchmark[]
    loaded.value = true
  }

  const upsertLocal = (row: PointBenchmark) => {
    const idx = benchmarks.value.findIndex((b) => b.benchmark_id === row.benchmark_id)
    if (idx === -1) benchmarks.value.push(row)
    else benchmarks.value[idx] = row
  }

  const removeLocal = (benchmarkId: string) => {
    benchmarks.value = benchmarks.value.filter((b) => b.benchmark_id !== benchmarkId)
  }

  const unsubscribe = () => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  const subscribe = (householdId: string) => {
    unsubscribe()
    channel = supabase
      .channel(`point-benchmarks-${householdId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'point_benchmarks',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            removeLocal((payload.old as PointBenchmark).benchmark_id)
          } else {
            upsertLocal(payload.new as PointBenchmark)
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load()
      })

    visibilityHandler = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }

  const reset = () => {
    unsubscribe()
    activeHouseholdId = null
    benchmarks.value = []
    loaded.value = false
  }

  const householdStore = useHouseholdStore()
  watch(
    () => householdStore.currentHousehold?.household_id ?? null,
    (householdId) => {
      if (householdId === activeHouseholdId) return
      reset()
      if (!householdId) return
      activeHouseholdId = householdId
      subscribe(householdId)
    },
    { immediate: true },
  )

  // Session-Ende: Richtwerte gehören dem Haushalt des abgemeldeten Kontos.
  onSessionEnd(reset)

  return {
    benchmarks,
    loaded,
    quickOptionPoints,
  }
})
