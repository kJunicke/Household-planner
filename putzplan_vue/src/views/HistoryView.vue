<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useTaskStore } from '../stores/taskStore'

const taskStore = useTaskStore()

interface CompletionWithDetails {
  completion_id: string
  completed_at: string
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

onMounted(() => {
  loadCompletions()
})
</script>

<template>
  <main class="history-view">
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2 class="page-title">Verlauf</h2>
        <button @click="loadCompletions" class="btn btn-sm btn-outline-primary">
          <i class="bi bi-arrow-clockwise"></i> Aktualisieren
        </button>
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

    <!-- Delete Confirmation Modal -->
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
  </main>
</template>

<style scoped>
.history-view {
  padding-bottom: var(--spacing-xl);
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--color-text-secondary);
}

.empty-state i {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.3;
}

.empty-state p {
  font-size: 1.125rem;
  margin: 0;
}

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

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.25rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
}

.btn-close:hover {
  color: var(--color-text-primary);
}

.modal-body {
  padding: 1.25rem;
}

.modal-body p {
  margin-bottom: 0.75rem;
  color: var(--color-text-primary);
}

.modal-footer {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--color-border);
}

/* Mobile: Stack buttons vertically */
@media (max-width: 767px) {
  .modal-footer {
    flex-direction: column-reverse;
  }

  .modal-footer button {
    width: 100%;
  }
}
</style>
