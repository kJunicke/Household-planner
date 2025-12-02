<script setup lang="ts">
import TaskCard from './TaskCard.vue'
import { useTaskStore } from '@/stores/taskStore'
import { computed } from 'vue'
import type { Task } from '@/types/Task'

interface Props {
  filter: 'daily-todo' | 'recurring-todo' | 'project-todo' | 'completed'
  searchQuery?: string
}

const props = defineProps<Props>()
const taskStore = useTaskStore()

// Helper function to check if task or its subtasks match search query
const matchesSearch = (task: Task): boolean => {
  if (!props.searchQuery || !props.searchQuery.trim()) return true

  const query = props.searchQuery.trim().toLowerCase()

  // Check task title
  if (task.title.toLowerCase().includes(query)) return true

  // Check subtasks
  const subtasks = taskStore.tasks.filter((t: Task) => t.parent_task_id === task.task_id)
  return subtasks.some((subtask: Task) => subtask.title.toLowerCase().includes(query))
}

// Computed property für gefilterte Tasks basierend auf Props
// WICHTIG: Nur Parent Tasks anzeigen (parent_task_id === null)
// Subtasks werden innerhalb der TaskCard Component angezeigt
const filteredTasks = computed(() => {
  let tasks: Task[] = []

  if (props.filter === 'completed') {
    // Completed tasks (non-projects)
    tasks = taskStore.tasks.filter((task: Task) =>
      task.completed &&
      task.parent_task_id === null && // Nur Parent Tasks
      task.task_type !== 'project' // Projekte werden separat angezeigt
    )

    // Sortiere nach Fälligkeit (dringendste zuerst)
    tasks.sort((a, b) => {
      // Helper: Berechne verbleibende Tage bis Fälligkeit
      const getDaysUntilDue = (task: Task): number => {
        // One-time tasks haben keine Fälligkeit → ganz unten
        if (task.task_type === 'one-time') return Infinity

        // Recurring tasks ohne recurrence_days → ganz unten
        if (task.task_type !== 'recurring' || !task.recurrence_days || !task.last_completed_at) {
          return Infinity
        }

        const lastCompleted = new Date(task.last_completed_at)
        const today = new Date()
        const lastCompletedDate = new Date(lastCompleted.getFullYear(), lastCompleted.getMonth(), lastCompleted.getDate())
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())

        const daysPassed = Math.floor((todayDate.getTime() - lastCompletedDate.getTime()) / (1000 * 60 * 60 * 24))
        return task.recurrence_days - daysPassed
      }

      // Sortiere nach verbleibenden Tagen (aufsteigend - nächste Fälligkeit zuerst)
      return getDaysUntilDue(a) - getDaysUntilDue(b)
    })
  } else if (props.filter === 'daily-todo') {
    // Tägliche Tasks (nicht completed) + einmalige Tasks
    tasks = taskStore.tasks.filter((task: Task) =>
      !task.completed &&
      task.parent_task_id === null && // Nur Parent Tasks
      (task.task_type === 'daily' || task.task_type === 'one-time')
    )
  } else if (props.filter === 'recurring-todo') {
    // Wiederkehrende Tasks (nicht completed)
    tasks = taskStore.tasks.filter((task: Task) =>
      !task.completed &&
      task.parent_task_id === null && // Nur Parent Tasks
      task.task_type === 'recurring'
    )

    // Sortiere nach Dringlichkeit (dringendste zuerst)
    tasks.sort((a, b) => {
      // Tasks ohne last_completed_at (noch nie gemacht) → ganz oben
      if (!a.last_completed_at && !b.last_completed_at) return 0
      if (!a.last_completed_at) return -1
      if (!b.last_completed_at) return 1

      // Berechne Tage überfällig für beide Tasks
      const getDaysOverdue = (task: Task): number => {
        if (!task.last_completed_at) return Infinity
        const lastCompleted = new Date(task.last_completed_at)
        const today = new Date()
        const lastCompletedDate = new Date(lastCompleted.getFullYear(), lastCompleted.getMonth(), lastCompleted.getDate())
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        return Math.floor((todayDate.getTime() - lastCompletedDate.getTime()) / (1000 * 60 * 60 * 24))
      }

      // Sortiere nach Tagen überfällig (absteigend - mehr Tage = höhere Priorität)
      return getDaysOverdue(b) - getDaysOverdue(a)
    })
  } else if (props.filter === 'project-todo') {
    // Projekte (nicht completed)
    tasks = taskStore.tasks.filter((task: Task) =>
      !task.completed &&
      task.parent_task_id === null && // Nur Parent Tasks
      task.task_type === 'project'
    )
  }

  // Apply search filter
  return tasks.filter(matchesSearch)
})

// Completed projects (separate section in completed view)
const completedProjects = computed(() => {
  const tasks = taskStore.tasks.filter((task: Task) =>
    task.completed &&
    task.parent_task_id === null &&
    task.task_type === 'project'
  ).sort((a, b) => {
    // Sort by completion date (newest first)
    if (!a.last_completed_at || !b.last_completed_at) return 0
    return new Date(b.last_completed_at).getTime() - new Date(a.last_completed_at).getTime()
  })

  // Apply search filter
  return tasks.filter(matchesSearch)
})

</script>
<template>
    <div class="task-list-container">
        <!-- Regular Tasks -->
        <div v-if="filteredTasks.length > 0" class="task-list">
            <TaskCard v-for="task in filteredTasks" :key="task.task_id" :task="task" />
        </div>

        <!-- Completed Projects Section (only in completed view) -->
        <div v-if="filter === 'completed' && completedProjects.length > 0" class="completed-projects-section">
            <h3 class="section-title">Abgeschlossene Projekte</h3>
            <div class="task-list">
                <TaskCard v-for="project in completedProjects" :key="project.task_id" :task="project" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.task-list-container {
    width: 100%;
}

.task-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
}

.completed-projects-section {
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 2px solid var(--color-border);
}

.section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
</style>