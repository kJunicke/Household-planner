<script setup lang="ts">
import TaskCard from './TaskCard.vue';
import type { Task } from '@/types/Task'

interface Props {
  tasks: Task[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
    toggleTask: [taskId: number]
}>()

</script>
<template>
    <div class="container-fluid">
        <div class="row">
            <div v-for="task in props.tasks"
            :key="task.id"
            class="col-12 col-md-6 col-lg-3 mb-3">
                <TaskCard :task="task" 
                @toggleTask="emit('toggleTask', $event)"
                />
            </div>
        </div>
    </div>
</template>