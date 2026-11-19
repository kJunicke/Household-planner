import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { PointBenchmark } from '@/types/PointBenchmark'
import { supabase } from '@/lib/supabase'
import { onSessionEnd } from '@/lib/sessionEnd'
import { isInFlight, isNetworkError, revertRows, runOptimistic } from '@/lib/optimistic'
import { duplicatePointsMessage } from '@/lib/pointBenchmarks'
import { quickOptions } from '@/lib/taskPoints'
import { useHouseholdStore } from './householdStore'
import { useToastStore } from './toastStore'

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
 *
 * Gepflegt (Einstellungen) wird über die optimistische Schicht: sofort lokal,
 * im Hintergrund bestätigt, bei Fehlschlag zurückgenommen. Keine
 * Offline-Warteschlange — die haben nur die Listen. Die Eingaben prüft vorher
 * `@/lib/pointBenchmarks`; die Datenbank prüft sie noch einmal.
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
    // Echo-Schutz: für Zeilen, deren eigene Mutation unterwegs ist, gilt der
    // lokale Stand ganz — vorhanden (Anlegen, Ändern) wie fehlend (Löschen).
    // Sonst verschwände ein gerade angelegter Richtwert kurz, oder ein
    // gelöschter käme zurück.
    const fresh = (data ?? []) as PointBenchmark[]
    benchmarks.value = [
      ...fresh.filter((b) => !isInFlight(b.benchmark_id)),
      ...benchmarks.value.filter((b) => isInFlight(b.benchmark_id)),
    ]
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
          // Echo eigener, noch laufender Mutationen überspringen: das Echo des
          // ersten von zwei schnellen Umschaltern zöge den Schalter zurück.
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as PointBenchmark).benchmark_id
            if (!isInFlight(id)) removeLocal(id)
          } else {
            const row = payload.new as PointBenchmark
            if (!isInFlight(row.benchmark_id)) upsertLocal(row)
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

  // ---------------------------------------------------------------
  // Pflege (Einstellungen)
  // ---------------------------------------------------------------

  type BenchmarkSnapshot = Pick<PointBenchmark, 'benchmark_id' | 'is_quick_option' | 'examples'>

  const isDuplicatePointsError = (error: unknown): boolean =>
    (error as { code?: string } | null)?.code === '23505'

  /**
   * Neuer Richtwert, noch ohne Beispiele. `points` ist schon geprüft
   * (`parseBenchmarkPoints`); hat das andere Gerät dieselbe Zahl gerade
   * angelegt, weist der eindeutige Index ab, und der Richtwert verschwindet mit
   * Meldung wieder.
   *
   * Die ID vergibt der Client, damit das Realtime-Echo die optimistische Zeile
   * trifft, statt eine zweite anzulegen.
   */
  const createBenchmark = (points: number, isQuickOption: boolean): boolean => {
    const householdId = activeHouseholdId
    if (!householdId) return false
    const toastStore = useToastStore()
    const row: PointBenchmark = {
      benchmark_id: crypto.randomUUID(),
      household_id: householdId,
      points,
      is_quick_option: isQuickOption,
      examples: [],
      created_at: new Date().toISOString(),
    }

    const { applied } = runOptimistic<PointBenchmark>({
      entityId: row.benchmark_id,
      apply: () => {
        benchmarks.value.push(row)
        return row
      },
      commit: async () => {
        const { error } = await supabase.from('point_benchmarks').insert({
          benchmark_id: row.benchmark_id,
          household_id: row.household_id,
          points: row.points,
          is_quick_option: row.is_quick_option,
          examples: row.examples,
        })
        if (error) throw error
      },
      revert: (snapshot) => removeLocal(snapshot.benchmark_id),
      onError: (error) => {
        toastStore.showToast(
          isDuplicatePointsError(error)
            ? duplicatePointsMessage(points)
            : 'Richtwert konnte nicht angelegt werden',
          'error',
        )
      },
    })
    return applied
  }

  /**
   * Schnelloption an/aus oder Beispiele ersetzen. Abschalten nimmt nur den
   * Knopf aus der Punktwahl; Richtwert und Beispiele bleiben. Aufgaben
   * behalten ihre Standardpunkte — sie hängen an keinem Richtwert.
   */
  const updateBenchmark = (
    benchmarkId: string,
    patch: Partial<Pick<PointBenchmark, 'is_quick_option' | 'examples'>>,
  ): boolean => {
    const toastStore = useToastStore()
    const { applied } = runOptimistic<BenchmarkSnapshot>({
      entityId: benchmarkId,
      apply: () => {
        const row = benchmarks.value.find((b) => b.benchmark_id === benchmarkId)
        if (!row) return null
        const snapshot: BenchmarkSnapshot = {
          benchmark_id: row.benchmark_id,
          is_quick_option: row.is_quick_option,
          examples: row.examples,
        }
        Object.assign(row, patch)
        return snapshot
      },
      commit: async () => {
        const { error } = await supabase
          .from('point_benchmarks')
          .update(patch)
          .eq('benchmark_id', benchmarkId)
        if (error) throw error
      },
      revert: async (snapshot, error) => {
        await revertRows({
          table: 'point_benchmarks',
          pkColumn: 'benchmark_id',
          snapshots: [snapshot],
          list: benchmarks,
          skipReload: isNetworkError(error),
        })
      },
      onError: () => {
        toastStore.showToast('Richtwert konnte nicht gespeichert werden', 'error')
      },
    })
    return applied
  }

  /** Richtwert löschen. Aufgaben behalten ihre Standardpunkte. */
  const deleteBenchmark = (benchmarkId: string): boolean => {
    const toastStore = useToastStore()
    const { applied } = runOptimistic<PointBenchmark>({
      entityId: benchmarkId,
      apply: () => {
        const row = benchmarks.value.find((b) => b.benchmark_id === benchmarkId)
        if (!row) return null
        removeLocal(benchmarkId)
        return row
      },
      commit: async () => {
        const { error } = await supabase
          .from('point_benchmarks')
          .delete()
          .eq('benchmark_id', benchmarkId)
        if (error) throw error
      },
      // Zurück kommt die Zeile, wie sie jetzt in der Datenbank steht; gibt es
      // sie dort nicht mehr (anderes Gerät hat gelöscht), bleibt sie weg. Ohne
      // Netz gilt der Schnappschuss.
      revert: async (snapshot, error) => {
        if (isNetworkError(error)) {
          upsertLocal(snapshot)
          return
        }
        const { data } = await supabase
          .from('point_benchmarks')
          .select('*')
          .eq('benchmark_id', benchmarkId)
          .maybeSingle()
        if (data) upsertLocal(data as PointBenchmark)
      },
      onError: () => {
        toastStore.showToast('Richtwert konnte nicht gelöscht werden', 'error')
      },
    })
    return applied
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
    createBenchmark,
    updateBenchmark,
    deleteBenchmark,
  }
})
