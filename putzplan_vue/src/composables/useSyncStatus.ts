import { computed, shallowReactive, unref, type ComputedRef, type Ref } from 'vue'
import { useNetworkStatus } from './useNetworkStatus'

type BoolSource = Ref<boolean> | ComputedRef<boolean>

/**
 * Eine Datenquelle, die unsynchronisierte Änderungen halten kann.
 * Heute meldet sich nur der Einkaufs-Store an; Etappe 5 (Checklisten) kann sich
 * ohne Änderung am Header andocken.
 */
export interface SyncSource {
  hasPending: BoolSource
  isSyncing: BoolSource
}

/** Zustand des globalen Sync-Indikators. `idle` heißt: alles gut, nichts anzeigen. */
export type SyncState = 'offline' | 'syncing' | 'idle'

// Modul-global, damit sich Stores einmalig beim Setup registrieren können und der
// Indikator unabhängig davon lebt, welche View gerade offen ist.
const sources = shallowReactive<Record<string, SyncSource>>({})

/** Meldet eine Quelle unter einem eindeutigen Schlüssel an (idempotent). */
export function registerSyncSource(key: string, source: SyncSource) {
  sources[key] = source
}

/**
 * Aggregierter Sync-Zustand über alle angemeldeten Quellen.
 * Die Aussage ist bewusst unspezifisch — „irgendetwas ist unsynchronisiert",
 * nicht „der Einkauf ist unsynchronisiert".
 */
export function useSyncStatus() {
  const { isOnline } = useNetworkStatus()

  const hasPending = computed(() =>
    Object.values(sources).some(s => unref(s.hasPending))
  )
  const isSyncing = computed(() =>
    Object.values(sources).some(s => unref(s.isSyncing))
  )

  const state = computed<SyncState>(() => {
    if (!isOnline.value) return 'offline'
    if (isSyncing.value || hasPending.value) return 'syncing'
    return 'idle'
  })

  return { state, isOnline, hasPending, isSyncing }
}
