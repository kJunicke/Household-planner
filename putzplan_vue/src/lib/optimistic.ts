// Schicht 1 der optimistischen Aktualisierungen: sofort lokal anwenden, im
// Hintergrund bestätigen, bei Fehlschlag zurücknehmen. Ohne Persistenz und ohne
// Offline-Queue — die hat weiterhin nur der Einkauf (Schicht 2).
//
// Vier Belange:
//   Apply   — lokale Änderung, sofort sichtbar (Aufrufer liefert sie als Callback)
//   Commit  — der Serveraufruf; wirft bei Fehlschlag
//   Revert  — Rücknahme; Vorlage ist `patchItem` in createChecklistStore.ts:
//             die Zeile nachladen und nur bei Nichtexistenz auf den Schnappschuss
//             zurückfallen, damit eine parallel erfolgreiche Änderung nicht
//             plattgemacht wird
//   Buchführung — Zähler laufender Mutationen + Menge der IDs „in Flug"
//
// An der Buchführung hängen Sync-Indikator, Echo-Schutz und die Serialisierung
// pro Entity-ID.

import { computed, ref, shallowRef, triggerRef } from 'vue'
import { supabase } from '@/lib/supabase'
import { registerSyncSource } from '@/composables/useSyncStatus'

// ---------------------------------------------------------------------------
// Buchführung
// ---------------------------------------------------------------------------

/** Anzahl aktuell laufender Mutationen (über alle Entitäten). */
const pendingCount = ref(0)

/**
 * IDs, die gerade in Flug sind — mit Zählung, weil dieselbe ID mehrfach
 * hintereinander mutiert werden kann, bevor die erste Antwort da ist.
 */
const inFlight = shallowRef(new Map<string, number>())

/**
 * Ist diese Entity-ID gerade in Flug? Realtime und Hintergrund-Reloads dürfen
 * solche Zeilen nicht überschreiben, sonst blinkt der optimistische Zustand weg.
 */
export function isInFlight(id: string): boolean {
    return inFlight.value.has(id)
}

function markInFlight(id: string) {
    const map = inFlight.value
    map.set(id, (map.get(id) ?? 0) + 1)
    triggerRef(inFlight)
}

function clearInFlight(id: string) {
    const map = inFlight.value
    const next = (map.get(id) ?? 1) - 1
    if (next <= 0) map.delete(id)
    else map.set(id, next)
    triggerRef(inFlight)
}

// ---------------------------------------------------------------------------
// Sync-Indikator
// ---------------------------------------------------------------------------

/**
 * Verzögerte Anzeige: erst wenn eine Mutation länger als SYNC_DELAY_MS dauert,
 * meldet sich der Header. Sonst flackert er bei jedem Tap.
 */
const SYNC_DELAY_MS = 400
const syncingVisible = ref(false)
let syncTimer: ReturnType<typeof setTimeout> | null = null

function refreshSyncIndicator() {
    if (pendingCount.value > 0) {
        if (syncingVisible.value || syncTimer !== null) return
        syncTimer = setTimeout(() => {
            syncTimer = null
            // Zwischenzeitlich fertig geworden? Dann nichts anzeigen.
            if (pendingCount.value > 0) syncingVisible.value = true
        }, SYNC_DELAY_MS)
        return
    }

    if (syncTimer !== null) {
        clearTimeout(syncTimer)
        syncTimer = null
    }
    syncingVisible.value = false
}

// `hasPending` bleibt dem Einkauf vorbehalten (persistente Queue). Hier gibt es
// nur „läuft gerade" — nach einem Fehlschlag ist die Änderung zurückgenommen,
// nicht ausstehend.
registerSyncSource('mutations', {
    hasPending: computed(() => false),
    isSyncing: computed(() => syncingVisible.value)
})

// ---------------------------------------------------------------------------
// Serialisierung pro Entity-ID
// ---------------------------------------------------------------------------

// Pro ID eine Kette: die nächste Mutation derselben Entität startet erst, wenn
// die vorige abgeschlossen ist. Global zu serialisieren wäre unnötig langsam.
const chains = new Map<string, Promise<unknown>>()

function enqueue<T>(entityId: string, run: () => Promise<T>): Promise<T> {
    const previous = chains.get(entityId) ?? Promise.resolve()
    const next = previous.then(run, run)
    // Kette am Ende aufräumen, damit die Map nicht wächst.
    chains.set(
        entityId,
        next.catch(() => undefined).then(() => {
            if (chains.get(entityId) === next) chains.delete(entityId)
        })
    )
    return next
}

/**
 * Reiht eine nicht-optimistische Operation in dieselbe Kette pro Entity-ID ein.
 * Nötig, wenn eine Folgeaktion (z.B. `markAsDirty` direkt nach dem Abschließen)
 * NACH der noch laufenden Mutation derselben Zeile passieren muss.
 */
export function serializeMutation<T>(entityId: string, run: () => Promise<T>): Promise<T> {
    return enqueue(entityId, run)
}

// ---------------------------------------------------------------------------
// Apply / Commit / Revert
// ---------------------------------------------------------------------------

export interface OptimisticMutation<S> {
    /** Entity-ID, an der serialisiert und „in Flug" gebucht wird. */
    entityId: string
    /**
     * Lokale Änderung, sofort. Rückgabe ist der Schnappschuss, den `revert`
     * bekommt — oder `null`, um die Mutation abzubrechen (kein Serveraufruf).
     */
    apply: () => S | null
    /** Serveraufruf. Wirft bei Fehlschlag. */
    commit: () => Promise<void>
    /** Rücknahme mit dem Schnappschuss aus `apply` und dem Fehler des Commits. */
    revert: (snapshot: S, error: unknown) => void | Promise<void>
    /** Läuft nach erfolgreichem Commit, noch innerhalb der Buchführung. */
    onSuccess?: () => void | Promise<void>
    /** Fehlerbehandlung (z.B. Toast). Läuft nach `revert`. */
    onError?: (error: unknown) => void
}

/**
 * Führt eine optimistische Mutation aus: `apply` sofort, `commit` im
 * Hintergrund, `revert` bei Fehlschlag.
 *
 * Rückgabe ist `true`, sobald optimistisch angewendet wurde (der Aufrufer darf
 * dann schon Konfetti zünden), bzw. `false`, wenn `apply` abgebrochen hat.
 * Das Versprechen auf den Serverabschluss steckt in `settled` — nur nutzen, wenn
 * wirklich auf die Bestätigung gewartet werden muss.
 */
export function runOptimistic<S>(mutation: OptimisticMutation<S>): {
    applied: boolean
    settled: Promise<boolean>
} {
    const snapshot = mutation.apply()
    if (snapshot === null) {
        return { applied: false, settled: Promise.resolve(false) }
    }

    pendingCount.value++
    markInFlight(mutation.entityId)
    refreshSyncIndicator()

    // Buchführung freigeben. Idempotent, und bewusst ERST NACH `onSuccess` bzw.
    // nach dem Revert: gibt man den Echo-Schutz vorher frei, kann ein spät
    // eintreffendes Realtime-Echo (Zwischenstand des DB-Triggers) die Zeile nach
    // dem Reload wieder auf einen veralteten Stand ziehen. Der Hintergrund-Reload
    // in `onSuccess` umgeht den Schutz stattdessen gezielt für seine eigenen IDs.
    let released = false
    const release = () => {
        if (released) return
        released = true
        pendingCount.value--
        clearInFlight(mutation.entityId)
        refreshSyncIndicator()
    }

    const settled = enqueue(mutation.entityId, async () => {
        try {
            await mutation.commit()
            await mutation.onSuccess?.()
            return true
        } catch (error) {
            console.error('Optimistic mutation failed:', error)
            try {
                await mutation.revert(snapshot, error)
            } catch (revertError) {
                console.error('Optimistic revert failed:', revertError)
            }
            mutation.onError?.(error)
            return false
        } finally {
            // Sicherheitsnetz: sonst hängt der Header dauerhaft auf „synchronisiert".
            release()
        }
    })

    return { applied: true, settled }
}

/**
 * Netzfehler? Dann ist ein Nachlade-SELECT sinnlos — er läuft in dieselben
 * Timeouts und lässt die Oberfläche sekundenlang widersprüchlich stehen.
 * supabase-js verpackt Netzfehler als `FunctionsFetchError`/`TypeError` mit
 * „Failed to fetch"; zusätzlich zählt ein offline gemeldeter Browser.
 */
export function isNetworkError(error: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
    if (!error) return false

    const name = (error as { name?: string }).name ?? ''
    if (name === 'FunctionsFetchError' || name === 'AbortError' || name === 'TypeError') return true

    const message = String((error as { message?: string }).message ?? error).toLowerCase()
    return (
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('network error') ||
        message.includes('load failed') ||
        message.includes('fetch failed')
    )
}

/**
 * Rücknahme-Vorlage aus `patchItem`: die betroffenen Zeilen frisch aus der DB
 * lesen (Source of Truth) und nur bei Nichtexistenz auf den Schnappschuss
 * zurückfallen. So macht eine gescheiterte Mutation keine parallel erfolgreiche
 * platt.
 *
 * `list` wird an Ort und Stelle korrigiert; Zeilen werden über `pkColumn` gefunden.
 */
export async function revertRows<T extends Record<string, unknown>, S extends Record<string, unknown>>(options: {
    table: string
    pkColumn: string
    snapshots: S[]
    list: { value: T[] }
    /**
     * Kein Nachladen — für den Fall, dass der Commit an einem Netzfehler
     * gescheitert ist. Dann gilt sofort der Schnappschuss: lieber eine
     * unmittelbar stimmige Oberfläche als eine, die zwölf Sekunden lang
     * halb zurückgenommen dasteht.
     */
    skipReload?: boolean
}): Promise<void> {
    const { table, pkColumn, snapshots, list, skipReload } = options
    const ids = snapshots.map(s => s[pkColumn] as string)
    if (ids.length === 0) return

    let fresh: T[] = []
    if (!skipReload) {
        try {
            const { data } = await supabase.from(table).select('*').in(pkColumn, ids)
            fresh = (data as T[] | null) || []
        } catch (error) {
            console.error(`Error reloading ${table} rows for revert:`, error)
        }
    }

    for (const snapshot of snapshots) {
        const id = snapshot[pkColumn] as string
        const index = list.value.findIndex(row => row[pkColumn] === id)
        if (index === -1) continue
        const row = fresh.find(r => r[pkColumn] === id)
        list.value[index] = row ? row : { ...list.value[index], ...snapshot }
    }
}

/** Nur für Diagnose/Tests im Browser. */
export const optimisticDebug = {
    pendingCount,
    inFlight
}
