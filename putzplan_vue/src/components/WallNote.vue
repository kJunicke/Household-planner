<script setup lang="ts">
/**
 * Ein Zettel an der Pinnwand (Pinnwand-Redesign, Etappe 2).
 *
 * Der Zettel bestimmt sein Aussehen selbst, aber **nicht seinen Platz**: Breite,
 * Position und Stapelreihenfolge setzt `WallView` per DOM, weil die Höhe erst
 * nach dem Setzen der Breite messbar ist. Deshalb ist das Wurzelelement nach
 * außen freigegeben.
 *
 * Bewusst nicht hier:
 * - kein Name, keine Initialen, kein Badge — die Zuständigkeit ist allein die
 *   farbige Umrandung in `household_members.user_color`
 * - keine Kategorie, keine Überschrift — der Typ ist am Papier und an der
 *   Befestigung erkennbar (Reißzwecke / Klebeband / Büroklammern)
 * - nur EIN sichtbarer Knopf: Bearbeiten. Die bis zu sieben Icon-Buttons der
 *   alten Karte entfallen; die Folgedialoge des Bearbeiten-Modals bleiben aber
 *   vollständig erreichbar.
 * - kein Antippen der Fläche. Aufklappen von Unteraufgaben, Abreiß-Geste und
 *   Long-Press kommen in späteren Etappen.
 */
import { computed, ref } from 'vue'
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { scheduleOf } from '@/lib/taskSchedule'
import { kindOfTaskType, rotationOf } from '@/lib/wallLayout'
import TaskEditModal from './TaskEditModal.vue'
import TaskAssignmentModal from './TaskAssignmentModal.vue'
import SubtaskManagementModal from './SubtaskManagementModal.vue'
import TaskPostponeModal from './TaskPostponeModal.vue'

const props = defineProps<{ task: Task }>()

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()

/** Wurzelelement für das Layout der Wand (Breite setzen, Höhe messen, FLIP). */
const root = ref<HTMLElement | null>(null)
defineExpose({ root })

const kind = computed(() => kindOfTaskType(props.task.task_type))
const isProject = computed(() => props.task.task_type === 'project')

/** Deterministisch aus der `task_id` — nach jedem Neuladen dieselbe Neigung. */
const rotation = computed(() => rotationOf(props.task.task_id))

/**
 * Personenfarbe als Umrandung — unverändert so, wie das Mitglied sie gewählt
 * hat. Es wird zur Laufzeit **nichts** umgefärbt, aufgehellt oder auf eine
 * Palette gerundet: die gewählte Farbe muss die angezeigte sein.
 *
 * `null` heißt „niemand zuständig". Dann bleibt `--owner` ungesetzt und die
 * CSS-Rückfallfarbe greift (siehe `--owner-none` unten).
 */
const ownerColor = computed(() => {
  if (!props.task.assigned_to) return null
  const member = householdStore.householdMembers.find(m => m.user_id === props.task.assigned_to)
  return member?.user_color || null
})

/**
 * `--owner` wird nur gesetzt, wenn es wirklich eine Person gibt. Ohne die
 * Eigenschaft greift in jeder Regel der zweite Parameter von
 * `var(--owner, …)` — der zurücktretende Rand.
 */
const noteStyle = computed((): Record<string, string> => {
  const style: Record<string, string> = { transform: `rotate(${rotation.value.toFixed(2)}deg)` }
  if (ownerColor.value) style['--owner'] = ownerColor.value
  return style
})

const schedule = computed(() => scheduleOf(props.task))

/**
 * Der Rückstand — so knapp wie möglich, weil er neben dem Punktwert in der
 * Fußzeile steht und jede Zeile Höhe kostet.
 *
 * Das Wort „überfällig" fehlt bewusst: die rote Farbe sagt es bereits, der
 * Text sagt nur noch, wie lange. Aus demselben Grund heißt „noch nie gemacht"
 * hier nur „nie" — der Zustand ist selten genug, dass er auffällt, und lang
 * genug beschrieben durch das Rot daneben.
 *
 * Tägliche Aufgaben tragen hier nichts: dass sie täglich sind, steht am
 * gelben Papier und am Klebestreifen. Ein Wort daneben wäre Doppelung.
 */
const metaLabel = computed((): string | null => {
  if (props.task.task_type === 'daily') return null
  if (schedule.value.status === 'never-done') return 'nie'
  if (schedule.value.status === 'overdue') {
    const days = schedule.value.daysOverdue ?? 0
    if (days === 0) return 'heute'
    return `${days} ${days === 1 ? 'Tag' : 'Tage'}`
  }
  return null
})

// --- Bearbeiten und seine Folgedialoge --------------------------------------
// Der Zettel zeigt nur den Bearbeiten-Knopf. Zuweisen, Unteraufgaben und
// Verschieben hängen unverändert am bestehenden Modal.

const showEditModal = ref(false)
const showAssignmentModal = ref(false)
const showSubtaskManagementModal = ref(false)
const showPostponeModal = ref(false)

const subtasks = computed(() => {
  const all = taskStore.getSubtasks(props.task.task_id)
  // "Am Projekt arbeiten" ist Buchhaltung, kein Zettel — wie in der alten Karte.
  return isProject.value ? all.filter(s => s.title !== 'Am Projekt arbeiten') : all
})

/** Folge-Dialog-Muster wie in der alten Karte: Bearbeiten schließt, der nächste öffnet. */
const openFollowUp = (which: 'assign' | 'subtasks' | 'postpone') => {
  showEditModal.value = false
  if (which === 'assign') showAssignmentModal.value = true
  else if (which === 'subtasks') showSubtaskManagementModal.value = true
  else showPostponeModal.value = true
}

const handleEditConfirm = async (updates: Partial<Task>) => {
  await taskStore.updateTask(props.task.task_id, updates)
  showEditModal.value = false
}

const handleEditDelete = async () => {
  showEditModal.value = false
  await taskStore.deleteTask(props.task.task_id)
}

const handleAssignmentConfirm = async (userId: string | null, permanent: boolean) => {
  await taskStore.assignTask(props.task.task_id, userId, permanent)
  showAssignmentModal.value = false
}

const handleCreateSubtask = async (subtaskData: {
  title: string
  effort: 1 | 2 | 3 | 4 | 5
  subtask_points_mode: 'checklist' | 'deduct' | 'bonus'
}) => {
  const maxOrderIndex = subtasks.value.reduce((max, s) => Math.max(max, s.order_index), 0)
  await taskStore.createTask({
    title: subtaskData.title,
    effort: subtaskData.effort,
    subtask_points_mode: subtaskData.subtask_points_mode,
    recurrence_days: props.task.recurrence_days, // erbt vom Elternteil
    task_type: props.task.task_type,
    parent_task_id: props.task.task_id,
    order_index: maxOrderIndex + 1
  })
}

const handleUpdateSubtaskPointsMode = async (
  subtaskId: string,
  mode: 'checklist' | 'deduct' | 'bonus'
) => {
  await taskStore.updateTask(subtaskId, { subtask_points_mode: mode })
}

const handleDeleteSubtask = async (subtaskId: string) => {
  await taskStore.deleteTask(subtaskId)
}

const handlePostponeConfirm = async (targetDate: string) => {
  const success = await taskStore.postponeTask(props.task.task_id, targetDate)
  if (success) showPostponeModal.value = false
}
</script>

<template>
  <div
    ref="root"
    class="zettel"
    :class="`zettel--${kind}`"
    :style="noteStyle"
  >
    <!-- Befestigung: Reißzwecke / Klebeband / Büroklammern.
         Sie ist das Typ-Signal, deshalb kein Text daneben. -->
    <span v-if="kind === 'open'" class="pin" aria-hidden="true"></span>
    <span v-else-if="kind === 'daily'" class="tape" aria-hidden="true"></span>
    <template v-else>
      <span class="clip clip--l" aria-hidden="true"></span>
      <span class="clip clip--r" aria-hidden="true"></span>
    </template>

    <p class="title">{{ props.task.title }}</p>

    <!-- Fußzeile im normalen Fluss: Punktwert und Rückstand können dem Titel
         damit strukturell nicht mehr ins Gehege kommen, egal wie lang er ist. -->
    <div class="foot">
      <span class="points">{{ props.task.effort }} P</span>
      <span v-if="metaLabel" class="meta">{{ metaLabel }}</span>
    </div>

    <button class="edit" title="Aufgabe bearbeiten" @click="showEditModal = true">
      <i class="bi bi-pencil" aria-hidden="true"></i>
    </button>

    <TaskEditModal
      v-if="showEditModal"
      :task="props.task"
      @close="showEditModal = false"
      @confirm="handleEditConfirm"
      @delete="handleEditDelete"
      @assign="openFollowUp('assign')"
      @manage-subtasks="openFollowUp('subtasks')"
      @postpone="openFollowUp('postpone')"
    />

    <TaskAssignmentModal
      v-if="showAssignmentModal"
      :currentAssignedTo="props.task.assigned_to"
      :currentPermanent="props.task.assignment_permanent"
      :householdMembers="householdStore.householdMembers"
      @close="showAssignmentModal = false"
      @confirm="handleAssignmentConfirm"
    />

    <SubtaskManagementModal
      v-if="showSubtaskManagementModal"
      :parentTask="props.task"
      :existingSubtasks="subtasks"
      @close="showSubtaskManagementModal = false"
      @createSubtask="handleCreateSubtask"
      @updateSubtaskPointsMode="handleUpdateSubtaskPointsMode"
      @deleteSubtask="handleDeleteSubtask"
    />

    <TaskPostponeModal
      v-if="showPostponeModal"
      :task="props.task"
      @close="showPostponeModal = false"
      @confirm="handlePostponeConfirm"
    />
  </div>
</template>

<style scoped>
/* Position, Breite und z-index setzt WallView per DOM — hier steht nur das
   Aussehen. `left`/`top` beginnen bei 0, damit ein noch nicht gepackter Zettel
   nicht irgendwo aufblitzt. */
.zettel {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  flex-direction: column;
  /* Rand ohne Zuständige: derselbe Grauton, aber auf 45 % gegen das Papier
     gemischt. Die Umrandung ist die EINZIGE Person-Information am Zettel,
     also darf „niemand zuständig" nie kräftiger wirken als „X ist zuständig".
     Vorher trat genau das ein: `--pw-free` erreichte 3,87:1 gegen das Papier,
     die blasseste vergebene Personenfarbe (#4A90E2) nur 3,23:1 — „niemand"
     las sich lauter als „jemand". Jetzt sind es 1,71:1 gegen Papier und
     1,28:1 gegen Kork, also klar zurücktretend gegenüber jeder Personenfarbe.

     Bewusst NICHT die Lösung des eigentlichen Problems: dass eine helle
     `user_color` auf Kork wenig hergibt, klärt die kuratierte Palette samt
     Migration in einer eigenen Etappe. Hier wird nur der farblose Zustand
     leiser gedreht, keine gewählte Farbe angetastet. */
  --owner-none: color-mix(in srgb, var(--pw-free) 45%, var(--pw-paper));
  border: 2px solid var(--owner, var(--owner-none));
  border-radius: 3px;
  background: var(--pw-paper);
  color: var(--pw-ink);
  box-shadow: var(--pw-shadow);
  /* Rechts bleibt Platz für den Bearbeiten-Knopf, der als einziges Element
     noch absolut sitzt. Unten reserviert nichts mehr Platz — die Fußzeile
     steht im Fluss. */
  padding: 6px 36px 5px 8px;
  min-height: 44px;
  text-align: left;
  will-change: transform;
}

.title {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.15px;
  /* NIEMALS innerhalb eines Wortes umbrechen. Ein Zettel, auf dem
     "Staub-\nsaugen" steht, sieht aus wie ein Fehler. Umbrochen wird
     ausschließlich an Wortgrenzen; die drei Eigenschaften stehen ausdrücklich
     da, damit auch eine geerbte Regel von weiter oben sie nicht wieder
     einschaltet. */
  overflow-wrap: normal;
  word-break: normal;
  hyphens: none;
  /* Letzter Ausweg für ein EINZELNES Wort, das breiter ist als die ganze
     Wand: es wird abgeschnitten, nicht umgebrochen. `overflow` sitzt am
     Titel und nicht am Zettel, damit Reißzwecke und Klebeband — die über
     den oberen Rand hinausragen — sichtbar bleiben.

     Die Ellipse ist nicht Kosmetik, sondern die Ehrlichkeit dazu: ohne sie
     endet der Titel stumm mitten im Wort und sieht aus wie der vollständige
     Text. Sie greift ausschließlich in diesem Fall — solange der Titel passt
     oder an Wortgrenzen umbricht, überläuft nichts und es erscheint keine. */
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Fußzeile: Punktwert links, Rückstand daneben — eine gemeinsame Zeile statt
   zwei, und im Fluss statt absolut. */
.foot {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.points {
  color: var(--pw-ink-soft);
  opacity: 0.85;
}

/* Rot trägt die Bedeutung „überfällig" — deshalb steht daneben nur noch die
   Dauer, nicht das Wort. */
.meta {
  color: var(--color-danger);
}

/* Nur für die Breitenmessung durch WallView: Titel einzeilig, damit
   `width: max-content` die natürliche Zettelbreite ergibt.
   Eigene Klasse neben `--measuring`, weil die zweite Messung (`min-content`,
   die Breite, unter der ein Wort abgeschnitten würde) dieselbe entdrehte Lage
   braucht, aber gerade den Umbruch NICHT abschalten darf — mit `nowrap` wäre
   `min-content` identisch mit `max-content` und die Untergrenze wertlos. */
.zettel--single-line .title {
  white-space: nowrap;
}

/* Während der Messung steht der Zettel gerade.
   `getBoundingClientRect()` liefert das Rechteck NACH der Transformation: ein
   um 3° geneigter Zettel misst sich um `Höhe × sin(3°)` breiter, als er ist,
   und zwar je nach Zettel unterschiedlich viel. Die Neigung wird deshalb für
   den Moment der Messung abgeschaltet — `!important`, weil die Neigung als
   Inline-Style am Element hängt. */
.zettel--measuring {
  transform: none !important;
}

/* Die einzige sichtbare Aktion. Oben rechts, weil unten rechts das Eselsohr
   der späteren Abreiß-Geste liegt. 40 px wie in dichten Listen — 48 px wären
   auf einem 48-px-Zettel die ganze Fläche. */
.edit {
  position: absolute;
  top: 0;
  right: 0;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--pw-ink-soft);
  font-size: 15px;
  line-height: 1;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.edit:active {
  transform: translate(1px, 1px);
}

/* --- Typ 1: offene Putzaufgabe — weißes Papier, Reißzwecke ---------------- */
.pin {
  position: absolute;
  top: -7px;
  left: 50%;
  margin-left: -7px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  /* Dieselbe Rückfallregel wie beim Rand — die Reißzwecke ist Teil derselben
     Aussage. Ihre eigene Tintenkontur hält sie auch farblos sichtbar. */
  background: var(--owner, var(--owner-none));
  border: 2px solid var(--pw-line);
  box-shadow:
    1px 2px 0 rgba(0, 0, 0, 0.28),
    inset -2px -2px 0 rgba(0, 0, 0, 0.18);
}

/* --- Typ 2: tägliche Aufgabe — gelber Notizblock, Klebestreifen ----------- */
.zettel--daily {
  background: var(--pw-paper-day);
  border-radius: 11px;
  padding-top: 10px;
}

.zettel--daily .title {
  font-size: 12.5px;
}

.tape {
  position: absolute;
  top: -9px;
  left: 50%;
  margin-left: -23px;
  width: 46px;
  height: 16px;
  background: rgba(255, 255, 255, 0.62);
  border: 1.5px solid rgba(36, 31, 26, 0.42);
  transform: rotate(-4deg);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.12);
}

/* --- Typ 3: Projekt — Packpapier, doppelte Büroklammer, kantig ------------ */
.zettel--project {
  background: var(--pw-paper-proj);
  background-image: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.045) 0 1px,
    transparent 1px 7px
  );
  border-width: 3px;
  border-radius: 0;
  box-shadow: 4px 4px 0 var(--pw-line);
  padding-top: 11px;
}

.zettel--project .title {
  font-size: 15px;
}

.clip {
  position: absolute;
  top: -8px;
  width: 15px;
  height: 20px;
  border: 2.5px solid var(--pw-line);
  border-radius: 3px;
  background: #b9b3a6;
  box-shadow: 1px 2px 0 rgba(0, 0, 0, 0.25);
}

.clip::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 4px;
  right: 3px;
  bottom: 7px;
  border: 2px solid rgba(36, 31, 26, 0.55);
  border-radius: 2px;
}

.clip--l {
  left: 12px;
  transform: rotate(-7deg);
}

.clip--r {
  right: 12px;
  transform: rotate(6deg);
}
</style>
