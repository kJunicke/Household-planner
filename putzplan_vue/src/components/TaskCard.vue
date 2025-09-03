<script setup lang="ts">
//@ importiert aus dem src verzeichnis um mühsame pfade zu sparen
import type { Task } from '@/types/Task'


// Typescript überprüft ob die übergebenen Daten auch wirklich ein Task sind
interface Props {
     task: Task
}
// props von der Elternkomponente werden in props gespeichert
// abrufbar als props.task...
const props = defineProps<Props>()

const emit = defineEmits<{
     toggleTask: [task_id: string]
}>()

const handleToggleTask = () => {
    emit('toggleTask', props.task.task_id)
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
          </div>
     </div>

</template>

<style scoped>
</style>