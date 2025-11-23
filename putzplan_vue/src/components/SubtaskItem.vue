<script setup lang="ts">
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { ref, computed } from "vue";
import TaskCompletionModal from './TaskCompletionModal.vue'
import TaskAssignmentModal from './TaskAssignmentModal.vue'
import ProjectWorkModal from './ProjectWorkModal.vue'
import confetti from 'canvas-confetti'

interface Props {
  task: Task // Subtask (has parent_task_id)
}

const props = defineProps<Props>()
const taskStore = useTaskStore()
const householdStore = useHouseholdStore()
const isEditing = ref(false)
const showCompletionModal = ref(false)
const showAssignmentModal = ref(false)
const showProjectWorkModal = ref(false)

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

const handleDeleteTask = async () => {
  await taskStore.deleteTask(props.task.task_id)
}

const handleCompleteTask = async () => {
  const success = await taskStore.completeTask(props.task.task_id)
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

// Assignment Badge
const assignedMember = computed(() => {
  if (!props.task.assigned_to) return null
  return householdStore.householdMembers.find(m => m.user_id === props.task.assigned_to)
})

const assignedInitials = computed(() => {
  if (!assignedMember.value) return '?'
  return assignedMember.value.display_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
})

const openAssignmentModal = () => {
  showAssignmentModal.value = true
}

const closeAssignmentModal = () => {
  showAssignmentModal.value = false
}

const handleAssignmentConfirm = async (userId: string | null, permanent: boolean) => {
  await taskStore.assignTask(props.task.task_id, userId, permanent)
  showAssignmentModal.value = false
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

    <!-- Normal Display (2 Zeilen Layout) -->
    <div v-else class="subtask-wrapper">
      <!-- Zeile 1: Titel (+ Effort nur bei non-checklist) -->
      <div class="subtask-header">
        <span class="subtask-title">{{ task.title }}</span>
        <span v-if="task.subtask_points_mode !== 'checklist'" class="subtask-effort">{{ task.effort }}</span>
      </div>

      <!-- Zeile 2: Action Icons Row (wie bei TaskCard) -->
      <div class="subtask-actions-row">
        <!-- Assignment Badge Mini -->
        <div
          class="assignment-badge-mini"
          :class="{ 'has-assignment': task.assigned_to }"
          :style="assignedMember ? { backgroundColor: assignedMember.user_color, borderColor: assignedMember.user_color } : {}"
          @click="openAssignmentModal"
          :title="assignedMember ? assignedMember.display_name : 'Zuweisen'"
        >
          {{ assignedInitials }}
        </div>

        <button
          class="subtask-btn"
          @click="startEdit"
          title="Bearbeiten"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button
          class="subtask-btn subtask-btn-danger"
          @click="handleDeleteTask"
          title="Löschen"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>

      <!-- Zeile 3: Main Action Button (wie bei TaskCard) -->
      <div class="subtask-main-action">
        <!-- SPECIAL: "Am Projekt arbeiten" subtask always opens ProjectWorkModal -->
        <button
          v-if="isProjectWorkSubtask"
          class="btn btn-primary btn-sm w-100"
          @click="openProjectWorkModal"
          title="Arbeit dokumentieren"
        >
          ✏️ Arbeit dokumentieren
        </button>

        <!-- REGULAR SUBTASKS: Standard completion logic -->
        <template v-else-if="!task.completed">
          <div class="combined-button-group">
            <button
              class="btn btn-success btn-sm combined-main"
              @click="handleCompleteTask"
              title="Sauber"
            >
              ✓
            </button>
            <button
              v-if="task.subtask_points_mode !== 'checklist'"
              class="btn btn-success btn-sm combined-modifier"
              @click="openCompletionModal"
              title="Aufwand anpassen"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="17 11 12 6 7 11"></polyline>
                <polyline points="17 18 12 13 7 18"></polyline>
              </svg>
            </button>
          </div>
        </template>
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

    <!-- Task Assignment Modal -->
    <TaskAssignmentModal
      v-if="showAssignmentModal"
      :currentAssignedTo="task.assigned_to"
      :currentPermanent="task.assignment_permanent"
      :householdMembers="householdStore.householdMembers"
      @close="closeAssignmentModal"
      @confirm="handleAssignmentConfirm"
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
.subtask-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all var(--transition-base);
}

.subtask-item:hover {
  background: var(--color-background-muted);
  border-color: var(--color-primary);
}

.subtask-item.completed {
  opacity: 0.6;
}

.subtask-item.completed .subtask-title {
  text-decoration: line-through;
}

/* 3-Zeilen Wrapper (wie TaskCard) */
.subtask-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  width: 100%;
}

/* Zeile 1: Titel + Effort */
.subtask-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.subtask-title {
  flex: 1;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtask-effort {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: 600;
  background: var(--color-background-elevated);
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

/* Zeile 2: Action Icons Row (wie TaskCard footer-actions-row) */
.subtask-actions-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  justify-content: flex-start;
}

.subtask-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-base);
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.subtask-btn svg {
  width: 14px;
  height: 14px;
}

.subtask-btn:hover {
  background: var(--color-background-muted);
  color: var(--color-text-primary);
  border-color: var(--color-primary);
  transform: scale(1.05);
}

.subtask-btn-danger:hover {
  background: var(--bs-danger);
  color: white;
  border-color: var(--bs-danger);
}

/* Zeile 3: Main Action Button (wie TaskCard footer-main-action) */
.subtask-main-action {
  display: flex;
  width: 100%;
}

.btn {
  font-size: 0.75rem;
  padding: 0.375rem 0.625rem;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  font-weight: 500;
}

.btn-sm {
  font-size: 0.75rem;
  padding: 0.375rem 0.625rem;
}

.btn-primary {
  background: var(--bs-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--bs-primary-dark, #0b5ed7);
}

.btn-success {
  background: var(--bs-success);
  color: white;
}

.btn-success:hover {
  background: var(--bs-success-dark, #157347);
}

.w-100 {
  width: 100%;
}

/* Combined Button Group (wie TaskCard) */
.combined-button-group {
  display: flex;
  width: 100%;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.combined-main {
  flex: 1;
  border-radius: var(--radius-md) 0 0 var(--radius-md);
  border-right: none;
}

.combined-modifier {
  padding: 0.5rem 0.625rem;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  border-left: 2px solid rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.combined-modifier svg {
  display: block;
}

.combined-modifier:hover {
  background: var(--bs-success-dark, #157347);
}

.assignment-badge-mini {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
  flex-shrink: 0;
  border: 2px dashed var(--color-border);
  background: var(--color-background);
  color: var(--color-text-secondary);
}

.assignment-badge-mini.has-assignment {
  color: white;
  border-style: solid;
}

.assignment-badge-mini:hover {
  transform: scale(1.15);
  border-color: var(--color-primary);
}

/* Edit Mode */
.subtask-edit {
  display: flex;
  gap: var(--spacing-xs);
  flex: 1;
  align-items: center;
}

.subtask-edit .form-control {
  flex: 1;
  font-size: 0.875rem;
}

.subtask-edit .effort-input {
  width: 60px;
  flex: 0 0 60px;
}

/* Mobile (wie TaskCard) */
@media (max-width: 480px) {
  .subtask-item {
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
  }

  .subtask-actions-row {
    gap: 0.25rem;
  }

  .subtask-btn {
    padding: 0.25rem;
  }

  .subtask-btn svg {
    width: 12px;
    height: 12px;
  }

  .combined-button-group .btn {
    font-size: 0.65rem;
    padding: 0.3rem 0.4rem;
    white-space: nowrap;
  }

  .combined-modifier {
    padding: 0.3rem 0.35rem;
  }

  .combined-modifier svg {
    width: 12px;
    height: 12px;
  }

  .assignment-badge-mini {
    width: 20px;
    height: 20px;
    font-size: 0.6rem;
  }
}
</style>
