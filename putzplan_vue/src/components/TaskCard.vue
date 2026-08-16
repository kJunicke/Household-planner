<script setup lang="ts">
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { scheduleOf, isOverdue, formatPostponeDate } from '@/lib/taskSchedule'
import { ref, computed } from "vue";
import TaskCompletionModal from './TaskCompletionModal.vue'
import TaskAssignmentModal from './TaskAssignmentModal.vue'
import SubtaskManagementModal from './SubtaskManagementModal.vue'
import SubtaskItem from './SubtaskItem.vue'
import ProjectWorkModal from './ProjectWorkModal.vue'
import ProjectCompleteModal from './ProjectCompleteModal.vue'
import TaskEditModal from './TaskEditModal.vue'
import TaskPostponeModal from './TaskPostponeModal.vue'
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
const showPostponeModal = ref(false)
const showProjectWorkModal = ref(false)
const showProjectCompleteModal = ref(false)
const subtasksExpanded = ref(false) // Standardmäßig eingeklappt für kompakteres Design

// Loading states for async operations in modals
const isCompletingTask = ref(false)
const isCompletingProject = ref(false)
const isLoggingWork = ref(false)
const isQuickCompleting = ref(false)

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

// Folge-Dialog-Muster wie bei Zuweisen und Subtasks: Bearbeiten schließt, Verschieben öffnet.
const handleEditPostpone = () => {
     showEditModal.value = false
     showPostponeModal.value = true
}

const closePostponeModal = () => {
     showPostponeModal.value = false
}

const handlePostponeConfirm = async (targetDate: string) => {
     const success = await taskStore.postponeTask(props.task.task_id, targetDate)
     if (success) showPostponeModal.value = false
}

const handleDeleteTask = async () => {
     try {
          await taskStore.deleteTask(props.task.task_id)

     } catch (error) {
          console.error('Fehler beim Löschen:', error)
     }
}

const handleCompleteTask = async () => {
     isQuickCompleting.value = true
     const success = await taskStore.completeTask(props.task.task_id)
     isQuickCompleting.value = false
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

const handleCustomCompletion = async (effortOverride: number, note: string) => {
     isCompletingTask.value = true
     const success = await taskStore.completeTask(props.task.task_id, effortOverride, note)
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

// Fälligkeit und Dringlichkeit kommen aus dem taskSchedule-Modul — die Karte
// rechnet selbst nicht mehr mit Datumsdifferenzen, sie formuliert nur noch.
const schedule = computed(() => scheduleOf(props.task))

// Deckel des Rot-Gradienten: ab 14 Tagen Verzug volle Färbung. Reine Darstellung,
// deshalb hier und nicht im Modul.
const OVERDUE_COLOR_CAP_DAYS = 14
const OVERDUE_RGB = [239, 68, 68] as const

// Text für Überfälligkeit (null = kein Überfällig-Badge)
const overdueLabel = computed(() => {
     if (schedule.value.status === 'never-done') return 'Noch nie gemacht'
     if (schedule.value.status !== 'overdue') return null

     const days = schedule.value.daysOverdue ?? 0
     // "Heute dran" statt "Heute fällig": "fällig" gehört zum Countdown einer
     // erledigten Aufgabe. Derselbe Text auf beiden Zuständen wäre der Widerspruch,
     // den diese Umstellung gerade beseitigt.
     if (days === 0) return 'Heute dran'
     return `${days} ${days === 1 ? 'Tag' : 'Tage'} überfällig`
})

// Farbgradient für Überfälligkeit: 0 Tage = neutral, 14+ Tage = full red.
// Hängt am Zustand, nicht am Label — sonst verschiebt eine Textänderung die Farbe.
const overdueColorStyle = computed(() => {
     if (!isOverdue(schedule.value)) return null

     // "Noch nie gemacht" hat keine Tageszahl und ist maximal dringend.
     const intensity = schedule.value.status === 'never-done'
          ? 1
          : Math.min((schedule.value.daysOverdue ?? 0) / OVERDUE_COLOR_CAP_DAYS, 1)

     // Color gradient from light red to strong red, alpha 0.1 bis 0.5.
     // Deckend über Weiß gemischt statt halbdurchlässig: auf einer eingefärbten
     // Karte würde sich sonst die Personenfarbe durch das Badge mischen und der
     // Kontrast der Badge-Schrift wäre nicht mehr vorhersagbar.
     const alpha = 0.1 + (intensity * 0.4)
     const borderAlpha = 0.3 + (intensity * 0.7)
     const [r, g, b] = OVERDUE_RGB.map(c => Math.round(255 + (c - 255) * alpha))

     return {
          backgroundColor: `rgb(${r}, ${g}, ${b})`,
          borderLeft: `3px solid rgba(239, 68, 68, ${borderAlpha})`,
          paddingLeft: '0.375rem',
          borderRadius: 'var(--radius-sm)'
     }
})

// Fälligkeits- oder Completion-Info für erledigte Tasks
// Verschoben: statt Fälligkeit das konkrete Zieldatum. Die Aufgabe steht damit
// in der Erledigt-Sektion, aber erkennbar als verschoben und nicht als erledigt.
const postponedLabel = computed(() => {
     if (schedule.value.status !== 'postponed') return null
     return `Verschoben auf ${formatPostponeDate(schedule.value.postponedUntil!)}`
})

const dueInDays = computed(() => {
     // Verschoben hat kein Erledigungs- und kein Fälligkeitsdatum zu zeigen —
     // sonst stünde bei einer einmaligen Aufgabe "Erledigt am ...", obwohl sie
     // niemand erledigt hat.
     if (schedule.value.status === 'postponed') return null

     if (!props.task.completed || !props.task.last_completed_at) {
          return null
     }

     // ONE-TIME TASKS: Zeige Completion-Datum
     if (props.task.task_type === 'one-time') {
          const dateStr = new Date(props.task.last_completed_at).toLocaleDateString('de-DE', {
               day: '2-digit',
               month: '2-digit',
               year: 'numeric'
          })
          return `Erledigt am ${dateStr}`
     }

     // RECURRING TASKS: Zeige wann wieder fällig
     if (schedule.value.status !== 'upcoming') return null

     // Im Zustand 'upcoming' existiert immer eine Restlaufzeit.
     const daysRemaining = schedule.value.daysUntilDue!

     // <= 0 heißt: die Kadenz ist durch, der nächtliche Cron war nur noch nicht dran.
     // Die Anzeige darf dann veraltet sein, aber nicht der DB widersprechen.
     if (daysRemaining <= 0) return 'Heute fällig'
     if (daysRemaining === 1) return 'Morgen fällig'
     return `Fällig in ${daysRemaining} Tagen`
})

// Assignment Badge - Zeigt Initialen und Namen des zugewiesenen Members
const assignedMember = computed(() => {
     if (!props.task.assigned_to) return null
     return householdStore.householdMembers.find(m => m.user_id === props.task.assigned_to)
})

// --- Zuweisung als Kartenhintergrund (Etappe 2) ------------------------------
// Der Avatar ist von der Karte verschwunden; die Zuständigkeit trägt jetzt der
// Hintergrund in der Personenfarbe. Die Deckkraft ist nicht fest, sondern die
// stärkste, bei der der Aufgabentitel noch klar lesbar bleibt: die Farbe wird
// über den Kartengrund gelegt und die Deckkraft von 0.35 abwärts gesucht, bis
// der Kontrast zwischen Titelfarbe und Ergebnis 7:1 erreicht (WCAG AAA für
// Fließtext). Ohne diese Grenze verschluckt eine dunkle Mitgliedsfarbe den Titel.
const CARD_BASE_RGB = [255, 255, 255] as const   // --color-background-elevated
const TITLE_RGB = [30, 41, 59] as const          // --color-text-primary (#1e293b)
const MIN_TITLE_CONTRAST = 7
const MAX_TINT_ALPHA = 0.35
const MIN_TINT_ALPHA = 0.08

const relativeLuminance = ([r, g, b]: readonly number[]): number => {
     const channel = (v: number) => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
     }
     return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const contrastRatio = (a: readonly number[], b: readonly number[]): number => {
     const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
     return (hi + 0.05) / (lo + 0.05)
}

const hexToRgb = (hex: string): [number, number, number] | null => {
     const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
     if (!m) return null
     const n = parseInt(m[1], 16)
     return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const assignmentTintStyle = computed(() => {
     const color = assignedMember.value?.user_color
     const rgb = color ? hexToRgb(color) : null
     if (!rgb) return {}

     const blend = (alpha: number) =>
          rgb.map((c, i) => CARD_BASE_RGB[i] + (c - CARD_BASE_RGB[i]) * alpha)

     let alpha = MIN_TINT_ALPHA
     for (let a = MAX_TINT_ALPHA; a >= MIN_TINT_ALPHA; a -= 0.01) {
          if (contrastRatio(blend(a), TITLE_RGB) >= MIN_TITLE_CONTRAST) {
               alpha = a
               break
          }
     }

     const [r, g, b] = blend(alpha).map(Math.round)
     return {
          backgroundColor: `rgb(${r}, ${g}, ${b})`,
          borderColor: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.45)`,
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
const subtasks = computed(() => {
     const allSubtasks = taskStore.getSubtasks(props.task.task_id)
     // Filter out "Am Projekt arbeiten" subtask for UI display (still exists in DB for completion tracking)
     if (isProject.value) {
          return allSubtasks.filter(s => s.title !== 'Am Projekt arbeiten')
     }
     return allSubtasks
})
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

const handleDeleteSubtask = async (subtaskId: string) => {
     await taskStore.deleteTask(subtaskId)
}

const handleResetSubtasks = async () => {
     await taskStore.resetSubtasks(props.task.task_id)
}

// PROJECTS - Project-specific handlers
const isProject = computed(() => props.task.task_type === 'project')
const projectEffort = computed(() => isProject.value ? taskStore.getProjectEffort(props.task.task_id) : 0)

// Get "Am Projekt arbeiten" subtask ID for project work documentation
const projectWorkSubtaskId = computed(() => {
     if (!isProject.value) return null
     const allSubtasks = taskStore.getSubtasks(props.task.task_id)
     const workSubtask = allSubtasks.find(s => s.title === 'Am Projekt arbeiten')
     return workSubtask?.task_id || null
})

const openProjectWorkModal = () => {
     showProjectWorkModal.value = true
}

const closeProjectWorkModal = () => {
     showProjectWorkModal.value = false
}

const handleProjectWork = async (effort: number, note: string) => {
     if (!projectWorkSubtaskId.value) {
          console.error('Project work subtask not found')
          return
     }

     isLoggingWork.value = true
     // Complete the "Am Projekt arbeiten" subtask with custom effort and note
     const success = await taskStore.completeTask(projectWorkSubtaskId.value, effort, note)
     isLoggingWork.value = false

     if (success) {
          showProjectWorkModal.value = false
          confetti({
               particleCount: 100,
               spread: 70,
               origin: { y: 0.6 }
          })
          // Immediately reset the subtask so it's always available — nach dem
          // Konfetti, damit das Feedback nicht auf den Server wartet.
          await taskStore.markAsDirty(projectWorkSubtaskId.value)
     }
     // If failed, modal stays open so user can retry
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
     <div class="task-card" :class="{ 'has-assignment': props.task.assigned_to }" :style="assignmentTintStyle">
          <!-- Main Horizontal Layout -->
          <div class="task-card-main" @click="!props.task.parent_task_id && subtasks.length > 0 ? toggleSubtasks() : null" :style="{ cursor: !props.task.parent_task_id && subtasks.length > 0 ? 'pointer' : 'default' }">
               <!-- Left: Assignee + Title + Badges -->
               <!-- Kein Assignee-Avatar mehr: die Zuständigkeit trägt der Kartenhintergrund,
                    Zuweisen läuft über das Bearbeiten-Modal. Der frei gewordene Platz
                    gehört dem Titel. -->
               <div class="task-left">
                    <div class="task-info-block">
                         <h4 class="task-title">{{ props.task.title }}</h4>
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

                              <!-- Subtasks: Fortschritt + Ausklappen in einem Control -->
                              <button
                                   v-if="!props.task.parent_task_id && subtasks.length > 0"
                                   class="subtask-toggle"
                                   @click.stop="toggleSubtasks"
                                   :title="subtasksExpanded ? 'Subtasks einklappen' : 'Subtasks ausklappen'"
                              >
                                   <i class="bi bi-list-check"></i>
                                   {{ completedSubtasksCount }}/{{ subtasks.length }}
                                   <i :class="subtasksExpanded ? 'bi bi-chevron-up' : 'bi bi-chevron-down'"></i>
                              </button>

                              <!-- Overdue indicator with color gradient (only for recurring dirty tasks) -->
                              <span v-if="overdueLabel" class="overdue-badge" :style="overdueColorStyle">
                                   {{ overdueLabel }}
                              </span>

                              <!-- Due in X days (only for recurring completed tasks) -->
                              <span v-if="dueInDays" class="overdue-text">{{ dueInDays }}</span>

                              <!-- Verschoben-Kennzeichen statt Fälligkeit -->
                              <span v-if="postponedLabel" class="meta-badge postponed-badge">
                                   <i class="bi bi-calendar-event"></i>
                                   {{ postponedLabel }}
                              </span>
                         </div>
                    </div>
               </div>

               <!-- Right: Edit Icon + Action Buttons -->
               <div class="task-right" @click.stop.prevent>
                    <button class="icon-btn edit-btn" @click.stop.prevent="openEditModal" title="Bearbeiten">
                         <i class="bi bi-pencil"></i>
                    </button>

                    <!-- PROJECTS: Dokumentieren button instead of Abschließen -->
                    <template v-if="isProject">
                         <button v-if="!props.task.completed" class="btn btn-primary btn-sm action-btn"
                                 @click="openProjectWorkModal"
                                 title="Dokumentieren">
                              <i class="bi bi-pencil-square"></i>
                         </button>
                         <div v-else class="completed-badge">
                              ✓
                         </div>
                    </template>

                    <!-- REGULAR TASKS: Standard logic -->
                    <!-- Reihenfolge nach „wahrscheinlichste Aktion ganz rechts":
                         erledigt → „wieder dreckig" außen, offen → Abschließen außen. -->
                    <template v-else-if="props.task.completed">
                         <div class="action-buttons">
                              <button class="action-btn-modifier"
                                      @click="openCompletionModal"
                                      title="Aufwand anpassen">
                                   <i class="bi bi-sliders"></i>
                              </button>
                              <!-- Trotzdem geputzt: Quick + Modal-Option -->
                              <button class="btn btn-success btn-sm action-btn"
                                      @click="handleCompleteTask"
                                      :disabled="isQuickCompleting"
                                      title="Trotzdem geputzt">
                                   <i v-if="isQuickCompleting" class="bi bi-arrow-repeat spinning"></i>
                                   <i v-else class="bi bi-check-lg"></i>
                              </button>
                              <!-- Dreckig markieren -->
                              <button class="btn btn-warning btn-sm action-btn"
                                      @click="handleMarkDirty"
                                      title="Dreckig markieren">
                                   <i class="bi bi-arrow-counterclockwise"></i>
                              </button>
                         </div>
                    </template>
                    <template v-else>
                         <div class="action-buttons">
                              <button class="action-btn-modifier"
                                      @click="openCompletionModal"
                                      title="Aufwand anpassen">
                                   <i class="bi bi-sliders"></i>
                              </button>
                              <button class="btn btn-success btn-sm action-btn"
                                      @click="handleCompleteTask"
                                      :disabled="isQuickCompleting"
                                      title="Sauber markieren">
                                   <i v-if="isQuickCompleting" class="bi bi-arrow-repeat spinning"></i>
                                   <i v-else class="bi bi-check-lg"></i>
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
               @deleteSubtask="handleDeleteSubtask"
          />

          <!-- Project Work Modal -->
          <ProjectWorkModal
               v-if="showProjectWorkModal"
               :projectTitle="props.task.title"
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
               @postpone="handleEditPostpone"
          />

          <!-- Task Postpone Modal -->
          <TaskPostponeModal
               v-if="showPostponeModal"
               :task="props.task"
               @close="closePostponeModal"
               @confirm="handlePostponeConfirm"
          />
     </div>

</template>

<style scoped>
/* Horizontal List Layout */
.task-card {
     border: 1px solid var(--color-border);
     border-radius: var(--radius-md);
     background: var(--color-background-elevated);
     transition: all var(--transition-base);
     overflow: hidden;
     display: flex;
     flex-direction: column;
     width: 100%;
}

.task-card:hover {
     box-shadow: var(--shadow-sm);
     border-color: var(--color-border-hover);
}

/* Main Horizontal Layout — dieselbe Padding-Kur wie im Einkauf: der Rahmen
   gibt Platz ab, der Inhalt behält seine Größe. */
.task-card-main {
     display: flex;
     align-items: center;
     justify-content: space-between;
     padding: 4px 4px 4px 10px;
     gap: 8px;
     min-height: 44px;
}

/* Left Side: Title + Badges (der Avatar ist entfallen) */
.task-left {
     display: flex;
     align-items: center;
     flex: 1;
     min-width: 0;
}

.task-info-block {
     display: flex;
     flex-direction: column;
     gap: 2px;
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

.overdue-text {
     font-size: 0.75rem;
     color: var(--color-text-muted);
     margin-top: 0.125rem;
     line-height: 1.2;
}

/* Overdue Badge with color gradient */
.overdue-badge {
     display: inline-flex;
     align-items: center;
     justify-content: center;
     padding: 0.125rem 0.5rem;
     font-size: 0.6875rem;
     font-weight: 700;
     color: #7f1d1d;
     white-space: nowrap;
     transition: all var(--transition-base);
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

/* Effort = einziger gefüllter Badge (Schlüsselinfo), Typ-Badges dezent als
   Outline, damit die Meta-Zeile nicht „bunt" wirkt. */
.effort-badge {
     /* Projekt-Token statt --bs-primary: weiß darauf liegt bei 6,1:1 statt bei
        exakt 4,5:1, also mit Reserve für die nächste Farbnuance. */
     background: var(--color-primary);
     color: white;
}

.type-badge-one-time {
     background: transparent;
     color: var(--color-text-secondary);
     border: 1px solid var(--color-border);
}

.type-badge-project {
     background: transparent;
     /* Dunkleres Blau: 6,7:1 auf weißem Grund statt grenzwertiger 4,5:1. */
     color: #1d4ed8;
     border: 1px solid currentColor;
}

.type-badge-daily {
     background: transparent;
     color: #92400e;
     border: 1px solid var(--color-warning);
}

/* Verschoben: dieselbe dezente Outline wie die Typ-Badges — es ist ein Zustands-
   hinweis, keine Warnung. Braunton passend zum Verschieben-Knopf im Modal. */
.postponed-badge {
     background: transparent;
     color: var(--color-warning-contrast);
     border: 1px solid var(--color-warning);
     font-weight: 500;
}

/* Subtask-Toggle: Fortschritt + Chevron in einem tappbaren Control */
.subtask-toggle {
     display: inline-flex;
     align-items: center;
     gap: 0.25rem;
     padding: 0.125rem 0.5rem;
     border-radius: var(--radius-sm);
     font-size: 0.6875rem;
     font-weight: 600;
     white-space: nowrap;
     background: var(--color-background);
     color: var(--color-text-secondary);
     border: 1px solid var(--color-border);
     cursor: pointer;
     transition: all var(--transition-base);
}

.subtask-toggle:hover {
     border-color: var(--color-primary);
     color: var(--color-primary);
}

.subtask-toggle i {
     font-size: 0.7rem;
}

/* Eingefärbte Karte: der Hintergrund trägt die Personenfarbe, also müssen die
   leisen Elemente darauf nachziehen. Der Titel ist über die Deckkraft-Suche
   abgesichert; Sekundärtext bekommt eine dunklere Farbe, und die Umriss-Badges
   bekommen einen deckenden Grund, damit ihr Kontrast unabhängig von der
   Mitgliedsfarbe bleibt. */
.has-assignment .overdue-text {
     color: #334155;
}

.has-assignment .type-badge-one-time,
.has-assignment .type-badge-project,
.has-assignment .type-badge-daily {
     background: var(--color-background-elevated);
}

.has-assignment .type-badge-one-time {
     color: var(--color-text-secondary);
}

/* Right Side: Edit Icon + Action Buttons.
   Alle Knöpfe sind sichtbar schlanker geworden; die Trefferfläche wächst per
   Pseudo-Element nach außen — dasselbe Muster wie in der Einkaufszeile. */
.task-right {
     display: flex;
     align-items: center;
     gap: 10px;
     flex-shrink: 0;
}

.edit-btn {
     position: relative;
     background: transparent;
     border: none;
     border-radius: var(--radius-sm);
     padding: 0;
     width: 30px;
     height: 38px;
     cursor: pointer;
     display: flex;
     align-items: center;
     justify-content: center;
     transition: all var(--transition-base);
     color: var(--color-text-secondary);
     flex-shrink: 0;
}

.edit-btn::after {
     content: '';
     position: absolute;
     inset: -1px -5px;
}

.edit-btn i {
     font-size: var(--font-lg);
}

.edit-btn:hover {
     color: var(--color-primary);
}

.action-buttons {
     display: flex;
     gap: 6px;
}

.action-btn {
     position: relative;
     width: 38px;
     height: 38px;
     min-width: 38px;
     min-height: 38px;
     padding: 0;
     border: none;
     border-radius: var(--radius-md);
     cursor: pointer;
     transition: all var(--transition-base);
     display: flex;
     align-items: center;
     justify-content: center;
}

.action-btn::after {
     content: '';
     position: absolute;
     inset: -1px;
}

.action-btn i {
     font-size: var(--font-lg);
}

/* Secondary action: "Aufwand anpassen" — visually subordinate to the
   primary green complete button so the two are not confused. */
.action-btn-modifier {
     position: relative;
     width: 34px;
     height: 38px;
     min-width: 34px;
     min-height: 38px;
     padding: 0;
     border: 1px solid var(--color-border);
     border-radius: var(--radius-md);
     background: var(--color-background-elevated);
     color: var(--color-text-secondary);
     cursor: pointer;
     transition: all var(--transition-base);
     display: flex;
     align-items: center;
     justify-content: center;
}

.action-btn-modifier::after {
     content: '';
     position: absolute;
     inset: -2px -4px;
}

.action-btn-modifier i {
     font-size: var(--font-md);
}

.action-btn-modifier:hover {
     border-color: var(--color-primary);
     color: var(--color-primary);
     background: var(--color-background);
}

.btn-success:hover {
     opacity: 0.9;
     transform: scale(1.02);
}

/* Loading state for buttons */
.action-btn:disabled {
     opacity: 0.7;
     cursor: not-allowed;
     transform: none;
}

.spinning {
     animation: spin 1s linear infinite;
}

@keyframes spin {
     from {
          transform: rotate(0deg);
     }
     to {
          transform: rotate(360deg);
     }
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
/* Die Einrückung bleibt das Zeichen der Unterordnung — aber als schmale Stufe,
   nicht als Platzfresser. Die Zeilen darin haben dieselbe Dichte wie die
   Aufgabenkarte selbst. */
.subtasks-section {
     border-top: 1px solid var(--color-border);
     background: var(--color-background);
     padding: 6px 4px 6px 16px;
}

.subtasks-header-row {
     display: flex;
     align-items: center;
     gap: 6px;
     margin-bottom: 6px;
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
     gap: 4px;
}

/* Subtask Groups (by points mode) */
.subtask-group {
     display: flex;
     flex-direction: column;
     gap: 4px;
}

.subtask-group-header {
     display: flex;
     align-items: center;
     justify-content: space-between;
     padding: 2px 4px;
     background: var(--color-background-muted);
     border-radius: var(--radius-sm);
     margin-bottom: 2px;
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

/* Weiß auf den hellen Bootstrap-Tönen erreicht nur 1,96:1 (Info) bzw. 1,6:1
   (Warning). Die Gruppen-Badges nehmen deshalb die kontrastfeste Stufe der
   Design-Tokens — dieselbe Farbsemantik, nur dunkel genug für weiße Schrift. */
.badge-checklist {
     background: var(--color-info-contrast);
     color: white;
}

.badge-deduct {
     background: var(--color-warning-contrast);
     color: white;
}

.badge-bonus {
     background: var(--color-success-contrast);
     color: white;
}

/* Mobile Responsive */
@media (max-width: 640px) {
     .task-title {
          font-size: 0.875rem;
     }

     .meta-badge {
          font-size: 0.625rem;
          padding: 0.1rem 0.375rem;
     }

     .subtasks-section {
          padding-left: 12px;
     }
}
</style>