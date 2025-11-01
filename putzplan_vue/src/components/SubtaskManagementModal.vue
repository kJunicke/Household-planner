<script setup lang="ts">
import type { Task } from '@/types/Task'
import { ref, computed } from 'vue'

interface Props {
  parentTask: Task
  existingSubtasks: Task[]
}

interface Emits {
  (e: 'close'): void
  (e: 'createSubtask', subtaskData: { title: string; effort: 1 | 2 | 3 | 4 | 5 }): void
  (e: 'updatePointsMode', mode: 'checklist' | 'deduct' | 'bonus'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Points Mode Selection
const selectedMode = ref<'checklist' | 'deduct' | 'bonus'>(props.parentTask.subtask_points_mode)

// Add Subtask Form
const newSubtaskTitle = ref('')
const newSubtaskEffort = ref<1 | 2 | 3 | 4 | 5>(1)

// Points Mode descriptions
const modeDescriptions = {
  checklist: {
    title: '✓ Checkliste',
    description: 'Unteraufgaben geben keine Punkte. Nur das Abschließen der Hauptaufgabe zählt.',
    example: `Beispiel: "${props.parentTask.title}" gibt ${props.parentTask.effort} Punkte`
  },
  deduct: {
    title: '− Abziehen',
    description: 'Unteraufgaben-Aufwand wird von der Hauptaufgabe abgezogen.',
    example: computed(() => {
      const subtaskEffortSum = props.existingSubtasks.reduce((sum, s) => sum + s.effort, 0)
      const remainingEffort = Math.max(0, props.parentTask.effort - subtaskEffortSum)
      return `Beispiel: "${props.parentTask.title}" gibt ${remainingEffort} Punkte (${props.parentTask.effort} - ${subtaskEffortSum} Unteraufgaben-Punkte)`
    })
  },
  bonus: {
    title: '+ Bonus',
    description: 'Unteraufgaben geben zusätzliche Punkte zur Hauptaufgabe.',
    example: computed(() => {
      const subtaskEffortSum = props.existingSubtasks.reduce((sum, s) => sum + s.effort, 0)
      const totalEffort = props.parentTask.effort + subtaskEffortSum
      return `Beispiel: "${props.parentTask.title}" gibt ${totalEffort} Punkte (${props.parentTask.effort} + ${subtaskEffortSum} Unteraufgaben-Punkte)`
    })
  }
}

const canAddSubtask = computed(() => {
  return newSubtaskTitle.value.trim().length > 0
})

const handleAddSubtask = () => {
  if (!canAddSubtask.value) return

  emit('createSubtask', {
    title: newSubtaskTitle.value.trim(),
    effort: newSubtaskEffort.value
  })

  // Reset form
  newSubtaskTitle.value = ''
  newSubtaskEffort.value = 1
}

const handleSavePointsMode = () => {
  if (selectedMode.value !== props.parentTask.subtask_points_mode) {
    emit('updatePointsMode', selectedMode.value)
  }
}

const handleClose = () => {
  emit('close')
}

const handleConfirm = () => {
  handleSavePointsMode()
  handleClose()
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click="handleClose">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">{{ parentTask.title }} - Unteraufgabe hinzufügen</h5>
          <button class="btn-close" @click="handleClose" aria-label="Schließen">×</button>
        </div>

        <div class="modal-body">
          <!-- SECTION 1: Add New Subtask -->
          <div class="section">
            <h6 class="section-title">Neue Unteraufgabe</h6>
            <div class="add-subtask-form">
              <input
                type="text"
                class="form-control"
                v-model="newSubtaskTitle"
                placeholder="Name der Unteraufgabe"
                @keyup.enter="handleAddSubtask"
              />
              <div class="effort-selector">
                <label
                  v-for="effort in [1, 2, 3, 4, 5]"
                  :key="effort"
                  class="effort-option"
                  :class="{ active: newSubtaskEffort === effort }"
                >
                  <input
                    type="radio"
                    :value="effort"
                    v-model.number="newSubtaskEffort"
                    name="subtaskEffort"
                  />
                  {{ effort }}
                </label>
              </div>
              <button
                class="btn btn-sm btn-success"
                :disabled="!canAddSubtask"
                @click="handleAddSubtask"
              >
                + Hinzufügen
              </button>
            </div>
          </div>

          <!-- SECTION 2: Existing Subtasks -->
          <div v-if="existingSubtasks.length > 0" class="section">
            <h6 class="section-title">Bestehende Unteraufgaben ({{ existingSubtasks.length }})</h6>
            <div class="subtasks-list">
              <div
                v-for="subtask in existingSubtasks"
                :key="subtask.task_id"
                class="subtask-preview"
                :class="{ completed: subtask.completed }"
              >
                <span class="subtask-title">{{ subtask.title }}</span>
                <span class="subtask-effort">{{ subtask.effort }}</span>
              </div>
            </div>
          </div>

          <!-- SECTION 3: Points Mode Selection -->
          <div class="section">
            <h6 class="section-title">Punktemodus für Unteraufgaben</h6>

            <div class="mode-options">
              <label
                v-for="mode in ['checklist', 'deduct', 'bonus'] as const"
                :key="mode"
                class="mode-option"
                :class="{ active: selectedMode === mode }"
              >
                <input
                  type="radio"
                  :value="mode"
                  v-model="selectedMode"
                  name="pointsMode"
                />
                <div class="mode-content">
                  <div class="mode-header">
                    <span class="mode-title">{{ modeDescriptions[mode].title }}</span>
                  </div>
                  <p class="mode-description">{{ modeDescriptions[mode].description }}</p>
                  <p class="mode-example">{{ typeof modeDescriptions[mode].example === 'string' ? modeDescriptions[mode].example : modeDescriptions[mode].example.value }}</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="handleClose">
            Abbrechen
          </button>
          <button
            class="btn btn-primary"
            @click="handleConfirm"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Section Styling */
.section {
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Points Mode Options */
.mode-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.mode-option {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  background: var(--color-background);
}

.mode-option:hover {
  border-color: var(--color-primary);
  background: var(--color-background-elevated);
}

.mode-option.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.15);
}

.mode-option.active .mode-title,
.mode-option.active .mode-description,
.mode-option.active .mode-example {
  color: white;
}

.mode-option.active .mode-example {
  background: rgba(255, 255, 255, 0.15);
  border-left-color: white;
}

.mode-option input[type="radio"] {
  margin-top: 0.125rem;
  cursor: pointer;
  flex-shrink: 0;
}

.mode-content {
  flex: 1;
}

.mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.mode-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.mode-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}

.mode-example {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  font-style: italic;
  margin: 0;
  padding: 0.5rem;
  background: var(--color-background-muted);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-primary);
}

/* Existing Subtasks List */
.subtasks-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.subtask-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.875rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
}

.subtask-preview:hover {
  background: var(--color-background-muted);
}

.subtask-preview.completed {
  opacity: 0.6;
}

.subtask-preview.completed .subtask-title {
  text-decoration: line-through;
}

.subtask-preview .subtask-title {
  flex: 1;
  font-size: 0.875rem;
  color: var(--color-text-primary);
}

.subtask-preview .subtask-effort {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-background-elevated);
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-sm);
}

/* Add Subtask Form */
.add-subtask-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.add-subtask-form .form-control {
  width: 100%;
  font-size: 0.875rem;
}

/* Effort Selector */
.effort-selector {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.effort-option {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-background);
}

.effort-option:hover {
  border-color: var(--color-primary);
  background: var(--color-background-elevated);
}

.effort-option.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: white;
}

.effort-option input[type="radio"] {
  display: none;
}

.add-subtask-form .btn {
  width: 100%;
}
</style>
