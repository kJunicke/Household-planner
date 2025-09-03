import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Task, TaskCompletion } from '@/types/Task'
import { supabase } from '@/lib/supabase'

export const useTaskStore = defineStore('tasks', () => {
    // State - wie ref() in Komponenten
    const tasks = ref<Task[]>([])
    const completions = ref<TaskCompletion[]>([])

    // Actions - Funktionen die State ändern
    const loadTasks = async () => {
        console.log('Loading tasks...')

        const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')

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
    // Return - was andere Komponenten verwenden können
    return { tasks, completions, loadTasks, toggleTask }
})