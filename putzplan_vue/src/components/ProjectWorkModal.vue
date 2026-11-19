<script setup lang="ts">
import { ref, computed } from 'vue'
import { COMPLETION_NOTE_MAX_LENGTH } from '@/lib/limits'
import PointPicker from './PointPicker.vue'

interface Props {
  projectTitle: string
  /**
   * Standardpunkte der Projekt-Arbeit (der Unteraufgabe „Am Projekt arbeiten“).
   * Gesetzt: vorausgewählt und als Knopf markiert. `null` = unbewertet — dann
   * wird die Wahl dieser ersten Arbeit zu den Standardpunkten (der Aufrufer
   * schickt sie als `standardPoints` mit).
   */
  standardPoints: number | null
  isLoading: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm', effort: number, note: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const selectedEffort = ref<number | null>(props.standardPoints)
const note = ref('')

const canConfirm = computed(() => {
  return selectedEffort.value !== null && note.value.trim().length > 0
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
          <h3 class="modal-title">Am Projekt arbeiten</h3>
          <button class="btn-close" @click="handleClose" aria-label="Schließen"></button>
        </div>

        <div class="modal-body">
          <p class="project-name">{{ projectTitle }}</p>

          <div class="effort-selection">
            <label class="selection-label">Wie viele Punkte war es? *</label>
            <!-- `standard`: Projekt-Arbeit zählt mindestens 1 Punkt, wie vorher. -->
            <PointPicker
              v-model="selectedEffort"
              kind="standard"
              :default-points="standardPoints"
              :disabled="isLoading"
            />
            <p v-if="standardPoints === null" class="rating-hint">
              Noch unbewertet. Der Wert gilt ab jetzt als Vorauswahl für dieses Projekt.
            </p>
          </div>

          <div class="note-input">
            <label for="note" class="form-label"> Was hast du gemacht? * </label>
            <textarea
              id="note"
              v-model="note"
              :maxlength="COMPLETION_NOTE_MAX_LENGTH"
              class="form-control"
              rows="4"
              placeholder="z.B. Wände gestrichen, Möbel aufgebaut, Recherche zu neuen Features..."
              required
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

.project-name {
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

.rating-hint {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}
</style>
