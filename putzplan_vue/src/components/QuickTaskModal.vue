<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface Props {
  initialTitle?: string
  isLoading: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'complete', data: {
    title: string
    effort: 1 | 2 | 3 | 4 | 5
    note?: string
  }): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const formData = ref({
  title: props.initialTitle || '',
  effort: 1 as 1 | 2 | 3 | 4 | 5,
  note: ''
})

watch(() => props.initialTitle, (newVal) => {
  if (newVal) {
    formData.value.title = newVal
  }
}, { immediate: true })

const canConfirm = computed(() => formData.value.title.trim().length > 0)

const handleConfirm = () => {
  if (!canConfirm.value || props.isLoading) return

  emit('complete', {
    title: formData.value.title.trim(),
    effort: formData.value.effort,
    note: formData.value.note.trim() || undefined
  })
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
          <h3 class="modal-title">
            <i class="bi bi-lightning-charge-fill"></i> Quick-Aufgabe
          </h3>
          <button class="btn-close" @click="handleClose" aria-label="Schließen">×</button>
        </div>

        <div class="modal-body">
          <p class="quick-hint">
            <i class="bi bi-info-circle"></i>
            Wird sofort als erledigt gespeichert und erscheint nur in der Historie.
          </p>
          <form @submit.prevent="handleConfirm">
            <div class="mb-3">
              <label class="form-label">Titel</label>
              <input
                type="text"
                v-model="formData.title"
                placeholder="z.B. Müll rausgebracht"
                class="form-control"
                :disabled="isLoading"
              />
            </div>

            <div class="mb-3">
              <label class="form-label">Punkte (1-5)</label>
              <select
                v-model="formData.effort"
                class="form-select"
                :disabled="isLoading"
              >
                <option :value="1">1 - Sehr leicht</option>
                <option :value="2">2 - Leicht</option>
                <option :value="3">3 - Normal</option>
                <option :value="4">4 - Schwer</option>
                <option :value="5">5 - Sehr schwer</option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label">Notiz (optional)</label>
              <textarea
                v-model="formData.note"
                placeholder="z.B. Details zur Aufgabe"
                class="form-control"
                rows="2"
                :disabled="isLoading"
              ></textarea>
            </div>
          </form>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" :disabled="isLoading" @click="handleClose">
            Abbrechen
          </button>
          <button
            class="btn btn-success"
            :disabled="!canConfirm || isLoading"
            @click="handleConfirm"
          >
            <span v-if="!isLoading"><i class="bi bi-check-lg"></i> Abschließen</span>
            <span v-else>
              <span class="spinner-border spinner-border-sm me-2"></span>
              Speichert...
            </span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mb-3 {
  margin-bottom: 1rem;
}

.quick-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 0.85rem;
  margin-bottom: 1rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.85rem;
}

.quick-hint i {
  flex-shrink: 0;
  margin-top: 0.1rem;
  color: var(--color-warning);
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

.spinner-border {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  vertical-align: -0.125em;
  border: 0.15em solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spinner-border 0.75s linear infinite;
}

.spinner-border-sm {
  width: 0.875rem;
  height: 0.875rem;
  border-width: 0.125em;
}

.me-2 {
  margin-right: 0.5rem;
}

@keyframes spinner-border {
  to {
    transform: rotate(360deg);
  }
}
</style>
