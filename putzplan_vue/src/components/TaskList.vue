<script setup lang="ts">
import TaskCard from './TaskCard.vue'
import { useTaskStore } from '@/stores/taskStore'
import { computed } from 'vue'
import type { Task } from '@/types/Task'

interface Props {
  filter: 'daily-todo' | 'recurring-todo' | 'project-todo' | 'completed'
}

const props = defineProps<Props>()
const taskStore = useTaskStore()

// Computed property für gefilterte Tasks basierend auf Props
// WICHTIG: Nur Parent Tasks anzeigen (parent_task_id === null)
// Subtasks werden innerhalb der TaskCard Component angezeigt
const filteredTasks = computed(() => {
  if (props.filter === 'completed') {
    // Completed tasks (non-projects)
    return taskStore.tasks.filter((task: Task) =>
      task.completed &&
      task.parent_task_id === null && // Nur Parent Tasks
      task.task_type !== 'project' // Projekte werden separat angezeigt
    )
  } else if (props.filter === 'daily-todo') {
    // Tägliche Tasks (nicht completed) + einmalige Tasks
    return taskStore.tasks.filter((task: Task) =>
      !task.completed &&
      task.parent_task_id === null && // Nur Parent Tasks
      (task.task_type === 'daily' || task.task_type === 'one-time')
    )
  } else if (props.filter === 'recurring-todo') {
    // Wiederkehrende Tasks (nicht completed)
    return taskStore.tasks.filter((task: Task) =>
      !task.completed &&
      task.parent_task_id === null && // Nur Parent Tasks
      task.task_type === 'recurring'
    )
  } else if (props.filter === 'project-todo') {
    // Projekte (nicht completed)
    return taskStore.tasks.filter((task: Task) =>
      !task.completed &&
      task.parent_task_id === null && // Nur Parent Tasks
      task.task_type === 'project'
    )
  }
  return []
})

// Completed projects (separate section in completed view)
const completedProjects = computed(() => {
  return taskStore.tasks.filter((task: Task) =>
    task.completed &&
    task.parent_task_id === null &&
    task.task_type === 'project'
  ).sort((a, b) => {
    // Sort by completion date (newest first)
    if (!a.last_completed_at || !b.last_completed_at) return 0
    return new Date(b.last_completed_at).getTime() - new Date(a.last_completed_at).getTime()
  })
})

</script>
<template>
    <div class="container-fluid">
        <!-- Regular Tasks -->
        <div v-if="filteredTasks.length > 0" class="row">
            <div v-for="task in filteredTasks"
            :key="task.task_id"
            class="col-12 col-md-6 col-lg-3 mb-3">
                <TaskCard :task="task" />
            </div>
        </div>

        <!-- Completed Projects Section (only in completed view) -->
        <div v-if="filter === 'completed' && completedProjects.length > 0" class="completed-projects-section">
            <h6 class="section-title">Abgeschlossene Projekte</h6>
            <div class="row">
                <div v-for="project in completedProjects"
                :key="project.task_id"
                class="col-12 col-md-6 col-lg-3 mb-3">
                    <TaskCard :task="project" />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.completed-projects-section {
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 2px solid var(--color-border);
}

.section-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
</style>