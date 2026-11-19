<script setup lang="ts">
import { ref, computed } from 'vue'
import { COMPLETION_NOTE_MAX_LENGTH } from '@/lib/limits'
import { isDeviation } from '@/lib/taskPoints'
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

// Andere Punkte als die Standardpunkte: die Notiz wird zur Pflicht-Begründung
// (CONTEXT.md § Abweichung). Beide Felder schreiben in dieselbe `note`, damit
// schon Getipptes beim Wechsel der Punkte stehen bleibt.
const needsReason = computed(() =>
  isDeviation({
    standardPoints: props.defaultEffort,
    chosenPoints: selectedEffort.value,
    kind: 'task',
  }),
)

const canConfirm = computed(
  () => selectedEffort.value !== null && (!needsReason.value || note.value.trim().length > 0),
)

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
              v-model:reason="note"
              :default-points="defaultEffort"
              :disabled="isLoading"
              :show-reason="needsReason"
              :reason-label="`Warum diesmal nicht ${defaultEffort}? *`"
              reason-placeholder="z.B. War sehr dreckig, Pfannen eingebrannt"
            />
            <p v-if="needsReason" class="reason-hint">
              Die Standardpunkte der Aufgabe bleiben {{ defaultEffort }}.
            </p>
          </div>

          <div v-if="!needsReason" class="note-input">
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

.reason-hint {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}
</style>
