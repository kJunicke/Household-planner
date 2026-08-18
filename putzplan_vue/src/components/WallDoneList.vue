<script setup lang="ts">
/**
 * Die Erledigt-Liste unter der Wand (Pinnwand-Redesign, Etappe 5, Ticket 04).
 *
 * Erledigte Aufgaben hängen nicht an der Wand — sie kosten dort den Überblick
 * über das, was noch offen ist. Sie stehen darunter als kompakter Streifen:
 * eine Zeile je Aufgabe, Titel durchgestrichen, Personenfarbe als Punkt,
 * Uhrzeit rechts. Aufbau und Reihenfolge sind die des klassischen
 * Erledigt-Tabs (`useTaskBoard.completedTasks`), nur in der neuen Formsprache.
 *
 * **„wieder dreckig" gehört hierher**, nicht an den Zettel: es betrifft
 * ausschließlich erledigte Aufgaben.
 *
 * Verschobene Aufgaben stehen ebenfalls hier — `postponeTask` setzt
 * `completed = true` —, tragen aber statt einer Uhrzeit das Kennzeichen
 * „verschoben auf …". Sie hat niemand erledigt; eine Uhrzeit wäre gelogen.
 *
 * **Der Bearbeiten-Stift (Ticket 04)** öffnet je Zeile dasselbe
 * Bearbeiten-Fenster wie am Zettel (`TaskEditModal`) — bewusst dieselbe
 * Komponente und dieselbe Verdrahtung wie in `WallNote.vue`, nicht ein
 * zweites, reduziertes Menü. Eine erledigte Aufgabe ist dafür kein
 * Sonderfall: Typ, Kadenz, Zuweisen, Unteraufgaben und Löschen bietet
 * `TaskEditModal` unverändert an. **Ausgenommen ist Verschieben** — dort
 * kennt `TaskEditModal` `task.completed` sehr wohl (s. Kommentar dort,
 * QC-Befund 1): die Aktion räumt eine noch offene Aufgabe aus dem Weg, an
 * einer bereits erledigten holt sie die nächste Fälligkeit teils um Monate zu
 * früh zurück. Am Zettel bleibt der Weg unangetastet, weil eine Aufgabe dort
 * ohnehin immer `!completed` ist.
 * Es gibt genau EIN Ziel-Task für alle vier Folgedialoge gleichzeitig
 * (`targetTaskId`), weil ohnehin immer nur eine Zeile bearbeitet wird.
 */
import { computed, ref } from 'vue'
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { scheduleOf } from '@/lib/taskSchedule'
import TaskEditModal from './TaskEditModal.vue'
import TaskAssignmentModal from './TaskAssignmentModal.vue'
import SubtaskManagementModal from './SubtaskManagementModal.vue'
import TaskPostponeModal from './TaskPostponeModal.vue'

const props = defineProps<{ tasks: readonly Task[] }>()

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()

/**
 * Wer eine Aufgabe zuletzt erledigt hat und wann — aus `task_completions`,
 * der einzigen Quelle dafür. `tasks.last_completed_at` kennt nur den
 * Zeitpunkt, nicht die Person.
 *
 * Die Quelle deckt bewusst nur die **laufende Woche** ab: der Store lädt
 * nichts anderes, und die Liste ist als Chronik des Tages gedacht. Für ältere
 * Erledigungen fällt die Zeit auf `last_completed_at` zurück und der Punkt
 * bleibt farblos — lieber kein Punkt als der falsche.
 */
const lastCompletionByTask = computed(() => {
  const map = new Map<string, { userId: string; at: string }>()
  for (const completion of householdStore.effectiveWeeklyCompletions) {
    const existing = map.get(completion.task_id)
    if (!existing || completion.completed_at > existing.at) {
      map.set(completion.task_id, { userId: completion.user_id, at: completion.completed_at })
    }
  }
  return map
})

const colorOfUser = (userId: string | null | undefined): string | null => {
  if (!userId) return null
  return householdStore.householdMembers.find(m => m.user_id === userId)?.user_color || null
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

type DoneRow = {
  task: Task
  /** Personenfarbe des Erledigers — `null` heißt „nicht bekannt", nicht „niemand". */
  color: string | null
  /** Rechte Spalte: Uhrzeit, Datum oder „verschoben auf …". */
  stamp: string
  /** Verschoben sieht anders aus als erledigt — es ist keine Leistung. */
  postponed: boolean
}

/**
 * Uhrzeit, solange die Erledigung von heute ist — darum geht es in der
 * Chronik. Alles Ältere bekommt stattdessen das Datum: „09:14" an einer
 * Aufgabe von vorletzter Woche liest sich wie heute Morgen.
 */
const formatStamp = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  if (date >= startOfToday()) {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

/**
 * Kompakte Variante des Verschiebe-Kennzeichens: nur Pfeil + Tag.Monat, ohne
 * Wortlaut und ohne Wochentag (QC-Befund 3, Ticket 04, dritte Runde).
 * `formatPostponeDate` (Zeitplan-Modul) bleibt dafür unangetastet — Toast,
 * Dialogvorschau und klassische Karte haben Platz für die lange Form
 * „Donnerstag, 20.08." und behalten sie.
 *
 * **Warum hier kein Wort mehr, nicht einmal „verschoben auf":** die Zeile
 * sieht man schon an ihrer eigenen Klasse (`done-row--postponed`) anders —
 * kein Durchstreichen, neutraler Punkt statt Personenfarbe. Der Wortlaut
 * wiederholte nur eine Aussage, die die Zeile bereits optisch trifft; das
 * Datum ist die einzige Information, die sonst nirgends steht.
 *
 * **Warum das nötig ist — die vollständige Rechnung, `.done-row` = 370 px
 * bei 390 px Viewport (die erste Fassung dieses Kommentars hatte die beiden
 * Bedienknöpfe vergessen und kam auf falsche 223 px für den Titel):**
 *
 *   370 = 8 (Padding links) + 10 (Punkt) + 8 + Titel + 8 + Text + 8
 *       + 48 (Stift) + 8 + 48 (wieder dreckig)
 *
 * Fest belegt sind 146 px, für Titel UND rechten Text bleiben zusammen
 * 224 px. `.stamp` steht auf `flex: none` (Absicht, s. dort) — der Text
 * bekommt IMMER seine volle Breite, der Titel den Rest. Mit „verschoben auf
 * 27.08." (139,3 px gemessen) blieben dem Titel nur rund 85 px übrig, und
 * JEDE verschobene Zeile wurde gekappt, auch kurze Titel wie
 * „Final-Effort-Test" (braucht 116 px, bekam 85). Mit nur `→ 27.08.` (grob
 * 55 px) bleiben rund 169 px für den Titel — spürbar mehr als die 186,7 px
 * einer gewöhnlichen Zeile sind zwar nicht erreicht, aber nah genug, dass die
 * meisten Titel wieder vollständig stehen. Der fehlende Platz ist genau der,
 * den der neue Bearbeiten-Stift aus Ticket 04 kostet — das hier ist also die
 * Gegenbuchung dazu, keine Kosmetik.
 *
 * **Zeichen `→` (U+2192 RIGHTWARDS ARROW), nicht ein Icon-Font-Glyph:** es
 * ist gewöhnlicher Text, kein `<i class="bi …">`, und muss deshalb in der
 * Font-Stack von `base.css` (Inter, dann System-/Fallback-Sans) darstellbar
 * sein. Ist es — dasselbe Zeichen steht schon als echter Template-Text in
 * `SettlementView.vue` (`settlement-title`, „von → nach"), also im selben
 * Font-Stack bereits im Einsatz und nicht neu riskiert.
 *
 * `schedule.postponedUntil` ist bereits `YYYY-MM-DD` (siehe `scheduleOf`) —
 * String-Zerlegung statt `Date`, damit hier keine Zeitzonen-Fallstricke
 * dazukommen, die `parseIsoDate` im Zeitplan-Modul extra vermeidet.
 */
const formatPostponeStamp = (isoDate: string): string => {
  const [, month, day] = isoDate.split('-')
  return `→ ${day}.${month}.`
}

const rows = computed((): DoneRow[] =>
  props.tasks.map((task): DoneRow => {
    const schedule = scheduleOf(task)
    const completion = lastCompletionByTask.value.get(task.task_id)

    /**
     * Verschoben wird angezeigt, sobald `postponed_until` gesetzt ist —
     * unabhängig von `task_completions` (Rücknahme von QC-Befund 2,
     * Ticket 04, zweite Runde).
     *
     * **`task.completed` taugt hier NICHT als Unterscheidung**, weil
     * `taskStore.postponeTask` es bei JEDER Verschiebung selbst auf `true`
     * setzt — auch von einer noch offenen (`dran`) Aufgabe aus (das muss es:
     * sonst bliebe die Aufgabe fälschlich „dran", CONTEXT.md „verschieben").
     * Eine verschobene Aufgabe ist damit *per Definition* `completed = true`;
     * das Feld sieht bei „wirklich erledigt" und „verschoben" gleich aus.
     * Dieselbe Ununterscheidbarkeit gilt beim SCHREIBEN, nicht nur hier beim
     * Lesen — siehe der Kommentar zu `showPostpone` in `TaskEditModal.vue`
     * (QC-Befund 1/2, Ticket 04).
     *
     * **Warum nicht zusätzlich `task_completions` befragen (erster Versuch,
     * zurückgenommen):** ein Verlaufseintrag beantwortet nur „hat es JE eine
     * Erledigung gegeben", nicht „gilt die noch". *wieder dreckig* widerruft
     * genau diese Erledigung (`markAsDirty`: `completed = false`), lässt den
     * Verlaufseintrag aber stehen — er ist append-only, Single Source of
     * Truth für PUNKTE, nicht für den aktuellen Zustand. Ablauf: erledigt →
     * wieder dreckig → vom Zettel aus verschoben, alles in derselben Woche.
     * Eine Prüfung auf „Verlaufseintrag dieser Woche vorhanden" trifft dann
     * fälschlich zu und schluckt „verschoben auf …" restlos — das Datum wäre
     * im UI nirgends mehr erreichbar, für einen alltäglichen Ablauf, nicht
     * für einen Randfall. Das ist schlimmer als das Problem, gegen das die
     * Prüfung gebaut war.
     *
     * **Warum die einfache Bedingung jetzt wieder richtig ist:** seit
     * `TaskEditModal.showPostpone` das Verschieben an einer wirklich
     * erledigten Aufgabe sperrt (`!completed`-Zweig dort), lässt sich der
     * Fehlerfall „erledigt UND zusätzlich verschoben" gar nicht mehr NEU
     * erzeugen. Ab jetzt gilt: wo `postponed_until` steht, wurde von *dran*
     * aus verschoben. Die kaputten Zeilen, die QC-Befund 2 ursprünglich
     * auslösten, sind Altdaten aus der Zeit vor dieser Sperre — Altdaten
     * gehören in den Daten bereinigt (z. B. per „wieder dreckig"), nicht in
     * der Anzeige wegargumentiert.
     */
    if (schedule.status === 'postponed' && schedule.postponedUntil) {
      // Punkt bleibt neutral. Er beantwortet „wer hat das gemacht" — eine
      // verschobene Aufgabe hat niemand gemacht. Die Farbe des Zuständigen
      // stünde hier in derselben Bildsprache wie die wahre Aussage der Zeile
      // daneben und wäre damit nicht als andere Aussage erkennbar.
      return {
        task,
        color: null,
        stamp: formatPostponeStamp(schedule.postponedUntil),
        postponed: true
      }
    }

    const iso = completion?.at ?? task.last_completed_at
    return {
      task,
      color: colorOfUser(completion?.userId),
      stamp: iso ? formatStamp(iso) : '',
      postponed: false
    }
  })
)

/**
 * Schutz gegen den Doppeltipp. `markAsDirty` ist asynchron und lädt danach
 * neu; ohne Sperre setzen zwei schnelle Tipps zwei Anfragen ab, und die Zeile
 * steht bis zum Nachladen weiter da.
 *
 * **ACHTUNG — der Schutz hängt allein an der `if`-Zeile unten, nicht am
 * `:disabled` im Template.** Vue schreibt das Attribut erst im nächsten Tick;
 * der QC hat gemessen, dass `btn.disabled` nach dem ersten, zweiten *und*
 * dritten synchronen Klick noch `false` war. `:disabled` ist hier reine Optik.
 *
 * Daraus folgt: die Sperre MUSS synchron vor dem ersten `await` gesetzt
 * werden. Wer davor ein `await` einschiebt (eine Rückfrage, ein Nachladen,
 * eine Animation), öffnet das Fenster wieder — und ein Doppeltipp setzt dann
 * zwei Aufgaben-Rücksetzungen ab.
 */
const busy = ref(new Set<string>())

const markDirty = async (taskId: string) => {
  // Synchron. Zwischen dieser Zeile und der Zuweisung darunter darf nichts
  // stehen, das den Ablauf unterbricht.
  if (busy.value.has(taskId)) return
  busy.value = new Set(busy.value).add(taskId)
  try {
    await taskStore.markAsDirty(taskId)
  } finally {
    const next = new Set(busy.value)
    next.delete(taskId)
    busy.value = next
  }
}

// --- Bearbeiten und seine Folgedialoge --------------------------------------
// Dieselbe Verdrahtung wie in `WallNote.vue` — bewusst kopiert, nicht
// wiederverwendet: es gibt hier keine geteilte Basis, an der eine künftige
// Änderung an EINER Stelle beide Wege treffen würde, aber die Vollständigkeit
// (Confirm, Delete, Assign, Subtasks, Postpone) ist Bedingung des Tickets.
//
// `targetTaskId` statt eines Tasks je Zeile: es ist ohnehin immer nur eine
// Zeile gleichzeitig in Bearbeitung, und `props.tasks` bleibt reaktiv — ändert
// sich der Titel, sieht auch ein noch offenes Folge-Modal den neuen Stand.
const targetTaskId = ref<string | null>(null)
const targetTask = computed<Task | null>(
  () => props.tasks.find(t => t.task_id === targetTaskId.value) ?? null
)
const targetSubtasks = computed(() =>
  targetTaskId.value ? taskStore.getSubtasks(targetTaskId.value) : []
)

const showEditModal = ref(false)
const showAssignmentModal = ref(false)
const showSubtaskManagementModal = ref(false)
const showPostponeModal = ref(false)

const openEdit = (taskId: string) => {
  targetTaskId.value = taskId
  showEditModal.value = true
}

/** Folge-Dialog-Muster wie am Zettel: Bearbeiten schließt, der nächste öffnet. */
const openFollowUp = (which: 'assign' | 'subtasks' | 'postpone') => {
  showEditModal.value = false
  if (which === 'assign') showAssignmentModal.value = true
  else if (which === 'subtasks') showSubtaskManagementModal.value = true
  else showPostponeModal.value = true
}

const handleEditConfirm = async (updates: Partial<Task>) => {
  if (!targetTaskId.value) return
  await taskStore.updateTask(targetTaskId.value, updates)
  showEditModal.value = false
}

const handleEditDelete = async () => {
  if (!targetTaskId.value) return
  showEditModal.value = false
  await taskStore.deleteTask(targetTaskId.value)
}

const handleAssignmentConfirm = async (userId: string | null, permanent: boolean) => {
  if (!targetTaskId.value) return
  await taskStore.assignTask(targetTaskId.value, userId, permanent)
  showAssignmentModal.value = false
}

const handleCreateSubtask = async (subtaskData: {
  title: string
  effort: 1 | 2 | 3 | 4 | 5
  subtask_points_mode: 'checklist' | 'deduct' | 'bonus'
}) => {
  const parent = targetTask.value
  if (!parent) return
  const maxOrderIndex = targetSubtasks.value.reduce((max, s) => Math.max(max, s.order_index), 0)
  await taskStore.createTask({
    title: subtaskData.title,
    effort: subtaskData.effort,
    subtask_points_mode: subtaskData.subtask_points_mode,
    recurrence_days: parent.recurrence_days, // erbt vom Elternteil
    task_type: parent.task_type,
    parent_task_id: parent.task_id,
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
  if (!targetTaskId.value) return
  const success = await taskStore.postponeTask(targetTaskId.value, targetDate)
  if (success) showPostponeModal.value = false
}
</script>

<template>
  <section v-if="rows.length" class="done">
    <h2 class="done-head">Erledigt</h2>
    <ul class="done-list">
      <li
        v-for="row in rows"
        :key="row.task.task_id"
        class="done-row"
        :class="{ 'done-row--postponed': row.postponed }"
        :style="row.color ? { '--dot': row.color } : undefined"
      >
        <span class="dot" aria-hidden="true"></span>
        <span class="done-title">{{ row.task.title }}</span>
        <span class="stamp">{{ row.stamp }}</span>
        <!-- Derselbe Weg wie am Zettel: EIN Bearbeiten-Stift, kein reduziertes
             Erledigt-Menü. Öffnet dasselbe `TaskEditModal` mit vollem
             Funktionsumfang (Typ, Kadenz, Zuweisen, Unteraufgaben, Verschieben,
             Löschen), unabhängig davon, ob die Zeile „erledigt" oder
             „verschoben" zeigt. -->
        <button class="ctrl edit" title="Aufgabe bearbeiten" @click="openEdit(row.task.task_id)">
          <i class="bi bi-pencil" aria-hidden="true"></i>
        </button>
        <button
          class="ctrl again"
          title="Wieder dreckig"
          :disabled="busy.has(row.task.task_id)"
          @click="markDirty(row.task.task_id)"
        >
          <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
        </button>
      </li>
    </ul>

    <TaskEditModal
      v-if="showEditModal && targetTask"
      :task="targetTask"
      @close="showEditModal = false"
      @confirm="handleEditConfirm"
      @delete="handleEditDelete"
      @assign="openFollowUp('assign')"
      @manage-subtasks="openFollowUp('subtasks')"
      @postpone="openFollowUp('postpone')"
    />

    <TaskAssignmentModal
      v-if="showAssignmentModal && targetTask"
      :currentAssignedTo="targetTask.assigned_to"
      :currentPermanent="targetTask.assignment_permanent"
      :householdMembers="householdStore.householdMembers"
      @close="showAssignmentModal = false"
      @confirm="handleAssignmentConfirm"
    />

    <SubtaskManagementModal
      v-if="showSubtaskManagementModal && targetTask"
      :parentTask="targetTask"
      :existingSubtasks="targetSubtasks"
      @close="showSubtaskManagementModal = false"
      @createSubtask="handleCreateSubtask"
      @updateSubtaskPointsMode="handleUpdateSubtaskPointsMode"
      @deleteSubtask="handleDeleteSubtask"
    />

    <TaskPostponeModal
      v-if="showPostponeModal && targetTask"
      :task="targetTask"
      @close="showPostponeModal = false"
      @confirm="handlePostponeConfirm"
    />
  </section>
</template>

<style scoped>
.done {
  margin-top: 16px;
}

.done-head {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pw-ink-soft);
}

.done-list {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--pw-paper);
  border: 2px solid var(--pw-line);
  box-shadow: var(--pw-shadow);
}

/* Höhe ist gesetzt und nicht dem Inhalt überlassen — der Streifen soll bei
   jeder Titellänge gleich dicht bleiben. `calc(touch-target-min + 1px)` statt
   einer eigenen Zahl: die Trennlinie unten ist 1 px stark, und das Maß der
   Bedienelemente (`.ctrl`, s.u.) muss aus demselben Wert kommen wie hier —
   sonst laufen beide beim nächsten Anfassen wieder auseinander (Ticket 04). */
.done-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: calc(var(--touch-target-min) + 1px);
  padding: 0 0 0 8px;
  border-bottom: 1px solid rgba(36, 31, 26, 0.18);
}

.done-row:last-child {
  border-bottom: none;
}

/* Personenfarbe als Punkt. Ohne bekannte Person bleibt `--dot` ungesetzt und
   der zweite Parameter greift — derselbe zurücktretende Ton wie am Zettel. */
.dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dot, color-mix(in srgb, var(--pw-free) 45%, var(--pw-paper)));
  border: 1.5px solid var(--pw-line);
}

/* `min-width: 0` ist Pflicht: ohne sie ist die Mindestbreite eines
   Flex-Kindes seine Inhaltsbreite, das Kürzen greift nicht und der lange
   Titel drückt stattdessen Stempel und Knöpfe aus der Zeile.

   **Zurückgenommener Zwischenstand (QC-Befund 3, Ticket 04, zweite Runde):**
   hier stand testweise `flex: 1 1 auto; min-width: 72px`, mit `.stamp` auf
   `flex: 0 1 auto; max-width: 45%` als Gegenstück. Gemessen bei 390 px
   (`.done-row` = 370 px) griff KEINE der beiden neuen Regeln in irgendeiner
   Zeile: der kürzeste gemessene Titel brauchte bereits 101,8 px (über der
   72-px-Grenze), und `verschoben auf 27.08.` braucht rund 139 px (unter dem
   45-%-Deckel von 166,5 px). Gerettet hat den Titel allein das Entfernen von
   `flex: none` am Stempel — und genau das war der neue Schaden: Flexbox
   schrumpft proportional zur Basisbreite, der längere Text (der Stempel)
   verlor dadurch IMMER mehr als der kürzere (der Titel), bis „verschoben auf
   27.08." in 10 von 19 Zeilen zur unlesbaren Ellipse zerfiel — schlechter als
   der Ausgangszustand, wo der Stempel immer vollständig stand. Beide Regeln
   sind deshalb zurück auf ihren ursprünglichen Stand. */
.done-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 15px;
  font-weight: 700;
  color: var(--pw-ink-soft);
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}

/* Verschoben ist nicht erledigt — deshalb kein Strich durch den Titel. */
.done-row--postponed .done-title {
  text-decoration: none;
}

/* Von 11 auf 13 px — dieselbe Begründung wie am Titel.

   `flex: none` bleibt bewusst: der Stempel/Text behält IMMER seine volle
   Breite, der Titel bekommt den Rest (`.done-title` oben). Nicht wieder am
   Flex-Verhalten drehen — das war der Fehlversuch der zweiten Runde
   (s. Kommentar an `.done-title`). Die vollständige Platzrechnung (146 px
   fest belegt, 224 px für Titel + Text zusammen) und warum bei der
   ausgeschriebenen Form „verschoben auf 27.08." (139,3 px) trotzdem JEDE
   verschobene Zeile gekappt wurde, steht bei `formatPostponeStamp` — deshalb
   dort nur noch `→ 27.08.` (grob 55 px statt 139). Diese Kurzform ist die
   Lösung, nicht ein Deckel oder Schrumpfen hier. */
.stamp {
  flex: none;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--pw-ink-soft);
  opacity: 0.85;
  white-space: nowrap;
}

.done-row--postponed .stamp {
  opacity: 1;
}

/* Gemeinsame Trefferfläche für BEIDE Bedienelemente der Zeile (Bearbeiten,
   Wieder-dreckig): `--touch-target-min` (48 px, `base.css`) breit, senkrecht
   der volle **Inhaltsbereich** der Zeile.

   Die Höhe steht deshalb NICHT als Zahl da, sondern als `align-self: stretch`.
   `.done-row` ist `--touch-target-min + 1px` hoch als Border-Box und trägt
   eine 1 px starke Trennlinie unten — ihr Inhaltsbereich ist damit exakt
   `--touch-target-min`, nicht mehr. Ein fest auf die Zeilenhöhe gesetzter
   Knopf ragte oben und unten je 0,5 px darüber hinaus; die unteren 0,5 px
   lägen im Band der nächsten Zeile, und deren Knopf gewänne als späteres
   Geschwisterelement das Hit-Testing — ein Tipp auf den unteren Rand setzte
   dann die FALSCHE Aufgabe wieder auf dran (an der Vorgängerversion mit fixer
   Höhe vom QC nachgewiesen, s. Git-Historie dieser Datei). `stretch` bindet
   die Höhe an den Inhaltsbereich und kann deshalb nicht wieder
   auseinanderlaufen, wenn sich Zeilenhöhe oder Linienstärke ändern.
   Prüfen lässt sich das nur durch Abtasten der Ecken, nicht durch Ansehen —
   bei ZWEI benachbarten Knöpfen zusätzlich auch die gemeinsame Kante
   zwischen ihnen, nicht nur die Zeilenränder.

   Kein Padding und kein Margin, `border: 0` und `box-sizing: border-box`
   stehen ausdrücklich da, damit keine geerbte Regel die 48 px in der Breite
   zu einem Innenmaß macht. */
.ctrl {
  flex: none;
  align-self: stretch;
  box-sizing: border-box;
  width: var(--touch-target-min);
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--pw-ink-soft);
  font-size: 16px;
  line-height: 1;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.ctrl:active:not(:disabled) {
  transform: translate(1px, 1px);
}

.ctrl:disabled {
  opacity: 0.4;
}
</style>
