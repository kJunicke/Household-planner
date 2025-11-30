<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTaskStore } from '../stores/taskStore'
import { useHouseholdStore } from '../stores/householdStore'
import type { Task } from '@/types/Task'

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()

interface CompletionWithDetails {
  completion_id: string
  completed_at: string
  effort_override: number | null
  override_reason: string | null
  task_id: string // Für Subtask-Lookup
  tasks: {
    title: string
  }
  household_members: {
    display_name: string
    user_color: string
  }
}

const showDeleteModal = ref(false)
const completionToDelete = ref<CompletionWithDetails | null>(null)
const showDeleteAllModal = ref(false)
const showOptionsDropdown = ref(false)

// Reactive completions from store (updated via Realtime)
const completions = computed(() => {
  // Enriche mit display_name und user_color via Frontend-Matching
  return taskStore.completions.map(completion => {
    const member = householdStore.householdMembers.find(m => m.user_id === completion.user_id)
    return {
      ...completion,
      household_members: {
        display_name: member?.display_name || 'Unbekannt',
        user_color: member?.user_color || '#6c757d'
      },
      tasks: {
        title: taskStore.tasks.find(t => t.task_id === completion.task_id)?.title || 'Unbekannte Aufgabe'
      }
    }
  }).sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
})

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const openDeleteModal = (completion: CompletionWithDetails) => {
  completionToDelete.value = completion
  showDeleteModal.value = true
}

const closeDeleteModal = () => {
  showDeleteModal.value = false
  completionToDelete.value = null
}

const confirmDelete = async () => {
  if (!completionToDelete.value) return

  await taskStore.deleteCompletion(completionToDelete.value.completion_id)
  closeDeleteModal()
}

const openDeleteAllModal = () => {
  showDeleteAllModal.value = true
}

const closeDeleteAllModal = () => {
  showDeleteAllModal.value = false
}

const confirmDeleteAll = async () => {
  await taskStore.deleteAllCompletions()
  closeDeleteAllModal()
}

// Helper: Check if task is a subtask and get parent task info
const getTaskInfo = (completion: CompletionWithDetails) => {
  const task = taskStore.tasks.find((t: Task) => t.task_id === completion.task_id)
  const isSubtask = task?.parent_task_id !== null

  if (isSubtask && task) {
    const parentTask = taskStore.tasks.find((t: Task) => t.task_id === task.parent_task_id)
    return {
      isSubtask: true,
      parentTaskTitle: parentTask?.title || 'Unbekannt'
    }
  }

  return {
    isSubtask: false,
    parentTaskTitle: null
  }
}

// Helper: Calculate points for completion
const getCompletionPoints = (completion: CompletionWithDetails): number => {
  // If effort_override is set, use that
  if (completion.effort_override !== null) {
    return completion.effort_override
  }

  // Otherwise, use task's effort
  const task = taskStore.tasks.find((t: Task) => t.task_id === completion.task_id)
  return task?.effort || 0
}

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('.dropdown')) {
    showOptionsDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <main class="page-container">
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2 class="page-title">Verlauf</h2>
        <div class="dropdown">
          <button
            class="btn btn-sm btn-outline-secondary dropdown-toggle"
            type="button"
            @click="showOptionsDropdown = !showOptionsDropdown"
            :disabled="completions.length === 0"
          >
            <i class="bi bi-three-dots-vertical"></i> Optionen
          </button>
          <ul class="dropdown-menu" :class="{ show: showOptionsDropdown }">
            <li>
              <button class="dropdown-item text-danger" @click="openDeleteAllModal(); showOptionsDropdown = false">
                <i class="bi bi-trash"></i> Alle löschen
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div v-if="completions.length === 0" class="empty-state">
        <i class="bi bi-clock-history"></i>
        <p>Noch keine erledigten Tasks</p>
      </div>

      <div v-else class="completions-list">
        <div
          v-for="completion in completions"
          :key="completion.completion_id"
          class="completion-item"
          :style="{
            '--user-color': completion.household_members.user_color,
            'background': `linear-gradient(to right, ${completion.household_members.user_color}15 0%, var(--color-background-elevated) 100%)`
          }"
        >
          <div class="completion-details">
            <div class="task-title">
              {{ completion.tasks?.title || 'Unbekannte Aufgabe' }}
              <!-- Subtask Badge -->
              <span v-if="getTaskInfo(completion).isSubtask" class="subtask-badge">
                Subtask von: {{ getTaskInfo(completion).parentTaskTitle }}
              </span>
            </div>
            <div class="completion-meta">
              <span class="member-name">
                <i class="bi bi-person-fill"></i>
                {{ completion.household_members?.display_name || 'Unbekannt' }}
              </span>
              <span class="completion-date">
                <i class="bi bi-clock"></i>
                {{ formatDate(completion.completed_at) }}
              </span>
              <span class="completion-points">
                <i class="bi bi-star-fill"></i>
                {{ getCompletionPoints(completion) }} Pkt
              </span>
            </div>
            <div v-if="completion.effort_override !== null" class="effort-override-note">
              <div class="override-badge">
                <i class="bi bi-exclamation-circle"></i>
                Aufwand: {{ completion.effort_override }}
              </div>
              <div class="override-reason">
                {{ completion.override_reason }}
              </div>
            </div>
          </div>
          <div class="completion-actions">
            <button
              @click="openDeleteModal(completion)"
              class="btn btn-sm btn-outline-danger"
              title="Eintrag löschen"
            >
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Single Entry Modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3 class="modal-title">Eintrag löschen</h3>
            <button @click="closeDeleteModal" class="btn-close" aria-label="Schließen">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="modal-body">
            <p>
              Möchtest du diesen Eintrag wirklich löschen?
            </p>
            <p class="text-muted mb-0">
              <strong>{{ completionToDelete?.tasks?.title }}</strong> von
              <strong>{{ completionToDelete?.household_members?.display_name }}</strong>
            </p>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              Abbrechen
            </button>
            <button @click="confirmDelete" class="btn btn-danger">
              <i class="bi bi-trash"></i> Löschen
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete All Modal -->
    <Teleport to="body">
      <div v-if="showDeleteAllModal" class="modal-overlay" @click="closeDeleteAllModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3 class="modal-title">Gesamten Verlauf löschen</h3>
            <button @click="closeDeleteAllModal" class="btn-close" aria-label="Schließen">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="modal-body">
            <p class="text-danger fw-bold">
              <i class="bi bi-exclamation-triangle-fill"></i>
              Achtung: Diese Aktion kann nicht rückgängig gemacht werden!
            </p>
            <p>
              Möchtest du wirklich den gesamten Verlauf für diesen Haushalt löschen?
            </p>
            <p class="text-muted mb-0">
              Es werden {{ completions.length }} Einträge gelöscht.
            </p>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteAllModal" class="btn btn-secondary">
              Abbrechen
            </button>
            <button @click="confirmDeleteAll" class="btn btn-danger">
              <i class="bi bi-trash"></i> Alle löschen
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
/* Component-specific styles only */

.completions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.completion-item {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--color-background-elevated);
  border-left: 3px solid var(--user-color, var(--color-border));
  border-top: 1px solid var(--color-border);
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
}

.completion-item:hover {
  border-left-color: var(--user-color, var(--color-primary));
  box-shadow: var(--shadow-sm);
}

.completion-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.task-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.subtask-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--bs-info);
  background: var(--bs-info-bg, #cfe2ff);
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--bs-info);
}

.completion-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.member-name,
.completion-date,
.completion-points {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.member-name i,
.completion-date i,
.completion-points i {
  font-size: 0.75rem;
}

.completion-points {
  color: var(--bs-warning);
  font-weight: 600;
}

.completion-points i {
  color: var(--bs-warning);
}

/* Mobile optimization */
@media (max-width: 576px) {
  .completion-meta {
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .completion-points {
    flex-basis: 100%;
    margin-top: 0.25rem;
  }
}

.completion-actions {
  display: flex;
  align-items: center;
}

.effort-override-note {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: var(--color-warning-light, #fff3cd);
  border-left: 3px solid var(--color-warning, #ffc107);
  border-radius: var(--radius-sm);
}

.override-badge {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-warning-dark, #856404);
  margin-bottom: 0.375rem;
}

.override-badge i {
  font-size: 1rem;
}

.override-reason {
  font-size: 0.875rem;
  color: var(--color-text-primary);
  line-height: 1.4;
}

.dropdown {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 0.25rem;
  z-index: 1000;
}
</style>
