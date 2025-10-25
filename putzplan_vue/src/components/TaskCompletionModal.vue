<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  taskTitle: string
  defaultEffort: number
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm', effortOverride: number, reason: string): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const selectedEffort = ref<number | null>(null)
const reason = ref('')

const effortOptions = [1, 2, 3, 4, 5]

const canConfirm = computed(() => {
  return selectedEffort.value !== null && reason.value.trim().length > 0
})

const handleConfirm = () => {
  if (canConfirm.value && selectedEffort.value !== null) {
    emit('confirm', selectedEffort.value, reason.value.trim())
  }
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
          <h5 class="modal-title">Aufwand anpassen</h5>
          <button class="btn-close" @click="handleClose" aria-label="Schließen">×</button>
        </div>

        <div class="modal-body">
          <p class="task-name">{{ taskTitle }}</p>
          <p class="default-effort">Standard-Aufwand: {{ defaultEffort }}</p>

          <div class="effort-selection">
            <label class="selection-label">Tatsächlicher Aufwand:</label>
            <div class="effort-buttons">
              <button
                v-for="effort in effortOptions"
                :key="effort"
                class="effort-btn"
                :class="{ active: selectedEffort === effort }"
                @click="selectedEffort = effort"
              >
                {{ effort }}
              </button>
            </div>
          </div>

          <div class="reason-input">
            <label for="reason" class="form-label">
              Warum war der Aufwand anders? *
            </label>
            <textarea
              id="reason"
              v-model="reason"
              class="form-control"
              rows="3"
              placeholder="z.B. War sehr dreckig, Pfannen eingebrannt und Kühlschrank noch ausgewischt"
              required
            ></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="handleClose">
            Abbrechen
          </button>
          <button
            class="btn btn-primary"
            :disabled="!canConfirm"
            @click="handleConfirm"
          >
            Bestätigen
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
  padding: 1rem;
}

.modal-content {
  background: var(--color-background-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s;
}

.btn-close:hover {
  color: var(--color-text-primary);
}

.modal-body {
  padding: 1.25rem;
}

.task-name {
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.default-effort {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: 1.5rem;
}

.effort-selection {
  margin-bottom: 1.5rem;
}

.selection-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 0.75rem;
}

.effort-buttons {
  display: flex;
  gap: 0.5rem;
}

.effort-btn {
  flex: 1;
  padding: 0.75rem;
  border: 2px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text-primary);
  border-radius: var(--radius-md);
  font-size: 1.125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.effort-btn:hover {
  border-color: var(--color-primary);
}

.effort-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.reason-input {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.form-control {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  color: var(--color-text-primary);
  background: var(--color-background);
  transition: border-color 0.15s;
  resize: vertical;
}

.form-control:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-control::placeholder {
  color: var(--color-text-tertiary);
}

.modal-footer {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--color-border);
}

.btn {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary {
  background: var(--color-background);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-border);
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Mobile optimizations */
@media (max-width: 576px) {
  .modal-backdrop {
    padding: 0;
  }

  .modal-content {
    max-width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }

  .effort-buttons {
    gap: 0.375rem;
  }

  .effort-btn {
    padding: 0.625rem;
    font-size: 1rem;
  }
}
</style>
