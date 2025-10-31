<script setup lang="ts">
import TaskCard from './TaskCard.vue'
import { useTaskStore } from '@/stores/taskStore'
import { computed } from 'vue'

interface Props {
  filter: 'daily-todo' | 'recurring-todo' | 'completed'
}

const props = defineProps<Props>()
const taskStore = useTaskStore()

// Computed property für gefilterte Tasks basierend auf Props
const filteredTasks = computed(() => {
  if (props.filter === 'completed') {
    return taskStore.tasks.filter(task => task.completed)
  } else if (props.filter === 'daily-todo') {
    // Tägliche Tasks (nicht completed) + einmalige Tasks
    return taskStore.tasks.filter(task =>
      !task.completed && (task.task_type === 'daily' || task.task_type === 'one-time')
    )
  } else if (props.filter === 'recurring-todo') {
    // Wiederkehrende Tasks (nicht completed)
    return taskStore.tasks.filter(task =>
      !task.completed && task.task_type === 'recurring'
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