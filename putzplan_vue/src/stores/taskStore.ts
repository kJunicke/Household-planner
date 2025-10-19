import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Task, TaskCompletion } from '@/types/Task'
import { supabase } from '@/lib/supabase'
import { useHouseholdStore } from './householdStore'
import { useAuthStore } from './authStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

export const useTaskStore = defineStore('tasks', () => {
    // State - wie ref() in Komponenten
    const tasks = ref<Task[]>([])
    const completions = ref<TaskCompletion[]>([])
    const isLoading = ref(false)

    // Realtime subscription channel (wird in subscribe() initialisiert)
    let realtimeChannel: RealtimeChannel | null = null

    // Actions - Funktionen die State ändern
    const loadTasks = async () => {
        console.log('Loading tasks...')

        const householdStore = useHouseholdStore()

        // Nur Tasks des aktuellen Households laden
        if (!householdStore.currentHousehold) {
            console.warn('No current household, cannot load tasks')
            tasks.value = []
            completions.value = []
            return
        }

        const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('household_id', householdStore.currentHousehold.household_id)

        if (tasksError) {
            console.error('Error loading tasks', tasksError)
            return
        }

        const { data: completionsData, error: completionsError} = await supabase
        .from('task_completions')
        .select('*')

        if (completionsError) {
            console.error('Error loading completions', completionsError)
            return
        }

        tasks.value = tasksData || []
        completions.value = completionsData || [] 
        console.log('Loaded tasks:', tasks.value)
        console.log('Loaded completions:', completions.value)
    }
    const toggleTask = async (taskId:string) => {
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
        return
        }

    }

    // COMPLETE - Task als erledigt markieren
    // Schreibt in task_completions Historie UND setzt tasks.completed = TRUE
    const completeTask = async (taskId: string) => {
        const authStore = useAuthStore()

        if (!authStore.user) {
            console.error('Cannot complete task: No user logged in')
            return false
        }

        // 1. INSERT in task_completions (Historie für Gamification)
        const { error: completionError } = await supabase
            .from('task_completions')
            .insert({
                task_id: taskId,
                user_id: authStore.user.id
                // completed_at wird automatisch von Supabase gesetzt (DEFAULT NOW())
            })

        if (completionError) {
            console.error('Error creating completion:', completionError)
            return false
        }

        // 2. UPDATE tasks.completed = TRUE
        const { error: updateError } = await supabase
            .from('tasks')
            .update({ completed: true })
            .eq('task_id', taskId)

        if (updateError) {
            console.error('Error updating task status:', updateError)
            return false
        }

        // 3. Reload tasks vom Backend (Source of Truth, kein optimistic update)
        await loadTasks()
        return true
    }

    // MARK AS DIRTY - Task wieder als "dreckig" markieren
    // Ändert nur tasks.completed, löscht KEINE completions aus der Historie
    const markAsDirty = async (taskId: string) => {
        // UPDATE tasks.completed = FALSE
        const { error } = await supabase
            .from('tasks')
            .update({ completed: false })
            .eq('task_id', taskId)

        if (error) {
            console.error('Error marking task as dirty:', error)
            return false
        }

        // Reload tasks vom Backend (Source of Truth)
        await loadTasks()
        return true
    }

    // CREATE - Neue Task erstellen
    // completed und last_completed_at sind optional - Database setzt Defaults
    const createTask = async (taskData: Omit<Task, 'task_id' | 'household_id' | 'completed' | 'last_completed_at'>) => {
        const householdStore = useHouseholdStore()

        if (!householdStore.currentHousehold) {
            console.error('Cannot create task: No current household')
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
            return null
        }

        // Lokalen State aktualisieren
        tasks.value.push(data)
        return data
    }

    // UPDATE - Task vollständig aktualisieren
    const updateTask = async (taskId: string, updates: Partial<Omit<Task, 'task_id'>>) => {
        isLoading.value = true

        const { error } = await supabase
            .from('tasks')
            .update(updates)
            .eq('task_id', taskId)

        isLoading.value = false

        if (error) {
            console.error('Error updating task:', error)
            return false
        }

        // Lokalen State aktualisieren
        const taskIndex = tasks.value.findIndex(t => t.task_id === taskId)
        if (taskIndex !== -1) {
            tasks.value[taskIndex] = { ...tasks.value[taskIndex], ...updates }
        }
        return true
    }

    // DELETE - Task löschen
    const deleteTask = async (taskId: string) => {
        isLoading.value = true

        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('task_id', taskId)

        isLoading.value = false

        if (error) {
            console.error('Error deleting task:', error)
            return false
        }

        // Lokalen State aktualisieren
        tasks.value = tasks.value.filter(t => t.task_id !== taskId)
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
            .channel('tasks-changes')
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
            .subscribe()
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

    // Return - was andere Komponenten verwenden können
    return {
        tasks,
        completions,
        isLoading,
        loadTasks,
        toggleTask,
        completeTask,
        markAsDirty,
        createTask,
        updateTask,
        deleteTask,
        subscribeToTasks,
        unsubscribeFromTasks
    }
})