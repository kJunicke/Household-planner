<script setup lang="ts">
import type { Task } from '@/types/Task'
import { ref, computed } from 'vue'

interface Props {
  parentTask: Task
  existingSubtasks: Task[]
}

interface Emits {
  (e: 'close'): void
  (e: 'createSubtask', subtaskData: { title: string; effort: 1 | 2 | 3 | 4 | 5; subtask_points_mode: 'checklist' | 'deduct' | 'bonus' }): void
  (e: 'updateSubtaskPointsMode', subtaskId: string, mode: 'checklist' | 'deduct' | 'bonus'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Check if parent is a project
const isProject = computed(() => props.parentTask.task_type === 'project')

// Add Subtask Form
const newSubtaskTitle = ref('')
const newSubtaskEffort = ref<1 | 2 | 3 | 4 | 5>(1)
const newSubtaskPointsMode = ref<'checklist' | 'deduct' | 'bonus'>('checklist')

// Available modes (filtered for projects)
const availableModes = computed(() => {
  if (isProject.value) {
    // Projects: only checklist and bonus allowed
    return ['checklist', 'bonus'] as const
  }
  // Regular tasks: all modes allowed
  return ['checklist', 'deduct', 'bonus'] as const
})

// Points Mode descriptions (für Create Form Hint)
const modeDescriptions = {
  checklist: {
    title: '✓ Checkliste',
    description: 'Diese Unteraufgabe gibt keine Punkte',
  },
  deduct: {
    title: '− Abziehen',
    description: 'Aufwand wird von Hauptaufgabe abgezogen',
  },
  bonus: {
    title: '+ Bonus',
    description: 'Gibt zusätzliche Bonuspunkte',
  }
}

const canAddSubtask = computed(() => {
  return newSubtaskTitle.value.trim().length > 0
})

const handleAddSubtask = () => {
  if (!canAddSubtask.value) return

  emit('createSubtask', {
    title: newSubtaskTitle.value.trim(),
    effort: newSubtaskEffort.value,
    subtask_points_mode: newSubtaskPointsMode.value
  })

  // Reset form
  newSubtaskTitle.value = ''
  newSubtaskEffort.value = 1
  newSubtaskPointsMode.value = 'checklist' // Reset to default
}

const handleClose = () => {
  emit('close')
}

const handlePointsModeChange = (subtaskId: string, mode: 'checklist' | 'deduct' | 'bonus') => {
  emit('updateSubtaskPointsMode', subtaskId, mode)
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
          <!-- PROJECT INFO (nur bei Projekten) -->
          <div v-if="isProject" class="project-info-banner">
            <i class="bi bi-info-circle"></i>
            <span>Projekt-Unteraufgaben: Nur <strong>Checkliste</strong> und <strong>Bonus</strong> verfügbar</span>
          </div>

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
              <!-- Points Mode Selector (zuerst, da es die Aufwand-Anzeige steuert) -->
              <div class="form-row">
                <label class="form-label-inline">Punktemodus:</label>
                <div class="points-mode-selector">
                  <label
                    v-for="mode in availableModes"
                    :key="mode"
                    class="mode-option-compact"
                    :class="{ active: newSubtaskPointsMode === mode }"
                  >
                    <input
                      type="radio"
                      :value="mode"
                      v-model="newSubtaskPointsMode"
                      name="newSubtaskPointsMode"
                    />
                    <span class="mode-icon">{{ modeDescriptions[mode].title.substring(0, 1) }}</span>
                    <span class="mode-text">{{ modeDescriptions[mode].title.substring(2) }}</span>
                  </label>
                </div>
              </div>

              <!-- Effort Selector (nur bei non-checklist) -->
              <div v-if="newSubtaskPointsMode !== 'checklist'" class="form-row">
                <label class="form-label-inline">Aufwand:</label>
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
                <span v-if="subtask.subtask_points_mode !== 'checklist'" class="subtask-effort">{{ subtask.effort }}</span>

                <!-- Points Mode Selector für existierende Subtasks -->
                <div class="subtask-mode-selector">
                  <button
                    v-for="mode in ['checklist', 'deduct', 'bonus'] as const"
                    :key="mode"
                    class="mode-btn"
                    :class="{ active: subtask.subtask_points_mode === mode }"
                    @click="handlePointsModeChange(subtask.task_id, mode)"
                    :title="modeDescriptions[mode].title"
                  >
                    {{ modeDescriptions[mode].title.substring(0, 1) }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="handleClose">
            Schließen
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Project Info Banner */
.project-info-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--bs-info-bg-subtle, #cfe2ff);
  border: 1px solid var(--bs-info-border-subtle, #9ec5fe);
  border-radius: var(--radius-md);
  color: var(--bs-info-text, #084298);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.project-info-banner i {
  font-size: 1rem;
  flex-shrink: 0;
}

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

/* Form Row Layout */
.form-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.form-label-inline {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  min-width: 100px;
  margin: 0;
}

/* Effort Selector */
.effort-selector {
  display: flex;
  gap: 0.5rem;
  flex: 1;
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

/* Points Mode Selector (for Add Form) */
.points-mode-selector {
  display: flex;
  gap: 0.5rem;
  flex: 1;
}

.mode-option-compact {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 0.5rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  background: var(--color-background);
  flex: 1;
  min-width: 0;
}

.mode-option-compact:hover {
  border-color: var(--color-primary);
  background: var(--color-background-elevated);
}

.mode-option-compact.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: white;
}

.mode-option-compact input[type="radio"] {
  display: none;
}

.mode-option-compact .mode-icon {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.mode-option-compact .mode-text {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Subtask Mode Selector (for Existing Subtasks) */
.subtask-mode-selector {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}

.mode-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
  font-size: 0.875rem;
  font-weight: 700;
}

.mode-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-background-elevated);
}

.mode-btn.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: white;
}

.add-subtask-form .btn {
  width: 100%;
}
</style>
