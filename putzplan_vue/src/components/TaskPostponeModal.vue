<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Task } from '@/types/Task'
import {
  postponeTargetDate,
  earliestPostponeDate,
  formatPostponeDate,
  type PostponeOption
} from '@/lib/taskSchedule'

interface Props {
  task: Task
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm', targetDate: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Das Intervall gibt es nur bei wiederkehrenden Aufgaben mit Kadenz. Einmalige
// Aufgaben haben keins — dort fehlt die Option ganz statt leer dazustehen.
const hasIntervalOption = computed(
  () => props.task.task_type === 'recurring' && props.task.recurrence_days > 0
)

// Vorauswahl "nach Intervall": ein Bestätigen-Klick genügt im Normalfall.
const selectedOption = ref<PostponeOption>(hasIntervalOption.value ? 'interval' : 'plus-1')
const customDate = ref<string>('')

const minDate = computed(() => earliestPostponeDate())

const targetDate = computed(() =>
  postponeTargetDate(props.task, selectedOption.value, customDate.value || null)
)

const targetLabel = computed(() =>
  targetDate.value ? formatPostponeDate(targetDate.value) : null
)

const selectOption = (option: PostponeOption) => {
  selectedOption.value = option
}

const handleCustomInput = () => {
  selectedOption.value = 'custom'
}

const handleConfirm = () => {
  if (!targetDate.value) return
  emit('confirm', targetDate.value)
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
          <h3 class="modal-title">Aufgabe verschieben</h3>
          <button class="btn-close" @click="handleClose" aria-label="Schließen">×</button>
        </div>

        <div class="modal-body">
          <p class="postpone-intro">
            Wann soll „{{ props.task.title }}" wieder dran sein?
          </p>

          <div class="option-list">
            <button
              v-if="hasIntervalOption"
              type="button"
              class="option-btn"
              :class="{ active: selectedOption === 'interval' }"
              @click="selectOption('interval')"
            >
              <span class="option-label">Nach Intervall</span>
              <span class="option-hint">in {{ props.task.recurrence_days }} Tagen</span>
            </button>

            <button
              type="button"
              class="option-btn"
              :class="{ active: selectedOption === 'plus-1' }"
              @click="selectOption('plus-1')"
            >
              <span class="option-label">+ 1 Tag</span>
            </button>

            <button
              type="button"
              class="option-btn"
              :class="{ active: selectedOption === 'plus-3' }"
              @click="selectOption('plus-3')"
            >
              <span class="option-label">+ 3 Tage</span>
            </button>

            <button
              type="button"
              class="option-btn"
              :class="{ active: selectedOption === 'plus-7' }"
              @click="selectOption('plus-7')"
            >
              <span class="option-label">+ 1 Woche</span>
            </button>
          </div>

          <div class="custom-date">
            <label for="postpone-date" class="form-label">Eigenes Datum</label>
            <input
              id="postpone-date"
              type="date"
              class="form-control"
              :class="{ active: selectedOption === 'custom' }"
              v-model="customDate"
              :min="minDate"
              @input="handleCustomInput"
            />
          </div>

          <p class="target-preview">
            <template v-if="targetLabel">
              Wieder dran am <strong>{{ targetLabel }}</strong>
            </template>
            <template v-else>
              Bitte ein Datum in der Zukunft wählen.
            </template>
          </p>

          <p class="postpone-note">
            Verschieben vergibt keine Punkte und erzeugt keinen Verlaufseintrag.
            Das Intervall der Aufgabe bleibt unverändert.
          </p>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="handleClose">Abbrechen</button>
          <button class="btn btn-primary" :disabled="!targetDate" @click="handleConfirm">
            Verschieben
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.postpone-intro {
  margin: 0 0 1rem;
  font-size: 0.9375rem;
  color: var(--color-text-primary);
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.option-btn {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  min-height: 48px;
  padding: 0.75rem;
  text-align: left;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.option-btn:hover {
  border-color: var(--color-primary);
}

.option-btn.active {
  border-color: var(--color-primary);
  background: rgba(79, 70, 229, 0.05);
}

.option-label {
  font-size: 0.9375rem;
  font-weight: 500;
}

.option-hint {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.custom-date {
  margin-top: 1rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-control {
  width: 100%;
  min-height: 48px;
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: border-color var(--transition-base);
}

.form-control.active {
  border-color: var(--color-primary);
}

.target-preview {
  margin: 1rem 0 0;
  font-size: 0.9375rem;
  color: var(--color-text-primary);
}

.postpone-note {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}
</style>
