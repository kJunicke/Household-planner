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
 * - die Abreiß-Geste am Eselsohr und der Long-Press (Etappe 4).
 *
 * **Antippen der Fläche** klappt die Unteraufgaben auf — aber nur bei einem
 * Zettel, der welche hat. Ein Zettel ohne Unteraufgaben reagiert auf ein
 * Antippen gar nicht; dort gibt es nur den Bearbeiten-Knopf.
 *
 * Wo er hinkommt, entscheidet der Zettel weiterhin nicht selbst: das Aufklappen
 * wird nur **gemeldet** (`toggle`), den Zustand hält `WallView`. Sie muss ihn
 * kennen, bevor sie packt — ein aufgeklappter Zettel bekommt die volle
 * Wandbreite, und die Zettel darunter müssen dafür weichen.
 */
import { computed, ref } from 'vue'
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { scheduleOf } from '@/lib/taskSchedule'
import { kindOfTaskType, rotationOf, subtaskColumns } from '@/lib/wallLayout'
import TaskEditModal from './TaskEditModal.vue'
import TaskAssignmentModal from './TaskAssignmentModal.vue'
import SubtaskManagementModal from './SubtaskManagementModal.vue'
import TaskPostponeModal from './TaskPostponeModal.vue'

const props = defineProps<{ task: Task; expanded?: boolean }>()
const emit = defineEmits<{ toggle: [taskId: string] }>()

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()

/** Wurzelelement für das Layout der Wand (Breite setzen, Höhe messen, FLIP). */
const root = ref<HTMLElement | null>(null)
defineExpose({ root })

const kind = computed(() => kindOfTaskType(props.task.task_type))
const isProject = computed(() => props.task.task_type === 'project')

// --- Unteraufgaben -----------------------------------------------------------

const subtasks = computed(() => {
  const all = taskStore.getSubtasks(props.task.task_id)
  // "Am Projekt arbeiten" ist Buchhaltung, kein Zettel — wie in der alten Karte.
  return isProject.value ? all.filter(s => s.title !== 'Am Projekt arbeiten') : all
})

/** Nur ein Zettel MIT Unteraufgaben klappt auf. */
const hasSubtasks = computed(() => subtasks.value.length > 0)

/**
 * **Ein täglicher Zettel hat keinen Fortschritt — das ist Absicht, kein Bug.**
 *
 * An einem `daily`-Elternteil ist als Punktmodus ausschließlich `bonus`
 * erlaubt, und `bonus`-Unteraufgaben sind dort als *wiederholbare
 * eigenständige Belohnungen* modelliert: sie werden nie zurückgesetzt, weil der
 * Elternteil nie „fertig" wird. Genau deshalb setzt `taskStore.completeTask`
 * bei ihnen `completed` NICHT (siehe dort: `isChecklistSubtask ||
 * task.task_type !== 'daily'`).
 *
 * Wer das für einen Fehler hält und „repariert", bekommt ein Zettelchen, das
 * für immer durchgestrichen bleibt, und ein `7 / 7`, das bis in alle Ewigkeit
 * dasteht. Das ist schlechter als der Ist-Zustand.
 *
 * Die Folge für diesen Zettel: **kein Fortschrittszähler und kein
 * Durchstreichen.** „3 / 7" hieße „noch vier übrig" — bei wiederholbaren
 * Belohnungen gibt es kein Übrig. Die Zettelchen bleiben dauerhaft abreißbar;
 * dass ein Abreißen angekommen ist, sagt eine kurze Rückmeldung
 * (`recentlyTorn`) und nichts Bleibendes.
 */
const tracksProgress = computed(() => props.task.task_type !== 'daily')

const doneSubtasks = computed(() => subtasks.value.filter(s => s.completed).length)

/** Drei Spalten nur bei durchweg kurzen Titeln, sonst zwei. */
const columns = computed(() => subtaskColumns(subtasks.value.map(s => s.title)))

/**
 * Antippen der Fläche. Der Zettel entscheidet hier nur, **ob** überhaupt etwas
 * passiert; das Aufklappen selbst gehört der Wand, weil sie neu packen muss.
 */
const onSurfaceTap = () => {
  if (!hasSubtasks.value) return
  emit('toggle', props.task.task_id)
}

/**
 * Ein Zettelchen abreißen = die Unteraufgabe erledigen.
 *
 * Der Doppeltipp-Schutz sitzt **synchron** in `taskStore.completeTask`: dort
 * wird `completionsInFlight` geprüft und noch vor dem ersten `await` gesetzt,
 * ein zweiter Tap im selben Tick kommt also nicht durch. Hier steht bewusst
 * KEIN eigenes `:disabled` — das Attribut schreibt Vue erst im nächsten Tick
 * und schützt gegen drei synchrone Taps nicht.
 *
 * Punkte je nach `subtask_points_mode` der Unteraufgabe: `checklist` = 0,
 * `deduct` = wird vom Elternaufwand abgezogen, `bonus` = zusätzlich. Gerechnet
 * wird das ausschließlich in der Edge Function `complete-task`.
 */
const tearSubtask = (subtaskId: string) => {
  void taskStore.completeTask(subtaskId)
  markTorn(subtaskId)
}

/**
 * Kurze, **vergängliche** Rückmeldung auf ein Abreißen.
 *
 * Sie ist der einzige Beleg an einem täglichen Zettel, dass der Tipp angekommen
 * ist — dort darf nichts Bleibendes stehen (siehe `tracksProgress`). An allen
 * anderen Zetteln läuft sie zusätzlich zum Durchstreichen und überbrückt die
 * Zeit, bis der Store den Zustand angewandt hat.
 *
 * Die 700 ms sind gesetzt, nicht gemessen: etwas länger als die 600 ms der
 * Animation, damit sie nicht mitten im Bild abgeschnitten wird.
 */
const recentlyTorn = ref(new Set<string>())

const markTorn = (subtaskId: string) => {
  recentlyTorn.value = new Set(recentlyTorn.value).add(subtaskId)
  setTimeout(() => {
    const next = new Set(recentlyTorn.value)
    next.delete(subtaskId)
    recentlyTorn.value = next
  }, 700)
}

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
    :class="[`zettel--${kind}`, { 'zettel--tappable': hasSubtasks }]"
    :style="noteStyle"
    @click="onSurfaceTap"
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
      <!-- Fortschritt am EINGEKLAPPTEN Zettel: „3 / 7" ohne Aufklappen. Er
           bleibt auch aufgeklappt stehen — die Zahl ist die Zusammenfassung
           der Zettelchen, nicht ihr Ersatz.

           Am täglichen Zettel fehlt er ABSICHTLICH → `tracksProgress`. -->
      <span v-if="hasSubtasks && tracksProgress" class="progress">
        {{ doneSubtasks }} / {{ subtasks.length }}
      </span>
      <span v-if="metaLabel" class="meta">{{ metaLabel }}</span>
    </div>

    <!-- Unteraufgaben als angeheftete Zettelchen. Erst im aufgeklappten
         Zustand im DOM: eingeklappt dürfen sie weder Höhe noch Breite des
         Zettels beeinflussen, und `min-content` misst sie sonst mit. -->
    <div v-if="props.expanded && hasSubtasks" class="subs" :class="`subs--c${columns}`">
      <div
        v-for="subtask in subtasks"
        :key="subtask.task_id"
        class="mini"
        :class="{
          'mini--done': tracksProgress && subtask.completed,
          'mini--torn': recentlyTorn.has(subtask.task_id)
        }"
        @click.stop
      >
        <span class="mini-title">{{ subtask.title }}</span>
        <span v-if="subtask.subtask_points_mode !== 'checklist'" class="mini-points">
          {{ subtask.subtask_points_mode === 'deduct' ? '−' : '+' }}{{ subtask.effort }} P
        </span>
        <!-- Eigener Abreiß-Griff, 40 × 40 px. Er sitzt VOLLSTÄNDIG innerhalb
             seines Zettelchens (kein negativer Versatz), damit er nicht die
             Kante des Nachbarn schluckt — unsichtbar, aber ertastbar. -->
        <!-- Am täglichen Zettel bleibt der Griff IMMER da: die Unteraufgabe ist
             dort eine wiederholbare Belohnung, kein Häkchen (→ `tracksProgress`). -->
        <button
          v-if="!tracksProgress || !subtask.completed"
          class="mini-ear"
          :title="`„${subtask.title}“ abreißen`"
          @click.stop="tearSubtask(subtask.task_id)"
        ></button>
      </div>
    </div>

    <button class="edit" title="Aufgabe bearbeiten" @click.stop="showEditModal = true">
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

/* Fortschritt der Unteraufgaben. Ruhig wie der Punktwert: er sagt, wie viel
   noch aussteht, und ist kein zweites Signal neben dem Rückstand. */
.progress {
  color: var(--pw-ink-soft);
  opacity: 0.85;
}

/* Nur ein Zettel mit Unteraufgaben reagiert auf ein Antippen der Fläche. */
.zettel--tappable {
  cursor: pointer;
}

/* --- Unteraufgaben: eigene Zettelchen, mehrspaltig ------------------------- */

/* Flexbox statt Grid, und das ist der Punkt: bei ungerader Anzahl bliebe im
   Grid die letzte Zelle leer. Hier wächst das letzte Zettelchen über die
   Restbreite (`flex-grow: 1`) und die Reihe schließt bündig ab.

   Die Spaltenzahl steckt in der Flex-Basis, nicht in einer Spaltenvorlage:
     2 Spalten: 2 × (50 % − 4,5px) + 9px Lücke   = 100 %
     3 Spalten: 3 × (33,333 % − 4,667px) + 2 × 7px = 100 %
   Beide Zeilen sind gerechnet, nicht gemessen. Wer an einer Lücke dreht,
   rechnet die zugehörige Basis mit. */
.subs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 9px;
  margin: 11px 0 2px;
  padding-top: 9px;
  border-top: 1.5px dashed rgba(36, 31, 26, 0.35);
  /* Die 36px rechter Innenabstand des Zettels halten den Bearbeiten-Knopf vom
     Titel frei. Der Knopf ist aber nur 40px hoch; unterhalb davon wäre der
     Streifen bei voller Wandbreite bloß Leerraum — genau das, wogegen das
     Aufklappen antritt. Die Zettelchen holen ihn sich zurück, bis auf die 8px
     Innenabstand der linken Seite. */
  margin-right: -28px;
}

.mini {
  position: relative;
  flex: 1 1 calc(50% - 4.5px);
  /* Ohne das staucht Flexbox ein langes Wort NICHT weg, sondern bläst das
     Zettelchen über seine Spalte hinaus: die Vorgabe ist `min-width: auto`,
     also die inhaltliche Mindestbreite. */
  min-width: 0;
  /* Untergrenze der Spec. Sie ist zugleich die Bedingung dafür, dass der
     40-px-Griff vollständig ins Zettelchen passt. */
  min-height: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  /* Rechts der Platz für den Griff (40px) plus etwas Luft, damit kein Text
     unter ihm verschwindet. */
  padding: 6px 44px 6px 12px;
  background: #fff8e2;
  border: 1.5px solid var(--pw-line);
  border-radius: 2px;
  box-shadow: 2px 2px 0 rgba(36, 31, 26, 0.42);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.15;
}

/* Papierwechsel im Wechsel der Zettelchen — ein Stapel, kein Raster. */
.mini:nth-child(even) {
  background: #fdf4ea;
}

.subs--c3 .mini {
  flex-basis: calc(33.333% - 4.667px);
  padding: 6px 42px 6px 10px;
  font-size: 11.5px;
}

.subs--c3 {
  column-gap: 7px;
}

.mini-title {
  /* Anders als der Zetteltitel darf ein Zettelchen im Notfall im Wort
     umbrechen: die Spalte ist rund ein Drittel so breit, und Abschneiden mit
     Auslassungspunkten würde hier regelmäßig statt ausnahmsweise greifen.
     `break-word` greift ausschließlich für ein Wort, das allein nicht passt. */
  overflow-wrap: break-word;
}

.mini-points {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.3px;
  color: var(--pw-ink-soft);
  opacity: 0.85;
}

.mini--done {
  opacity: 0.55;
}

.mini--done .mini-title {
  text-decoration: line-through;
}

/* Vergängliche Quittung fürs Abreißen: das Zettelchen knickt kurz weg und
   kommt zurück. Bewusst nichts, was liegen bleibt — am täglichen Zettel wäre
   ein bleibendes Zeichen eine falsche Aussage (→ `tracksProgress` im Skript). */
.mini--torn {
  animation: mini-torn 0.6s cubic-bezier(0.28, 0.9, 0.32, 1);
}

@keyframes mini-torn {
  0% {
    transform: rotate(0) translate(0, 0);
  }
  35% {
    transform: rotate(6deg) translate(4px, 7px);
    box-shadow: 5px 7px 0 rgba(36, 31, 26, 0.3);
  }
  100% {
    transform: rotate(0) translate(0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  /* Doppelte Klasse, damit die Regel `.mini:nth-child(even)` mit ihrem
     Papierwechsel nicht gewinnt — die hat zwei Spezifitätspunkte. */
  .mini.mini--torn {
    animation: none;
    /* Ohne Bewegung bleibt die Quittung ein kurzes Aufleuchten des Papiers —
       sie verschwindet mit der Klasse nach 700 ms wieder. */
    background: var(--pw-tape);
  }
}

/* Abreiß-Griff des Zettelchens: 40 × 40 px echte Trefferfläche, gezeichnet ist
   nur die angeknickte Ecke. Er hängt an der unteren rechten Ecke SEINES
   Zettelchens (`right: 0; bottom: 0`) — ein negativer Versatz würde ihn über
   die Kante des Nachbarn schieben, was man nicht sieht, aber trifft. */
.mini-ear {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.mini-ear::before {
  content: '';
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 17px;
  height: 17px;
  background: linear-gradient(225deg, rgba(0, 0, 0, 0.12) 0 50%, #efe7d3 50%);
  border-left: 1.2px solid rgba(36, 31, 26, 0.65);
  border-top: 1.2px solid rgba(36, 31, 26, 0.65);
}

.mini-ear:active::before {
  width: 20px;
  height: 20px;
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
