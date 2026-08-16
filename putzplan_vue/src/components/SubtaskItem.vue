<script setup lang="ts">
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { ref, computed } from "vue";
import TaskCompletionModal from './TaskCompletionModal.vue'
import ProjectWorkModal from './ProjectWorkModal.vue'
import confetti from 'canvas-confetti'

interface Props {
  task: Task // Subtask (has parent_task_id)
}

const props = defineProps<Props>()
const taskStore = useTaskStore()
const isEditing = ref(false)
const showCompletionModal = ref(false)
const showProjectWorkModal = ref(false)
const isQuickCompleting = ref(false)

const editForm = ref({
  title: props.task.title,
  effort: props.task.effort
})

const startEdit = () => {
  editForm.value = {
    title: props.task.title,
    effort: props.task.effort
  }
  isEditing.value = true
}

const saveEdit = async () => {
  await taskStore.updateTask(props.task.task_id, {
    title: editForm.value.title,
    effort: editForm.value.effort
  })
  isEditing.value = false
}

const cancelEdit = () => {
  isEditing.value = false
}

const handleCompleteTask = async () => {
  isQuickCompleting.value = true
  const success = await taskStore.completeTask(props.task.task_id)
  isQuickCompleting.value = false
  if (success) {
    confetti({
      particleCount: 50,
      spread: 50,
      origin: { y: 0.7 }
    })
  }
}

const openCompletionModal = () => {
  showCompletionModal.value = true
}

const closeCompletionModal = () => {
  showCompletionModal.value = false
}

const handleCustomCompletion = async (effortOverride: number, reason: string) => {
  const success = await taskStore.completeTask(props.task.task_id, effortOverride, reason)
  showCompletionModal.value = false
  if (success) {
    confetti({
      particleCount: 50,
      spread: 50,
      origin: { y: 0.7 }
    })
  }
}


// Check if this is the "Am Projekt arbeiten" default subtask
const isProjectWorkSubtask = computed(() => props.task.title === 'Am Projekt arbeiten')

// Get parent task (project) info
const parentTask = computed(() => {
  if (!props.task.parent_task_id) return null
  return taskStore.tasks.find(t => t.task_id === props.task.parent_task_id)
})

const openProjectWorkModal = () => {
  showProjectWorkModal.value = true
}

const closeProjectWorkModal = () => {
  showProjectWorkModal.value = false
}

const handleProjectWork = async (effort: number, note: string) => {
  // Complete the subtask with custom effort and note
  const success = await taskStore.completeTask(props.task.task_id, effort, note)

  if (success) {
    // Immediately reset the subtask so it's always available
    await taskStore.markAsDirty(props.task.task_id)
    confetti({
      particleCount: 50,
      spread: 50,
      origin: { y: 0.7 }
    })
  }

  showProjectWorkModal.value = false
}
</script>

<template>
  <div class="subtask-item" :class="{ completed: task.completed }">
    <!-- Edit Mode -->
    <div v-if="isEditing" class="subtask-edit">
      <input
        type="text"
        v-model="editForm.title"
        class="form-control form-control-sm"
        placeholder="Subtask Name"
      />
      <input
        v-if="task.subtask_points_mode !== 'checklist'"
        type="number"
        v-model.number="editForm.effort"
        class="form-control form-control-sm effort-input"
        min="1"
        max="5"
      />
      <button class="btn btn-sm btn-primary" @click="saveEdit">✓</button>
      <button class="btn btn-sm btn-secondary" @click="cancelEdit">✕</button>
    </div>

    <!-- Normal Display (Horizontal Layout wie TaskCard) -->
    <div v-else class="subtask-wrapper">
      <!-- Left: Title + Effort Badge -->
      <div class="subtask-left">
        <span class="subtask-title">{{ task.title }}</span>
        <span v-if="task.subtask_points_mode !== 'checklist'" class="subtask-effort-badge">
          {{ task.effort }} Pkt
        </span>
      </div>

      <!-- Right: Edit + Action Buttons -->
      <div class="subtask-right">
        <button class="subtask-edit-btn" @click="startEdit" title="Bearbeiten">
          <i class="bi bi-pencil"></i>
        </button>

        <!-- Main Action Button (wie bei TaskCard) -->
        <div class="subtask-action-btn-wrapper">
          <!-- SPECIAL: "Am Projekt arbeiten" subtask always opens ProjectWorkModal -->
          <button
            v-if="isProjectWorkSubtask"
            class="btn btn-primary btn-sm subtask-action-btn"
            @click="openProjectWorkModal"
            title="Arbeit dokumentieren"
          >
            <i class="bi bi-pencil-square"></i>
          </button>

          <!-- REGULAR SUBTASKS: Standard completion logic -->
          <template v-else-if="!task.completed">
            <button
              class="btn btn-success btn-sm subtask-action-btn"
              @click="handleCompleteTask"
              :disabled="isQuickCompleting"
              title="Sauber markieren"
            >
              <i v-if="isQuickCompleting" class="bi bi-arrow-repeat spinning"></i>
              <i v-else class="bi bi-check-lg"></i>
            </button>
            <button
              v-if="task.subtask_points_mode !== 'checklist'"
              class="subtask-action-btn-modifier"
              @click="openCompletionModal"
              title="Aufwand anpassen"
            >
              <i class="bi bi-sliders"></i>
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Task Completion Modal -->
    <TaskCompletionModal
      v-if="showCompletionModal"
      :taskTitle="task.title"
      :defaultEffort="task.effort"
      :isLoading="false"
      @close="closeCompletionModal"
      @confirm="handleCustomCompletion"
    />

    <!-- Project Work Modal -->
    <ProjectWorkModal
      v-if="showProjectWorkModal"
      :projectTitle="parentTask?.title || 'Projekt'"
      :isLoading="false"
      @close="closeProjectWorkModal"
      @confirm="handleProjectWork"
    />
  </div>
</template>

<style scoped>
/* Verdichtete Zeile (Etappe 2, Nachtrag): dieselbe Dichte wie die Aufgabenkarte
   und die Einkaufszeile — 40px Mindesthöhe, Innenabstand rechts 4px / links 10px.
   Die Unterordnung zeigt allein die Einrückung der Sektion, nicht eine kleinere
   Zeile. */
.subtask-item {
  display: flex;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
  overflow: hidden;
}

.subtask-item:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.subtask-item.completed {
  opacity: 0.6;
}

.subtask-item.completed .subtask-title {
  text-decoration: line-through;
}

/* Horizontal Wrapper */
.subtask-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 4px 0 10px;
  gap: 8px;
  min-height: 40px;
}

/* Left: Title + Effort Badge */
.subtask-left {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  min-width: 0;
}

.subtask-title {
  font-size: 0.875rem;
  color: var(--color-text-primary);
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
}

.subtask-effort-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
  font-size: 0.625rem;
  font-weight: 600;
  /* Projekt-Token statt --bs-primary: weiß darauf liegt bei 6,1:1 statt exakt
     4,5:1 — dieselbe Wahl wie beim Effort-Badge der Aufgabenkarte. */
  background: var(--color-primary);
  color: white;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Right: Edit + Action Buttons.
   Sichtbar bleiben die Knöpfe schlank; die Trefferfläche wächst per
   Pseudo-Element nach außen, damit die Zeile bei 40px bleibt.

   Die Abstände sind Bedingung, keine Optik — jeder Knopf zieht seine Fläche
   seitlich auf: ✎ +5px, Abschließen +1px, Regler +4px. Daraus folgt die
   Restluft zwischen zwei erweiterten Flächen:
     ✎ → Aktionsgruppe: 10px − 5 − 1 = 4px
     Abschließen → Regler: 10px − 1 − 4 = 5px
   Bei kleineren Abständen überlappen sich die Flächen und der im DOM spätere
   Knopf schluckt stillschweigend die Kante seines Nachbarn. Wer hier an Gap
   oder Inset dreht, rechnet diese beiden Zeilen neu nach. */
.subtask-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.subtask-edit-btn {
  position: relative;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  padding: 0;
  width: 30px;
  height: 38px;
  min-width: 30px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-base);
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.subtask-edit-btn::after {
  content: '';
  position: absolute;
  inset: -1px -5px;
}

.subtask-edit-btn i {
  font-size: var(--font-lg);
}

.subtask-edit-btn:hover {
  color: var(--color-primary);
}

.subtask-action-btn-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.subtask-action-btn {
  position: relative;
  width: 38px;
  height: 38px;
  min-width: 38px;
  min-height: 38px;
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.subtask-action-btn::after {
  content: '';
  position: absolute;
  inset: -1px;
}

.subtask-action-btn i {
  font-size: var(--font-lg);
}

/* Secondary action: subordinate to the primary green complete button. */
.subtask-action-btn-modifier {
  position: relative;
  width: 34px;
  height: 38px;
  min-width: 34px;
  min-height: 38px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background-elevated);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.subtask-action-btn-modifier::after {
  content: '';
  position: absolute;
  inset: -2px -4px;
}

.subtask-action-btn-modifier:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-background);
}

.subtask-action-btn-modifier i {
  font-size: var(--font-md);
}

.btn-primary {
  background: var(--bs-primary);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-success {
  background: var(--bs-success);
  color: white;
}

.btn-success:hover {
  opacity: 0.9;
}

/* Loading state */
.subtask-action-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Edit Mode */
.subtask-edit {
  display: flex;
  gap: var(--spacing-xs);
  flex: 1;
  align-items: center;
  padding: 4px 4px 4px 10px;
}

.subtask-edit .form-control {
  flex: 1;
  font-size: 0.875rem;
}

.subtask-edit .effort-input {
  width: 60px;
  flex: 0 0 60px;
}

.subtask-edit .btn {
  font-size: 0.75rem;
  padding: 0.375rem 0.625rem;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  font-weight: 500;
}

.btn-secondary {
  background: var(--bs-secondary);
  color: white;
}

/* Mobile Responsive */
@media (max-width: 640px) {
  .subtask-title {
    font-size: 0.8125rem;
  }

  .subtask-effort-badge {
    font-size: 0.5625rem;
    padding: 0.1rem 0.3rem;
  }

  .subtask-edit-btn i {
    font-size: 0.6875rem;
  }
}
</style>
