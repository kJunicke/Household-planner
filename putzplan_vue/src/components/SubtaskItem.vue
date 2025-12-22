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
            Dokumentieren
          </button>

          <!-- REGULAR SUBTASKS: Standard completion logic -->
          <template v-else-if="!task.completed">
            <button
              class="btn btn-success btn-sm subtask-action-btn"
              @click="handleCompleteTask"
              title="Sauber"
            >
              ✓
            </button>
            <button
              v-if="task.subtask_points_mode !== 'checklist'"
              class="btn btn-success btn-sm subtask-action-btn-modifier"
              @click="openCompletionModal"
              title="Aufwand anpassen"
            >
              <i class="bi bi-chevron-double-up"></i>
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
/* Horizontal Layout wie TaskCard, aber kompakter */
.subtask-item {
  display: flex;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
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
  padding: 0.5rem 0.75rem;
  gap: 0.75rem;
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
  background: var(--bs-primary);
  color: white;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Right: Edit + Action Buttons */
.subtask-right {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

.subtask-edit-btn {
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

.subtask-edit-btn i {
  font-size: 0.75rem;
}

.subtask-edit-btn:hover {
  background: var(--color-background-muted);
  color: var(--color-primary);
  border-color: var(--color-primary);
  transform: scale(1.05);
}

.subtask-action-btn-wrapper {
  display: flex;
  gap: 0.25rem;
}

.subtask-action-btn {
  font-size: 0.75rem;
  padding: 0.375rem 0.625rem;
  font-weight: 500;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.subtask-action-btn-modifier {
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.subtask-action-btn-modifier i {
  font-size: 0.75rem;
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

/* Edit Mode */
.subtask-edit {
  display: flex;
  gap: var(--spacing-xs);
  flex: 1;
  align-items: center;
  padding: 0.5rem 0.75rem;
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
  .subtask-wrapper {
    padding: 0.4rem 0.625rem;
    gap: 0.625rem;
  }

  .subtask-title {
    font-size: 0.8125rem;
  }

  .subtask-effort-badge {
    font-size: 0.5625rem;
    padding: 0.1rem 0.3rem;
  }

  .subtask-action-btn {
    font-size: 0.6875rem;
    padding: 0.3rem 0.5rem;
  }

  .subtask-action-btn-modifier {
    padding: 0.3rem 0.4rem;
  }

  .subtask-action-btn-modifier i {
    font-size: 0.6875rem;
  }

  .subtask-edit-btn {
    padding: 0.25rem;
  }

  .subtask-edit-btn i {
    font-size: 0.6875rem;
  }
}
</style>
