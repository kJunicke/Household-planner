<script setup lang="ts">
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { ref, computed } from "vue";
import TaskCompletionModal from './TaskCompletionModal.vue'
import TaskAssignmentModal from './TaskAssignmentModal.vue'
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
</script>

<template>
  <div class="subtask-item" :class="{ completed: task.completed }">
    <!-- Checkbox -->
    <input
      type="checkbox"
      :checked="task.completed"
      class="subtask-checkbox"
      @click.prevent="handleCompleteTask"
      :disabled="isEditing"
    />

    <!-- Edit Mode -->
    <div v-if="isEditing" class="subtask-edit">
      <input
        type="text"
        v-model="editForm.title"
        class="form-control form-control-sm"
        placeholder="Subtask Name"
      />
      <input
        type="number"
        v-model.number="editForm.effort"
        class="form-control form-control-sm effort-input"
        min="1"
        max="5"
      />
      <button class="btn btn-sm btn-primary" @click="saveEdit">✓</button>
      <button class="btn btn-sm btn-secondary" @click="cancelEdit">✕</button>
    </div>

    <!-- Normal Display -->
    <div v-else class="subtask-content">
      <span class="subtask-title">{{ task.title }}</span>
      <span class="subtask-effort">{{ task.effort }}</span>

      <!-- Action Buttons -->
      <div class="subtask-actions">
        <button
          class="subtask-btn subtask-btn-success"
          @click="handleCompleteTask"
          title="Sauber"
          v-if="!task.completed"
        >
          ✓
        </button>
        <button
          class="subtask-btn subtask-btn-success"
          @click="openCompletionModal"
          title="Mehr Aufwand"
          v-if="!task.completed"
        >
          ↑
        </button>
        <button
          class="subtask-btn"
          @click="startEdit"
          title="Bearbeiten"
        >
          ✏️
        </button>
        <button
          class="subtask-btn subtask-btn-danger"
          @click="handleDeleteTask"
          title="Löschen"
        >
          🗑️
        </button>
      </div>

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
    </div>

    <!-- Task Completion Modal -->
    <TaskCompletionModal
      v-if="showCompletionModal"
      :taskTitle="task.title"
      :defaultEffort="task.effort"
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
  </div>
</template>

<style scoped>
.subtask-item {
  display: flex;
  align-items: center;
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

.subtask-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.subtask-content {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
  min-width: 0;
}

.subtask-title {
  flex: 1;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2; /* Max 2 Zeilen */
  -webkit-box-orient: vertical;
  line-height: 1.4;
  word-break: break-word;
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

.subtask-actions {
  display: flex;
  gap: var(--spacing-xs);
  flex-shrink: 0;
}

.subtask-btn {
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all var(--transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.subtask-btn:hover {
  background: var(--color-background-muted);
  border-color: var(--color-primary);
  transform: scale(1.05);
}

.subtask-btn-success {
  background: var(--bs-success);
  color: white;
  border-color: var(--bs-success);
}

.subtask-btn-success:hover {
  background: var(--bs-success-dark, #157347);
  border-color: var(--bs-success-dark, #157347);
}

.subtask-btn-danger:hover {
  background: var(--bs-danger);
  color: white;
  border-color: var(--bs-danger);
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

/* Mobile */
@media (max-width: 480px) {
  .subtask-item {
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
  }

  .subtask-btn {
    padding: 0.2rem 0.4rem;
    font-size: 0.7rem;
  }

  .assignment-badge-mini {
    width: 20px;
    height: 20px;
    font-size: 0.6rem;
  }
}
</style>
