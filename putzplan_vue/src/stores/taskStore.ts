import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Task, TaskCompletion, EnrichedCompletion } from '@/types/Task'
import { supabase } from '@/lib/supabase'
import { formatPostponeDate } from '@/lib/taskSchedule'
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

        // Snapshot der Zeilen, die der Apply anfasst (Task + ggf. Subtasks)
        type RowSnapshot = Pick<Task, 'task_id' | 'completed' | 'last_completed_at' | 'postponed_until' | 'assigned_to'>

        // Für Fehler-Toast und Reload-Bypass, im Apply gefüllt
        let taskTitle = 'Aufgabe'
        const touchedIds: string[] = []

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
                await householdStore.loadWeeklyCompletions()
                // Erst NACH dem Reload entfernen, sonst zählt die Woche kurz doppelt
                // bzw. fällt die Erledigung kurz aus dem Ranking.
                householdStore.removeOptimisticCompletion(clientMutationId)
                // Die echte Completion holen und die optimistische ERSETZEN, statt
                // sie nur zu löschen — sonst verschwindet der Eintrag ersatzlos,
                // wenn das Realtime-Echo ausbleibt.
                await replaceOptimisticCompletion(clientMutationId, taskId, userId)
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
        assigned_to: task.assigned_to
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
    const restoreRows = async (
        snapshot: Pick<Task, 'task_id' | 'completed' | 'last_completed_at' | 'postponed_until' | 'assigned_to'>[],
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
        await householdStore.loadWeeklyCompletions()

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

    // Return - was andere Komponenten verwenden können
    return {
        tasks,
        completions,
        isLoading,
        loadTasks,
        completeTask,
        markAsDirty,
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
        getProjectEffort
    }
})