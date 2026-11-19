<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { TASK_TITLE_MAX_LENGTH } from '@/lib/limits'
import { findDuplicateTask } from '@/lib/taskDuplicates'
import { useTaskStore } from '@/stores/taskStore'
import PointPicker from './PointPicker.vue'

interface Props {
  initialTitle?: string
  isLoading: boolean
}

interface Emits {
  (e: 'close'): void
  (
    e: 'create',
    taskData: {
      title: string
      effort: number
      recurrence_days: number
      task_type: 'recurring' | 'daily' | 'one-time' | 'project'
    },
  ): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Der Suchbegriff wird als Titel übernommen; `maxlength` kürzt nur Getipptes,
// nicht einen vorbelegten Wert — deshalb hier auf die Titel-Grenze kürzen.
const titleFromSearch = (query: string | undefined): string =>
  (query ?? '').slice(0, TASK_TITLE_MAX_LENGTH)

const formData = ref({
  title: titleFromSearch(props.initialTitle),
  // Keine Vorbelegung: neue Aufgaben werden bewusst bewertet, nie mit einem Zufallswert.
  effort: null as number | null,
  recurrence_days: 0,
  task_type: 'recurring' as 'recurring' | 'daily' | 'one-time' | 'project',
})

// Watch for initialTitle changes (when modal opens with search query)
watch(
  () => props.initialTitle,
  (newVal) => {
    if (newVal) {
      formData.value.title = titleFromSearch(newVal)
    }
  },
  { immediate: true },
)

const taskStore = useTaskStore()
// Geprüft wird der getrimmte Titel — genau der wird gesendet (→ `normalizeTaskTitle`).
const duplicate = computed(() => findDuplicateTask(taskStore.tasks, formData.value.title.trim()))

const canConfirm = computed(() => {
  return (
    formData.value.title.trim().length > 0 && formData.value.effort !== null && !duplicate.value
  )
})

const handleConfirm = () => {
  if (!canConfirm.value || props.isLoading || formData.value.effort === null) return

  emit('create', {
    title: formData.value.title.trim(),
    effort: formData.value.effort,
    recurrence_days: formData.value.recurrence_days,
    task_type: formData.value.task_type,
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
          <h3 class="modal-title">Neue Aufgabe erstellen</h3>
          <button class="btn-close" @click="handleClose" aria-label="Schließen"></button>
        </div>

        <div class="modal-body">
          <form @submit.prevent="handleConfirm">
            <div class="mb-3">
              <label class="form-label">Task Titel</label>
              <input
                type="text"
                v-model="formData.title"
                :maxlength="TASK_TITLE_MAX_LENGTH"
                placeholder="z.B. Küche putzen"
                class="form-control"
                :class="{ 'is-invalid': duplicate }"
                :disabled="isLoading"
              />
              <div v-if="duplicate" class="invalid-feedback">
                „{{ duplicate.title }}" gibt es schon — über die Suche erledigen oder wieder dreckig
                machen.
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">Punkte</label>
              <PointPicker v-model="formData.effort" kind="standard" :disabled="isLoading" />
            </div>

            <div class="mb-3">
              <label class="form-label">Task-Typ</label>
              <select v-model="formData.task_type" class="form-select" :disabled="isLoading">
                <option value="daily">Täglich / Allgemein (immer sichtbar)</option>
                <option value="recurring">Wiederkehrend (zeitbasiert)</option>
                <option value="one-time">Einmalig</option>
                <option value="project">Projekt (langfristig)</option>
              </select>
            </div>

            <div class="mb-3" v-if="formData.task_type === 'recurring'">
              <label class="form-label">Tage bis zum nächsten Putzen</label>
              <input
                type="number"
                v-model.number="formData.recurrence_days"
                placeholder="3"
                class="form-control"
                :disabled="isLoading"
              />
            </div>

            <div v-if="formData.task_type === 'project'" class="project-info">
              <i class="bi bi-info-circle"></i>
              <span>
                Projekte sind langfristige Aufgaben ohne Wiederholung. Es wird automatisch ein "Am
                Projekt arbeiten" Subtask erstellt.
              </span>
            </div>
          </form>
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
            <span v-if="!isLoading">Aufgabe erstellen</span>
            <span v-else>
              <span class="spinner-border spinner-border-sm me-2"></span>
              Erstellt...
            </span>
          </button>
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

.project-info {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--bs-info-bg-subtle, #cfe2ff);
  border: 1px solid var(--bs-info-border-subtle, #9ec5fe);
  border-radius: var(--radius-md);
  color: var(--bs-info-text, #084298);
  font-size: 0.875rem;
}

.project-info i {
  font-size: 1rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
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
