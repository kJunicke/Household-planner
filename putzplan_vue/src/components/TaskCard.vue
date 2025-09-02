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
     completeTask: [taskId: number]
}>()

const handleCompleteTask = () => {
    emit('completeTask', props.task.id)
  }
</script>

<template>
     <!--h-100 macht alle Karten 100% der Höhe des Containers?-->
     <div class="card h-100">
          <div class="card-body">
               <h6 class="card-title">{{ props.task.title }}</h6>
               <p class="text">Aufwand: {{ props.task.effort }}</p>
               <!-- Für wiederkehrende Tasks -->
               <p v-if="props.task.recurrence.type === 'recurring'" class="text">
                    Wiederholt sich alle {{ props.task.recurrence.days }} Tage
               </p>

               <!-- Für einmalige Tasks -->
               <p v-if="props.task.recurrence.type === 'once'" class="text">
                    Einmalige Aufgabe
               </p>
          </div>
          <div class="card-footer">
               <button class="btn btn-success w-30"
               @click="handleCompleteTask"
               >Erledigt?</button>
          </div>
     </div>

</template>

<style scoped>
</style>