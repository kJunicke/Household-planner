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
        </div>
      </div>
    </div>
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
</style>
