import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Task, TaskCompletion } from '@/types/Task'
import { supabase } from '@/lib/supabase'
import { useHouseholdStore } from './householdStore'

export const useTaskStore = defineStore('tasks', () => {
    // State - wie ref() in Komponenten
    const tasks = ref<Task[]>([])
    const completions = ref<TaskCompletion[]>([])

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

    // CREATE - Neue Task erstellen
    const createTask = async (taskData: Omit<Task, 'task_id' | 'household_id'>) => {
        const householdStore = useHouseholdStore()

        if (!householdStore.currentHousehold) {
            console.error('Cannot create task: No current household')
            return null
        }

        const { data, error } = await supabase
            .from('tasks')
            .insert({
                ...taskData,
                household_id: householdStore.currentHousehold.household_id
            })
            .select()
            .single()

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
        const { error } = await supabase
            .from('tasks')
            .update(updates)
            .eq('task_id', taskId)

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
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('task_id', taskId)

        if (error) {
            console.error('Error deleting task:', error)
            return false
        }

        // Lokalen State aktualisieren
        tasks.value = tasks.value.filter(t => t.task_id !== taskId)
        return true
    }
    // Return - was andere Komponenten verwenden können
    return { 
        tasks, 
        completions, 
        loadTasks, 
        toggleTask, 
        createTask, 
        updateTask, 
        deleteTask 
    }
})