<script setup lang="ts">
import TaskCard from './TaskCard.vue'
import { useTaskStore } from '@/stores/taskStore'
import { computed } from 'vue'
import type { Task } from '@/types/Task'

interface Props {
  filter: 'daily-todo' | 'recurring-todo' | 'completed'
}

const props = defineProps<Props>()
const taskStore = useTaskStore()

// Computed property für gefilterte Tasks basierend auf Props
// WICHTIG: Nur Parent Tasks anzeigen (parent_task_id === null)
// Subtasks werden innerhalb der TaskCard Component angezeigt
const filteredTasks = computed(() => {
  if (props.filter === 'completed') {
    return taskStore.tasks.filter((task: Task) =>
      task.completed && task.parent_task_id === null // Nur Parent Tasks
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
  }
  return []
})

</script>
<template>
    <div class="container-fluid">
        <div class="row">
            <div v-for="task in filteredTasks"
            :key="task.task_id"
            class="col-12 col-md-6 col-lg-3 mb-3">
                <TaskCard :task="task" />
            </div>
        </div>
    </div>
</template>