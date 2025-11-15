<script setup lang="ts">
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { ref, computed } from "vue";
import TaskCompletionModal from './TaskCompletionModal.vue'
import TaskAssignmentModal from './TaskAssignmentModal.vue'
import SubtaskManagementModal from './SubtaskManagementModal.vue'
import SubtaskItem from './SubtaskItem.vue'
import ProjectWorkModal from './ProjectWorkModal.vue'
import ProjectCompleteModal from './ProjectCompleteModal.vue'
import confetti from 'canvas-confetti'

interface Props {
     task: Task
}

const props = defineProps<Props>()
const taskStore = useTaskStore()
const householdStore = useHouseholdStore()
const isEditing = ref(false)
const showCompletionModal = ref(false)
const showAssignmentModal = ref(false)
const showSubtaskManagementModal = ref(false)
const showProjectWorkModal = ref(false)
const showProjectCompleteModal = ref(false)
const subtasksExpanded = ref(true)

const editForm = ref({
     ...props.task
})

const startEdit = () => {
     editForm.value = {...props.task}
     isEditing.value = true
}

const saveEdit = async () => {
     // Validierung: Wenn task_type !== 'recurring', setze recurrence_days = 0
     const updates = { ...editForm.value }
     if (updates.task_type !== 'recurring') {
          updates.recurrence_days = 0
     }

     await taskStore.updateTask(props.task.task_id, updates)
     isEditing.value = false
}

const cancelEdit = () => {
     isEditing.value = false
}

const handleDeleteTask = async () => {
     try {
          await taskStore.deleteTask(props.task.task_id)

     } catch (error) {
          console.error('Fehler beim Löschen:', error)
     }
}

const handleCompleteTask = async () => {
     const success = await taskStore.completeTask(props.task.task_id)
     if (success) {
          confetti({
               particleCount: 100,
               spread: 70,
               origin: { y: 0.6 }
          })
     }
}

const handleMarkDirty = () => {
     taskStore.markAsDirty(props.task.task_id)
}

const openCompletionModal = () => {
     showCompletionModal.value = true
}

const closeCompletionModal = () => {
     showCompletionModal.value = false
}

const handleCustomCompletion = async (effortOverride: number, reason: string) => {
     const success = await taskStore.completeTask(props.task.task_id, effortOverride, reason)
     showCompletionModal.value = false
     if (success) {
          confetti({
               particleCount: 100,
               spread: 70,
               origin: { y: 0.6 }
          })
     }
}

const handleDirectCompletion = async () => {
     const success = await taskStore.completeTask(props.task.task_id)
     if (success) {
          confetti({
               particleCount: 100,
               spread: 70,
               origin: { y: 0.6 }
          })
     }
}

// Berechnet Tage bis Task wieder fällig ist (nur für wiederkehrende Tasks die completed sind)
// Verwendet CALENDAR DAYS (nicht 24h-Perioden), konsistent mit Backend-Cron-Logik
// Daily tasks zeigen keine Fälligkeitsdaten
const daysUntilDue = computed(() => {
     // Nur für wiederkehrende Tasks die completed sind
     if (props.task.task_type !== 'recurring' || props.task.recurrence_days === 0 || !props.task.completed || !props.task.last_completed_at) {
          return null
     }

     const lastCompleted = new Date(props.task.last_completed_at)
     const today = new Date()

     // Calendar days: Nur Datum vergleichen, keine Uhrzeit
     // Setzt Zeit auf 00:00:00 für beide Daten
     const lastCompletedDate = new Date(lastCompleted.getFullYear(), lastCompleted.getMonth(), lastCompleted.getDate())
     const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())

     // Berechne vergangene Tage (in ganzen Kalendertagen)
     const daysPassed = Math.floor((todayDate.getTime() - lastCompletedDate.getTime()) / (1000 * 60 * 60 * 24))

     // Verbleibende Tage bis zum Reset
     const daysRemaining = props.task.recurrence_days - daysPassed

     return daysRemaining
})

// Assignment Badge - Zeigt Initialen und Namen des zugewiesenen Members
const assignedMember = computed(() => {
     if (!props.task.assigned_to) return null
     return householdStore.householdMembers.find(m => m.user_id === props.task.assigned_to)
})

const assignedInitials = computed(() => {
     if (!assignedMember.value) return '?'
     return assignedMember.value.display_name
          .split(' ')
          .map(n => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase()
})

const openAssignmentModal = () => {
     showAssignmentModal.value = true
}

const closeAssignmentModal = () => {
     showAssignmentModal.value = false
}

const handleAssignmentConfirm = async (userId: string | null, permanent: boolean) => {
     await taskStore.assignTask(props.task.task_id, userId, permanent)
     showAssignmentModal.value = false
}

// SUBTASKS
const subtasks = computed(() => taskStore.getSubtasks(props.task.task_id))
const completedSubtasksCount = computed(() => subtasks.value.filter((s: Task) => s.completed).length)

// Gruppiere Subtasks nach ihrem individuellen Punktemodus
const subtasksByMode = computed(() => ({
     checklist: subtasks.value.filter(s => s.subtask_points_mode === 'checklist'),
     deduct: subtasks.value.filter(s => s.subtask_points_mode === 'deduct'),
     bonus: subtasks.value.filter(s => s.subtask_points_mode === 'bonus')
}))

const toggleSubtasks = () => {
     subtasksExpanded.value = !subtasksExpanded.value
}

// SUBTASK MANAGEMENT MODAL
const openSubtaskManagementModal = () => {
     showSubtaskManagementModal.value = true
}

const closeSubtaskManagementModal = () => {
     showSubtaskManagementModal.value = false
}

const handleCreateSubtask = async (subtaskData: { title: string; effort: 1 | 2 | 3 | 4 | 5; subtask_points_mode: 'checklist' | 'deduct' | 'bonus' }) => {
     // Bestimme order_index für neuen Subtask (höchster existierender + 1)
     const maxOrderIndex = subtasks.value.reduce((max: number, s: Task) => Math.max(max, s.order_index), 0)

     await taskStore.createTask({
          title: subtaskData.title,
          effort: subtaskData.effort,
          subtask_points_mode: subtaskData.subtask_points_mode, // NEU: Individueller Punktemodus pro Subtask!
          recurrence_days: props.task.recurrence_days, // Erbt recurrence von Parent
          task_type: props.task.task_type, // Erbt task_type von Parent
          parent_task_id: props.task.task_id, // WICHTIG: Setzt parent_task_id!
          order_index: maxOrderIndex + 1
     })
}

const handleUpdateSubtaskPointsMode = async (subtaskId: string, mode: 'checklist' | 'deduct' | 'bonus') => {
     await taskStore.updateTask(subtaskId, {
          subtask_points_mode: mode
     })
}

const handleResetSubtasks = async () => {
     await taskStore.resetSubtasks(props.task.task_id)
}

// PROJECTS - Project-specific handlers
const isProject = computed(() => props.task.task_type === 'project')
const projectEffort = computed(() => isProject.value ? taskStore.getProjectEffort(props.task.task_id) : 0)

// Check if this is the "Am Projekt arbeiten" default subtask
const isProjectWorkSubtask = computed(() =>
     props.task.title === 'Am Projekt arbeiten' &&
     props.task.parent_task_id !== null
)

const openProjectWorkModal = () => {
     showProjectWorkModal.value = true
}

const closeProjectWorkModal = () => {
     showProjectWorkModal.value = false
}

const handleProjectWork = async (effort: number, note: string) => {
     // Complete the subtask with custom effort and note
     const success = await taskStore.completeTask(props.task.task_id, effort, note)

     if (success) {
          // Immediately reset the subtask so it's always available
          await taskStore.markAsDirty(props.task.task_id)
          confetti({
               particleCount: 100,
               spread: 70,
               origin: { y: 0.6 }
          })
     }

     showProjectWorkModal.value = false
}

const openProjectCompleteModal = () => {
     showProjectCompleteModal.value = true
}

const closeProjectCompleteModal = () => {
     showProjectCompleteModal.value = false
}

const handleCompleteProject = async () => {
     const success = await taskStore.completeProject(props.task.task_id)
     showProjectCompleteModal.value = false
     if (success) {
          confetti({
               particleCount: 150,
               spread: 100,
               origin: { y: 0.6 }
          })
     }
}
</script>

<template>
     <div class="task-card h-100">
          <!-- Normal Display -->
          <div v-if="!isEditing" class="card-body">
               <!-- Action Icons (Top Right) -->
               <div class="action-icons">
                    <button class="icon-btn" @click="startEdit" title="Bearbeiten">
                         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                         </svg>
                    </button>
                    <button class="icon-btn icon-btn-danger" @click="handleDeleteTask" title="Löschen">
                         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              <line x1="10" y1="11" x2="10" y2="17"></line>
                              <line x1="14" y1="11" x2="14" y2="17"></line>
                         </svg>
                    </button>
               </div>

               <h6 class="task-title">{{ props.task.title }}</h6>
               <div class="task-details">
                    <!-- Effort für normale Tasks, Gesamt-Effort für Projekte -->
                    <div v-if="!isProject" class="task-info">
                         <span class="info-label">Aufwand:</span>
                         <span class="info-value">{{ props.task.effort }}</span>
                    </div>
                    <div v-else class="task-info">
                         <span class="info-label">Gesamt-Effort:</span>
                         <span class="info-value effort-badge">{{ projectEffort }}</span>
                    </div>

                    <!-- Task Type Badge -->
                    <div v-if="props.task.task_type === 'one-time'" class="task-badge task-badge-one-time">
                         Einmalig
                    </div>
                    <div v-if="props.task.task_type === 'project'" class="task-badge task-badge-project">
                         Projekt
                    </div>

                    <!-- Für wiederkehrende Tasks -->
                    <div v-if="props.task.task_type === 'recurring' && props.task.recurrence_days > 0" class="task-info">
                         <span class="info-label">Wiederholung:</span>
                         <span class="info-value">alle {{ props.task.recurrence_days }} Tage</span>
                    </div>

                    <!-- Fälligkeitsdatum für dreckige, wiederkehrende Tasks -->
                    <div v-if="daysUntilDue !== null" class="task-info">
                         <span class="info-label">Fällig in:</span>
                         <span class="info-value">{{ daysUntilDue }} {{ daysUntilDue === 1 ? 'Tag' : 'Tagen' }}</span>
                    </div>
               </div>

               <!-- SUBTASKS SECTION (nur für Parent Tasks) - Gruppiert nach Punktemodus -->
               <div v-if="!props.task.parent_task_id && subtasks.length > 0" class="subtasks-section">
                    <div class="subtasks-header-row">
                         <div class="subtasks-header" @click="toggleSubtasks">
                              <span class="toggle-icon">{{ subtasksExpanded ? '▼' : '▶' }}</span>
                              Subtasks ({{ completedSubtasksCount }}/{{ subtasks.length }})
                         </div>
                         <button
                              v-if="completedSubtasksCount > 0"
                              class="btn btn-sm btn-outline-secondary reset-subtasks-btn"
                              @click="handleResetSubtasks"
                              title="Alle Subtasks zurücksetzen"
                         >
                              ↺
                         </button>
                    </div>

                    <div v-show="subtasksExpanded" class="subtasks-list">
                         <!-- Checkliste Gruppe -->
                         <div v-if="subtasksByMode.checklist.length > 0" class="subtask-group">
                              <div class="subtask-group-header">
                                   <span class="subtask-group-badge badge-checklist">✓ Checkliste</span>
                                   <span class="subtask-group-count">{{ subtasksByMode.checklist.length }}</span>
                              </div>
                              <SubtaskItem
                                   v-for="subtask in subtasksByMode.checklist"
                                   :key="subtask.task_id"
                                   :task="subtask"
                              />
                         </div>

                         <!-- Abziehen Gruppe -->
                         <div v-if="subtasksByMode.deduct.length > 0" class="subtask-group">
                              <div class="subtask-group-header">
                                   <span class="subtask-group-badge badge-deduct">− Abziehen</span>
                                   <span class="subtask-group-count">{{ subtasksByMode.deduct.length }}</span>
                              </div>
                              <SubtaskItem
                                   v-for="subtask in subtasksByMode.deduct"
                                   :key="subtask.task_id"
                                   :task="subtask"
                              />
                         </div>

                         <!-- Bonus Gruppe -->
                         <div v-if="subtasksByMode.bonus.length > 0" class="subtask-group">
                              <div class="subtask-group-header">
                                   <span class="subtask-group-badge badge-bonus">+ Bonus</span>
                                   <span class="subtask-group-count">{{ subtasksByMode.bonus.length }}</span>
                              </div>
                              <SubtaskItem
                                   v-for="subtask in subtasksByMode.bonus"
                                   :key="subtask.task_id"
                                   :task="subtask"
                              />
                         </div>
                    </div>
               </div>

               <!-- MANAGE SUBTASKS BUTTON (nur für Parent Tasks) -->
               <div v-if="!props.task.parent_task_id" class="add-subtask-section">
                    <button
                         class="btn btn-sm btn-outline-primary w-100"
                         @click="openSubtaskManagementModal"
                    >
                         ⚙ Subtasks verwalten
                    </button>
               </div>
          </div>

          <!-- Edit Form -->
          <div v-else class="card-body">
               <form @submit.prevent="saveEdit">
                    <div class="mb-3">
                         <label for="title" class="form-label">Titel</label>
                         <input
                              type="text"
                              class="form-control"
                              id="title"
                              v-model="editForm.title"
                              required>
                    </div>

                    <div class="mb-3">
                         <label for="task-type" class="form-label">Typ</label>
                         <select
                              class="form-select"
                              id="task-type"
                              v-model="editForm.task_type"
                              required>
                              <option value="recurring">Zeitbasiert</option>
                              <option value="daily">Täglich</option>
                              <option value="one-time">Einmalig</option>
                         </select>
                    </div>

                    <div class="mb-3">
                         <label for="effort" class="form-label">Aufwand</label>
                         <input
                              type="number"
                              class="form-control"
                              id="effort"
                              v-model.number="editForm.effort"
                              min="1"
                              required>
                    </div>

                    <div v-if="editForm.task_type === 'recurring'" class="mb-3">
                         <label for="recurrence" class="form-label">Wiederholung (Tage)</label>
                         <input
                              type="number"
                              class="form-control"
                              id="recurrence"
                              v-model.number="editForm.recurrence_days"
                              min="1"
                              required>
                    </div>
               </form>
          </div>
          <div class="card-footer">
               <!-- Normal Mode Buttons -->
               <div v-if="!isEditing" class="footer-content">
                    <div class="button-group">
                         <!-- PROJECTS: Different button logic -->
                         <template v-if="isProject">
                              <button v-if="!props.task.completed" class="btn btn-primary btn-sm flex-fill"
                                      @click="openProjectCompleteModal">
                                   Projekt abschließen
                              </button>
                              <div v-else class="project-completed-badge">
                                   ✓ Abgeschlossen
                              </div>
                         </template>

                         <!-- REGULAR TASKS: Standard logic -->
                         <template v-else-if="props.task.completed">
                              <button class="btn btn-warning btn-sm flex-fill"
                                      @click="handleMarkDirty">
                                   Dreckig
                              </button>
                              <button class="btn btn-outline-success btn-sm flex-fill"
                                      @click="handleDirectCompletion">
                                   Trotzdem geputzt
                              </button>
                         </template>
                         <div v-else class="combined-button-group">
                              <button class="btn btn-success btn-sm combined-main"
                                      @click="handleCompleteTask">
                                   Sauber
                              </button>
                              <button class="btn btn-success btn-sm combined-modifier"
                                      @click="openCompletionModal"
                                      title="Aufwand anpassen">
                                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="17 11 12 6 7 11"></polyline>
                                        <polyline points="17 18 12 13 7 18"></polyline>
                                   </svg>
                              </button>
                         </div>
                    </div>

                    <!-- Assignment Badge -->
                    <div
                         class="assignment-badge"
                         :class="{ 'has-assignment': props.task.assigned_to }"
                         :style="assignedMember ? { backgroundColor: assignedMember.user_color, borderColor: assignedMember.user_color } : {}"
                         @click="openAssignmentModal"
                         :title="assignedMember ? assignedMember.display_name : 'Task zuweisen'"
                    >
                         {{ assignedInitials }}
                    </div>
               </div>

               <!-- Edit Mode Buttons -->
               <div v-else class="d-flex gap-2">
                    <button type="submit"
                            class="btn btn-primary btn-sm flex-fill"
                            @click="saveEdit">
                         Speichern
                    </button>
                    <button type="button"
                            class="btn btn-secondary btn-sm flex-fill"
                            @click="cancelEdit">
                         Abbrechen
                    </button>
               </div>
          </div>

          <!-- Task Completion Modal -->
          <TaskCompletionModal
               v-if="showCompletionModal"
               :taskTitle="props.task.title"
               :defaultEffort="props.task.effort"
               @close="closeCompletionModal"
               @confirm="handleCustomCompletion"
          />

          <!-- Task Assignment Modal -->
          <TaskAssignmentModal
               v-if="showAssignmentModal"
               :currentAssignedTo="props.task.assigned_to"
               :currentPermanent="props.task.assignment_permanent"
               :householdMembers="householdStore.householdMembers"
               @close="closeAssignmentModal"
               @confirm="handleAssignmentConfirm"
          />

          <!-- Subtask Management Modal -->
          <SubtaskManagementModal
               v-if="showSubtaskManagementModal"
               :parentTask="props.task"
               :existingSubtasks="subtasks"
               @close="closeSubtaskManagementModal"
               @createSubtask="handleCreateSubtask"
               @updateSubtaskPointsMode="handleUpdateSubtaskPointsMode"
          />

          <!-- Project Work Modal -->
          <ProjectWorkModal
               v-if="showProjectWorkModal"
               :projectTitle="props.task.parent_task_id ? taskStore.tasks.find(t => t.task_id === props.task.parent_task_id)?.title || 'Projekt' : 'Projekt'"
               @close="closeProjectWorkModal"
               @confirm="handleProjectWork"
          />

          <!-- Project Complete Modal -->
          <ProjectCompleteModal
               v-if="showProjectCompleteModal"
               :projectTitle="props.task.title"
               @close="closeProjectCompleteModal"
               @confirm="handleCompleteProject"
          />
     </div>

</template>

<style scoped>
.task-card {
     border: 1px solid var(--color-border);
     border-radius: var(--radius-lg);
     background: var(--color-background-elevated);
     box-shadow: var(--shadow-md);
     transition: all var(--transition-base);
     overflow: hidden;
}

.task-card:hover {
     box-shadow: var(--shadow-lg);
     transform: translateY(-2px);
}

.task-title {
     font-size: 1.125rem;
     font-weight: 600;
     color: var(--color-text-primary);
     margin-bottom: var(--spacing-md);
}

.task-details {
     display: flex;
     flex-direction: column;
     gap: var(--spacing-xs);
}

.task-info {
     display: flex;
     align-items: center;
     font-size: 0.875rem;
}

.info-label {
     color: var(--color-text-secondary);
     margin-right: 0.5rem;
     font-weight: 500;
}

.info-value {
     color: var(--color-text-primary);
     font-weight: 500;
}

.effort-badge {
     display: inline-block;
     background: var(--bs-primary);
     color: white;
     padding: 0.125rem 0.5rem;
     border-radius: var(--radius-sm);
     font-size: 0.875rem;
     font-weight: 600;
}

.task-badge {
     display: inline-block;
     background: var(--color-primary);
     color: white;
     padding: 0.25rem 0.75rem;
     border-radius: var(--radius-sm);
     font-size: 0.75rem;
     font-weight: 500;
     text-transform: uppercase;
     letter-spacing: 0.5px;
}

.task-badge-daily {
     background: var(--bs-info);
}

.task-badge-one-time {
     background: var(--bs-secondary);
}

.task-badge-project {
     background: var(--bs-primary);
}

.project-completed-badge {
     display: flex;
     align-items: center;
     justify-content: center;
     padding: 0.5rem 1rem;
     background: var(--bs-success);
     color: white;
     border-radius: var(--radius-md);
     font-size: 0.875rem;
     font-weight: 600;
     flex: 1;
}

.card-footer {
     background: transparent;
     border-top: 1px solid var(--color-border);
     padding: var(--spacing-md);
}

.btn-sm {
     font-size: 0.8125rem;
     padding: 0.5rem 0.875rem;
}

/* Combined Button Group Styling */
.combined-button-group {
     display: inline-flex;
     flex: 1;
     border-radius: var(--radius-md);
     overflow: hidden;
}

.combined-main {
     flex: 1;
     border-radius: var(--radius-md) 0 0 var(--radius-md);
     border-right: none;
}

.combined-modifier {
     padding: 0.5rem 0.625rem;
     border-radius: 0 var(--radius-md) var(--radius-md) 0;
     border-left: 2px solid rgba(255, 255, 255, 0.3);
     display: flex;
     align-items: center;
     justify-content: center;
}

.combined-modifier svg {
     display: block;
}

.combined-modifier:hover {
     background: var(--bs-success-dark, #157347);
}

/* Action Icons (Top Right) */
.action-icons {
     position: absolute;
     top: var(--spacing-md);
     right: var(--spacing-md);
     display: flex;
     gap: var(--spacing-xs);
     z-index: 10;
}

.icon-btn {
     background: var(--color-background-elevated);
     border: 1px solid var(--color-border);
     border-radius: var(--radius-md);
     padding: 0.375rem;
     cursor: pointer;
     display: flex;
     align-items: center;
     justify-content: center;
     transition: all var(--transition-base);
     color: var(--color-text-secondary);
}

.icon-btn:hover {
     background: var(--color-background-muted);
     color: var(--color-text-primary);
     border-color: var(--color-primary);
     transform: scale(1.05);
}

.icon-btn-danger:hover {
     background: var(--bs-danger);
     color: white;
     border-color: var(--bs-danger);
}

.card-body {
     position: relative;
     padding: var(--spacing-lg);
}

/* Footer Layout with Assignment Badge */
.footer-content {
     display: flex;
     align-items: center;
     gap: var(--spacing-md);
}

.button-group {
     flex: 1;
     display: flex;
     gap: var(--spacing-sm);
     flex-wrap: wrap;
}

/* Assignment Badge */
.assignment-badge {
     width: 36px;
     height: 36px;
     border-radius: 50%;
     display: flex;
     align-items: center;
     justify-content: center;
     font-size: 0.75rem;
     font-weight: 600;
     cursor: pointer;
     transition: all var(--transition-base);
     flex-shrink: 0;
     border: 2px dashed var(--color-border);
     background: var(--color-background);
     color: var(--color-text-secondary);
}

.assignment-badge.has-assignment {
     color: white;
     border-style: solid;
}

.assignment-badge:hover {
     transform: scale(1.1);
     border-color: var(--color-primary);
}

.assignment-badge.has-assignment:hover {
     background: var(--color-primary-light);
     border-color: var(--color-primary-light);
}

/* Subtasks Section */
.subtasks-section {
     margin-top: var(--spacing-md);
     padding-top: var(--spacing-md);
     border-top: 1px solid var(--color-border);
}

.subtasks-header-row {
     display: flex;
     align-items: center;
     gap: var(--spacing-sm);
     justify-content: space-between;
}

.subtasks-header {
     font-size: 0.875rem;
     font-weight: 600;
     color: var(--color-text-primary);
     cursor: pointer;
     padding: var(--spacing-xs) var(--spacing-sm);
     border-radius: var(--radius-sm);
     transition: background var(--transition-base);
     display: flex;
     align-items: center;
     gap: var(--spacing-xs);
     flex: 1;
}

.subtasks-header:hover {
     background: var(--color-background-muted);
}

.reset-subtasks-btn {
     padding: 0.25rem 0.5rem;
     font-size: 1rem;
     line-height: 1;
     flex-shrink: 0;
}

.toggle-icon {
     font-size: 0.75rem;
     color: var(--color-text-secondary);
}

.subtasks-list {
     margin-top: var(--spacing-sm);
     display: flex;
     flex-direction: column;
     gap: var(--spacing-md);
}

/* Subtask Groups (by points mode) */
.subtask-group {
     display: flex;
     flex-direction: column;
     gap: var(--spacing-xs);
}

.subtask-group-header {
     display: flex;
     align-items: center;
     justify-content: space-between;
     padding: 0.375rem 0.625rem;
     background: var(--color-background-muted);
     border-radius: var(--radius-sm);
     margin-bottom: var(--spacing-xs);
}

.subtask-group-badge {
     font-size: 0.75rem;
     padding: 0.25rem 0.625rem;
     border-radius: var(--radius-sm);
     font-weight: 600;
     text-transform: uppercase;
     letter-spacing: 0.5px;
}

.subtask-group-count {
     font-size: 0.75rem;
     font-weight: 600;
     color: var(--color-text-secondary);
     background: var(--color-background-elevated);
     padding: 0.25rem 0.5rem;
     border-radius: var(--radius-sm);
}

.badge-checklist {
     background: var(--bs-info);
     color: white;
}

.badge-deduct {
     background: var(--bs-warning);
     color: white;
}

.badge-bonus {
     background: var(--bs-success);
     color: white;
}

/* Manage Subtasks Section */
.add-subtask-section {
     margin-top: var(--spacing-md);
}

/* Mobile: Ensure buttons and badge stay in one row */
@media (max-width: 480px) {
     .footer-content {
          gap: var(--spacing-sm);
     }

     .button-group {
          min-width: 0; /* Allow flex items to shrink below content size */
     }

     .combined-button-group,
     .button-group > .btn {
          font-size: 0.75rem;
          padding: 0.4rem 0.5rem;
     }

     .assignment-badge {
          width: 32px;
          height: 32px;
          font-size: 0.7rem;
     }
}
</style>