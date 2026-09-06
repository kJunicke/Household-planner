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

const DEFAULT_MAX_RETRIES = 5

export interface MutationQueueOptions {
  /** localStorage-Schlüssel, z. B. 'packing_mutation_queue'. */
  storageKey: string
  /** Schlüssel für registerSyncSource — eine Quelle je Store ('packing', 'todo'). */
  syncSourceKey: string
  /**
   * Eine Mutation ausführen. true = erledigt (wird entfernt). false = liegen lassen,
   * OHNE Fehlversuch (z. B. Ziel hat noch eine temp-ID). Wirft → retries++, lastError.
   */
  process: (m: PendingMutation) => Promise<boolean>
  /** Läuft, wenn die Warteschlange leer synchronisiert wurde (Neuabgleich laden). */
  onDrained?: () => Promise<void> | void
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
}

export function createMutationQueue(opts: MutationQueueOptions): MutationQueue {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES

  const queue = ref<PendingMutation[]>([])
  const isSyncing = ref(false)
  const hasPending = computed(() => queue.value.length > 0)

  const saveToStorage = () => {
    try {
      localStorage.setItem(opts.storageKey, JSON.stringify(queue.value))
    } catch (error) {
      console.error('Failed to save queue to storage:', error)
    }
  }

  const loadFromStorage = () => {
    try {
      const cached = localStorage.getItem(opts.storageKey)
      if (cached) {
        queue.value = JSON.parse(cached)
        console.log('📦 Loaded mutation queue from storage:', opts.storageKey, queue.value.length)
      }
    } catch (error) {
      console.error('Failed to load queue from storage:', error)
    }
  }

  loadFromStorage()
  watch(queue, saveToStorage, { deep: true })

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
    return queueItem
  }

  const rewrite = (fn: (m: PendingMutation) => void) => {
    for (const m of queue.value) fn(m)
  }

  const pendingItemIds = () =>
    new Set(queue.value.map((m) => m.payload.itemId).filter(Boolean) as string[])

  /**
   * Eine Mutation ausführen und den Fehlerfall in den Queue-Eintrag schreiben.
   * Ein Wurf ist ein Fehlversuch (retries++), ein `false` aus `process` nicht —
   * das heißt „noch nicht dran", nicht „kaputt".
   */
  const runOne = async (mutation: PendingMutation): Promise<boolean> => {
    try {
      return await opts.process(mutation)
    } catch (error) {
      console.error('❌ Failed to sync mutation:', mutation, error)
      mutation.lastError = error instanceof Error ? error.message : String(error)
      mutation.retries++
      return false
    }
  }

  const sync = async () => {
    if (!navigator.onLine) return
    if (isSyncing.value || queue.value.length === 0) return

    console.log('🔄 Starting sync of', queue.value.length, 'mutations...')
    isSyncing.value = true

    const toastStore = useToastStore()
    const failed: PendingMutation[] = []

    for (const mutation of queue.value) {
      if (mutation.retries >= maxRetries) {
        console.warn('⚠️ Max retries reached for mutation:', mutation)
        failed.push(mutation)
        continue
      }

      const success = await runOne(mutation)

      if (success) {
        queue.value = queue.value.filter((m) => m.queueId !== mutation.queueId)
      } else {
        failed.push(mutation)
      }
    }

    isSyncing.value = false

    if (failed.length > 0) {
      console.warn('⚠️ Some mutations failed to sync:', failed.length)
      toastStore.showToast(
        `${failed.length} Änderung(en) konnten nicht synchronisiert werden`,
        'error',
        3000,
      )
    } else if (queue.value.length === 0 && opts.successToast) {
      console.log('✅ All mutations synced successfully')
      toastStore.showToast(opts.successToast, 'success', 2000)
    }

    if (queue.value.length === 0) {
      await opts.onDrained?.()
    }
  }

  return { queue, hasPending, isSyncing, add, rewrite, sync, pendingItemIds }
}
