<script setup lang="ts">
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'

interface Props {
     task: Task
}

const props = defineProps<Props>()
const taskStore = useTaskStore()

const handleToggleTask = () => {
    taskStore.toggleTask(props.task.task_id)
}

const handleDeleteTask = async () => {
     try { 
          await taskStore.deleteTask(props.task.task_id)
          
     } catch (error) {
          console.error('Fehler beim Löschen:', error)
     }
}
</script>

<template>
     <!--h-100 macht alle Karten 100% der Höhe des Containers?-->
     <div class="card h-100">
          <div class="card-body">
               <h6 class="card-title">{{ props.task.title }}</h6>
               <p class="text">Aufwand: {{ props.task.effort }}</p>
               <!-- Für wiederkehrende Tasks -->
               <p v-if="props.task.recurrence_days > 0" class="text">
                    Wiederholt sich alle {{ props.task.recurrence_days }} Tage
               </p>

               <!-- Für einmalige Tasks -->
               <p v-if="props.task.recurrence_days === 0" class="text">
                    Einmalige Aufgabe
               </p>
          </div>
          <div class="card-footer">
               <button v-if="props.task.completed" 
                       class="btn btn-warning w-30" 
                       @click="handleToggleTask">
                    Dreckig
               </button>
               <button v-else 
                       class="btn btn-success w-30" 
                       @click="handleToggleTask">
                    Sauber
               </button>
               <button class="btn btn-danger"
               @click="handleDeleteTask">
               Aufgabe Löschen
               </button>
          </div>
     </div>

</template>

<style scoped>
</style>