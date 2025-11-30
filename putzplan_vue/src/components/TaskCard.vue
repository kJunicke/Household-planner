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
import TaskEditModal from './TaskEditModal.vue'
import confetti from 'canvas-confetti'

interface Props {
     task: Task
}

const props = defineProps<Props>()
const taskStore = useTaskStore()
const householdStore = useHouseholdStore()
const showEditModal = ref(false)
const showCompletionModal = ref(false)
const showAssignmentModal = ref(false)
const showSubtaskManagementModal = ref(false)
const showProjectWorkModal = ref(false)
const showProjectCompleteModal = ref(false)
const subtasksExpanded = ref(false) // Standardmäßig eingeklappt für kompakteres Design

// Loading states for async operations in modals
const isCompletingTask = ref(false)
const isCompletingProject = ref(false)
const isLoggingWork = ref(false)

const openEditModal = () => {
     showEditModal.value = true
}

const closeEditModal = () => {
     showEditModal.value = false
}

const handleEditConfirm = async (updates: Partial<Task>) => {
     await taskStore.updateTask(props.task.task_id, updates)
     showEditModal.value = false
}

const handleEditDelete = () => {
     showEditModal.value = false
     handleDeleteTask()
}

const handleEditAssign = () => {
     showEditModal.value = false
     openAssignmentModal()
}

const handleEditManageSubtasks = () => {
     showEditModal.value = false
     openSubtaskManagementModal()
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
     isCompletingTask.value = true
     const success = await taskStore.completeTask(props.task.task_id, effortOverride, reason)
     isCompletingTask.value = false

     if (success) {
          showCompletionModal.value = false
          confetti({
               particleCount: 100,
               spread: 70,
               origin: { y: 0.6 }
          })
     }
     // If failed, modal stays open so user can retry
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

// Assignment Glow - Subtiler Farbschimmer für zugewiesene Tasks
const assignmentGlowStyle = computed(() => {
     if (!assignedMember.value) return {}

     // Hexadezimal zu RGB konvertieren für opacity
     const hex = assignedMember.value.user_color
     const r = parseInt(hex.slice(1, 3), 16)
     const g = parseInt(hex.slice(3, 5), 16)
     const b = parseInt(hex.slice(5, 7), 16)

     return {
          backgroundColor: `rgba(${r}, ${g}, ${b}, 0.08)`,
          borderColor: `rgba(${r}, ${g}, ${b}, 0.3)`
     }
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

const closeProjectWorkModal = () => {
     showProjectWorkModal.value = false
}

const handleProjectWork = async (effort: number, note: string) => {
     isLoggingWork.value = true
     // Complete the subtask with custom effort and note
     const success = await taskStore.completeTask(props.task.task_id, effort, note)
     isLoggingWork.value = false

     if (success) {
          // Immediately reset the subtask so it's always available
          await taskStore.markAsDirty(props.task.task_id)
          showProjectWorkModal.value = false
          confetti({
               particleCount: 100,
               spread: 70,
               origin: { y: 0.6 }
          })
     }
     // If failed, modal stays open so user can retry
}

const openProjectCompleteModal = () => {
     showProjectCompleteModal.value = true
}

const closeProjectCompleteModal = () => {
     showProjectCompleteModal.value = false
}

const handleCompleteProject = async () => {
     isCompletingProject.value = true
     const success = await taskStore.completeProject(props.task.task_id)
     isCompletingProject.value = false

     if (success) {
          showProjectCompleteModal.value = false
          confetti({
               particleCount: 150,
               spread: 100,
               origin: { y: 0.6 }
          })
     }
     // If failed, modal stays open so user can retry
}
</script>

<template>
     <div class="task-card" :class="{ 'has-assignment': props.task.assigned_to }" :style="assignmentGlowStyle">
          <!-- Main Horizontal Layout -->
          <div class="task-card-main" @click="!props.task.parent_task_id && subtasks.length > 0 ? toggleSubtasks() : null" :style="{ cursor: !props.task.parent_task_id && subtasks.length > 0 ? 'pointer' : 'default' }">
               <!-- Left: Title + Badges -->
               <div class="task-left">
                    <div class="task-info-block">
                         <h6 class="task-title">{{ props.task.title }}</h6>
                         <div class="task-meta">
                              <!-- Effort Badge -->
                              <span v-if="!isProject" class="meta-badge effort-badge">
                                   {{ props.task.effort }} Pkt
                              </span>
                              <span v-else class="meta-badge effort-badge">
                                   {{ projectEffort }} Pkt
                              </span>

                              <!-- Task Type Badge -->
                              <span v-if="props.task.task_type === 'one-time'" class="meta-badge type-badge-one-time">
                                   Einmalig
                              </span>
                              <span v-if="props.task.task_type === 'project'" class="meta-badge type-badge-project">
                                   Projekt
                              </span>
                              <span v-if="props.task.task_type === 'daily'" class="meta-badge type-badge-daily">
                                   Täglich
                              </span>

                              <!-- Subtasks Count -->
                              <span v-if="!props.task.parent_task_id && subtasks.length > 0" class="meta-badge subtasks-badge">
                                   {{ completedSubtasksCount }}/{{ subtasks.length }}
                              </span>

                              <!-- Due Date (wenn vorhanden) -->
                              <span v-if="daysUntilDue !== null" class="meta-badge due-badge">
                                   {{ daysUntilDue }}d
                              </span>

                              <!-- Expand Icon (klein, ausgegraut, unten rechts) -->
                              <button
                                   v-if="!props.task.parent_task_id && subtasks.length > 0"
                                   class="expand-indicator"
                                   @click.stop="toggleSubtasks"
                                   :title="subtasksExpanded ? 'Subtasks einklappen' : 'Subtasks ausklappen'"
                              >
                                   {{ subtasksExpanded ? '▲' : '▼' }}
                              </button>
                         </div>
                    </div>
               </div>

               <!-- Right: Edit Icon + Action Buttons -->
               <div class="task-right" @click.stop>
                    <button class="icon-btn edit-btn" @click="openEditModal" title="Bearbeiten">
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                         </svg>
                    </button>

                    <!-- PROJECTS: Different button logic -->
                    <template v-if="isProject">
                         <button v-if="!props.task.completed" class="btn btn-primary btn-sm action-btn"
                                 @click="openProjectCompleteModal">
                              Abschließen
                         </button>
                         <div v-else class="completed-badge">
                              ✓
                         </div>
                    </template>

                    <!-- REGULAR TASKS: Standard logic -->
                    <template v-else-if="props.task.completed">
                         <button class="btn btn-warning btn-sm action-btn"
                                 @click="handleMarkDirty">
                              Dreckig
                         </button>
                    </template>
                    <template v-else>
                         <div class="action-buttons">
                              <button class="btn btn-success btn-sm action-btn"
                                      @click="handleCompleteTask">
                                   Sauber
                              </button>
                              <button class="btn btn-success btn-sm action-btn-modifier"
                                      @click="openCompletionModal"
                                      title="Aufwand anpassen">
                                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="17 11 12 6 7 11"></polyline>
                                        <polyline points="17 18 12 13 7 18"></polyline>
                                   </svg>
                              </button>
                         </div>
                    </template>
               </div>
          </div>

          <!-- SUBTASKS SECTION (nur für Parent Tasks, eingeklappt) -->
          <div v-if="!props.task.parent_task_id && subtasks.length > 0 && subtasksExpanded" class="subtasks-section">
               <div class="subtasks-header-row">
                    <button
                         v-if="completedSubtasksCount > 0"
                         class="btn btn-sm btn-outline-secondary reset-subtasks-btn"
                         @click="handleResetSubtasks"
                         title="Alle Subtasks zurücksetzen"
                    >
                         ↺ Reset
                    </button>
                    <button
                         class="btn btn-sm btn-outline-primary manage-subtasks-btn"
                         @click="openSubtaskManagementModal"
                    >
                         ⚙ Verwalten
                    </button>
               </div>

               <div class="subtasks-list">
                         <!-- DAILY TASKS: Flache Liste (alle sind Bonus) -->
                         <template v-if="props.task.task_type === 'daily'">
                              <SubtaskItem
                                   v-for="subtask in subtasks"
                                   :key="subtask.task_id"
                                   :task="subtask"
                              />
                         </template>

                         <!-- REGULAR/RECURRING/PROJECTS: Gruppiert nach Modus -->
                         <template v-else>
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
                         </template>
               </div>
          </div>

          <!-- Task Completion Modal -->
          <TaskCompletionModal
               v-if="showCompletionModal"
               :taskTitle="props.task.title"
               :defaultEffort="props.task.effort"
               :isLoading="isCompletingTask"
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
               :isLoading="isLoggingWork"
               @close="closeProjectWorkModal"
               @confirm="handleProjectWork"
          />

          <!-- Project Complete Modal -->
          <ProjectCompleteModal
               v-if="showProjectCompleteModal"
               :projectTitle="props.task.title"
               :isLoading="isCompletingProject"
               @close="closeProjectCompleteModal"
               @confirm="handleCompleteProject"
          />

          <!-- Task Edit Modal -->
          <TaskEditModal
               v-if="showEditModal"
               :task="props.task"
               @close="closeEditModal"
               @confirm="handleEditConfirm"
               @delete="handleEditDelete"
               @assign="handleEditAssign"
               @manage-subtasks="handleEditManageSubtasks"
          />
     </div>

</template>

<style scoped>
/* Horizontal List Layout */
.task-card {
     border: 1px solid var(--color-border);
     border-radius: var(--radius-md);
     background: var(--color-background-elevated);
     box-shadow: var(--shadow-sm);
     transition: all var(--transition-base);
     overflow: hidden;
     display: flex;
     flex-direction: column;
     width: 100%;
}

.task-card:hover {
     box-shadow: var(--shadow-md);
     border-color: var(--color-primary);
}

.task-card.has-assignment {
     border-width: 2px;
}

/* Main Horizontal Layout */
.task-card-main {
     display: flex;
     align-items: center;
     justify-content: space-between;
     padding: 0.75rem 1rem;
     gap: 1rem;
}

/* Left Side: Expand + Title + Badges */
.task-left {
     display: flex;
     align-items: center;
     gap: 0.5rem;
     flex: 1;
     min-width: 0;
}

.expand-indicator {
     background: transparent;
     border: none;
     color: var(--color-text-secondary);
     opacity: 0.5;
     font-size: 0.625rem;
     cursor: pointer;
     padding: 0.125rem 0.25rem;
     display: inline-flex;
     align-items: center;
     justify-content: center;
     flex-shrink: 0;
     transition: all var(--transition-base);
     border-radius: var(--radius-sm);
}

.expand-indicator:hover {
     opacity: 0.8;
     background: var(--color-background-muted);
}

.task-info-block {
     display: flex;
     flex-direction: column;
     gap: 0.25rem;
     flex: 1;
     min-width: 0;
}

.task-title {
     font-size: 0.9375rem;
     font-weight: 600;
     color: var(--color-text-primary);
     margin: 0;
     line-height: 1.3;
     word-wrap: break-word;
     overflow-wrap: break-word;
}

.task-meta {
     display: flex;
     align-items: center;
     gap: 0.375rem;
     flex-wrap: wrap;
}

.meta-badge {
     display: inline-flex;
     align-items: center;
     padding: 0.125rem 0.5rem;
     border-radius: var(--radius-sm);
     font-size: 0.6875rem;
     font-weight: 600;
     white-space: nowrap;
}

.effort-badge {
     background: var(--bs-primary);
     color: white;
}

.type-badge-one-time {
     background: var(--bs-secondary);
     color: white;
}

.type-badge-project {
     background: var(--bs-info);
     color: white;
}

.type-badge-daily {
     background: var(--bs-warning);
     color: white;
}

.subtasks-badge {
     background: var(--color-background-muted);
     color: var(--color-text-secondary);
     border: 1px solid var(--color-border);
}

.due-badge {
     background: var(--color-warning-light);
     color: white;
}

/* Right Side: Edit Icon + Action Buttons */
.task-right {
     display: flex;
     align-items: center;
     gap: 0.5rem;
     flex-shrink: 0;
}

.edit-btn {
     background: transparent;
     border: 1px solid var(--color-border);
     border-radius: var(--radius-sm);
     padding: 0.375rem;
     cursor: pointer;
     display: flex;
     align-items: center;
     justify-content: center;
     transition: all var(--transition-base);
     color: var(--color-text-secondary);
     flex-shrink: 0;
}

.edit-btn svg {
     width: 16px;
     height: 16px;
}

.edit-btn:hover {
     background: var(--color-background-muted);
     color: var(--color-primary);
     border-color: var(--color-primary);
     transform: scale(1.05);
}

.action-buttons {
     display: flex;
     gap: 0.25rem;
}

.action-btn {
     font-size: 0.8125rem;
     padding: 0.5rem 1rem;
     font-weight: 500;
     border: none;
     border-radius: var(--radius-md);
     cursor: pointer;
     transition: all var(--transition-base);
     white-space: nowrap;
}

.action-btn-modifier {
     padding: 0.5rem 0.625rem;
     font-size: 0.8125rem;
     font-weight: 500;
     border: none;
     border-radius: var(--radius-md);
     cursor: pointer;
     transition: all var(--transition-base);
     display: flex;
     align-items: center;
     justify-content: center;
}

.action-btn-modifier svg {
     display: block;
}

.btn-success:hover,
.action-btn-modifier:hover {
     opacity: 0.9;
     transform: scale(1.02);
}

.completed-badge {
     display: flex;
     align-items: center;
     justify-content: center;
     padding: 0.5rem 1rem;
     background: var(--bs-success);
     color: white;
     border-radius: var(--radius-md);
     font-size: 0.875rem;
     font-weight: 600;
}

/* Subtasks Section - Eingeklappte Liste mit Einrückung */
.subtasks-section {
     border-top: 1px solid var(--color-border);
     background: var(--color-background);
     padding: 0.75rem 1rem;
     padding-left: 3rem; /* Einrückung für Subtasks */
}

.subtasks-header-row {
     display: flex;
     align-items: center;
     gap: 0.5rem;
     margin-bottom: 0.75rem;
}

.reset-subtasks-btn,
.manage-subtasks-btn {
     padding: 0.25rem 0.625rem;
     font-size: 0.75rem;
     line-height: 1.4;
     flex-shrink: 0;
}

.subtasks-list {
     display: flex;
     flex-direction: column;
     gap: 0.5rem;
}

/* Subtask Groups (by points mode) */
.subtask-group {
     display: flex;
     flex-direction: column;
     gap: 0.25rem;
}

.subtask-group-header {
     display: flex;
     align-items: center;
     justify-content: space-between;
     padding: 0.25rem 0.375rem;
     background: var(--color-background-muted);
     border-radius: var(--radius-sm);
     margin-bottom: 0.25rem;
}

.subtask-group-badge {
     font-size: 0.625rem;
     padding: 0.125rem 0.375rem;
     border-radius: var(--radius-sm);
     font-weight: 600;
     text-transform: uppercase;
     letter-spacing: 0.3px;
}

.subtask-group-count {
     font-size: 0.625rem;
     font-weight: 600;
     color: var(--color-text-secondary);
     background: var(--color-background-elevated);
     padding: 0.125rem 0.375rem;
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

/* Mobile Responsive */
@media (max-width: 640px) {
     .task-card-main {
          padding: 0.625rem 0.75rem;
          gap: 0.75rem;
     }

     .task-title {
          font-size: 0.875rem;
     }

     .meta-badge {
          font-size: 0.625rem;
          padding: 0.1rem 0.375rem;
     }

     .action-btn {
          font-size: 0.75rem;
          padding: 0.4rem 0.75rem;
     }

     .action-btn-modifier {
          padding: 0.4rem 0.5rem;
     }

     .edit-btn {
          padding: 0.3rem;
     }

     .edit-btn svg {
          width: 14px;
          height: 14px;
     }

     .subtasks-section {
          padding-left: 2rem;
     }
}
</style>