import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Task, TaskCompletion, EnrichedCompletion } from '@/types/Task'
import { supabase } from '@/lib/supabase'
import { useHouseholdStore } from './householdStore'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

export const useTaskStore = defineStore('tasks', () => {
    // State - wie ref() in Komponenten
    const tasks = ref<Task[]>([])
    // Completions: Kann TaskCompletion (von loadTasks) oder EnrichedCompletion (von fetchCompletions) sein
    // EnrichedCompletion enthält zusätzlich tasks.title, isDeleted, household_members
    const completions = ref<(TaskCompletion | EnrichedCompletion)[]>([])
    const isLoading = ref(false)

    // Realtime subscription channel (wird in subscribe() initialisiert)
    let realtimeChannel: RealtimeChannel | null = null

    // Actions - Funktionen die State ändern
    const loadTasks = async () => {
        console.log('Loading tasks...')

        // Verhindere parallele Calls
        if (isLoading.value) {
            console.log('Already loading tasks, skipping...')
            return
        }

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

            tasks.value = tasksData || []
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
    const toggleTask = async (taskId:string) => {
        const toastStore = useToastStore()
        const task = tasks.value.find(t => t.task_id === taskId)
        if(!task) return
        const newState = !task.completed
        task.completed = newState

        const {error} = await supabase.
        from('tasks')
        .update({completed: newState})
        .eq('task_id', taskId)

        if (error) {
            console.error('Error updating task:', error)
            toastStore.showToast('Fehler beim Aktualisieren der Aufgabe', 'error')
            return
        }

    }

    // COMPLETE - Task als erledigt markieren (via Edge Function)
    // Edge Function schreibt in task_completions Historie UND setzt tasks.completed = TRUE + last_completed_at
    // Optional: effortOverride und completionNote für Sonderfälle (z.B. unerwarteter Mehraufwand)
    const completeTask = async (taskId: string, effortOverride?: number, completionNote?: string) => {
        const authStore = useAuthStore()
        const toastStore = useToastStore()

        if (!authStore.user) {
            console.error('Cannot complete task: No user logged in')
            toastStore.showToast('Fehler: Nicht angemeldet', 'error')
            return false
        }

        // Call Edge Function (replaces direct DB access + trigger logic)
        // effortOverride and completionNote are both optional and independent
        const payload: {
            taskId: string
            effortOverride?: number
            completionNote?: string
        } = { taskId }

        if (effortOverride !== undefined) {
            payload.effortOverride = effortOverride
        }

        if (completionNote?.trim()) {
            payload.completionNote = completionNote
        }

        const { data, error } = await supabase.functions.invoke('complete-task', {
            body: payload
        })

        if (error) {
            console.error('Error calling complete-task function:', error)
            console.error('Full error object:', JSON.stringify(error, null, 2))
            toastStore.showToast('Fehler beim Abschließen der Aufgabe', 'error')
            return false
        }

        if (!data?.success) {
            console.error('Edge function returned error:', data)
            console.error('Full response data:', JSON.stringify(data, null, 2))
            toastStore.showToast('Fehler beim Abschließen der Aufgabe', 'error')
            return false
        }

        // Reload tasks vom Backend (Source of Truth, kein optimistic update)
        await loadTasks()

        // Reload weekly completions for header stats
        const householdStore = useHouseholdStore()
        await householdStore.loadWeeklyCompletions()

        // Show warning if subtask reset failed (prevents silent data corruption)
        if (data.warning) {
            console.warn('Edge function warning:', data.warning)
            // Use 'info' type since 'warning' doesn't exist yet
            toastStore.showToast(`⚠️ ${data.warning}`, 'info', 5000)
        } else {
            toastStore.showToast('Aufgabe abgeschlossen', 'success', 3000)
        }
        return true
    }

    // MARK AS DIRTY - Task wieder als "dreckig" markieren
    // Ändert nur tasks.completed, löscht KEINE completions aus der Historie
    const markAsDirty = async (taskId: string) => {
        const toastStore = useToastStore()
        // UPDATE tasks.completed = FALSE
        const { error } = await supabase
            .from('tasks')
            .update({ completed: false })
            .eq('task_id', taskId)

        if (error) {
            console.error('Error marking task as dirty:', error)
            toastStore.showToast('Fehler beim Zurücksetzen der Aufgabe', 'error')
            return false
        }

        // Reload tasks vom Backend (Source of Truth)
        await loadTasks()
        return true
    }

    // SKIP - Task zeitlich verschieben ohne Punkte zu vergeben
    // Setzt last_completed_at auf jetzt (für Cron-Job Berechnung)
    // OHNE task_completions Entry (keine Punkte, keine Historie)
    // completed bleibt FALSE (Task bleibt dirty, nur zeitlich verschoben)
    const skipTask = async (taskId: string) => {
        const toastStore = useToastStore()

        const { error } = await supabase
            .from('tasks')
            .update({
                last_completed_at: new Date().toISOString()
            })
            .eq('task_id', taskId)

        if (error) {
            console.error('Error skipping task:', error)
            toastStore.showToast('Fehler beim Verschieben der Aufgabe', 'error')
            return false
        }

        toastStore.showToast('Task verschoben', 'success')
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
                        // Nur hinzufügen wenn nicht schon vorhanden
                        if (!completions.value.find(c => c.completion_id === newCompletion.completion_id)) {
                            completions.value.push(newCompletion)
                        }
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
        toggleTask,
        completeTask,
        markAsDirty,
        skipTask,
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