import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Task, TaskCompletion, EnrichedCompletion } from '@/types/Task'
import { supabase } from '@/lib/supabase'
import { formatPostponeDate } from '@/lib/taskSchedule'
import { drawProjectPhraseSlot, projectPhraseSlotOf } from '@/lib/projectPhrases'
import { useHouseholdStore } from './householdStore'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { isInFlight, isNetworkError, revertRows, runOptimistic, serializeMutation } from '@/lib/optimistic'

/**
 * Optimistische Completion: trägt eine Client-Kennung, weil die `completion_id`
 * erst vom Server kommt. Das INSERT-Echo aus Realtime ersetzt den Eintrag
 * darüber, statt ihn zu duplizieren.
 */
type OptimisticCompletion = TaskCompletion & { clientMutationId: string }

const isOptimistic = (c: TaskCompletion | EnrichedCompletion): c is OptimisticCompletion =>
    'clientMutationId' in c

/** Die Task-Felder, die eine Erledigung anfasst — und die ein Rückgängig zurückschreibt. */
type RowSnapshot = Pick<Task, 'task_id' | 'completed' | 'last_completed_at' | 'postponed_until' | 'assigned_to' | 'emphasis_level'>

/**
 * Die Task-Felder, die ein **Stempeltipp** anfasst (→ `cycleEmphasisLevel`).
 *
 * Ein eigener Typ neben `RowSnapshot` und **nicht** dieselbe Liste: der Stempel fasst
 * `project_saying_index` an, eine Erledigung nie (Projekte verlieren ihren Nachdruck gar
 * nicht, → CONTEXT.md „Überstempeln"). Stünde die Spalte in `RowSnapshot`, führe sie
 * durch `undoCompletion` mit, das seine Felder einzeln zurückschreibt — und ein
 * Zurückkleben könnte einen Projektspruch überschreiben, der mit dieser Erledigung nichts
 * zu tun hatte.
 *
 * Umgekehrt MUSS der Spruch hier drinstehen: der Tipp, der den Stapel abräumt, ändert
 * **zwei** Werte. Rollte nur die Stufe zurück, stünde nach einem gescheiterten Schreiben
 * der alte Stapel mit dem neuen Spruch da — ein Zustand, den es serverseitig nie gab.
 */
type StampSnapshot = Pick<Task, 'task_id' | 'emphasis_level' | 'project_saying_index'>

/**
 * Was nötig ist, um eine Erledigung zurückzunehmen (→ `undoCompletion`).
 *
 * Wird bei JEDER optimistisch angewandten Erledigung angelegt, weil der Store
 * nicht weiß, welche davon dem Nutzer einen Fetzen anbietet. Angeboten wird das
 * Zurückkleben nur beim Abreißen eines ganzen Zettels (→ `useTornScrap`); die
 * übrigen Fahrscheine werden nie eingelöst und fallen aus dem Deckel unten
 * heraus.
 */
interface UndoTicket {
    userId: string
    /** Task-Zeile plus alle Unteraufgaben, die die Edge Function zurückgesetzt hat. */
    snapshot: RowSnapshot[]
    /** `true`, sobald der Server bestätigt hat; `false`, wenn bereits zurückgenommen wurde. */
    settled: Promise<boolean>
    clientMutationId: string
}

/**
 * Wie viele Fahrscheine höchstens aufgehoben werden.
 *
 * Ein Deckel und **keine Verfallszeit**: der Fetzen hängt, bis die Pinnwand
 * verlassen wird — beliebig lange. Jede Frist, die hier stünde, wäre irgendwann
 * kürzer als er und nähme ihm still sein Rückgängig. Der Deckel greift
 * stattdessen erst, wenn nach dem Abreißen noch `UNDO_TICKET_LIMIT` weitere
 * Erledigungen passiert sind — und schon die erste davon ersetzt den Fetzen,
 * dessen Fahrschein damit ohnehin verworfen wird.
 */
const UNDO_TICKET_LIMIT = 8

export const useTaskStore = defineStore('tasks', () => {
    // State - wie ref() in Komponenten
    const tasks = ref<Task[]>([])
    // Completions: Kann TaskCompletion (von loadTasks) oder EnrichedCompletion (von fetchCompletions) sein
    // EnrichedCompletion enthält zusätzlich tasks.title, isDeleted, household_members
    const completions = ref<(TaskCompletion | EnrichedCompletion)[]>([])
    const isLoading = ref(false)

    // Realtime subscription channel (wird in subscribe() initialisiert)
    let realtimeChannel: RealtimeChannel | null = null

    // Aufgaben, deren Abschluss gerade beim Server liegt — Doppel-Tap-Schutz,
    // siehe completeTask.
    const completionsInFlight = new Set<string>()

    // Offene Rückgängig-Fahrscheine, je Aufgabe der jüngste. Reihenfolge = Einfügereihenfolge
    // (Map-Garantie), damit der Deckel den ältesten verdrängen kann.
    const undoTickets = new Map<string, UndoTicket>()

    // Guard gegen parallele Ladevorgänge. Ein zweiter Aufruf während eines
    // laufenden Loads wird NICHT mehr verschluckt (das hinterließ veraltete
    // Karten), sondern gemerkt: nach dem laufenden Durchgang wird genau einmal
    // nachgeladen. Wer awaitet, bekommt den Zustand nach diesem Nachlauf.
    let loadTasksRun: Promise<void> | null = null
    let loadTasksRequestedAgain = false
    // IDs, für die dieser Reload den Echo-Schutz gezielt umgehen darf: der
    // Hintergrund-Reload NACH einem erfolgreichen Commit will genau die Zeile
    // holen, die er selbst geschrieben hat. Der Schutz bleibt für alle anderen
    // Quellen (Realtime, fremde Reloads) bis zur Freigabe bestehen.
    let pendingBypass = new Set<string>()

    const loadTasks = (bypassIds: string[] = []): Promise<void> => {
        for (const id of bypassIds) pendingBypass.add(id)

        if (loadTasksRun) {
            loadTasksRequestedAgain = true
            return loadTasksRun
        }

        loadTasksRun = (async () => {
            try {
                do {
                    loadTasksRequestedAgain = false
                    const bypass = pendingBypass
                    pendingBypass = new Set<string>()
                    await runLoadTasks(bypass)
                } while (loadTasksRequestedAgain)
            } finally {
                loadTasksRun = null
                loadTasksRequestedAgain = false
            }
        })()

        return loadTasksRun
    }

    // Actions - Funktionen die State ändern
    const runLoadTasks = async (bypass: Set<string> = new Set()) => {
        console.log('Loading tasks...')

        const householdStore = useHouseholdStore()
        const toastStore = useToastStore()

        // Nur Tasks des aktuellen Households laden
        if (!householdStore.currentHousehold) {
            console.warn('No current household, cannot load tasks')
            tasks.value = []
            completions.value = []
            return
        }

        isLoading.value = true

        try {
            // Nur aktive Tasks laden (deleted_at IS NULL = nicht soft-deleted)
            const { data: tasksData, error: tasksError } = await supabase
                .from('tasks')
                .select('*')
                .eq('household_id', householdStore.currentHousehold.household_id)
                .is('deleted_at', null)

            if (tasksError) throw tasksError

            // Echo-Schutz: Zeilen, deren Mutation gerade unterwegs ist, behalten
            // ihren optimistischen Zustand — sonst springt die Karte kurz zurück,
            // weil der Server die Änderung noch nicht geschrieben hat.
            tasks.value = (tasksData || []).map((row: Task) => {
                if (bypass.has(row.task_id) || !isInFlight(row.task_id)) return row
                return tasks.value.find(t => t.task_id === row.task_id) ?? row
            })
            console.log('Loaded tasks:', tasks.value)
            // Completions werden NICHT hier geladen - fetchCompletions() ist dafür zuständig
            // (mit JOIN zu tasks für Task-Namen in der Historie)
        } catch (error) {
            console.error('Error loading tasks:', error)
            toastStore.showToast('Fehler beim Laden der Aufgaben', 'error')
        } finally {
            isLoading.value = false
        }
    }

    // COMPLETE - Task als erledigt markieren (via Edge Function), optimistisch.
    //
    // Die Karte bewegt sich sofort und der Aufrufer darf sofort Konfetti zünden;
    // Edge Function und Reloads laufen im Hintergrund. Der Rückgabewert sagt
    // deshalb nur „lokal angewendet", nicht „serverseitig bestätigt".
    //
    // Der PUNKTWERT wird bewusst NICHT vorhergesagt — die Edge Function rechnet
    // ihn aus den Subtask-Zuständen. Die optimistische Completion trägt nur eine
    // Schätzung fürs Wochen-Ranking, die beim Eintreffen der echten Zeile still
    // korrigiert wird.
    const completeTask = async (taskId: string, effortOverride?: number, completionNote?: string) => {
        const authStore = useAuthStore()
        const toastStore = useToastStore()
        const householdStore = useHouseholdStore()

        if (!authStore.user) {
            console.error('Cannot complete task: No user logged in')
            toastStore.showToast('Fehler: Nicht angemeldet', 'error')
            return false
        }
        const userId = authStore.user.id

        // Doppel-Tap-Schutz an EINER Stelle (vorher hing er implizit an den
        // `isQuickCompleting`-Flags der Komponenten, die den ganzen Roundtrip
        // umspannten — mit dem optimistischen Rückgabewert wäre dieses Fenster
        // auf ~0 ms geschrumpft und ein zweiter Tap hätte doppelte Punkte
        // erzeugt). Die Sperre hängt jetzt am `settled`-Promise: die Karte darf
        // sich sofort bewegen, ein zweites Abschließen derselben Aufgabe kommt
        // erst nach dem Commit durch.
        if (completionsInFlight.has(taskId)) {
            console.warn('Completion already in flight, ignoring duplicate tap:', taskId)
            return false
        }

        const clientMutationId =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `opt-${Date.now()}-${Math.random()}`

        // Vor dem Apply merken: der Apply räumt postponed_until lokal weg.
        const postponedBefore = Boolean(tasks.value.find(t => t.task_id === taskId)?.postponed_until)

        // Für Fehler-Toast und Reload-Bypass, im Apply gefüllt
        let taskTitle = 'Aufgabe'
        const touchedIds: string[] = []
        // Für den Rückgängig-Fahrschein, im Apply gefüllt (der Schnappschuss geht
        // sonst in `runOptimistic` hinein und kommt hier nicht wieder heraus).
        let undoSnapshot: RowSnapshot[] = []

        const { applied, settled } = runOptimistic<RowSnapshot[]>({
            entityId: taskId,
            apply: () => {
                const task = tasks.value.find(t => t.task_id === taskId)
                if (!task) {
                    console.error('Cannot complete task: not in local state', taskId)
                    return null
                }

                const snapshot: RowSnapshot[] = [snapshotOf(task)]
                taskTitle = task.title
                touchedIds.push(task.task_id)
                const now = new Date().toISOString()

                // Spiegelt die Edge Function:
                // - Checklist-Subtask ohne expliziten Override wird abgehakt
                // - sonst: tägliche Aufgaben bleiben ABSICHTLICH nicht abgeschlossen
                const isChecklistSubtask =
                    task.parent_task_id !== null &&
                    task.subtask_points_mode === 'checklist' &&
                    effortOverride === undefined

                if (isChecklistSubtask || task.task_type !== 'daily') {
                    task.completed = true
                }
                task.last_completed_at = now
                // Verschiebung ist mit der Erledigung hinfällig (siehe Commit unten)
                task.postponed_until = null
                if (!task.assignment_permanent) {
                    task.assigned_to = null
                }
                // Überstempeln gilt für EINEN Durchlauf (→ CONTEXT.md, "Überstempeln").
                // Spiegelt die Edge Function: zurückgesetzt wird beim Erledigen,
                // sonst nie — auch bei täglichen Aufgaben. Ausgenommen sind allein
                // Projekte: sie werden nie fertig, ihr Stapel bleibt stehen.
                // Die Regel steht an ZWEI Stellen: hier und in complete-task. Sie
                // greift bewusst nach dem EIGENEN task_type, nicht nach dem
                // Elternknoten — Begründung im Glossar (CONTEXT.md, "Überstempeln").
                // Wer eine ändert, ändert beide.
                if (task.task_type !== 'project') {
                    task.emphasis_level = 0
                }

                // Die Edge Function setzt alle Subtasks eines Parents zurück
                if (task.parent_task_id === null && !isChecklistSubtask) {
                    for (const subtask of tasks.value.filter(t => t.parent_task_id === taskId)) {
                        snapshot.push(snapshotOf(subtask))
                        touchedIds.push(subtask.task_id)
                        subtask.completed = false
                    }
                }

                // Optimistische Completion — mit Client-Kennung, damit das
                // INSERT-Echo sie ersetzt statt sie zu duplizieren.
                const estimatedEffort = estimateCompletionEffort(task, effortOverride)
                const optimisticCompletion: OptimisticCompletion = {
                    clientMutationId,
                    completion_id: `optimistic-${clientMutationId}`,
                    task_id: taskId,
                    user_id: userId,
                    completed_at: now,
                    effort_override: estimatedEffort,
                    completion_note: completionNote?.trim() || null
                }
                completions.value.push(optimisticCompletion)
                householdStore.addOptimisticCompletion({
                    clientMutationId,
                    user_id: userId,
                    task_id: taskId,
                    completed_at: now,
                    effort_override: estimatedEffort,
                    tasks: { effort: task.effort }
                })

                undoSnapshot = snapshot
                return snapshot
            },

            commit: async () => {
                const payload: {
                    taskId: string
                    effortOverride?: number
                    completionNote?: string
                } = { taskId }

                if (effortOverride !== undefined) payload.effortOverride = effortOverride
                if (completionNote?.trim()) payload.completionNote = completionNote

                const { data, error } = await supabase.functions.invoke('complete-task', {
                    body: payload
                })

                if (error) {
                    console.error('Full error object:', JSON.stringify(error, null, 2))
                    throw error
                }
                if (!data?.success) {
                    console.error('Full response data:', JSON.stringify(data, null, 2))
                    throw new Error(data?.error || 'complete-task failed')
                }

                // Wird eine verschobene Aufgabe doch noch erledigt, ist der Weckruf
                // hinfällig: sonst würde der Cron sie am alten Zieldatum verfrüht
                // wieder auf dran setzen. Nur ein Extra-Request, wenn nötig.
                if (postponedBefore) {
                    await supabase.from('tasks').update({ postponed_until: null }).eq('task_id', taskId)
                }

                if (data.warning) {
                    console.warn('Edge function warning:', data.warning)
                    toastStore.showToast(`⚠️ ${data.warning}`, 'info', 5000)
                }
            },

            onSuccess: async () => {
                // Reloads im Hintergrund — der Nutzer hat sein Konfetti längst.
                // Die eigenen Zeilen dürfen den Echo-Schutz umgehen, er selbst
                // bleibt gegen spät eintreffende Realtime-Echos bestehen.
                await loadTasks(touchedIds)
                await householdStore.loadWeeklyCompletions({ force: true })
                // Erst NACH dem Reload entfernen, sonst zählt die Woche kurz doppelt
                // bzw. fällt die Erledigung kurz aus dem Ranking.
                householdStore.removeOptimisticCompletion(clientMutationId)
                // Die echte Completion holen und die optimistische ERSETZEN, statt
                // sie nur zu löschen — sonst verschwindet der Eintrag ersatzlos,
                // wenn das Realtime-Echo ausbleibt.
                await replaceOptimisticCompletion(clientMutationId, taskId, userId)
                // Das Projekt-Abzeichen zieht hier NICHT nach — das tut die
                // ERSTE Zeile des Realtime-INSERT-Zweiges, absichtlich vor allen
                // frühen `return`. Genau dieser Aufruf hier stand einmal an
                // dieser Stelle; er wanderte dorthin, weil er sonst am
                // optimistischen Einsetzen direkt darüber hängt.
            },

            revert: async (snapshot, error) => {
                // Optimistische Completion aus beiden Listen entfernen
                householdStore.removeOptimisticCompletion(clientMutationId)
                completions.value = completions.value.filter(
                    c => !(isOptimistic(c) && c.clientMutationId === clientMutationId)
                )

                // Karte zurück: Zeilen nachladen (Source of Truth) und nur bei
                // Nichtexistenz auf den Schnappschuss zurückfallen — analog zu
                // patchItem in createChecklistStore. Bei einem NETZfehler wird
                // nicht nachgeladen: der SELECT liefe in dieselben Timeouts und
                // die Karte stünde sekundenlang auf „erledigt", während Verlauf
                // und Wochenwertung längst zurückgenommen sind.
                await restoreRows(snapshot, isNetworkError(error))
            },

            onError: () => {
                toastStore.showToast(`Fehler beim Abschließen: ${taskTitle}`, 'error')
            }
        })

        if (applied) {
            completionsInFlight.add(taskId)
            void settled.finally(() => completionsInFlight.delete(taskId))

            // Rückgängig-Fahrschein hinterlegen. Ein vorhandener für dieselbe
            // Aufgabe wird ersetzt — angeboten wird immer nur die jüngste
            // Erledigung, und genau darauf beruht die Suche nach der zu
            // löschenden Zeile in `undoCompletion`.
            undoTickets.delete(taskId)
            undoTickets.set(taskId, {
                userId,
                snapshot: undoSnapshot,
                settled,
                clientMutationId
            })
            while (undoTickets.size > UNDO_TICKET_LIMIT) {
                const oldest = undoTickets.keys().next().value
                if (oldest === undefined) break
                undoTickets.delete(oldest)
            }
        }

        // Bewusst NICHT awaiten: Konfetti hängt an der Aktion, nicht am Server.
        return applied
    }

    /** Snapshot der optimistisch veränderten Task-Felder. */
    const snapshotOf = (task: Task) => ({
        task_id: task.task_id,
        completed: task.completed,
        last_completed_at: task.last_completed_at,
        postponed_until: task.postponed_until,
        assigned_to: task.assigned_to,
        emphasis_level: task.emphasis_level
    })

    /**
     * Schätzung des Punktwerts NUR fürs Wochen-Ranking. Die verbindliche Zahl
     * rechnet die Edge Function; im UI wird diese Schätzung nirgends als
     * Erfolgsmeldung gefeiert.
     */
    const estimateCompletionEffort = (task: Task, effortOverride?: number): number => {
        if (effortOverride !== undefined) return effortOverride
        if (task.parent_task_id !== null) {
            if (task.subtask_points_mode === 'checklist') return 0
            return task.effort
        }
        const deductSum = tasks.value
            .filter(t => t.parent_task_id === task.task_id && t.completed && t.subtask_points_mode === 'deduct')
            .reduce((sum, t) => sum + t.effort, 0)
        return Math.max(0, task.effort - deductSum)
    }

    /**
     * Rücknahme mehrerer Task-Zeilen über das gemeinsame Muster
     * (nachladen, nur bei Nichtexistenz Schnappschuss).
     */
    const restoreRows = async <S extends Record<string, unknown>>(
        snapshot: S[],
        skipReload = false
    ) => {
        await revertRows({
            table: 'tasks',
            pkColumn: 'task_id',
            snapshots: snapshot,
            list: tasks,
            skipReload
        })
    }

    /**
     * Ersetzt die optimistische Completion durch die echte Serverzeile. Läuft
     * nach erfolgreichem Commit; kommt das Realtime-Echo zuerst, ist hier nichts
     * mehr zu tun. Schlägt der Nachschlag fehl, wird die optimistische Zeile
     * trotzdem entfernt — sie darf nicht als Dauerzustand hängen bleiben.
     */
    const replaceOptimisticCompletion = async (
        clientMutationId: string,
        taskId: string,
        userId: string
    ) => {
        const index = completions.value.findIndex(
            c => isOptimistic(c) && c.clientMutationId === clientMutationId
        )
        if (index === -1) return // Echo war schneller

        try {
            const { data } = await supabase
                .from('task_completions')
                .select('completion_id, task_id, user_id, completed_at, effort_override, completion_note')
                .eq('task_id', taskId)
                .eq('user_id', userId)
                .order('completed_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            const current = completions.value.findIndex(
                c => isOptimistic(c) && c.clientMutationId === clientMutationId
            )
            if (current === -1) return

            const alreadyPresent =
                data && completions.value.some(c => c.completion_id === data.completion_id)

            if (data && !alreadyPresent) {
                completions.value[current] = data as TaskCompletion
            } else {
                completions.value.splice(current, 1)
            }
        } catch (error) {
            console.error('Error fetching confirmed completion:', error)
            completions.value = completions.value.filter(
                c => !(isOptimistic(c) && c.clientMutationId === clientMutationId)
            )
        }
    }

    // MARK AS DIRTY - Task wieder als "dreckig" markieren
    // Ändert nur tasks.completed, löscht KEINE completions aus der Historie
    // Hebt eine Verschiebung auf: die manuelle Entscheidung "jetzt dran" schlägt
    // den gesetzten Weckruf, sonst würde der Cron die Aufgabe später erneut wecken.
    const markAsDirty = async (taskId: string) => {
        const toastStore = useToastStore()
        // UPDATE tasks.completed = FALSE — in derselben Kette wie eine ggf. noch
        // laufende Mutation dieser Zeile, sonst könnte ein gerade unterwegs
        // befindliches complete-task die Zurücksetzung wieder überschreiben.
        const { error } = await serializeMutation(taskId, async () =>
            await supabase
                .from('tasks')
                .update({ completed: false, postponed_until: null })
                .eq('task_id', taskId)
        )

        if (error) {
            console.error('Error marking task as dirty:', error)
            toastStore.showToast('Fehler beim Zurücksetzen der Aufgabe', 'error')
            return false
        }

        // Kein lokales Mitziehen mehr nötig: der loadTasks-Guard verschluckt
        // parallele Anforderungen nicht mehr, sondern lädt danach genau einmal nach.
        await loadTasks()
        return true
    }

    // NACHDRUCK — Stempel-Automat 0 (kein Nachdruck) → 1 WICHTIG → 2 DRINGEND → 0
    // (→ CONTEXT.md, "Überstempeln"; Ticket 09a).
    //
    // Aufgerufen von `onStampTap` in WallNote.vue — dem Tipp auf den Stempel in
    // der Fußzeile. Das ist der EINZIGE Aufrufer.
    //
    // Bis zum 02.09.2026 hatte diese Funktion keinen: 09a lieferte Datenmodell und
    // Automaten, die Bedienung am Zettel nie. Zwei Backlog-Tickets haben deshalb
    // monatelang Randfälle eines Verhaltens beschrieben, das kein Nutzer auslösen
    // konnte, und eine Spec hat eine Regel umgekehrt, die niemand im Betrieb prüfen
    // konnte — weil sie nichts steuerte.
    //
    // Der Automat liegt bewusst hier im
    // Store statt im Zettel-Component: die Fußzeile muss nur antippen und den
    // aktuellen Wert anzeigen, nicht die Modulo-Logik kennen.
    //
    // Optimistisch wie completeTask — ein Stempel soll sich wie ein Stempel
    // anfühlen, nicht auf einen Server-Roundtrip warten, gerade weil User Story
    // 29 mehrfaches schnelles Antippen ausdrücklich vorsieht. Rein optisch: kein
    // Effekt auf Gruppe oder Reihenfolge, deshalb kein Toast bei Erfolg (würde
    // bei drei Taps hintereinander dreimal aufblitzen).
    //
    // AN EINEM PROJEKT SCHREIBT DIESER AUTOMAT ZWEI SPALTEN, nicht eine: der
    // Übergang 2 → 0 räumt den Stapel ab und zieht dabei einen neuen
    // Projektspruch (Ticket `04`, → CONTEXT.md „Projektspruch"). Beide Werte
    // gehören zusammen — sie werden zusammen angewandt, zusammen geschrieben
    // und im Fehlerfall zusammen zurückgenommen. Ein halber Rückfall (Stufe
    // zurück, Spruch neu) wäre ein Zustand, den der Server nie gesehen hat.
    const cycleEmphasisLevel = async (taskId: string): Promise<boolean> => {
        const toastStore = useToastStore()

        const { applied } = runOptimistic<StampSnapshot>({
            entityId: taskId,
            apply: () => {
                const task = tasks.value.find(t => t.task_id === taskId)
                if (!task) {
                    console.error('Cannot cycle emphasis: task not in local state', taskId)
                    return null
                }
                // NICHT `snapshotOf`: das ist der Schnappschuss einer ERLEDIGUNG. Der
                // Stempel fasst andere Felder an — siehe `StampSnapshot`.
                const snapshot: StampSnapshot = {
                    task_id: task.task_id,
                    emphasis_level: task.emphasis_level,
                    project_saying_index: task.project_saying_index
                }

                const next = ((task.emphasis_level + 1) % 3) as 0 | 1 | 2
                task.emphasis_level = next

                // ABRÄUMEN (2 → 0) DREHT DEN PROJEKTSPRUCH WEITER
                // (→ CONTEXT.md, „Projektspruch"; Ticket `04`).
                //
                // Genau dieser eine Übergang, und nur an einem PROJEKT: solange der
                // Stapel wächst (0 → 1 → 2), bleibt der Untergrund liegen — WICHTIG und
                // DRINGEND legen sich darüber, und ein Grundabdruck, der dabei das Wort
                // wechselte, sähe aus wie ein zweiter, unverstandener Vorgang.
                //
                // Der neue Platz wird GEZOGEN und GESPEICHERT, nicht aus der
                // Aufgaben-Kennung gerechnet: eine Ableitung wäre je Gerät gleich, aber
                // eben auch je Abräumen gleich — der Spruch bliebe für immer derselbe.
                // Deshalb hängt er an einer Spalte und nicht an einer Formel.
                if (next === 0 && task.task_type === 'project') {
                    task.project_saying_index = drawProjectPhraseSlot(projectPhraseSlotOf(task))
                }

                return snapshot
            },

            commit: async () => {
                const task = tasks.value.find(t => t.task_id === taskId)
                if (!task) throw new Error('Task not found')

                // `project_saying_index` steht nur im UPDATE, wenn die Zeile ein Projekt
                // ist. An jeder anderen Aufgabe trägt die Spalte zwar einen gültigen Wert
                // (NOT NULL mit Default), er bedeutet dort aber nichts — ihn bei jedem
                // Stempeltipp mitzuschreiben hieße, eine Spalte anzufassen, die diese
                // Aufgabe gar nicht benutzt.
                //
                // Gelesen wird der Wert aus dem AKTUELLEN lokalen Zustand, nicht aus einer
                // beim Tippen gemerkten Variablen: drei schnelle Taps stehen als drei
                // Commits in derselben Kette (`enqueue`), und jeder soll den Stand
                // schreiben, der dann gilt — nicht den, der beim eigenen Tap galt.
                const patch: { emphasis_level: 0 | 1 | 2; project_saying_index?: number } = {
                    emphasis_level: task.emphasis_level
                }
                if (task.task_type === 'project') {
                    patch.project_saying_index = task.project_saying_index
                }

                const { error } = await supabase
                    .from('tasks')
                    .update(patch)
                    .eq('task_id', taskId)

                if (error) throw error
            },

            // Zurück springt BEIDES — Stufe und Spruch. Der Schnappschuss trägt beide
            // Felder, `revertRows` lädt die Zeile ohnehin frisch und fällt nur bei
            // Netzfehlern auf ihn zurück.
            revert: async (snapshot, error) => {
                await restoreRows([snapshot], isNetworkError(error))
            },

            onError: () => {
                toastStore.showToast('Nachdruck konnte nicht gespeichert werden', 'error')
            }
        })

        return applied
    }

    /**
     * Fahrschein wegwerfen, ohne ihn einzulösen — das Fenster ist zu.
     * Danach ist die Erledigung endgültig; ein späteres Zurücknehmen geht nur
     * noch über „wieder dreckig" (und lässt die Punkte stehen).
     */
    const discardUndoTicket = (taskId: string) => {
        undoTickets.delete(taskId)
    }

    /** Gibt es für diese Aufgabe noch ein offenes Rückgängig-Fenster? */
    const canUndoCompletion = (taskId: string) => undoTickets.has(taskId)

    /**
     * ZURÜCKKLEBEN — die jüngste eigene Erledigung dieser Aufgabe zurücknehmen
     * (Pinnwand-Redesign, Etappe 4, Ticket 11).
     *
     * **Was „rückgängig" auf Datenebene heißt.** `task_completions` ist
     * append-only und die einzige Quelle der Punkte. Beides gilt weiter — aber
     * append-only schützt **Tatsachen**, und innerhalb des Fetzen-Fensters sagt
     * der Nutzer genau das Gegenteil: die Zeile beschreibt keine Erledigung,
     * sondern einen Fehlgriff. Eine solche Zeile wird **gelöscht**, nicht
     * ausgeglichen:
     *
     * - Eine Gegenbuchung („−3 P") wäre eine erfundene zweite Tatsache. Sie
     *   stünde im Verlauf, in `/stats` und in jeder späteren Auswertung als
     *   Ereignis da, das nie stattgefunden hat, und `effort_override` ist als
     *   Punktwert einer Leistung definiert, nicht als Vorzeichen.
     * - Die Zeile stehen zu lassen und nur `tasks.completed` zurückzusetzen ist
     *   „wieder dreckig" — laut Glossar eine Aussage über die Wohnung, kein
     *   Korrigieren. Die Punkte blieben verbucht, und das Ticket verlangt
     *   ausdrücklich, dass sie aus dem Balken verschwinden.
     *
     * Zurückgeschrieben wird der Schnappschuss aus der Erledigung — nicht nur
     * `completed`. `last_completed_at` ist der Anker der Kadenz: bliebe der neue
     * Wert stehen, wäre die Aufgabe zwar wieder dran, aber ihre nächste
     * Fälligkeit um ein volles Intervall verschoben. Ebenso zurück: das von der
     * Edge Function gelöschte `assigned_to`, das beim Erledigen geräumte
     * `postponed_until`, der `completed`-Zustand aller Unteraufgaben, die die
     * Edge Function zurückgesetzt hat — UND `emphasis_level` (Nachdruck):
     * Abreißen ist „ein Griff, kein Urteil" (→ CONTEXT.md, „Abreißen"), die
     * Erledigung hat nicht stattgefunden, darf also auch keinen gesetzten
     * Nachdruck verzehrt haben. Anders als bei „wieder dreckig" (`markAsDirty`,
     * eine inhaltliche Aussage über die Wohnung, keine Korrektur eines
     * Fehlgriffs) — die Erledigung bleibt dort Tatsache, `markAsDirty` fasst
     * `emphasis_level` deshalb bewusst nicht an.
     *
     * **Warum das Warten auf `settled` sein muss:** vor der Bestätigung gibt es
     * keine Zeile zum Löschen. Wer hier nicht wartet, löscht nichts und die
     * Punkte bleiben — genau der stille Fehler, den das Ticket verbietet.
     *
     * **Doppeltipp:** der Riegel ist das synchrone `undoTickets.delete` ganz
     * oben, vor dem ersten `await` — dieselbe Regel wie bei `completeTask`. Ein
     * `:disabled` am Fetzen schützt nicht, weil Vue das Attribut erst im nächsten
     * Tick schreibt.
     */
    const undoCompletion = async (taskId: string): Promise<boolean> => {
        const toastStore = useToastStore()
        const householdStore = useHouseholdStore()

        const ticket = undoTickets.get(taskId)
        if (!ticket) return false
        // Synchron, vor dem ersten `await`. Zwischen dieser Zeile und dem
        // `get` darüber darf nichts stehen, das den Ablauf unterbricht.
        undoTickets.delete(taskId)

        // Der Commit läuft womöglich noch. Ist er gescheitert, hat `revert`
        // bereits alles zurückgenommen — dann gibt es nichts mehr zu tun.
        const confirmed = await ticket.settled
        if (!confirmed) return true

        // Die zu löschende Zeile: die **jüngste eigene** Erledigung dieser
        // Aufgabe. Das ist genau unsere, weil `completeTask` einen vorhandenen
        // Fahrschein derselben Aufgabe ersetzt — ein zweites Abreißen macht das
        // erste unwiderruflich, statt es zu verwechseln. Eine Zeitgrenze steht
        // hier bewusst nicht: Client- und Serveruhr laufen auseinander, und eine
        // um Sekunden danebenliegende Schranke ließe die Punkte still stehen.
        // Erledigungen anderer Mitglieder bleiben durch `user_id` außen vor.
        const { data: row, error: findError } = await supabase
            .from('task_completions')
            .select('completion_id')
            .eq('task_id', taskId)
            .eq('user_id', ticket.userId)
            .order('completed_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (findError) {
            console.error('Error finding completion to undo:', findError)
            toastStore.showToast('Zurückkleben fehlgeschlagen', 'error')
            return false
        }

        if (row) {
            const { error: deleteError } = await supabase
                .from('task_completions')
                .delete()
                .eq('completion_id', row.completion_id)

            if (deleteError) {
                console.error('Error deleting completion on undo:', deleteError)
                toastStore.showToast('Zurückkleben fehlgeschlagen', 'error')
                return false
            }

            // Aus der lokalen Historie ebenfalls raus — sonst steht der Eintrag
            // im Verlauf, bis er das nächste Mal geladen wird.
            completions.value = completions.value.filter(
                c =>
                    c.completion_id !== row.completion_id &&
                    !(isOptimistic(c) && c.clientMutationId === ticket.clientMutationId)
            )
        }
        householdStore.removeOptimisticCompletion(ticket.clientMutationId)

        // Task-Zeilen zurück auf den Stand vor dem Abreißen. In derselben Kette
        // wie jede andere Mutation dieser Zeile (→ `serializeMutation`), damit
        // ein noch nachlaufender Schreibvorgang die Rücknahme nicht überholt.
        const restoreError = await serializeMutation(taskId, async () => {
            for (const snapshot of ticket.snapshot) {
                const { error } = await supabase
                    .from('tasks')
                    .update({
                        completed: snapshot.completed,
                        last_completed_at: snapshot.last_completed_at,
                        postponed_until: snapshot.postponed_until,
                        assigned_to: snapshot.assigned_to,
                        emphasis_level: snapshot.emphasis_level
                    })
                    .eq('task_id', snapshot.task_id)
                if (error) return error
            }
            return null
        })

        if (restoreError) {
            console.error('Error restoring task rows on undo:', restoreError)
            toastStore.showToast('Zurückkleben fehlgeschlagen', 'error')
        }

        // Beides neu laden: die Wand bekommt ihren Zettel zurück, die
        // Statusleiste ihre Punkte weg. `force`, weil unmittelbar nach eigenem
        // Schreiben — eine gebündelte Abfrage könnte vor dem Löschen abgeschickt
        // worden sein und den alten Stand zurückbringen.
        await loadTasks(ticket.snapshot.map(s => s.task_id))
        await householdStore.loadWeeklyCompletions({ force: true })
        // Kein Nachruf fürs Projekt-Abzeichen: hierher kommt nur der FETZEN
        // (`useTornScrap`), und an einem Projekt entsteht laut 03-1 keiner.
        // Zurückgenommen wird eine Projekt-Erledigung ausschließlich über
        // `deleteCompletion()` in der Historie — dort steht die Absicherung.

        return !restoreError
    }

    // POSTPONE - Aufgabe bis zu einem Datum aus dem Weg räumen
    //
    // Setzt completed = TRUE (damit sie "Jetzt dran" verlässt — completed bleibt die
    // alleinige Dranheits-Quelle) und postponed_until auf das Zieldatum, das der
    // nächtliche Cron als Weckruf liest.
    //
    // last_completed_at bleibt ABSICHTLICH unangetastet: es wird keine Erledigung
    // erfunden, der Intervall-Anker bleibt erhalten. Kein task_completions-Eintrag,
    // also weder Punkte noch Verlaufszeile.
    const postponeTask = async (taskId: string, targetDate: string) => {
        const toastStore = useToastStore()

        const { error } = await supabase
            .from('tasks')
            .update({
                completed: true,
                postponed_until: targetDate
            })
            .eq('task_id', taskId)

        if (error) {
            console.error('Error postponing task:', error)
            toastStore.showToast('Fehler beim Verschieben der Aufgabe', 'error')
            return false
        }

        toastStore.showToast(`Verschoben auf ${formatPostponeDate(targetDate)}`, 'success')
        // Reload tasks vom Backend (Source of Truth)
        await loadTasks()
        return true
    }

    // CREATE - Neue Task erstellen
    // completed, last_completed_at, assigned_to, assignment_permanent, parent_task_id, order_index sind optional - Database setzt Defaults
    // task_type defaults to 'recurring' if not provided (for backwards compatibility)
    const createTask = async (taskData: Partial<Task> & Pick<Task, 'title' | 'effort' | 'recurrence_days' | 'task_type'>) => {
        const householdStore = useHouseholdStore()
        const toastStore = useToastStore()

        if (!householdStore.currentHousehold) {
            console.error('Cannot create task: No current household')
            toastStore.showToast('Fehler: Kein Haushalt ausgewählt', 'error')
            return null
        }

        isLoading.value = true

        const { data, error } = await supabase
            .from('tasks')
            .insert({
                ...taskData,
                household_id: householdStore.currentHousehold.household_id
            })
            .select()
            .single()

        isLoading.value = false

        if (error) {
            console.error('Error creating task:', error)
            toastStore.showToast('Fehler beim Erstellen der Aufgabe', 'error')
            return null
        }

        // Lokalen State aktualisieren
        tasks.value.push(data)

        // If it's a project, auto-create "Am Projekt arbeiten" subtask
        if (data.task_type === 'project' && !taskData.parent_task_id) {
            const { data: subtaskData, error: subtaskError } = await supabase
                .from('tasks')
                .insert({
                    title: 'Am Projekt arbeiten',
                    effort: 1, // Default effort, will be overridden on completion
                    recurrence_days: 0,
                    task_type: 'daily', // Always visible, never recurs
                    subtask_points_mode: 'bonus',
                    parent_task_id: data.task_id,
                    order_index: 0,
                    household_id: householdStore.currentHousehold.household_id
                })
                .select()
                .single()

            if (subtaskError) {
                console.error('Error creating default project subtask:', subtaskError)
            } else if (subtaskData) {
                tasks.value.push(subtaskData)
            }
        }

        toastStore.showToast('Aufgabe erstellt', 'success', 3000)
        return data
    }

    // CREATE QUICK TASK - Einmalige Aufgabe, sofort abgeschlossen, nur in Historie
    // Legt einen one-time Task an (sofort soft-deleted, damit er weder in der
    // aktiven Liste noch unter "Erledigt" auftaucht) und schreibt direkt eine
    // Completion mit is_quick=true. RLS erlaubt den Client-Insert in
    // task_completions, daher keine Edge Function nötig.
    const createQuickTask = async (quickData: { title: string; effort: number; note?: string }) => {
        const householdStore = useHouseholdStore()
        const authStore = useAuthStore()
        const toastStore = useToastStore()

        if (!householdStore.currentHousehold) {
            toastStore.showToast('Fehler: Kein Haushalt ausgewählt', 'error')
            return null
        }
        if (!authStore.user) {
            toastStore.showToast('Fehler: Nicht angemeldet', 'error')
            return null
        }

        isLoading.value = true
        const now = new Date().toISOString()

        // 1. Task: one-time, bereits abgeschlossen, sofort soft-deleted
        const { data: task, error: taskError } = await supabase
            .from('tasks')
            .insert({
                title: quickData.title,
                effort: quickData.effort,
                recurrence_days: 0,
                task_type: 'one-time',
                completed: true,
                last_completed_at: now,
                deleted_at: now,
                household_id: householdStore.currentHousehold.household_id
            })
            .select()
            .single()

        if (taskError || !task) {
            isLoading.value = false
            console.error('Error creating quick task:', taskError)
            toastStore.showToast('Fehler beim Erstellen der Quick-Aufgabe', 'error')
            return null
        }

        // 2. Completion direkt schreiben (Single Source of Truth für Punkte/Historie)
        const { error: completionError } = await supabase
            .from('task_completions')
            .insert({
                task_id: task.task_id,
                user_id: authStore.user.id,
                effort_override: quickData.effort,
                completion_note: quickData.note?.trim() || null,
                is_quick: true
            })

        isLoading.value = false

        if (completionError) {
            console.error('Error creating quick completion:', completionError)
            toastStore.showToast('Fehler beim Abschließen der Quick-Aufgabe', 'error')
            return null
        }

        // Header-Stats (Wochenpunkte) aktualisieren
        await householdStore.loadWeeklyCompletions({ force: true })

        toastStore.showToast('Quick-Aufgabe abgeschlossen', 'success', 3000)
        return task
    }

    // UPDATE - Task vollständig aktualisieren
    const updateTask = async (taskId: string, updates: Partial<Omit<Task, 'task_id'>>) => {
        const toastStore = useToastStore()
        isLoading.value = true

        const { error } = await supabase
            .from('tasks')
            .update(updates)
            .eq('task_id', taskId)

        isLoading.value = false

        if (error) {
            console.error('Error updating task:', error)
            toastStore.showToast('Fehler beim Aktualisieren der Aufgabe', 'error')
            return false
        }

        // Lokalen State aktualisieren
        const taskIndex = tasks.value.findIndex(t => t.task_id === taskId)
        if (taskIndex !== -1) {
            tasks.value[taskIndex] = { ...tasks.value[taskIndex], ...updates }
        }
        toastStore.showToast('Aufgabe aktualisiert', 'success', 3000)
        return true
    }

    // DELETE - Task löschen (SOFT DELETE)
    // Setzt deleted_at statt echtem DELETE → Completions bleiben erhalten
    const deleteTask = async (taskId: string) => {
        const toastStore = useToastStore()
        isLoading.value = true

        const { error } = await supabase
            .from('tasks')
            .update({ deleted_at: new Date().toISOString() })
            .eq('task_id', taskId)

        isLoading.value = false

        if (error) {
            console.error('Error deleting task:', error)
            toastStore.showToast('Fehler beim Löschen der Aufgabe', 'error')
            return false
        }

        // Lokalen State aktualisieren (Task aus UI entfernen)
        tasks.value = tasks.value.filter(t => t.task_id !== taskId)
        toastStore.showToast('Aufgabe gelöscht', 'success', 3000)
        return true
    }

    // REALTIME - Subscribe zu Änderungen an tasks & task_completions
    // Muss manuell aufgerufen werden (z.B. in HomeView.onMounted)
    const subscribeToTasks = () => {
        const householdStore = useHouseholdStore()

        if (!householdStore.currentHousehold) {
            console.warn('Cannot subscribe: No current household')
            return
        }

        // Alte Subscription cleanup (falls vorhanden)
        if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel)
        }

        console.log('🔴 Subscribing to tasks for household:', householdStore.currentHousehold.household_id)

        // Neuen Channel erstellen & filtern auf household_id
        realtimeChannel = supabase
            .channel(`tasks-changes-${Date.now()}`)
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'tasks',
                    filter: `household_id=eq.${householdStore.currentHousehold.household_id}`
                },
                (payload) => {
                    console.log('📡 Realtime tasks event:', payload)

                    // INSERT - Neuer Task wurde erstellt
                    if (payload.eventType === 'INSERT') {
                        const newTask = payload.new as Task
                        // Nur hinzufügen wenn nicht schon vorhanden (Race Condition vermeiden)
                        if (!tasks.value.find(t => t.task_id === newTask.task_id)) {
                            tasks.value.push(newTask)
                        }
                    }

                    // UPDATE - Task wurde geändert
                    if (payload.eventType === 'UPDATE') {
                        const updatedTask = payload.new as Task
                        // Echo-Schutz: eine Zeile, deren eigene Mutation gerade
                        // unterwegs ist, wird nicht überschrieben — sonst springt
                        // der optimistische Zustand kurz zurück.
                        if (isInFlight(updatedTask.task_id)) return
                        const index = tasks.value.findIndex(t => t.task_id === updatedTask.task_id)
                        if (index !== -1) {
                            tasks.value[index] = updatedTask
                        }
                    }

                    // DELETE - Task wurde gelöscht
                    if (payload.eventType === 'DELETE') {
                        const deletedTask = payload.old as Task
                        tasks.value = tasks.value.filter(t => t.task_id !== deletedTask.task_id)
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'task_completions'
                },
                (payload) => {
                    console.log('📡 Realtime completions event:', payload)

                    // INSERT - Neue Completion wurde erstellt
                    if (payload.eventType === 'INSERT') {
                        const newCompletion = payload.new as TaskCompletion

                        // ZUERST, VOR jedem `return` weiter unten. Das Projekt-
                        // Abzeichen an der Wand rechnet nicht aus `completions`,
                        // sondern aus einer eigenen Abfrage — es braucht dieses
                        // Ereignis also auch dann, wenn die Zeile hier gar nichts
                        // mehr zu tun findet.
                        //
                        // Genau das ist bei der EIGENEN Buchung der Regelfall:
                        // `completeTask().onSuccess` holt über
                        // `replaceOptimisticCompletion()` die Serverzeile selbst
                        // und setzt sie ein, lange bevor das Echo eintrifft. Der
                        // Treffer auf `completion_id` unten greift dann, der
                        // Handler steigt aus — und ein Nachruf am Ende des
                        // Zweiges liefe nie. Gemessen: vier Buchungen über die
                        // Wand-Geste, null Summen-Abfragen, Abzeichen unverändert
                        // falsch, während eine FREMDE Erledigung im selben
                        // Handler alles nachholte.
                        //
                        // Hier oben ist der Aufruf unabhängig davon, wie die
                        // eigene Buchung ihre Zeile einsetzt: er hängt allein am
                        // Eintreffen des Ereignisses. Wer das optimistische
                        // Einsetzen umbaut, kann das Abzeichen nicht mehr
                        // aushebeln. Doppelte Abfragen sind der Preis; eine
                        // falsche Zahl wäre teurer.
                        refreshProjectEffortTotals()

                        if (completions.value.find(c => c.completion_id === newCompletion.completion_id)) return

                        // Echo einer eigenen optimistischen Completion: die Prüfung
                        // auf completion_id greift hier nicht (die ID kommt erst vom
                        // Server), deshalb über task_id + user_id die optimistische
                        // Zeile ERSETZEN statt zu duplizieren.
                        const optimisticIndex = completions.value.findIndex(
                            c => isOptimistic(c) &&
                                c.task_id === newCompletion.task_id &&
                                c.user_id === newCompletion.user_id
                        )
                        if (optimisticIndex !== -1) {
                            completions.value[optimisticIndex] = newCompletion
                            return
                        }

                        completions.value.push(newCompletion)
                    }

                    // DELETE - Completion wurde gelöscht (sollte nicht vorkommen, aber für Vollständigkeit)
                    if (payload.eventType === 'DELETE') {
                        const deletedCompletion = payload.old as TaskCompletion
                        completions.value = completions.value.filter(c => c.completion_id !== deletedCompletion.completion_id)
                        // Volle Neuabfrage: der Payload trägt hier NUR die
                        // completion_id (kein `REPLICA IDENTITY FULL`), also ist
                        // weder Projekt noch Punktwert bekannt.
                        refreshProjectEffortTotals()
                    }
                }
            )
            .subscribe((status) => {
                console.log('📡 Realtime subscription status:', status)

                if (status === 'SUBSCRIBED') {
                    console.log('✅ Successfully subscribed to tasks and completions')
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
    // Muss beim Component Cleanup aufgerufen werden (z.B. HomeView.onUnmounted)
    const unsubscribeFromTasks = () => {
        if (realtimeChannel) {
            console.log('🔴 Unsubscribing from tasks')
            supabase.removeChannel(realtimeChannel)
            realtimeChannel = null
        }
    }

    // ASSIGN TASK - Weise Task einem Household-Member zu
    const assignTask = async (taskId: string, userId: string | null, permanent: boolean) => {
        const toastStore = useToastStore()
        isLoading.value = true

        const { error } = await supabase
            .from('tasks')
            .update({
                assigned_to: userId,
                assignment_permanent: permanent
            })
            .eq('task_id', taskId)

        isLoading.value = false

        if (error) {
            console.error('Error assigning task:', error)
            toastStore.showToast('Fehler beim Zuweisen der Aufgabe', 'error')
            return false
        }

        // Lokalen State aktualisieren
        const taskIndex = tasks.value.findIndex(t => t.task_id === taskId)
        if (taskIndex !== -1) {
            tasks.value[taskIndex].assigned_to = userId
            tasks.value[taskIndex].assignment_permanent = permanent
        }
        toastStore.showToast('Aufgabe zugewiesen', 'success', 3000)
        return true
    }

    // FETCH COMPLETIONS - Hole Task-Completions mit JOIN für History-View
    // Lädt alle completions des aktuellen Households mit Task- und Member-Namen
    // HINWEIS: Gelöschte Tasks haben task_id = NULL (ON DELETE SET NULL)
    const fetchCompletions = async () => {
        const householdStore = useHouseholdStore()
        const toastStore = useToastStore()

        if (!householdStore.currentHousehold) {
            console.warn('No current household, cannot fetch completions')
            return []
        }

        // Hole alle user_ids im aktuellen Household für Filterung
        const householdUserIds = householdStore.householdMembers.map(m => m.user_id)

        // JOIN task_completions → tasks (via task_id)
        // Mit Soft Delete bleiben Tasks erhalten → JOIN funktioniert immer
        // Filterung über user_id für Household-Zugehörigkeit
        const { data, error } = await supabase
            .from('task_completions')
            .select(`
                completion_id,
                completed_at,
                user_id,
                task_id,
                effort_override,
                completion_note,
                is_quick,
                tasks (
                    title,
                    household_id,
                    deleted_at
                )
            `)
            .in('user_id', householdUserIds)
            .order('completed_at', { ascending: false })

        if (error) {
            console.error('Error fetching completions:', error)
            toastStore.showToast('Fehler beim Laden der Historie', 'error')
            return []
        }

        // Filtere auf aktuellen Household
        const filteredData = data.filter(completion => {
            const taskData = Array.isArray(completion.tasks) ? completion.tasks[0] : completion.tasks
            return taskData?.household_id === householdStore.currentHousehold?.household_id
        })

        // Enriche mit display_name via Frontend-Matching
        // user_id → householdMembers (bereits im Store geladen)
        const enriched = filteredData.map(completion => {
            const taskData = Array.isArray(completion.tasks) ? completion.tasks[0] : completion.tasks
            const completionData = completion as typeof completion & {
                effort_override: number
                completion_note?: string | null
                is_quick?: boolean
            }

            // Task-Titel: Bei Soft-Deleted Tasks ist deleted_at gesetzt
            const isDeleted = (taskData as { deleted_at: string | null } | null)?.deleted_at !== null
            const taskTitle = (taskData as { title: string } | null)?.title || 'Unbekannte Aufgabe'

            return {
                completion_id: completion.completion_id,
                completed_at: completion.completed_at,
                user_id: completion.user_id, // WICHTIG: user_id für Stats-Berechnung
                task_id: completion.task_id, // WICHTIG: task_id für Effort-Lookup
                effort_override: completionData.effort_override, // UNIFIED: ALWAYS set (Single Source of Truth)
                completion_note: completionData.completion_note || null,
                isDeleted, // NEU: Flag für gelöschte Tasks (UI kann Badge anzeigen)
                isQuick: completionData.is_quick ?? false, // Quick-Aufgabe (nur Historie)
                tasks: {
                    title: taskTitle
                },
                household_members: {
                    display_name: householdStore.householdMembers.find(
                        m => m.user_id === completion.user_id
                    )?.display_name || 'Unbekannt'
                }
            }
        })

        console.log('Fetched completions:', enriched)

        // Store completions in state (for HistoryView reactive access)
        completions.value = enriched as EnrichedCompletion[]

        return enriched
    }

    // DELETE COMPLETION - Lösche einen Task-Completion Eintrag aus Historie
    // Wichtig: Löscht NUR aus task_completions, ändert NICHT tasks.completed Status
    const deleteCompletion = async (completionId: string) => {
        const toastStore = useToastStore()
        isLoading.value = true

        const { error } = await supabase
            .from('task_completions')
            .delete()
            .eq('completion_id', completionId)

        isLoading.value = false

        if (error) {
            console.error('Error deleting completion:', error)
            toastStore.showToast('Fehler beim Löschen des Eintrags', 'error')
            return false
        }

        // Lokalen State aktualisieren
        completions.value = completions.value.filter(c => c.completion_id !== completionId)
        // Hier verschwindet eine Projekt-Erledigung wirklich (der Fetzen greift
        // bei Projekten nicht, → 03-1). Der Nachruf steht als Vorsorge, aber
        // **er greift heute in keinem einzigen Fall**: `deleteCompletion` wird
        // nur aus `HistoryView` gerufen, dort ist die Wand nicht gemountet,
        // ihr `onUnmounted` hat `stopProjectEffortTotals()` gerufen — und
        // `refreshProjectEffortTotals()` ist dann ein `return` in Zeile 1.
        //
        // Dass das Abzeichen nach einem Löschen in der Historie trotzdem stimmt,
        // trägt allein `WallView.onMounted`: das Betreten der Wand holt die
        // Summen neu. Die Zeile hier wird erst dann zur Absicherung, wenn
        // Erledigungen auch bei geöffneter Wand gelöscht werden können.
        refreshProjectEffortTotals()
        toastStore.showToast('Eintrag gelöscht', 'success', 3000)
        return true
    }

    // DELETE ALL COMPLETIONS - Lösche alle Task-Completions für den aktuellen Haushalt
    // Verwendet tasks-Join um nur completions des aktuellen Households zu löschen
    const deleteAllCompletions = async () => {
        const householdStore = useHouseholdStore()
        const toastStore = useToastStore()

        if (!householdStore.currentHousehold) {
            console.warn('No current household, cannot delete completions')
            return false
        }

        isLoading.value = true

        // Erst alle task_ids des aktuellen Households holen
        const { data: householdTasks, error: tasksError } = await supabase
            .from('tasks')
            .select('task_id')
            .eq('household_id', householdStore.currentHousehold.household_id)

        if (tasksError) {
            console.error('Error fetching household tasks:', tasksError)
            toastStore.showToast('Fehler beim Löschen der Historie', 'error')
            isLoading.value = false
            return false
        }

        const taskIds = householdTasks.map(t => t.task_id)

        if (taskIds.length === 0) {
            console.warn('No tasks found for household')
            isLoading.value = false
            return true // Technisch erfolgreich, nur nichts zu löschen
        }

        // Dann alle completions für diese task_ids löschen
        const { error } = await supabase
            .from('task_completions')
            .delete()
            .in('task_id', taskIds)

        isLoading.value = false

        if (error) {
            console.error('Error deleting all completions:', error)
            toastStore.showToast('Fehler beim Löschen der Historie', 'error')
            return false
        }

        // Lokalen State aktualisieren
        completions.value = []
        // Mit der Historie fiele auch jedes Projekt-Abzeichen auf 0 — nach
        // derselben Rechnung wie sonst, nicht durch Nullsetzen von Hand.
        // Zweimal Vorsorge, zweimal ohne heutige Wirkung: `deleteAllCompletions`
        // hat aktuell **gar keinen Aufrufer** (nur Definition und Export), und
        // selbst mit einem träfe hier dieselbe Sperre wie bei
        // `deleteCompletion` — es sei denn, der Aufrufer säße auf der Wand.
        refreshProjectEffortTotals()
        toastStore.showToast('Historie gelöscht', 'success', 3000)
        return true
    }

    // SUBTASKS - Helper für Self-Referencing Tasks
    // Parent Tasks = tasks ohne parent_task_id
    const parentTasks = computed(() =>
        tasks.value.filter(t => t.parent_task_id === null)
    )

    // Subtasks für eine bestimmte Parent Task holen (sortiert nach order_index)
    const getSubtasks = (parentTaskId: string) =>
        tasks.value
            .filter(t => t.parent_task_id === parentTaskId)
            .sort((a, b) => a.order_index - b.order_index)

    // RESET SUBTASKS - Setze alle Subtasks einer Parent Task auf uncompleted
    const resetSubtasks = async (parentTaskId: string) => {
        const toastStore = useToastStore()
        const subtasks = getSubtasks(parentTaskId)

        if (subtasks.length === 0) {
            return true
        }

        const subtaskIds = subtasks.map(s => s.task_id)

        const { error } = await supabase
            .from('tasks')
            .update({ completed: false })
            .in('task_id', subtaskIds)

        if (error) {
            console.error('Error resetting subtasks:', error)
            toastStore.showToast('Fehler beim Zurücksetzen der Unteraufgaben', 'error')
            return false
        }

        // Reload tasks vom Backend (Source of Truth)
        await loadTasks()
        return true
    }

    // PROJECTS - Complete a project permanently
    const completeProject = async (projectId: string) => {
        const toastStore = useToastStore()
        isLoading.value = true

        const { error } = await supabase
            .from('tasks')
            .update({
                completed: true,
                last_completed_at: new Date().toISOString()
            })
            .eq('task_id', projectId)

        isLoading.value = false

        if (error) {
            console.error('Error completing project:', error)
            toastStore.showToast('Fehler beim Abschließen des Projekts', 'error')
            return false
        }

        // Reload tasks vom Backend (Source of Truth)
        await loadTasks()
        toastStore.showToast('Projekt abgeschlossen', 'success', 3000)
        return true
    }

    // PROJECTS - Calculate total effort contributed to a project from subtask completions
    const getProjectEffort = (projectId: string): number => {
        const subtasks = getSubtasks(projectId)
        const subtaskIds = subtasks.map(s => s.task_id)

        // Sum up effort from all completions of project subtasks
        // UNIFIED SOLUTION: Use effort_override (ALWAYS set, Single Source of Truth)
        return completions.value
            .filter(c => subtaskIds.includes(c.task_id))
            .reduce((total, completion) => {
                return total + completion.effort_override
            }, 0)
    }

    /**
     * Punktesummen der Projekte — **unabhängig von `completions`**.
     *
     * `getProjectEffort()` oben rechnet aus `completions.value`. Das trägt nur
     * im klassischen Aussehen, das seine Erledigungen selbst lädt; die Pinnwand
     * lädt gar keine (`WallView.onMounted`: `loadTasks` + `subscribeToTasks` +
     * `loadWeeklyCompletions`), und die Wochenliste liegt ohnehin im
     * `householdStore` und deckt nur die laufende Woche ab. Ein Projekt sammelt
     * über Monate. Deshalb eine eigene, schmale Abfrage.
     *
     * **Keine zweite Wahrheit:** gezählt wird weiter aus `task_completions`
     * (`effort_override`), es gibt keine Spalte auf `tasks` und keine Migration.
     * Was die Historie nicht mehr enthält — Zurückkleben löscht die Zeile —,
     * zählt hier automatisch nicht mehr mit.
     */
    const projectEffortTotals = ref<Record<string, number>>({})

    // Erst wenn die Wand die Summen einmal geholt hat, hält `refreshProjectEffortTotals`
    // sie nach. Ohne diese Sperre feuerte das klassische Aussehen bei jeder
    // Erledigung zwei überflüssige Abfragen — es rechnet aus `completions`.
    let projectEffortTotalsActive = false

    const loadProjectEffortTotals = async (): Promise<void> => {
        const householdStore = useHouseholdStore()
        if (!householdStore.currentHousehold) return

        projectEffortTotalsActive = true

        // Schritt 1: alle Unteraufgaben des Haushalts mit ihrem Elternteil.
        //
        // **Bewusst OHNE `deleted_at`-Filter.** Eine gelöschte Unteraufgabe hat
        // trotzdem Punkte verschlungen; ihre Erledigungen zählen weiter, sonst
        // schrumpfte das Abzeichen beim Aufräumen der Unteraufgaben.
        const { data: subtaskRows, error: subtaskError } = await supabase
            .from('tasks')
            .select('task_id, parent_task_id')
            .eq('household_id', householdStore.currentHousehold.household_id)
            .not('parent_task_id', 'is', null)

        if (subtaskError) {
            // Stehenlassen statt auf 0 setzen: eine falsche 0 sieht aus wie ein
            // Projekt ohne Arbeit und niemand liest sie als Fehler.
            console.error('Error loading subtasks for project effort totals:', subtaskError)
            return
        }

        const parentOf = new Map<string, string>()
        for (const row of (subtaskRows ?? []) as Pick<Task, 'task_id' | 'parent_task_id'>[]) {
            if (row.parent_task_id) parentOf.set(row.task_id, row.parent_task_id)
        }

        const subtaskIds = [...parentOf.keys()]
        const totals: Record<string, number> = {}

        // Schritt 2: die Erledigungen dieser Unteraufgaben. Summiert wird im
        // Client — PostgREST kann ohne DB-Objekt kein `GROUP BY`. Gezählt werden
        // ALLE Unteraufgaben-Erledigungen, nicht nur die von „Am Projekt
        // arbeiten": auch eine abgehakte Checklisten-Zeile hat Punkte gekostet,
        // wenn sie welche gebracht hat.
        //
        // Zwei voneinander unabhängige Grenzen, beide müssen gezogen werden:
        //
        // - `CHUNK` teilt die `in`-Liste, damit die URL nicht zu lang wird.
        //   Das begrenzt die Zahl der ABGEFRAGTEN IDs, nicht die der Zeilen.
        // - `PAGE` blättert die Antwort. PostgREST deckelt jede Antwort bei
        //   `max_rows` (`supabase/config.toml`: 1000). Eine Scheibe mit 150
        //   Unteraufgaben kann in einem gewachsenen Haushalt weit mehr als 1000
        //   Erledigungen tragen — ohne Blättern fiele der Rest weg, die Summe
        //   wäre zu NIEDRIG und niemand sähe einen Fehler.
        const CHUNK = 150
        const PAGE = 1000
        for (let i = 0; i < subtaskIds.length; i += CHUNK) {
            const chunk = subtaskIds.slice(i, i + CHUNK)

            let offset = 0
            for (;;) {
                const { data: completionRows, error: completionError } = await supabase
                    .from('task_completions')
                    .select('task_id, effort_override')
                    .in('task_id', chunk)
                    // Ohne feste Ordnung ist Blättern sinnlos: PostgREST gibt
                    // die Zeilen sonst in beliebiger Reihenfolge zurück, und
                    // zwischen zwei Seiten darf sie sich ändern. Dieselbe Zeile
                    // käme dann doppelt oder gar nicht — die Summe wäre still
                    // falsch, genau der Fehler, gegen den das Blättern hier
                    // überhaupt gebaut ist. `completion_id` ist der PK, also
                    // eindeutig und damit eine vollständige Ordnung.
                    .order('completion_id')
                    .range(offset, offset + PAGE - 1)

                if (completionError) {
                    console.error('Error loading completions for project effort totals:', completionError)
                    return
                }

                const rows = (completionRows ?? []) as Pick<TaskCompletion, 'task_id' | 'effort_override'>[]
                for (const row of rows) {
                    const parentId = parentOf.get(row.task_id)
                    if (!parentId) continue
                    totals[parentId] = (totals[parentId] ?? 0) + (row.effort_override ?? 0)
                }

                // Abbruch erst bei einer LEEREN Seite, und weitergezählt wird
                // um das, was wirklich kam. `rows.length < PAGE` wäre falsch,
                // sobald `max_rows` unter `PAGE` liegt: der Server kürzte dann
                // jede Seite, die erste Runde sähe wie die letzte aus und der
                // Rest fiele still weg.
                if (rows.length === 0) break
                offset += rows.length
            }
        }

        projectEffortTotals.value = totals
    }

    /**
     * Die Summe eines Projekts. 0 heißt „noch nichts gebucht" — ein Projekt ohne
     * Arbeitseintrag trägt das Abzeichen trotzdem.
     */
    const getProjectEffortTotal = (projectId: string): number =>
        projectEffortTotals.value[projectId] ?? 0

    /**
     * Nachziehen nach jeder Änderung an `task_completions`.
     *
     * **Immer voll neu abfragen, auch beim Löschen.** Ein Realtime-`DELETE`
     * trägt ohne `REPLICA IDENTITY FULL` nur die `completion_id` im Payload —
     * weder `task_id` noch Punktwert. Wer hier auf den Payload baut, kann nicht
     * abziehen; das Abzeichen bliebe nach dem Zurückkleben zu hoch, und
     * **niemand sähe einen Fehler**.
     */
    const refreshProjectEffortTotals = () => {
        if (!projectEffortTotalsActive) return
        void loadProjectEffortTotals()
    }

    /**
     * Gegenstück zu `loadProjectEffortTotals()`: die Wand meldet sich beim
     * Verlassen ab. Ohne das feuerte das klassische Aussehen, sobald es einmal
     * die Wand gesehen hat, bei jeder Erledigung Abfragen für Summen, die
     * niemand mehr liest — es rechnet aus `completions`.
     */
    const stopProjectEffortTotals = () => {
        projectEffortTotalsActive = false
    }

    // Return - was andere Komponenten verwenden können
    return {
        tasks,
        completions,
        isLoading,
        loadTasks,
        completeTask,
        undoCompletion,
        discardUndoTicket,
        canUndoCompletion,
        markAsDirty,
        cycleEmphasisLevel,
        postponeTask,
        createTask,
        createQuickTask,
        updateTask,
        deleteTask,
        subscribeToTasks,
        unsubscribeFromTasks,
        assignTask,
        fetchCompletions,
        deleteCompletion,
        deleteAllCompletions,
        // Subtasks
        parentTasks,
        getSubtasks,
        resetSubtasks,
        // Projects
        completeProject,
        getProjectEffort,
        projectEffortTotals,
        loadProjectEffortTotals,
        getProjectEffortTotal,
        refreshProjectEffortTotals,
        stopProjectEffortTotals
    }
})