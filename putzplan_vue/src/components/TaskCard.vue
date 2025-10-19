<script setup lang="ts">
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { ref, computed } from "vue";

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

// Berechnet Tage bis Task wieder fällig ist (nur für wiederkehrende Tasks die completed sind)
// Verwendet CALENDAR DAYS (nicht 24h-Perioden), konsistent mit Backend-Cron-Logik
const daysUntilDue = computed(() => {
     // Nur für wiederkehrende Tasks die completed sind
     if (props.task.recurrence_days === 0 || !props.task.completed || !props.task.last_completed_at) {
          return null
     }

     const lastCompleted = new Date(props.task.last_completed_at)
     const today = new Date()

     // Calendar days: Nur Datum vergleichen, keine Uhrzeit
     // Setzt Zeit auf 00:00:00 für beide Daten
     const lastCompletedDate = new Date(lastCompleted.getFullYear(), lastCompleted.getMonth(), lastCompleted.getDate())
     const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())

     // Berechne vergangene Tage (in ganzen Kalendertagen)
     const daysPassed = Math.floor((todayDate.getTime() - lastCompletedDate.getTime()) / (1000 * 60 * 60 * 24))

     // Verbleibende Tage bis zum Reset
     const daysRemaining = props.task.recurrence_days - daysPassed

     return daysRemaining
})
</script>

<template>
     <div class="task-card h-100">
          <!-- Normal Display -->
          <div v-if="!isEditing" class="card-body">
               <h6 class="task-title">{{ props.task.title }}</h6>
               <div class="task-details">
                    <div class="task-info">
                         <span class="info-label">Aufwand:</span>
                         <span class="info-value">{{ props.task.effort }}</span>
                    </div>

                    <!-- Für wiederkehrende Tasks -->
                    <div v-if="props.task.recurrence_days > 0" class="task-info">
                         <span class="info-label">Wiederholung:</span>
                         <span class="info-value">alle {{ props.task.recurrence_days }} Tage</span>
                    </div>

                    <!-- Fälligkeitsdatum für dreckige, wiederkehrende Tasks -->
                    <div v-if="daysUntilDue !== null" class="task-info">
                         <span class="info-label">Fällig in:</span>
                         <span class="info-value">{{ daysUntilDue }} {{ daysUntilDue === 1 ? 'Tag' : 'Tagen' }}</span>
                    </div>

                    <!-- Für einmalige Tasks -->
                    <div v-if="props.task.recurrence_days === 0" class="task-badge">
                         Einmalige Aufgabe
                    </div>
               </div>
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
               <div v-if="!isEditing" class="d-flex gap-2 flex-wrap">
                    <button v-if="props.task.completed"
                            class="btn btn-warning btn-sm flex-fill"
                            @click="handleMarkDirty">
                         Dreckig
                    </button>
                    <button v-else
                            class="btn btn-success btn-sm flex-fill"
                            @click="handleCompleteTask">
                         Sauber
                    </button>
                    <button class="btn btn-secondary btn-sm"
                            @click="startEdit">
                         Bearbeiten
                    </button>
                    <button class="btn btn-danger btn-sm"
                            @click="handleDeleteTask">
                         Löschen
                    </button>
               </div>

               <!-- Edit Mode Buttons -->
               <div v-else class="d-flex gap-2">
                    <button type="submit"
                            class="btn btn-primary btn-sm flex-fill"
                            @click="saveEdit">
                         Speichern
                    </button>
                    <button type="button"
                            class="btn btn-secondary btn-sm flex-fill"
                            @click="cancelEdit">
                         Abbrechen
                    </button>
               </div>
          </div>
     </div>

</template>

<style scoped>
.task-card {
     border: 1px solid var(--color-border);
     border-radius: var(--radius-lg);
     background: var(--color-background-elevated);
     box-shadow: var(--shadow-md);
     transition: all var(--transition-base);
     overflow: hidden;
}

.task-card:hover {
     box-shadow: var(--shadow-lg);
     transform: translateY(-2px);
}

.task-title {
     font-size: 1.125rem;
     font-weight: 600;
     color: var(--color-text-primary);
     margin-bottom: var(--spacing-md);
}

.task-details {
     display: flex;
     flex-direction: column;
     gap: var(--spacing-xs);
}

.task-info {
     display: flex;
     align-items: center;
     font-size: 0.875rem;
}

.info-label {
     color: var(--color-text-secondary);
     margin-right: 0.5rem;
     font-weight: 500;
}

.info-value {
     color: var(--color-text-primary);
     font-weight: 500;
}

.task-badge {
     display: inline-block;
     background: var(--color-primary);
     color: white;
     padding: 0.25rem 0.75rem;
     border-radius: var(--radius-sm);
     font-size: 0.75rem;
     font-weight: 500;
     text-transform: uppercase;
     letter-spacing: 0.5px;
}

.card-footer {
     background: transparent;
     border-top: 1px solid var(--color-border);
     padding: var(--spacing-md);
}

.btn-sm {
     font-size: 0.8125rem;
     padding: 0.5rem 0.875rem;
}
</style>