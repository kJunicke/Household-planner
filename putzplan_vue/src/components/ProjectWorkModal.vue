<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  projectTitle: string
  isLoading: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm', effort: number, note: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const selectedEffort = ref<number | null>(null)
const note = ref('')

const effortOptions = [1, 2, 3, 4, 5]

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
          <button class="btn-close" @click="handleClose" aria-label="Schließen">×</button>
        </div>

        <div class="modal-body">
          <p class="project-name">{{ projectTitle }}</p>

          <div class="effort-selection">
            <label class="selection-label">Wie viel Aufwand war es? *</label>
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

          <div class="note-input">
            <label for="note" class="form-label">
              Was hast du gemacht? *
            </label>
            <textarea
              id="note"
              v-model="note"
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

.note-input {
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
