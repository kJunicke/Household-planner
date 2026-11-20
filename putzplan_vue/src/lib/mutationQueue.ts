// Generische Offline-Warteschlange.
//
// Verallgemeinerung der Mechanik, die im Einkaufs-Store inline liegt: Mutationen
// werden optimistisch angewandt, in einer Warteschlange gehalten, im localStorage
// gespiegelt und sequenziell abgearbeitet. Was hier NICHT liegt, ist das
// Ausführen einer einzelnen Mutation — das ist Sache des Stores (`process`),
// weil nur er seine Tabellen und seine Temp-ID-Verkettung kennt.
//
// Der Sync-Indikator im Header liest über `registerSyncSource` mit; deshalb wird
// die Warteschlange beim Anlegen sofort aus dem localStorage hergestellt (ein
// reiner Lesevorgang ohne Netzwerk). Sonst wüsste der Header von ausstehenden
// Änderungen erst, wenn die zugehörige Ansicht in dieser Sitzung geöffnet wurde.

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import type { PendingMutation } from '@/types/PendingMutation'
import { registerSyncSource } from '@/composables/useSyncStatus'
import { useToastStore } from '@/stores/toastStore'
import { runQueuePass, type QueuePassResult } from './queueRetry'
import {
  adoptLegacyQueue,
  isGuestOwner,
  readOwnedQueue,
  removeFromOwnedQueue,
  writeOwnedQueue,
} from './queueStorage'

const DEFAULT_MAX_RETRIES = 5

export interface MutationQueueOptions {
  /** localStorage-Schlüssel, z. B. 'packing_mutation_queue'; gespeichert wird je Besitzer. */
  storageKey: string
  /**
   * Besitzer der Warteschlange (`queueOwner(userId, householdId)`), reaktiv
   * gelesen. null = niemand angemeldet: nichts laden, nichts abspielen.
   */
  owner: () => string | null
  /** Schlüssel für registerSyncSource — eine Quelle je Store ('packing', 'todo'). */
  syncSourceKey: string
  /**
   * Eine Mutation ausführen. true = erledigt (wird entfernt). false = liegen lassen,
   * OHNE Fehlversuch (z. B. Ziel hat noch eine temp-ID). Wirft → Fehlversuch, außer bei
   * Netzfehlern (siehe `runQueuePass`).
   */
  process: (m: PendingMutation) => Promise<boolean>
  /**
   * Aufgegebene Mutationen, schon aus der Warteschlange entfernt: optimistische
   * temp-Zeilen wegräumen, die nie eine echte ID bekommen.
   */
  onDiscarded?: (discarded: PendingMutation[]) => void
  /**
   * Neuabgleich vom Server. Läuft, wenn ein Durchlauf die Warteschlange
   * geleert hat — und auch, wenn er etwas verworfen hat, obwohl noch anderes
   * wartet: sonst bliebe der optimistische Stand der verworfenen Änderung
   * stehen, als wäre sie gespeichert. Währenddessen meldet `isReconciling()`
   * true: ein Nachlader soll dann keinen weiteren Durchlauf anstoßen — der
   * eben fertige hat alles versucht, ein sofortiger zweiter wiederholte nur
   * dieselben Fehlschläge samt Meldung.
   */
  reconcile?: () => Promise<void> | void
  /**
   * Ordnet einen Altbestand vom ungebundenen Schlüssel dem aktuellen Haushalt
   * zu (`legacyListsBelong`). Fehlt sie, wird er nie übernommen.
   */
  ownsLegacy?: (legacy: PendingMutation[]) => boolean
  successToast?: string // z. B. 'Packliste synchronisiert'
  maxRetries?: number // Standard 5
}

export interface MutationQueue {
  queue: Ref<PendingMutation[]>
  hasPending: ComputedRef<boolean>
  isSyncing: Ref<boolean>
  add(m: Omit<PendingMutation, 'queueId' | 'timestamp' | 'retries'>): PendingMutation
  /** Alle wartenden Mutationen umschreiben (temp-ID → echte ID). */
  rewrite(fn: (m: PendingMutation) => void): void
  /** Sequenziell abarbeiten; bei navigator.onLine false sofort zurück. */
  sync(): Promise<void>
  /** Item-IDs mit wartender Mutation (für den Neuabgleich in loadItems). */
  pendingItemIds(): Set<string>
  /** true, solange `reconcile` nach einem Durchlauf läuft. */
  isReconciling(): boolean
  /**
   * Altbestand erneut prüfen, z. B. sobald die Listen geladen sind — beim
   * Anlegen der Warteschlange kennt `ownsLegacy` sie meist noch nicht.
   */
  adoptLegacy(): void
}

export function createMutationQueue(opts: MutationQueueOptions): MutationQueue {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES

  const queue = ref<PendingMutation[]>([])
  const isSyncing = ref(false)
  let reconciling = false
  const hasPending = computed(() => queue.value.length > 0)

  const owner = computed(opts.owner)

  const saveToStorage = (key = owner.value) => {
    if (!key) return
    try {
      writeOwnedQueue(localStorage, opts.storageKey, key, queue.value)
    } catch (error) {
      console.error('Failed to save queue to storage:', error)
    }
  }

  const loadFromStorage = () => {
    const key = owner.value
    try {
      queue.value = key ? readOwnedQueue(localStorage, opts.storageKey, key, opts.ownsLegacy) : []
      console.log('📦 Loaded mutation queue from storage:', opts.storageKey, queue.value.length)
    } catch (error) {
      console.error('Failed to load queue from storage:', error)
    }
  }

  // Wechselt der Besitzer, die bisherige Warteschlange unter ihm sichern und
  // die des neuen laden — nie die eines anderen Nutzers abspielen.
  watch(
    owner,
    (_key, previous) => {
      if (previous) saveToStorage(previous)
      loadFromStorage()
    },
    { immediate: true },
  )
  watch(queue, () => saveToStorage(), { deep: true })

  registerSyncSource(opts.syncSourceKey, { hasPending, isSyncing })

  const add = (mutation: Omit<PendingMutation, 'queueId' | 'timestamp' | 'retries'>) => {
    const queueItem: PendingMutation = {
      ...mutation,
      queueId: `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      timestamp: Date.now(),
      retries: 0,
    }
    queue.value.push(queueItem)
    console.log('📝 Added to queue:', queueItem)
    // Gast: sofort schreiben, auch ohne Netz — scheitert es, wird verworfen
    // statt gewartet. Was jetzt schon läuft, nimmt die Mutation mit.
    if (isGuestOwner(owner.value)) void sync()
    return queueItem
  }

  const rewrite = (fn: (m: PendingMutation) => void) => {
    for (const m of queue.value) fn(m)
  }

  const adoptLegacy = () => {
    const key = owner.value
    if (!key || !opts.ownsLegacy || queue.value.length > 0) return
    try {
      const adopted = adoptLegacyQueue(localStorage, opts.storageKey, key, opts.ownsLegacy)
      if (adopted.length > 0) queue.value = adopted
    } catch (error) {
      console.error('Failed to adopt legacy queue:', error)
    }
  }

  const pendingItemIds = () =>
    new Set(queue.value.map((m) => m.payload.itemId).filter(Boolean) as string[])

  const sync = async () => {
    const key = owner.value
    const direct = isGuestOwner(key)
    if (!navigator.onLine && !direct) return
    if (!key || isSyncing.value || queue.value.length === 0) return

    console.log('🔄 Starting sync of', queue.value.length, 'mutations...')
    isSyncing.value = true

    const toastStore = useToastStore()
    let result: QueuePassResult
    try {
      result = await runQueuePass({
        current: () => queue.value,
        process: opts.process,
        remove: (ids) => {
          if (owner.value === key) {
            queue.value = queue.value.filter((m) => !ids.includes(m.queueId))
            return
          }
          // Das Abmelden hat die Anfrage überholt; die Warteschlange liegt schon
          // gesichert unter dem alten Besitzer — dort streichen, sonst läuft sie
          // beim nächsten Login ein zweites Mal.
          try {
            removeFromOwnedQueue(localStorage, opts.storageKey, key, ids)
          } catch (error) {
            console.error('Failed to update stored queue:', error)
          }
        },
        maxRetries,
        shouldStop: () => owner.value !== key,
        direct,
      })
    } finally {
      isSyncing.value = false
    }
    if (owner.value !== key) return

    if (result.serverNotice) {
      toastStore.showToast('Server antwortet nicht – Änderungen warten', 'info', 4000)
    }
    if (result.discarded.length > 0) {
      console.warn('🗑️ Gave up on mutations:', result.discarded)
      opts.onDiscarded?.(result.discarded)
      toastStore.showToast(
        `${result.discarded.length} Änderung(en) ließen sich nicht speichern und wurden verworfen`,
        'error',
        5000,
      )
    } else if (result.failed > 0) {
      console.warn('⚠️ Some mutations failed to sync:', result.failed)
      toastStore.showToast(
        `${result.failed} Änderung(en) konnten nicht synchronisiert werden`,
        'error',
        3000,
      )
    } else if (!result.interrupted && queue.value.length === 0 && opts.successToast) {
      console.log('✅ All mutations synced successfully')
      toastStore.showToast(opts.successToast, 'success', 2000)
    }

    if (queue.value.length === 0 || result.discarded.length > 0) {
      reconciling = true
      try {
        await opts.reconcile?.()
      } finally {
        reconciling = false
      }
    }
  }

  return {
    queue,
    hasPending,
    isSyncing,
    add,
    rewrite,
    sync,
    pendingItemIds,
    isReconciling: () => reconciling,
    adoptLegacy,
  }
}
