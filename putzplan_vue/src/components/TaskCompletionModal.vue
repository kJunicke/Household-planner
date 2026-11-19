<script setup lang="ts">
import { ref, computed } from 'vue'
import { COMPLETION_NOTE_MAX_LENGTH } from '@/lib/limits'
import PointPicker from './PointPicker.vue'

interface Props {
  taskTitle: string
  defaultEffort: number
  isLoading: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm', effortOverride: number, note: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const selectedEffort = ref<number | null>(null)
const note = ref('')

const canConfirm = computed(() => {
  // Effort selection is required, note is optional
  return selectedEffort.value !== null
})

const handleConfirm = () => {
  if (canConfirm.value && selectedEffort.value !== null && !props.isLoading) {
    emit('confirm', selectedEffort.value, note.value.trim())
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
          <h3 class="modal-title">Punkte anpassen</h3>
          <button class="btn-close" @click="handleClose" aria-label="Schließen"></button>
        </div>

        <div class="modal-body">
          <p class="task-name">{{ taskTitle }}</p>

          <div class="effort-selection">
            <label class="selection-label">Punkte dieses Mal:</label>
            <PointPicker
              v-model="selectedEffort"
              kind="completion"
              :default-points="defaultEffort"
              :disabled="isLoading"
            />
          </div>

          <div class="note-input">
            <label for="note" class="form-label"> Notiz (optional) </label>
            <textarea
              id="note"
              v-model="note"
              :maxlength="COMPLETION_NOTE_MAX_LENGTH"
              class="form-control"
              rows="3"
              placeholder="z.B. War sehr dreckig, Pfannen eingebrannt und Kühlschrank noch ausgewischt"
            ></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" :disabled="isLoading" @click="handleClose">
            Abbrechen
          </button>
          <button
            class="btn btn-primary"
            :disabled="!canConfirm || isLoading"
            @click="handleConfirm"
          >
            <span v-if="isLoading" class="spinner-border spinner-border-sm me-1"></span>
            {{ isLoading ? 'Speichert...' : 'Bestätigen' }}
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

.note-input {
  margin-bottom: 1rem;
}
</style>
