<script setup lang="ts">
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { ref } from "vue";

interface Props {
     task: Task
}

const props = defineProps<Props>()
const taskStore = useTaskStore()
const isEditing = ref(false)

const editForm = ref({
     ...props.task
})

const startEdit = () => {
     editForm.value = {...props.task}
     isEditing.value = true
}

const saveEdit = async () => {
     await taskStore.updateTask(props.task.task_id, editForm.value)
     isEditing.value = false
}

const cancelEdit = () => {
     isEditing.value = false
}

const handleDeleteTask = async () => {
     try { 
          await taskStore.deleteTask(props.task.task_id)
          
     } catch (error) {
          console.error('Fehler beim Löschen:', error)
     }
}

const handleCompleteTask = () => {
     taskStore.completeTask(props.task.task_id)
}

const handleMarkDirty = () => {
     taskStore.markAsDirty(props.task.task_id)
}
</script>

<template>
     <!--h-100 macht alle Karten 100% der Höhe des Containers?-->
     <div class="card h-100">
          <!-- Normal Display -->
          <div v-if="!isEditing" class="card-body">
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

          <!-- Edit Form -->
          <div v-else class="card-body">
               <form @submit.prevent="saveEdit">
                    <div class="mb-3">
                         <label for="title" class="form-label">Titel</label>
                         <input
                              type="text"
                              class="form-control"
                              id="title"
                              v-model="editForm.title"
                              required>
                    </div>

                    <div class="mb-3">
                         <label for="effort" class="form-label">Aufwand</label>
                         <input
                              type="number"
                              class="form-control"
                              id="effort"
                              v-model.number="editForm.effort"
                              min="1"
                              required>
                    </div>

                    <div class="mb-3">
                         <label for="recurrence" class="form-label">Wiederholung (Tage, 0 = einmalig)</label>
                         <input
                              type="number"
                              class="form-control"
                              id="recurrence"
                              v-model.number="editForm.recurrence_days"
                              min="0"
                              required>
                    </div>
               </form>
          </div>
          <div class="card-footer">
               <!-- Normal Mode Buttons -->
               <div v-if="!isEditing" class="d-flex gap-2">
                    <button v-if="props.task.completed"
                            class="btn btn-warning"
                            @click="handleMarkDirty">
                         Dreckig
                    </button>
                    <button v-else
                            class="btn btn-success"
                            @click="handleCompleteTask">
                         Sauber
                    </button>
                    <button class="btn btn-danger"
                            @click="handleDeleteTask">
                         Aufgabe Löschen
                    </button>
                    <button class="btn btn-secondary"
                            @click="startEdit">
                         Bearbeiten
                    </button>
               </div>

               <!-- Edit Mode Buttons -->
               <div v-else class="d-flex gap-2">
                    <button type="submit"
                            class="btn btn-primary"
                            @click="saveEdit">
                         Speichern
                    </button>
                    <button type="button"
                            class="btn btn-secondary"
                            @click="cancelEdit">
                         Abbrechen
                    </button>
               </div>
          </div>
     </div>

</template>

<style scoped>
</style>