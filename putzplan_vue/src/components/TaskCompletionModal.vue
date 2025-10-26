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

          <div class="effort-selection">
            <label class="selection-label">Tatsächlicher Aufwand:</label>
            <div class="effort-buttons">
              <button
                v-for="effort in effortOptions"
                :key="effort"
                class="effort-btn"
                :class="{
                  active: selectedEffort === effort,
                  default: effort === defaultEffort
                }"
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
/* Component-specific styles only */

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
  position: relative;
}

.effort-btn:hover {
  border-color: var(--color-primary);
}

.effort-btn.default {
  border-color: var(--color-primary);
  background: var(--color-background-elevated);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.effort-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
  box-shadow: none;
}

.effort-btn.active.default {
  background: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.25);
}

.reason-input {
  margin-bottom: 1rem;
}

/* Mobile optimizations */
@media (max-width: 576px) {
  .effort-buttons {
    gap: 0.375rem;
  }

  .effort-btn {
    padding: 0.625rem;
    font-size: 1rem;
  }
}
</style>
