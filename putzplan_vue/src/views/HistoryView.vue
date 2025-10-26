<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useTaskStore } from '../stores/taskStore'

const taskStore = useTaskStore()

interface CompletionWithDetails {
  completion_id: string
  completed_at: string
  effort_override: number | null
  override_reason: string | null
  tasks: {
    title: string
  }
  household_members: {
    display_name: string
  }
}

const completions = ref<CompletionWithDetails[]>([])
const isLoading = ref(true)
const showDeleteModal = ref(false)
const completionToDelete = ref<CompletionWithDetails | null>(null)
const showDeleteAllModal = ref(false)

const loadCompletions = async () => {
  isLoading.value = true
  completions.value = await taskStore.fetchCompletions() as CompletionWithDetails[]
  isLoading.value = false
}

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

  const success = await taskStore.deleteCompletion(completionToDelete.value.completion_id)

  if (success) {
    await loadCompletions()
  }

  closeDeleteModal()
}

const openDeleteAllModal = () => {
  showDeleteAllModal.value = true
}

const closeDeleteAllModal = () => {
  showDeleteAllModal.value = false
}

const confirmDeleteAll = async () => {
  const success = await taskStore.deleteAllCompletions()

  if (success) {
    await loadCompletions()
  }

  closeDeleteAllModal()
}

onMounted(() => {
  loadCompletions()
})
</script>

<template>
  <main class="page-container">
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2 class="page-title">Verlauf</h2>
        <div class="d-flex gap-2">
          <button @click="loadCompletions" class="btn btn-sm btn-outline-primary">
            <i class="bi bi-arrow-clockwise"></i> Aktualisieren
          </button>
          <button
            @click="openDeleteAllModal"
            class="btn btn-sm btn-outline-danger"
            :disabled="completions.length === 0"
          >
            <i class="bi bi-trash"></i> Alle löschen
          </button>
        </div>
      </div>

      <div v-if="isLoading" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Lädt...</span>
        </div>
      </div>

      <div v-else-if="completions.length === 0" class="empty-state">
        <i class="bi bi-clock-history"></i>
        <p>Noch keine erledigten Tasks</p>
      </div>

      <div v-else class="completions-list">
        <div
          v-for="completion in completions"
          :key="completion.completion_id"
          class="completion-item"
        >
          <div class="completion-icon">
            <i class="bi bi-check-circle-fill text-success"></i>
          </div>
          <div class="completion-details">
            <div class="task-title">{{ completion.tasks?.title || 'Unbekannte Aufgabe' }}</div>
            <div class="completion-meta">
              <span class="member-name">
                <i class="bi bi-person-fill"></i>
                {{ completion.household_members?.display_name || 'Unbekannt' }}
              </span>
              <span class="completion-date">
                <i class="bi bi-clock"></i>
                {{ formatDate(completion.completed_at) }}
              </span>
            </div>
            <div v-if="completion.effort_override" class="effort-override-note">
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
            <h5 class="modal-title">Eintrag löschen</h5>
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
            <h5 class="modal-title">Gesamten Verlauf löschen</h5>
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
  gap: 0.75rem;
}

.completion-item {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
}

.completion-item:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.completion-icon {
  display: flex;
  align-items: center;
  font-size: 1.5rem;
}

.completion-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.task-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.completion-meta {
  display: flex;
  gap: 1.5rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.member-name,
.completion-date {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.member-name i,
.completion-date i {
  font-size: 0.875rem;
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
</style>
