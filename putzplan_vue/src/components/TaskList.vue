<script setup lang="ts">
import TaskCard from './TaskCard.vue';
import type { Task } from '@/types/Task'

interface Props {
  tasks: Task[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
    completeTask: [taskId: number]
}>()

</script>
<template>
    <div class="container-fluid">
        <div class="row">
            <div v-for="task in props.tasks"
            :key="task.id"
            class="col-12 col-md-6 col-lg-3 mb-3">
                <TaskCard :task="task" 
                @completeTask="emit('completeTask', $event)"
                />
            </div>
        </div>
    </div>
</template>