<script setup lang="ts">
import type { Task } from '@/types/Task'
import { ref, computed } from 'vue'

interface Props {
  task: Task
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm', updates: Partial<Task>): void
  (e: 'delete'): void
  (e: 'assign'): void
  (e: 'manage-subtasks'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const editForm = ref({
  title: props.task.title,
  effort: props.task.effort,
  task_type: props.task.task_type,
  recurrence_days: props.task.recurrence_days
})

const canConfirm = computed(() => {
  return editForm.value.title.trim().length > 0 && editForm.value.effort >= 1
})

const handleConfirm = () => {
  if (!canConfirm.value) return

  // Validierung: Wenn task_type !== 'recurring', setze recurrence_days = 0
  const updates = { ...editForm.value }
  if (updates.task_type !== 'recurring') {
    updates.recurrence_days = 0
  }

  emit('confirm', updates)
}

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click="handleClose">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">Aufgabe bearbeiten</h3>
          <button class="btn-close" @click="handleClose" aria-label="Schließen">×</button>
        </div>

        <div class="modal-body">
          <form @submit.prevent="handleConfirm">
            <div class="mb-3">
              <label for="title" class="form-label">Titel</label>
              <input
                type="text"
                class="form-control"
                id="title"
                v-model="editForm.title"
                required
              />
            </div>

            <div class="mb-3">
              <label for="task-type" class="form-label">Typ</label>
              <select
                class="form-select"
                id="task-type"
                v-model="editForm.task_type"
                required
              >
                <option value="recurring">Zeitbasiert</option>
                <option value="daily">Täglich</option>
                <option value="one-time">Einmalig</option>
              </select>
            </div>

            <div class="mb-3">
              <label for="effort" class="form-label">Aufwand</label>
              <input
                type="number"
                class="form-control"
                id="effort"
                v-model.number="editForm.effort"
                min="1"
                required
              />
            </div>

            <div v-if="editForm.task_type === 'recurring'" class="mb-3">
              <label for="recurrence" class="form-label">Wiederholung (Tage)</label>
              <input
                type="number"
                class="form-control"
                id="recurrence"
                v-model.number="editForm.recurrence_days"
                min="1"
                required
              />
            </div>
          </form>
        </div>

        <div class="modal-footer">
          <!-- Zusätzliche Actions links -->
          <div class="footer-actions-left">
            <button class="btn btn-outline-danger" @click="emit('delete')" title="Aufgabe löschen">
              🗑️ Löschen
            </button>
            <button class="btn btn-outline-secondary" @click="emit('assign')" title="Aufgabe zuweisen">
              👤 Zuweisen
            </button>
            <button
              v-if="!task.parent_task_id"
              class="btn btn-outline-primary"
              @click="emit('manage-subtasks')"
              title="Subtasks verwalten"
            >
              ⚙ Subtasks
            </button>
          </div>

          <!-- Primary Actions rechts -->
          <div class="footer-actions-right">
            <button class="btn btn-secondary" @click="handleClose">
              Abbrechen
            </button>
            <button
              class="btn btn-primary"
              :disabled="!canConfirm"
              @click="handleConfirm"
            >
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Component-specific styles only */
.mb-3 {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-control,
.form-select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: border-color var(--transition-base);
}

.form-control:focus,
.form-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.15);
}

/* Footer Layout */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.footer-actions-left {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.footer-actions-right {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

@media (max-width: 640px) {
  .footer-actions-left,
  .footer-actions-right {
    width: 100%;
    justify-content: stretch;
  }

  .footer-actions-left .btn,
  .footer-actions-right .btn {
    flex: 1;
  }
}
</style>
