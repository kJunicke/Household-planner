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
 * - der Fetzen zum Zurückkleben (Ticket 11).
 *
 * **Der Long-Press** auf der Zettelfläche (Ticket 10) blendet alle vier
 * Richtungen beschriftet ein: oben verschieben, unten erledigen, links
 * zuweisen, rechts erledigen mit angepasstem Aufwand. Die Geste steckt in
 * `useDirectionPress`, die Beschriftung in `WallDirectionMenu`.
 *
 * **Das Eselsohr** unten rechts ist der Abreiß-Griff (Ticket 09): von dort aus
 * nach unten ziehen erledigt die Aufgabe, sofort und ohne vorheriges langes
 * Drücken. Die Geste selbst steckt in `useTearGesture`.
 *
 * **Projekte sind die Ausnahme von beidem** (Ticket 03). Sie werden nie fertig,
 * sondern beackert: beide Gesten nach unten öffnen dort das
 * `ProjectWorkModal`, der Zettel bleibt hängen, es entsteht kein Fetzen. Einen
 * Richtungskranz bekommen sie gar nicht — beim Halten hebt sich nur der Zettel
 * („ich höre zu"), ohne Beschriftung und ohne Schleier; die anderen drei
 * Richtungen tun nichts. Alles Weitere (zuweisen, Aufwand,
 * verschieben, löschen) läuft dort über den Bearbeiten-Stift.
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
import { computed, ref, watch } from 'vue'
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { projectPhraseOf } from '@/lib/projectPhrases'
import { jitterOf, kindOfTaskType, rotationOf, subtaskColumns } from '@/lib/wallLayout'
import { useTearGesture } from '@/composables/useTearGesture'
import { useDirectionPress, type PressDirection } from '@/composables/useDirectionPress'
import { flyPoints } from '@/lib/pointsFlight'
import { offerScrap } from '@/composables/useTornScrap'
import WallDirectionMenu from './WallDirectionMenu.vue'
import ProjectWorkModal from './ProjectWorkModal.vue'
import TaskCompletionModal from './TaskCompletionModal.vue'
import TaskEditModal from './TaskEditModal.vue'
import TaskAssignmentModal from './TaskAssignmentModal.vue'
import SubtaskManagementModal from './SubtaskManagementModal.vue'
import TaskPostponeModal from './TaskPostponeModal.vue'

const props = defineProps<{
  task: Task
  expanded?: boolean
  /**
   * Karten-Redesign (Ticket 00a): der Punktwert steht oben rechts statt in
   * der Fußzeile. Die Wand entscheidet das, nicht der Zettel — nur sie misst
   * während des Layout-Laufs, ob die Fußzeile sonst breiter als der Titel
   * wäre (→ `WallView`, `relayout`).
   *
   * **Bewusst ein Prop, keine per `classList` gesetzte Klasse.** Eine Klasse,
   * die `WallView` direkt ans DOM schreibt, überlebt kein Vue-Update: Vue
   * ersetzt `className` bei jedem Patch komplett aus dem berechneten
   * Klassen-Array, unregelmäßig und unabhängig davon, ob sich an DIESEM
   * Zettel gerade etwas geändert hat. Über ein Prop bleibt die Entscheidung
   * dagegen Teil des von Vue selbst verwalteten Zustands.
   */
  metaTop?: boolean
}>()
/**
 * `gesture-start` / `gesture-end`: solange der Finger auf diesem Zettel eine
 * Geste ausführt — Ziehen am Eselsohr (Ticket 09) **oder** langes Drücken mit
 * Richtungen (Ticket 10) —, darf ihn ein Neupacken der Wand nicht gleichzeitig
 * durch die Gegend fliegen lassen: sonst kämpfen die FLIP-Animation und der
 * Finger um dasselbe `transform`, und der Richtungskranz verlöre seinen
 * Bezugspunkt. Die Wand merkt sich die ID und lässt genau diesen Zettel aus,
 * wie sie es beim angetippten Zettel schon tut.
 *
 * Bewusst nicht „tear": beide Gesten melden hier, und ein Name, der nur die
 * eine nennt, wäre für die andere schlicht falsch.
 */
const emit = defineEmits<{
  (e: 'toggle', taskId: string): void
  (e: 'gesture-start', taskId: string): void
  (e: 'gesture-end', taskId: string): void
}>()

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
  // Den nachlaufenden Klick eines Long-Press sieht diese Stelle nie: ihn fängt
  // `useDirectionPress` in der Einfangphase am Fenster ab, bevor er irgendein
  // Ziel erreicht. Hier steht deshalb bewusst KEINE zweite Schluckstelle —
  // zwei Stellen, die dasselbe abräumen, wären eine zu viel.
  if (!hasSubtasks.value) return
  emit('toggle', props.task.task_id)
}

// --- Abreißen (Etappe 4 / Ticket 09) ----------------------------------------

/**
 * Der Griff des Zettels selbst braucht eine ID, weil das Gesten-Composable
 * mehrere Griffe derselben Komponente auseinanderhalten muss (ein Eselsohr am
 * Zettel, je eines an jedem Zettelchen). Eine echte `task_id` wäre hier falsch:
 * die des Elternteils ist auch eine gültige Unteraufgaben-ID in anderen
 * Zusammenhängen, und die Verwechslung wäre lautlos.
 */
const NOTE_HANDLE = '#note'

/**
 * Was dieser Zettel beim Abreißen **wirklich** noch einbringt.
 *
 * Bewusst dieselbe Rechnung wie `estimateCompletionEffort` im Store: der Balken
 * wächst um genau diesen Wert, also müssen die fliegende Zahl UND die Zahl in
 * der Fußzeile dieselbe sein.
 *
 * **Hier lag ein Fehler, und er war teuer.** Die Fußzeile zeigte vorher den
 * ungekürzten `tasks.effort`. Der QC hat den Fall nachgestellt: „Badezimmer
 * putzen", `effort 1`, eine erledigte `deduct`-Unteraufgabe — die Fußzeile
 * versprach „1 P", geflogen ist nichts, die Statusleiste stand vor und nach dem
 * Abriss auf 11, und die Datenbank schrieb `effort_override 0`. App, Flug und
 * Datenbank waren einig; allein der Zettel log. Eine Zahl am Zettel ist ein
 * Versprechen — sie muss die sein, die gleich fliegt.
 *
 * Verbindlich rechnet weiterhin die Edge Function; das hier ist die Schätzung
 * fürs Auge, wie im Store auch.
 */
const effectivePoints = computed(() => {
  const deductSum = taskStore
    .getSubtasks(props.task.task_id)
    .filter(s => s.completed && s.subtask_points_mode === 'deduct')
    .reduce((sum, s) => sum + s.effort, 0)
  return Math.max(0, props.task.effort - deductSum)
})

/**
 * Was am Sticker steht.
 *
 * Bei allen anderen Zetteln ist das die Zahl, die beim Abreißen gleich fliegt
 * (→ `effectivePoints`). **Ein Projekt hat keine feste Punktzahl mehr** — sie
 * wird bei jedem Arbeitseintrag neu gewählt. Dort steht stattdessen, wie viele
 * Punkte das Projekt bis jetzt verschlungen hat: die Summe aller Erledigungen
 * seiner Unteraufgaben, aus `taskStore.projectEffortTotals`.
 *
 * Bewusst NICHT `taskStore.getProjectEffort()`: das rechnet aus
 * `taskStore.completions`, und die sind an der Wand leer — die Zahl stünde
 * dauerhaft auf 0. Der klassische `TaskCard` lädt seine Erledigungen selbst und
 * bleibt deshalb unverändert an der alten Rechnung.
 *
 * Klassenname `.points` und Platz im `.corner` bleiben, weil
 * `WallView.relayout` genau danach misst.
 */
const displayPoints = computed(() =>
  isProject.value ? taskStore.getProjectEffortTotal(props.task.task_id) : effectivePoints.value
)

/**
 * Was im Sticker STEHT.
 *
 * Bei allen Zetteln außer Projekten unverändert die rohe Zahl. **Nur das
 * Projekt-Abzeichen klemmt bei `999+`** (Ticket 03-3): vier Stellen sprengen
 * die 34 px, und ein Projekt jenseits von 999 Punkten hat die Aussage ohnehin
 * gemacht. Die Klemme gilt ausschließlich für die ANZEIGE — die Stufe rechnet
 * weiter mit `displayPoints` (siehe `badgeStage`), sonst fiele ein Projekt mit
 * 1500 Punkten auf die Stufe von 999.
 */
const pointsLabel = computed(() =>
  isProject.value && displayPoints.value > 999 ? '999+' : String(displayPoints.value)
)

/**
 * Stufe des Projekt-Abzeichens: 1–5 über den Bändern 0–9, 10–24, 25–49,
 * 50–99, ab 100. Die Bänder sind gesetzt, nicht gemessen (Ticket 03).
 *
 * **Bewusst eigene Klassen (`points--b1…b5`) statt `points--s0…s5`.** Die
 * Sticker-Stufen sind die PUNKTZAHL einer Aufgabe (Kreis 1 … Stern 5); ein
 * Projekt mit 21 verschlungenen Punkten bekäme über `Math.min(5, …)` den
 * goldenen Fünf-Punkte-Stern und läse sich als „5 Punkte" statt „Stufe 5".
 * Getrennte Klassen, getrenntes Bild: Sticker sind aufgeklebte Formen,
 * Abzeichen ist eine Siegelmarke mit umlaufender Skala.
 */
const badgeStage = computed(() => {
  const p = displayPoints.value
  if (p >= 100) return 5
  if (p >= 50) return 4
  if (p >= 25) return 3
  if (p >= 10) return 2
  return 1
})

/**
 * Klassen am Sticker. Projekte bekommen das Abzeichen (Grundform, Stufe,
 * Passung), alle anderen den unveränderten Punkte-Sticker.
 *
 * `points--fitN` steuert nur die Schriftgröße nach der STELLENZAHL. Ohne sie
 * läge dreistellig bei 14,3 px über der freien Innenfläche des Abzeichens; die
 * Fläche selbst bleibt bei allen Stufen 34 × 34 px (der Sticker wächst bei
 * `points--s5` auf 39,1 px — das Abzeichen tut das bewusst NICHT).
 */
const pointsShapeClass = computed(() => {
  if (!isProject.value) return `points--s${Math.min(5, Math.max(0, displayPoints.value))}`
  return [
    'points--badge',
    `points--b${badgeStage.value}`,
    `points--fit${Math.min(4, pointsLabel.value.length)}`,
  ]
})

/**
 * Nur dort gesetzt, wo die Klemme etwas verschweigt. Bei einem Abzeichen, das
 * `23` zeigt, wäre „Bisher verschlungene Punkte: 23" die sichtbare Zahl noch
 * einmal — ein Titel, der nichts hinzufügt, ist einer zu viel.
 */
const pointsTitle = computed(() =>
  isProject.value && displayPoints.value > 999
    ? `Bisher verschlungene Punkte: ${displayPoints.value}`
    : undefined
)

/**
 * Startpunkt des Punkteflugs: die Mitte des Griffs in **Fensterkoordinaten**.
 *
 * Das Rechteck eines geneigten Zettels ist größer als der Zettel selbst — seine
 * Ecken liegen außerhalb. Für den Startpunkt spielt das keine Rolle: die
 * **Mitte** des Rechtecks ist auch bei jeder Drehung die Mitte des Elements,
 * und ein Startpunkt ist ohnehin nur der Anfang einer Zierbewegung, keine
 * Trefferprüfung. Wer hier später eine Ecke bräuchte, müsste rechnen.
 */
const centerOf = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

// --- Projekte: arbeiten statt abreißen (Ticket 03) --------------------------

/**
 * Ein Projekt wird nie fertig, es wird beackert. **Beide** Gesten nach unten —
 * der Zug am Eselsohr und der Long-Press-Zug — landen deshalb im selben
 * `ProjectWorkModal` wie der Knopf „Am Projekt arbeiten" im klassischen
 * Aussehen. Kein Erledigen, kein Fetzen, kein Verschwinden vom Board.
 *
 * Die beiden Wege können sich nicht gegenseitig auslösen und auch nicht zwei
 * Einträge erzeugen: der Long-Press startet auf dem Eselsohr gar nicht erst
 * (`isPressControl`), und selbst wenn beide dasselbe `showProjectWorkModal`
 * setzten, ist es ein einzelner Zustand — gebucht wird ohnehin erst im Fenster,
 * mit Pflichtauswahl und Pflichtnotiz.
 */
const showProjectWorkModal = ref(false)
const isLoggingWork = ref(false)

/**
 * Die Unteraufgabe, an der die Buchung hängt. Sie ist bewusst NICHT in
 * `subtasks` (dort herausgefiltert, „Buchhaltung, kein Zettel") — gesucht wird
 * deshalb in der ungefilterten Liste des Stores.
 */
const projectWorkSubtaskId = computed(() => {
  if (!isProject.value) return null
  const work = taskStore
    .getSubtasks(props.task.task_id)
    .find(s => s.title === 'Am Projekt arbeiten')
  return work?.task_id ?? null
})

/**
 * Ein Altbestands-Projekt ohne diese Unteraufgabe (angelegt, bevor der Store
 * sie automatisch mitanlegte) bekommt **kein** Fenster: es hätte nichts, worauf
 * es buchen könnte, und ein Bestätigen liefe ins Leere. Stilles Nachlegen aus
 * einer Geste heraus wäre eine Datenänderung, die niemand angefordert hat —
 * dieselbe Entscheidung wie in `TaskCard` (dort `console.error`).
 */
const openProjectWork = () => {
  if (!projectWorkSubtaskId.value) {
    console.error('Project work subtask not found')
    return
  }
  showProjectWorkModal.value = true
}

/**
 * Buchen. Punkte und Notiz gehen an die Work-Unteraufgabe, genau wie am Knopf
 * im klassischen Aussehen — die Punkte laufen damit ins Wochenziel wie bei
 * jeder Erledigung.
 *
 * **Kein Konfetti**, obwohl `TaskCard` welches zündet: an der Wand ist die
 * Rückmeldung der Punkteflug plus das Bestätigungsfenster, das ja schon
 * dastand. **Kein Toast** aus demselben Grund. **Kein `markAsDirty`**: die
 * Work-Unteraufgabe ist an der Wand ohnehin ausgeblendet, und ein
 * Zurücksetzen von hier aus wäre eine zweite Wahrheit neben dem Store.
 *
 * Wie überall hier entscheidet der Rückgabewert über den Flug — ein
 * abgewiesener Doppelgriff darf keine zweite Zahl fliegen lassen. Schlägt es
 * fehl, bleibt das Fenster offen und der Eintrag erhalten.
 */
const handleProjectWork = async (effort: number, note: string) => {
  const subtaskId = projectWorkSubtaskId.value
  if (!subtaskId) return
  const el = root.value
  const origin = el ? centerOf(el) : null
  isLoggingWork.value = true
  const applied = await taskStore.completeTask(subtaskId, effort, note)
  isLoggingWork.value = false
  if (!applied) return
  showProjectWorkModal.value = false
  if (origin) flyPoints(`+${effort} P`, origin)
}

/**
 * Ein Zettelchen abreißen = die Unteraufgabe erledigen.
 *
 * Der Doppeltipp-Schutz sitzt **synchron** in `taskStore.completeTask`: dort
 * wird `completionsInFlight` geprüft und noch vor dem ersten `await` gesetzt,
 * ein zweiter Tap im selben Tick kommt also nicht durch. Hier steht bewusst
 * KEIN eigenes `:disabled` — das Attribut schreibt Vue erst im nächsten Tick
 * und schützt gegen drei synchrone Taps nicht. Aus demselben Grund entscheidet
 * über den Punkteflug der **Rückgabewert** von `completeTask`: ein
 * abgewiesener Doppelgriff darf keine zweite Zahl fliegen lassen.
 *
 * Punkte je nach `subtask_points_mode` der Unteraufgabe: `checklist` = 0,
 * `deduct` = wird vom Elternaufwand abgezogen, `bonus` = zusätzlich. Gerechnet
 * wird das ausschließlich in der Edge Function `complete-task`.
 *
 * **Was fliegt:** bei `bonus` und bei `deduct` der volle `effort` der
 * Unteraufgabe — beide erhöhen die Wochenpunkte um genau diesen Betrag (siehe
 * `estimateCompletionEffort`). Dass `deduct` am Zettelchen mit einem Minus
 * steht, meint den späteren Abzug beim Elternteil, nicht die Woche. Bei
 * `checklist` fliegt nichts, weil auch nichts dazukommt. Stumm ist das trotzdem
 * nicht — anders als beim ganzen Zettel bleibt das Zettelchen ja stehen und
 * quittiert selbst: `mini--torn` knickt es weg, und bei Aufgaben mit
 * Fortschritt kommt der Durchstrich dazu.
 */
const tearSubtask = async (subtaskId: string, handle: HTMLElement) => {
  const subtask = subtasks.value.find(s => s.task_id === subtaskId)
  const origin = centerOf(handle)
  markTorn(subtaskId)
  const applied = await taskStore.completeTask(subtaskId)
  if (!applied || !subtask) return
  if (subtask.subtask_points_mode === 'checklist') return
  flyPoints(`+${subtask.effort} P`, origin)
}

/**
 * Den ganzen Zettel abreißen = die Aufgabe erledigen.
 *
 * **Ein Abriss quittiert immer**, auch wenn er null Punkte bringt. Ein Zettel,
 * dessen Punkte schon über seine `deduct`-Unteraufgaben eingesammelt wurden,
 * ist kein Sonderfall, sondern das erwartete Ende genau dieser Zettel — er
 * verschwand vorher stumm von der Wand, und stumm sieht aus wie ein Fehlgriff.
 *
 * Kein „+0 P": eine Null in derselben Aufmachung wie ein Punktgewinn liest sich
 * wie ein Verlust oder wie ein Fehler. Stattdessen fliegt „erledigt" in der
 * ruhigen Papiervariante — dieselbe Bahn, dieselbe Ankunft, nur ohne
 * Punktbehauptung.
 */
const tearNote = async (handle: HTMLElement) => {
  const origin = centerOf(handle)
  const points = effectivePoints.value
  const applied = await taskStore.completeTask(props.task.task_id)
  if (!applied) return
  if (points > 0) flyPoints(`+${points} P`, origin)
  else flyPoints('erledigt', origin, { muted: true })
  // Der Fetzen — das Rückgängig zur Geste (Ticket 11). Erst NACH `applied`:
  // ein abgewiesener Doppelgriff hat nichts erledigt und darf nichts zum
  // Zurücknehmen anbieten.
  //
  // Nur der ganze Zettel bekommt einen. Ein abgerissenes Zettelchen bleibt
  // sichtbar an seinem Platz stehen — es verschwindet nichts, was man
  // zurückholen müsste —, und die Wege über die Dialoge (Aufwand anpassen,
  // verschieben) sind bewusste Entscheidungen mit Bestätigung, keine Geste,
  // die schneller ist als der Gedanke.
  offerScrap({ taskId: props.task.task_id, title: props.task.title, points })
}

/**
 * Die Abreiß-Geste. Ein Composable für **alle** Griffe dieses Zettels: das
 * Eselsohr und jedes Zettelchen. Es kann ohnehin nur einer gleichzeitig gezogen
 * werden, und ein Composable je Zettelchen hieße ein Scroll-Zuhörer je
 * Zettelchen.
 */
const tear = useTearGesture({
  onTear: (id, handle) => {
    if (id === NOTE_HANDLE) {
      // Am Projekt reißt nichts ab — der Griff ist dort der Griff zum Arbeiten
      // (Ticket 03). Nicht über `tearNote()`: das erledigt die Aufgabe UND
      // bietet unbedingt einen Fetzen an (`offerScrap`), und „Zurückkleben"
      // löschte dort einen Arbeitseintrag, ohne dass es jemand als Löschen
      // liest.
      if (isProject.value) openProjectWork()
      else void tearNote(handle)
    } else void tearSubtask(id, handle)
  }
})

// Einzeln herausgezogen, weil verschachtelte Refs im Template NICHT ausgepackt
// werden — `tear.pull` wäre dort das Ref-Objekt und nie eine Zahl.
const {
  scrolling: tearScrolling,
  activeId: tearActiveId,
  pull: tearPull,
  tearDistance,
  onPointerDown: onTearDown,
  onPointerMove: onTearMove,
  onPointerUp: onTearUp,
  onPointerCancel: onTearCancel,
  onTouchStart: onTearTouchStart,
  onTouchMove: onTearTouchMove,
  swallowClick: swallowTearClick
} = tear

/** Wird gerade am Eselsohr DIESES Zettels gezogen (nicht an einem Zettelchen)? */
const isNoteTearing = computed(() => tearActiveId.value === NOTE_HANDLE)

/**
 * Weit genug für ein Abreißen — der Zettel sagt es, bevor losgelassen wird.
 *
 * **An einem Projekt nie.** Der gestrichelte Umriss (`.zettel--tear-ready`) und
 * die Perforation am Eselsohr (`.ear--ready`) kündigen ein Abreißen an, das
 * dort nicht stattfindet: der Zettel bleibt hängen. Das Ziehfeedback bleibt
 * davon unberührt — der Zettel folgt weiter dem Finger (`.zettel--tearing`),
 * nur die Ankündigung des Abrisses entfällt.
 */
const isTearReady = computed(
  () => !isProject.value && isNoteTearing.value && tearPull.value >= tearDistance
)

watch(isNoteTearing, active => {
  if (active) emit('gesture-start', props.task.task_id)
  else emit('gesture-end', props.task.task_id)
})

/**
 * Ein Zettelchen folgt dem Finger. Inline, weil der Wert je Zettelchen
 * unterschiedlich ist und nur für genau eines gleichzeitig gilt.
 */
const miniStyle = (subtaskId: string): Record<string, string> | undefined => {
  if (tearActiveId.value !== subtaskId) return undefined
  const pull = tearPull.value
  return {
    transform: `translate(${(pull * 0.1).toFixed(1)}px, ${pull.toFixed(1)}px) rotate(${Math.min(9, pull * 0.11).toFixed(2)}deg)`,
    zIndex: '3',
    boxShadow: '4px 6px 0 rgba(36, 31, 26, 0.34)'
  }
}

/**
 * Antippen eines Zettelchen-Griffs erledigt weiterhin sofort — das ist der
 * Weg aus Ticket 06 und bleibt. Die Zieh-Geste kommt daneben, nicht an seine
 * Stelle. Hat sie ausgelöst, wird der nachlaufende Klick geschluckt; käme er
 * durch, finge ihn ohnehin der synchrone Riegel im Store ab.
 *
 * Der Scroll-Schutz gilt auch für dieses Antippen. Er hängt sonst nur am
 * `pointerdown` der Geste — der Klick liefe daran vorbei und erledigte mitten
 * im Bildlauf doch etwas.
 */
const onMiniEarClick = (subtaskId: string, event: MouseEvent) => {
  if (swallowTearClick(event)) return
  if (tearScrolling.value) return
  void tearSubtask(subtaskId, event.currentTarget as HTMLElement)
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

// --- Long-Press mit vier Richtungen (Etappe 4 / Ticket 10) -------------------

/**
 * Was diese Geste NICHT starten darf.
 *
 * **Nur noch die Abreiß-Griffe** (Ticket 01). Das Eselsohr des Zettels
 * (`.ear`) und die Mini-Eselsohren der Zettelchen (`.mini-ear`) haben ihre
 * eigene Geste (`useTearGesture`); weil `pointerdown` bis zum Wurzelelement
 * hochblubbert, liefe der Long-Press dort sonst **zusätzlich** mit: ein Zug am
 * Eselsohr hätte nach 420 ms auch die Richtungen eingeblendet, und dieselbe
 * Fingerbewegung nach unten hätte zweimal erledigt. Das **Abreißen** ist
 * außerdem laut Glossar ausdrücklich vom **Greifen** ausgenommen — es greift
 * sofort und **ohne Kranz**, weil es nur ein Ziel hat. Genau das leistet dieser
 * Wächter: startet die Geste hier nicht, erscheint auch keine Beschriftung.
 *
 * **Was hier bewusst NICHT steht: `.mini`, `.edit`, `.subs-badge` — und seit
 * Ticket 02 auch `.due-stamp` nicht.**
 * Ticket 01 dreht die Regel um — *der ganze Zettel ist Griff*. Ein Finger, der
 * auf dem Bearbeiten-Stift, dem Unteraufgaben-Abzeichen, dem Stempel oder der
 * Zeile eines aufgeklappten Zettelchens aufsetzt, muss den Zettel genauso greifen können
 * wie leeres Papier; wo er aufsetzt, ist für das Greifen ohne Bedeutung.
 *
 * Die Knöpfe verlieren dadurch nichts: sie hängen an `@click`, feuern also
 * ohnehin erst beim Loslassen, und ein Loslassen NACH überschrittener
 * Halte-Schwelle schluckt der Klick-Wächter am Fenster (`armClickGuard` in
 * `useDirectionPress`, feuert bei `fired` auch ohne anliegende Richtung). Wer
 * gespürt hat, dass er greift, bekommt beim Loslassen also weder ein
 * Bearbeiten-Modal noch ein Auf-/Zuklappen. Ein kurzer Tipp läuft wie gehabt
 * durch — unter 420 ms wird der Wächter nie scharf.
 */
const isPressControl = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('.ear, .mini-ear') !== null

/**
 * Die Belegung ist in `WallDirectionMenu` beschriftet und hier ausgeführt —
 * beide Listen müssen dieselbe Aussage machen.
 *
 * Für alles außer Projekten gilt weiter: dieselbe Bewegung tut auf jedem
 * Zettel dasselbe. Drei der vier Richtungen öffnen genau die Dialoge, die schon
 * am Bearbeiten-Knopf hängen; nur „unten" handelt sofort, weil es der
 * Schnellweg ist, den die Beschriftung lehren soll.
 *
 * **Projekte sind die eine Ausnahme** (Ticket 03, `HANDOFF-ziehgeste.md`
 * Punkt 5). Sie bekommen gar keinen Kranz, also auch keine Beschriftung, die
 * hier eingelöst werden müsste: „unten" öffnet das Arbeitsfenster, die anderen
 * drei tun **nichts**. Verschieben ergibt an einem Projekt keinen Sinn,
 * Erledigen gibt es dort nicht, und Zuweisen und Aufwand laufen laut
 * Nutzerentscheidung über den Bearbeiten-Stift. Eine Aktion ohne Beschriftung
 * wäre außerdem eine unsichtbare — der frühere Kommentar hier („kein
 * `if (task_type === …)`") stammt aus der Fassung, in der jeder Zettel einen
 * Kranz bekam.
 */
const onPressDirection = (direction: PressDirection) => {
  if (isProject.value) {
    if (direction === 'down') openProjectWork()
    return
  }
  if (direction === 'down') {
    const el = root.value
    if (el) void tearNote(el)
    return
  }
  if (direction === 'up') showPostponeModal.value = true
  else if (direction === 'left') showAssignmentModal.value = true
  else showCompletionModal.value = true
}

const press = useDirectionPress({
  onDirection: onPressDirection,
  isControl: isPressControl
})

// Einzeln herausgezogen — verschachtelte Refs werden im Template nicht
// ausgepackt (dieselbe Falle wie bei der Abreiß-Geste oben).
const {
  open: pressOpen,
  direction: pressDirection,
  origin: pressOrigin,
  tip: pressTip,
  onPointerDown: onPressDown,
  onPointerMove: onPressMove,
  onPointerUp: onPressUp,
  onPointerCancel: onPressCancel,
  onTouchStart: onPressTouchStart,
  onTouchMove: onPressTouchMove
} = press

/**
 * Dieselbe Ausnahme wie beim Abreißen: solange die Richtungen offen sind, darf
 * ein Neupacken der Wand (ein anderes Mitglied ändert etwas) diesen Zettel nicht
 * durch die Gegend fliegen lassen. Das Overlay liegt in Fensterkoordinaten fest
 * — ein wegfliegender Zettel unter einer stehenden Geste ist keine Bewegung, die
 * jemand erwartet.
 *
 * Beide Gesten teilen sich dafür `gestureNoteId` in `WallView`. Das geht, weil sie
 * sich gegenseitig ausschließen: der Long-Press startet nicht auf dem Eselsohr
 * (→ `isPressControl`), und ein zweiter Finger kommt in keiner der beiden durch.
 */
watch(pressOpen, open => {
  if (open) emit('gesture-start', props.task.task_id)
  else emit('gesture-end', props.task.task_id)
})

/** Deterministisch aus der `task_id` — nach jedem Neuladen dieselbe Neigung. */
const rotation = computed(() => rotationOf(props.task.task_id))

/**
 * Personenfarbe für die Reißzwecke — unverändert so, wie das Mitglied sie
 * gewählt hat. Es wird zur Laufzeit **nichts** umgefärbt, aufgehellt oder auf
 * eine Palette gerundet: die gewählte Farbe muss die angezeigte sein.
 *
 * `null` heißt „niemand zuständig". Dann bleibt `--owner` ungesetzt und an
 * der Reißzwecke greift die neutrale CSS-Rückfallfarbe (siehe `--owner-none`
 * unten).
 *
 * Seit der Korrektur zu Ticket 10 steht die Zuweisungsfarbe **ausschließlich**
 * an der Reißzwecke (`.pin`) — der Nutzer mochte den zwischenzeitlich
 * gebauten dicken farbigen Rahmen nicht. Der Zettelrahmen selbst bleibt
 * unabhängig von `ownerColor` immer konturlos (`transparent`, siehe
 * `.zettel` unten).
 */
const ownerColor = computed(() => {
  if (!props.task.assigned_to) return null
  const member = householdStore.householdMembers.find(m => m.user_id === props.task.assigned_to)
  return member?.user_color || null
})

/**
 * Ob jemand zuständig ist. Eigene Ableitung statt eines rohen
 * `!!props.task.assigned_to`, damit derselbe Fall wie bei `ownerColor` gilt:
 * ein `assigned_to`, das auf kein (mehr) existierendes Mitglied zeigt, zählt
 * als „niemand zuständig".
 *
 * Aktuell OHNE CSS-Wirkung am Zettel selbst (die frühere `.zettel--assigned`-
 * Regel mit dem dicken farbigen Rahmen ist nach der Nutzerkorrektur zu
 * Ticket 10 entfernt) — die Klasse bleibt am Element als Hook stehen, falls
 * die im Ticket angekündigte „zurückhaltendere Auszeichnung" später dort
 * andockt. Bis dahin ist sie totes Markup, bewusst belassen statt entfernt.
 */
const isAssigned = computed(() => ownerColor.value !== null)

/**
 * `--owner` wird nur gesetzt, wenn es wirklich eine Person gibt. Ohne die
 * Eigenschaft greift in jeder Regel der zweite Parameter von
 * `var(--owner, …)` — der zurücktretende Rand.
 *
 * Hier hängt auch die Zieh-Bewegung des Abreißens dran: die Neigung ist bereits
 * ein Inline-`transform`, ein zweites daneben gäbe es nicht — die letzte
 * Deklaration gewänne und die Neigung wäre weg. Beides steht deshalb in
 * derselben Zeichenkette.
 *
 * Der z-index bleibt bewusst **draußen**: den schreibt `WallView` direkt ans
 * Element. Würde Vue ihn hier zeitweise mitverwalten, entfernte es ihn beim
 * Loslassen wieder — der Zettel verlöre seine Stapelposition bis zum nächsten
 * Packen. Das Anheben während des Ziehens macht deshalb eine Klasse mit
 * `!important` (`.zettel--tearing`).
 */
const noteStyle = computed((): Record<string, string> => {
  const pull = isNoteTearing.value ? tearPull.value : 0
  const transform =
    pull > 0
      ? `translate(${(pull * 0.1).toFixed(1)}px, ${pull.toFixed(1)}px) rotate(${(rotation.value + Math.min(9, pull * 0.09)).toFixed(2)}deg)`
      : `rotate(${rotation.value.toFixed(2)}deg)`
  const style: Record<string, string> = { transform }
  if (ownerColor.value) style['--owner'] = ownerColor.value
  return style
})

/**
 * Der **Grundabdruck** — der berechnete unterste Abdruck des Gummistempels
 * (→ CONTEXT.md, „Stempel"). **Jeder Zettel trägt einen**, auch der, der noch
 * Zeit hat; es gibt keinen Zettel ohne Stempel mehr.
 *
 *   tägliche Aufgabe            → BEDARF   (sie wird nicht fällig, sie fällt an)
 *   Projekt                     → Projektspruch (es kann nicht in Verzug geraten)
 *   noch nie erledigt           → NEU
 *   sonst                       → FÄLLIG
 *
 * **Der Typ schlägt NEU, und die Reihenfolge dieser Prüfungen ist die ganze
 * Regel.** Eine nagelneue tägliche Aufgabe zeigt BEDARF, ein nagelneues Projekt
 * seinen Spruch — beide werden nie abgeschlossen, stünden bei umgekehrter
 * Prüfreihenfolge also DAUERHAFT auf NEU. Der Fehler wäre still: der Stempel
 * sähe plausibel aus, er stünde nur nie wieder um.
 *
 * **`NIE` und `HEUTE` sind ersatzlos entfallen.** `NEU` ersetzt `NIE` und heißt
 * dasselbe — noch nie abgeschlossen —, klingt aber nicht wie ein Urteil über die
 * Bewohner. `HEUTE` fällt weg, weil auf der Wand alle fälligen Aufgaben gleich
 * dringend sind; „heute dran" gegen „liegt schon länger" wäre eine Rangfolge,
 * und Rangfolgen macht die Wand nicht (→ ADR-0002). Aus demselben Grund gibt es
 * hier **keine Dringlichkeitsstufe mehr**, die den Stempel einfärben könnte: die
 * früheren Klassen `--hot`/`--today` sind mit ihrer Aussage verschwunden.
 *
 * **Der Grundabdruck verfällt nicht.** Er wird berechnet und kommt von selbst
 * wieder; was von Hand daraufgelegt wird, ist das Überstempeln und hängt an
 * `emphasis_level` (→ Ticket `02`/`03`). Und er **ordnet nicht** (→ ADR-0002).
 *
 * **Kein Ring an der Reißzwecke.** Der Handoff (Punkt 7) sah zusätzlich einen
 * farbigen Ring um die Reißzwecke vor — Ticket 10 hat die Reißzwecke seither
 * der Zuweisungsfarbe gegeben (`--owner`), ein Ring wäre sofort wieder
 * entfernt worden. Der Stempel hier ist deshalb die EINZIGE Stelle am Zettel,
 * die den Stand einer Aufgabe zeigt (→ CONTEXT.md, „Stempel").
 *
 * **Es gibt bewusst keinen zweiten Text mit der genauen Tageszahl daneben**
 * (früher `metaLabel`/`.meta`, „3 Tage" / „heute" / „nie" in Rot — entfernt,
 * QC-Befund: die Dringlichkeit stand damit zweimal in der Fußzeile, einmal
 * am Stempel, einmal an einer Farbe, die das Glossar für den Stempel
 * ausdrücklich ausschließt, siehe CONTEXT.md). Die Tageszahl selbst fehlt
 * damit auch als Information — gewollt: auf der Wand gelten alle fälligen
 * Aufgaben als GLEICH dringend, eine Zählung „3 Tage überfällig" widerspräche
 * dem. Kein Verlust, sondern die Auflösung eines Widerspruchs. Wer hier
 * wieder eine Tageszahl anzeigen will, widerspricht damit dem Glossareintrag
 * „Stempel" — das ist eine Domänenentscheidung, keine UI-Petitesse.
 */
const stampLabel = computed((): string => {
  // ERST der Typ, DANN der Erledigungs-Status. Nicht umstellen, siehe oben.
  if (props.task.task_type === 'daily') return 'BEDARF'
  if (props.task.task_type === 'project') return projectPhraseOf(props.task)
  return props.task.last_completed_at ? 'FÄLLIG' : 'NEU'
})

/**
 * Der **Nachdruck** — was von Hand auf den Grundabdruck gelegt wurde
 * (Ticket `02`, → CONTEXT.md „Überstempeln"). `null` heißt: der Zettel ist
 * sauber, es gilt allein der Grundabdruck.
 *
 * **Die Modulo-Logik steht hier bewusst NICHT** — sie liegt im Store
 * (`cycleEmphasisLevel`). Diese Stelle zeigt nur an, was gerade gilt.
 */
const emphasisLabel = computed((): string | null => {
  if (props.task.emphasis_level === 1) return 'WICHTIG'
  if (props.task.emphasis_level === 2) return 'DRINGEND'
  return null
})

/**
 * Betrag der Neigung eines Abdrucks in Grad, dazu die Streubreite je Lage:
 * **9° ± 5°**. Beides aus der Abnahme am Bild (Variante F,
 * `stempel-optik-prototypen.md`), nicht frei gewählt — der Nutzer will die
 * Neigung ausdrücklich sehen.
 *
 * **Es ist ein Betrag, kein Winkel: die Richtung kommt aus `stampTiltSign`.**
 * Bis zum 05.09.2026 stand hier −9 mit ±5 Streuung, und weil `jitterOf`
 * symmetrisch um null streut, ergab das −14° … −4° — **jeder** Stempel der
 * ganzen Wand nach links, keiner nach rechts. Vom Maintainer am Gerät
 * bemerkt. Ein Vorzeichen, das nie kippt, ist keine Streuung, sondern eine
 * feste Schräge mit Rauschen.
 */
const STAMP_TILT = 9
const STAMP_TILT_JITTER = 5

/**
 * Versatz einer UNTEREN Lage gegen die oberste, in Pixeln: ±5,5.
 *
 * **Ein Messergebnis, kein Geschmack.** Der Wert stand ursprünglich auf 3 px;
 * sobald die oberste Lage deckt (und genau das ist Variante F), verschwinden
 * die unteren darunter vollständig — der Stapel wäre unsichtbar, und die
 * Stapelhöhe soll die Aussage tragen. Bei 5,5 px lugen die Rahmen erkennbar
 * hervor. Nicht „aufräumen".
 *
 * Der Versatz läuft über `transform` und geht deshalb **nicht** in die Breite
 * der Fußzeile ein — was die Breite bestimmt, steht am `.due-stamp`-CSS.
 */
const STAMP_OFFSET = 5.5

/**
 * Nach links oder nach rechts? Deterministisch aus der Aufgaben-Kennung, damit
 * derselbe Zettel überall gleich hängt — dieselbe Regel wie bei Versatz und
 * Neigung.
 *
 * **Das Vorzeichen hängt an der LAGE, nicht am Zettel.** Jeder Abdruck ist ein
 * eigener Handgriff und darf anders herum sitzen; ein Stapel, in dem alle drei
 * gleich kippen, sieht aus wie gedruckt, nicht wie gestempelt. Bis zum
 * 05.09.2026 hing das Vorzeichen am Zettel — vom Maintainer am Gerät bemerkt:
 * „ich hab nie erlebt, dass ein Stempel der nach links geneigt ist von einem
 * überstempelt wird der nach rechts geneigt ist".
 *
 * Für die Geometrie ist das Kippen folgenlos: die Hüllbreite eines gedrehten
 * Kastens ist `b·cos θ + h·sin θ` und damit für +θ und −θ gleich. Gemessen an
 * 94 Zetteln × 3 Stufen: gekreuzte Lagen ragen in **0 von 564** Fällen in die
 * 88-px-Reserve, und über die Papierkante nicht weiter als gleichsinnige.
 */
const tiltSignOf = (id: string, index: number) => (jitterOf(id, `stamp-dir${index}`, 1) < 0 ? -1 : 1)

/** Eine Lage des Abdruckstapels, von unten (Grundabdruck) nach oben. */
interface StampLayer {
  /** Index in der Rampe: 0 Grundabdruck, 1 WICHTIG, 2 DRINGEND. */
  level: 0 | 1 | 2
  text: string
  /** Die zurzeit oberste, gültige Lage — voll deckend, mit Papier-Halo. */
  top: boolean
  /** Noch nicht gestempelt: unsichtbar, aber **weiterhin gemessen** (siehe unten). */
  reserved: boolean
  transform: string
  /**
   * Wieviel breiter der Papier-Halo dieser Lage sein muss, um die Lagen
   * DARUNTER zu verdecken — nur an der obersten Lage von Belang, sonst 0.
   * Ausführlich am `.stamp-layer--top`-Block im CSS.
   */
  haloSlack: number
}

/**
 * Der **Abdruckstapel** (Ticket `03`, Variante F „Papier-Halo",
 * → CONTEXT.md „Überstempeln").
 *
 * **Alle drei Lagen stehen IMMER im DOM — auch die noch nicht gestempelten.**
 * Das ist die Stelle, an der dieses Ticket still kaputtginge: nach einem Tipp
 * wird bewusst NICHT neu gepackt (`layoutSignature` in `WallView.vue` kennt
 * `emphasis_level` nicht, → ADR-0002). Wüchse die Fußzeile beim Stempeln,
 * schöbe sich das Layout unter dem Finger weg — oder bliebe, schlimmer, falsch
 * gepackt stehen. Die noch nicht gesetzten Lagen sind deshalb nur
 * `visibility: hidden`: unsichtbar, aber im Grid weiterhin vermessen. Der
 * Stapel hat seinen Platz damit **von Anfang an**, unabhängig von der Stufe.
 * (Gemessen: `style.left/top/width` aller Zettel und die Wandhöhe sind auf
 * Stufe 0 und Stufe 2 bis auf den letzten Pixel gleich.)
 *
 * **Der Weg, der stattdessen nahelag, ist gemessen und gescheitert:** die
 * Nachdrücke ABSOLUT über den Grundabdruck legen, so wie es Ticket `02` tat.
 * Er kostet tatsächlich keinen Pixel — Wandhöhe und alle Positionen bleiben
 * exakt auf dem stempellosen Stand, 0 von 93 Zetteln bewegen sich. Er
 * scheitert an einer Arithmetik, die nichts mit der Optik zu tun hat: die
 * Breite eines Zettels wird aus dem GRUNDABDRUCK plus den 88 px für Stift und
 * Eselsohr gerechnet. Auf einem schmalen Zettel (`NEU`, 38,8 px, Zettel 156 px)
 * beginnt der Stift damit unmittelbar rechts vom Grundabdruck — für die 79 px
 * von `DRINGEND` ist dort kein Platz, egal wie man die Lage verankert. Nach
 * links geht es nicht, dort sind nur 9 px bis zur Papierkante. Gemessen: der
 * Kasten der obersten Lage lief auf **86 von 93** Zetteln in den Stift (bis
 * 28,02 px), und auf **36 von 93** lag das WORT unter der sichtbaren
 * Stift-Glyphe, die später im DOM steht und deshalb darüber gezeichnet wird.
 * Geschluckte Klicks gab es keine (`elementFromPoint` auf Stift und Eselsohr:
 * 0 von 93), die Papierkante hielt ebenfalls — aber der oberste Abdruck war
 * nicht mehr sauber lesbar, und genau das ist der Zweck dieses Tickets.
 *
 * **Versatz und Neigung kommen deterministisch aus der Aufgaben-Kennung**
 * (`jitterOf`, derselbe FNV-1a wie beim Zettelversatz) — nie `Math.random`, nie
 * die Listenposition. Ein Stempel, der beim Neuladen woanders sitzt, sieht aus
 * wie ein Fehler; auf einem zweiten Gerät säße er anders als hier.
 *
 * **Der Versatz hängt an der LAGE, nicht an ihrer Rolle — und JEDE Lage hat
 * einen, auch der Grundabdruck.** Das ist keine Feinheit. Hing er an `top`,
 * dann sprang der Grundabdruck in dem Moment beiseite, in dem der erste
 * Nachdruck daraufkam: er war bis dahin die oberste Lage und saß bei 0/0.
 * Nicht der neue Abdruck bewegte sich, sondern der alte. Das widerspricht dem
 * Ticket („vorherige Abdrücke **bleiben liegen**") und der Sache selbst — ein
 * Abdruck, der einmal auf dem Papier ist, verrutscht nicht mehr. Vom
 * Maintainer am Gerät bemerkt, bevor es committet war.
 *
 * Dass auch Lage 0 einen Versatz bekommt, ist Absicht und nicht bloß der
 * bequemste Weg, den Sprung loszuwerden: ein handgesetzter Stempel sitzt nie
 * exakt, genau wie die Neigung. Und es ist das, was den Stapel überhaupt
 * sichtbar macht — läge der Grundabdruck mittig unter einem deckenden
 * Nachdruck, sähe man beim Überstempeln nichts von ihm.
 */
const stampLayers = computed((): StampLayer[] => {
  const texts = [stampLabel.value, 'WICHTIG', 'DRINGEND']
  const level = props.task.emphasis_level
  const id = props.task.task_id
  const offsets = texts.map((_, index) => jitterOf(id, `stamp-dx${index}`, STAMP_OFFSET))

  return texts.map((text, index) => {
    const top = index === level
    const tilt = tiltSignOf(id, index) * (STAMP_TILT + jitterOf(id, `stamp-rot${index}`, STAMP_TILT_JITTER))
    const dx = offsets[index]
    const dy = jitterOf(id, `stamp-dy${index}`, STAMP_OFFSET)

    // Der Halo muss den seitlichen Versatz der Lagen DARUNTER ausgleichen —
    // und nur den. Auf Stufe 0 gibt es keine, der Zuschlag ist dort 0.
    // Verdoppelt, weil der Kasten mittig in der Zelle sitzt und der Zuschlag
    // sich damit auf beide Seiten verteilt.
    // Der Hof gilt fuer JEDE Lage, nicht nur die oberste: sonst aendert sich
    // sein Wert in dem Moment, in dem eine Lage ueberstempelt wird.
    const slack = 2 * Math.max(0, ...offsets.slice(0, index).map(other => Math.abs(other - dx)))

    return {
      level: index as 0 | 1 | 2,
      text,
      top,
      reserved: index > level,
      transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`,
      haloSlack: slack
    }
  })
})

/**
 * Ein Tipp auf den Stempel dreht ihn weiter: sauber → WICHTIG → DRINGEND →
 * sauber (Ticket `02`).
 *
 * **An einem Projekt wechselt beim letzten Schritt zusätzlich der Grundabdruck**
 * — das Abräumen zieht einen neuen Projektspruch (Ticket `04`). Auch das macht
 * der Store; diese Stelle weiß davon nichts und soll es nicht wissen.
 *
 * **Kein `await`, keine Auswertung des Rückgabewerts, kein Toast.** Der Automat
 * im Store ist optimistisch — der Wert steht, bevor diese Funktion zurückkehrt,
 * und genau darauf beruht das Gummistempel-Gefühl: mehrfaches schnelles
 * Antippen ist ausdrücklich vorgesehen. Ein Erfolgs-Toast blitzte dabei dreimal
 * auf. Scheitert das Schreiben, springt der Wert zurück und der Store meldet es
 * selbst mit **einem** Toast (`onError` dort).
 *
 * **Kein eigener Doppeltipp-Riegel.** Anders als beim Erledigen entsteht hier
 * durch einen zweiten Griff keine zweite Buchung: `emphasis_level` ist ein
 * Zustand, kein Ereignis, und `runOptimistic` reiht die Schreibvorgänge je
 * `task_id` hintereinander auf (`enqueue`). Drei schnelle Taps ergeben drei
 * Umläufe des Werts und einen Endzustand, der stimmt — nichts wird gebucht.
 *
 * **Der Stempel steht bewusst nicht in `isPressControl`** (Begründung dort):
 * Gedrückthalten auf ihm greift weiterhin den Zettel und öffnet den Kranz. Dass
 * dabei nicht ZUSÄTZLICH gestempelt wird, erledigt der Klick-Wächter am Fenster
 * in `useDirectionPress` — er sieht den nachlaufenden Klick in der Einfangphase,
 * also vor dem `@click.stop` am Stempel. Ein kurzer Tipp (unter 420 ms) macht
 * den Wächter nie scharf und kommt unangetastet hier an.
 */
const onStampTap = () => {
  void taskStore.cycleEmphasisLevel(props.task.task_id)
}

// --- Bearbeiten und seine Folgedialoge --------------------------------------
// Der Zettel zeigt nur den Bearbeiten-Knopf. Zuweisen, Unteraufgaben und
// Verschieben hängen unverändert am bestehenden Modal.

const showEditModal = ref(false)
const showAssignmentModal = ref(false)
const showSubtaskManagementModal = ref(false)
const showPostponeModal = ref(false)
/** „Erledigen mit angepasstem Aufwand" — nur über den Zug nach rechts. */
const showCompletionModal = ref(false)

/**
 * Erledigen mit angepasstem Aufwand.
 *
 * **Kein eigenes `:disabled` und kein eigener Riegel**: der Doppeltipp-Schutz
 * sitzt synchron in `taskStore.completeTask` (`completionsInFlight`, vor dem
 * ersten `await`). Über den Rückgabewert entscheidet sich auch hier, ob eine
 * Zahl fliegt — ein abgewiesener zweiter Griff darf keine zweite auslösen.
 *
 * **Was fliegt, ist der gewählte Aufwand, nicht `effectivePoints`.** Ein
 * ausdrücklich gesetzter `effortOverride` ersetzt die Rechnung vollständig,
 * inklusive des Abzugs erledigter `deduct`-Unteraufgaben — genau so rechnet
 * `estimateCompletionEffort` im Store (erste Zeile: `if (effortOverride !==
 * undefined) return effortOverride`), und die Statusleiste wächst um genau
 * diesen Betrag.
 *
 * Der Startpunkt ist die Mitte des Zettels und nicht die des Eselsohrs: der
 * Zug ging hier nicht von der Ecke aus.
 *
 * Bei einem Aufwand von 0 kann diese Stelle nicht landen — das Modal lässt nur
 * 1 bis 5 zu. Die ruhige „erledigt"-Variante des Abreißens braucht es hier
 * deshalb nicht.
 */
const handleCustomCompletion = async (effortOverride: number, note: string) => {
  const el = root.value
  const origin = el ? centerOf(el) : null
  const applied = await taskStore.completeTask(props.task.task_id, effortOverride, note)
  if (!applied) return
  showCompletionModal.value = false
  if (origin) flyPoints(`+${effortOverride} P`, origin)
}

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
  <!-- `@contextmenu.prevent` (Ticket 01): die native Langdruck-Geste des
       Browsers ist der einzige Mechanismus, der ortsabhängig ist — sie hängt
       daran, WAS unter dem Finger liegt (Text, Bild, Auswahlbares), während
       unser eigener Timer in `useDirectionPress` die Stelle gar nicht kennt.
       Sie feuert die native Haptik (die App selbst ruft nirgends
       `navigator.vibrate`) und nimmt uns danach den Zeiger per `pointercancel`
       weg. `user-select: none` unterdrückt nur die SICHTBARE Auswahl — Marker
       und Lupe bleiben deshalb aus, die Geste läuft trotzdem. Erst das
       Abbestellen des Kontextmenüs bricht sie ab; genau das tut auch das
       ältere `useLongPress` der Listen, das seit jeher `@contextmenu` bindet.
       Am Zettel geht dabei nichts verloren: er ist ein Knopf, kein Fließtext,
       und ein Kontextmenü hat dort keine Aufgabe. -->
  <div
    ref="root"
    class="zettel"
    :class="[
      `zettel--${kind}`,
      {
        'zettel--tappable': hasSubtasks,
        'zettel--meta-top': props.metaTop,
        'zettel--tearing': isNoteTearing,
        'zettel--tear-ready': isTearReady,
        'zettel--pressed': pressOpen,
        'zettel--assigned': isAssigned
      }
    ]"
    :style="noteStyle"
    @click="onSurfaceTap"
    @pointerdown="onPressDown"
    @pointermove="onPressMove"
    @pointerup="onPressUp"
    @pointercancel="onPressCancel"
    @touchstart.passive="onPressTouchStart"
    @touchmove="onPressTouchMove"
    @contextmenu.prevent
  >
    <!-- Befestigung: Reißzwecke / Klebeband / Büroklammern.
         Sie ist das Typ-Signal, deshalb kein Text daneben. -->
    <span v-if="kind === 'open'" class="pin" aria-hidden="true"></span>
    <span v-else-if="kind === 'daily'" class="tape" aria-hidden="true"></span>
    <template v-else>
      <span class="clip clip--l" aria-hidden="true"></span>
      <span class="clip clip--r" aria-hidden="true"></span>
    </template>

    <!-- Kopf: der Titel bekommt die ganze obere Kante (Karten-Redesign,
         Ticket 00a). Der Punktwert steht HIER ein zweites Mal im DOM —
         sichtbar ist immer nur eine der beiden Stellen, gesteuert über
         `zettel--meta-top` (Prop `metaTop`, siehe Skript und `WallView`). -->
    <div class="head">
      <!-- Schwimmt nach rechts — der Titel fließt aber NICHT darum herum:
           `.title` öffnet mit `overflow: hidden` einen eigenen Block-
           Formatierungskontext, und ein solcher Kasten darf den Float-Kasten
           nicht überlappen. Der Titel steht deshalb über seine GANZE Höhe in
           einer um die Ecke verengten Spalte; auch die zweite und dritte
           Zeile bleiben kurz, keine läuft unter der Ecke weiter. QC-Beleg:
           `head.clientWidth − title.clientWidth` ist ohne `zettel--meta-top`
           0 und mit ihr genau die Breite dieser Ecke — gemessen 41 px bei 36
           Zetteln und 46 px bei zwei Zetteln mit Fünf-Punkte-Stern, den
           `.points--s5` breiter macht. Die Ecken sind also NICHT alle gleich
           breit.

           Das ist eine echte Kopplung, kein Nebeneffekt: wer das
           `overflow: hidden` an `.title` wegräumt, nimmt nicht nur die
           Ellipse-Klemme mit (Begründung dort), sondern verändert auch die
           Form dieses Kopfes — und die Breitenmessung in `WallView`
           (`cornerExtra`) rechnet dann für ein Layout, das es nicht mehr gibt.

           Nur sichtbar mit `zettel--meta-top`. -->
      <div class="corner">
        <span class="points" :class="pointsShapeClass" :title="pointsTitle">
          {{ pointsLabel }}
        </span>
      </div>

      <p class="title">{{ props.task.title }}</p>
    </div>

    <!-- Fußzeile im normalen Fluss, zugleich die GRIFFZEILE: links der
         Punktwert, rechts Stift und Eselsohr — beide 44×44 px nebeneinander
         (Karten-Redesign, Ticket 00a). -->
    <div class="foot">
      <!-- NICHT `task.effort`: hier steht, was das Abreißen wirklich noch
           einbringt (→ `effectivePoints`). Die Zahl ist das Versprechen, das
           der Punkteflug gleich einlöst — beide kommen aus derselben Quelle.

           Punkte als aufgeklebter Sticker: die FORM trägt den Wert (Kreis 1,
           Quadrat 2, Sechseck 3, Wappen 4, Stern 5), die Zahl bestätigt ihn
           nur — auf einen Blick erkennbar, ohne zu lesen. Funktioniert auch
           bei Farbenblindheit, weil die Silhouette trägt, nicht nur die
           Farbe. Werte über 5 (Bonus-Unteraufgaben) fallen alle auf den
           Stern — bekannt offen, siehe `HANDOFF-kartengroesse.md`.

           Bei einem PROJEKT steht hier kein Versprechen, sondern die Bilanz:
           die bis jetzt verschlungenen Punkte (→ `displayPoints`). Ein Projekt
           wird nicht abgerissen, es fliegt beim Zug also auch nichts, was diese
           Zahl einlösen müsste. Das Abzeichen trägt deshalb ein eigenes Bild
           (`points--badge`, siehe CSS) — die Sticker-Formen bedeuten eine
           Punktzahl, das Abzeichen eine Stufe. -->
      <span class="points" :class="pointsShapeClass" :title="pointsTitle">
        {{ pointsLabel }}
      </span>
      <!-- Unteraufgaben haben jetzt IMMER ein eigenes Zeichen — ein
           angeklammerter Zettelstapel. Vorher verriet nur die Fortschrittszahl
           ihre Existenz, und die fehlte bei `daily` und reinen Checklisten
           ganz (→ `tracksProgress`); dort war das Aufklappen unsichtbar.

           Es ist ein echter Knopf, kein bloßes Zeichen: die ganze Zettelfläche
           klappt zwar weiterhin auf, aber sie sagt es niemandem. Der Zähler
           steht nur, wo Fortschritt etwas bedeutet; sonst die blanke Anzahl. -->
      <button
        v-if="hasSubtasks"
        class="subs-badge"
        :class="{ 'subs-badge--open': props.expanded }"
        :title="props.expanded ? 'Unteraufgaben zuklappen' : 'Unteraufgaben aufklappen'"
        @click.stop="emit('toggle', props.task.task_id)"
      >
        <i class="bi bi-list-task" aria-hidden="true"></i>
        <span class="subs-count">
          {{ tracksProgress ? `${doneSubtasks}/${subtasks.length}` : subtasks.length }}
        </span>
      </button>
      <!-- Der Gummistempel, sein Grundabdruck (→ `stampLabel` im Skript).
           **JEDER Zettel trägt einen**, auch der, der noch Zeit hat: ohne
           sichtbaren Abdruck gäbe es keine Fläche zum Antippen, und das
           Überstempeln hängt daran (→ Ticket `02`).

           Er steht IM FLUSS der Fußzeile, nicht darüber: so kann er sich mit
           keinem Knopf überschneiden, egal wie schmal der Zettel wird — die
           Zeile schiebt ihn zur Seite, statt ihn zu überlagern.

           **`v-if` gibt es hier bewusst nicht mehr.** Das Element ist ab jetzt
           unbedingt da, und die Breitenmessung in `WallView.vue` verlässt sich
           darauf: sie sucht `.due-stamp` per `querySelector` und zählt danach
           die Flex-`gap`s der Fußzeile ab. **Klassenname und Platz als
           DIREKTES Flex-Kind von `.foot` sind Vertrag mit dieser Messung** —
           wer eines von beidem ändert, ohne `WallView.vue` mitzuziehen,
           bekommt eine still falsche Zettelbreite: kein Fehler, keine Warnung,
           nur ein Zettel, der nicht passt.

           **Er ist die EINZIGE Stelle am Zettel, die den Stand einer Aufgabe
           zeigt** (→ CONTEXT.md, „Stempel"). Vorher stand daneben zusätzlich
           die genaue Tageszahl in Rot (`.meta`, „3 Tage" / „heute" / „nie") —
           das war eine zweite Anzeige derselben Aussage, und dazu eine Farbe,
           die das Glossar für den Stempel ausdrücklich ausschließt. Die
           Tageszahl fehlt jetzt bewusst: auf der Wand gelten alle fälligen
           Aufgaben als GLEICH dringend, eine Zählung „3 Tage überfällig"
           widerspräche dem. Das ist kein Informationsverlust, sondern die
           Auflösung eines Widerspruchs — nicht wieder einführen. -->
      <!-- Antippbar seit Ticket `02`: ein Tipp dreht den Nachdruck weiter
           (→ `onStampTap` im Skript). `@click.stop` hält den Zettel davon ab,
           dabei auch noch auf- oder zuzuklappen (`onSurfaceTap` an der
           Wurzel) — es ist die EINZIGE Abgrenzung zwischen den beiden
           Tipp-Zielen auf diesem Zettel.

           **Der Stempel kommt trotzdem NICHT in `isPressControl`**: der ganze
           Zettel bleibt Griff, gerade unten, wo der Daumen liegt. Genau wie
           `.edit` und `.subs-badge`, die auch Knöpfe sind und auch nicht darin
           stehen. Gedrückthalten öffnet hier also weiterhin den Kranz; der
           nachlaufende Klick wird vom Wächter am Fenster geschluckt, bevor er
           dieses `@click.stop` erreicht.

           Kein `<button>`: das Element ist Vertrag mit der Breitenmessung in
           `WallView.vue` (Klassenname UND Platz als direktes Flex-Kind von
           `.foot`), und ein Knopf brächte eigene Polster, Schrift und Kästen
           mit, die diese Messung still verschieben. -->
      <span
        class="due-stamp"
        :data-emphasis="props.task.emphasis_level"
        :title="emphasisLabel ? `Überstempelt: ${emphasisLabel} — tippen zum Weiterdrehen` : 'Tippen: überstempeln'"
        @click.stop="onStampTap"
      >
        <!-- Der Abdruckstapel (Ticket `03`, → `stampLayers` im Skript).

             **Immer alle drei Lagen**, auch die noch nicht gestempelten: die
             stehen als `.stamp-layer--reserved` unsichtbar, aber im Grid
             weiterhin gemessen. Ohne sie wüchse die Fußzeile beim Stempeln,
             und die Wand packt nach einem Tipp nicht neu (`layoutSignature`
             kennt `emphasis_level` nicht, → ADR-0002). Ausführlich bei
             `stampLayers`.

             `v-for` über `level` statt über den Text: zwei Lagen können
             denselben Text tragen (ein Projekt mit dem Spruch „DRINGEND"
             käme sonst zum Schlüsselkonflikt). -->
        <span
          v-for="layer in stampLayers"
          :key="layer.level"
          class="stamp-layer"
          :class="[
            `stamp-layer--l${layer.level}`,
            layer.top ? 'stamp-layer--top' : 'stamp-layer--under',
            { 'stamp-layer--reserved': layer.reserved }
          ]"
          :style="{ transform: layer.transform, '--halo-slack': `${layer.haloSlack.toFixed(2)}px` }"
          :aria-hidden="layer.top ? undefined : 'true'"
          >{{ layer.text }}</span
        >
      </span>
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
          'mini--torn': recentlyTorn.has(subtask.task_id),
          'mini--tearing': tearActiveId === subtask.task_id
        }"
        :style="miniStyle(subtask.task_id)"
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
          @pointerdown="onTearDown(subtask.task_id, $event)"
          @pointermove="onTearMove"
          @pointerup="onTearUp"
          @pointercancel="onTearCancel"
          @touchstart.passive="onTearTouchStart"
          @touchmove="onTearTouchMove"
          @click="onMiniEarClick(subtask.task_id, $event)"
        ></button>
      </div>
    </div>

    <!-- Der nachlaufende Klick eines Long-Press kann sehr wohl hier landen: der
         Knopf sitzt jetzt unten rechts (Karten-Redesign, Ticket 00a), also
         genau dort, wo ein Zug nach unten oder rechts enden kann. Dass er das
         Modal trotzdem nicht öffnet, regelt der Klick-Wächter am Fenster (→
         `useDirectionPress`) — er sieht den Klick in der Einfangphase, vor
         diesem `@click.stop`.

         **Seit Ticket 01 startet der Long-Press auch AUF diesem Knopf**:
         `.edit` steht nicht mehr in `isPressControl`, der ganze Zettel ist
         Griff. Derselbe Wächter trägt beide Fälle — wer hier lange drückt,
         greift den Zettel, und beim Loslassen ohne Bewegung öffnet sich
         KEIN Modal. Ein kurzer Tipp öffnet es wie bisher. -->
    <button class="edit" title="Aufgabe bearbeiten" @click.stop="showEditModal = true">
      <i class="bi bi-pencil" aria-hidden="true"></i>
    </button>

    <!-- Das Eselsohr: der Abreiß-Griff. Kein Text daneben — die angeknickte
         Ecke mit der Perforationslinie sagt „hier anfassen".

         Ein Antippen tut ausdrücklich NICHTS (der Klick wird nur geschluckt,
         damit er den Zettel nicht aufklappt): Erledigen ist eine Zieh-Geste.
         Ein Griff, der schon auf Antippen erledigt, wäre die versehentlichste
         Erledigung der ganzen App.

         **Am AUFGEKLAPPTEN Zettel gibt es ihn nicht.** Dort sitzt in derselben
         Ecke der Griff des letzten Zettelchens: die untere rechte Ecke des
         Zettels IST die untere rechte Ecke des letzten Zettelchens, und beide
         Trefferflächen lägen übereinander. Der Zettel steht im DOM später und
         gewänne — ein Zug am letzten Zettelchen würde also die ganze Aufgabe
         erledigen statt der Unteraufgabe. Genau die Art Fehlgriff, die man
         nicht sieht und nur ertastet. Wer die ganze Aufgabe abreißen will,
         klappt zu und zieht; eingeklappt ist die Ecke frei. -->
    <button
      v-if="!props.expanded"
      class="ear"
      :class="{ 'ear--ready': isTearReady }"
      :title="`„${props.task.title}“ nach unten abreißen`"
      @pointerdown="onTearDown(NOTE_HANDLE, $event)"
      @pointermove="onTearMove"
      @pointerup="onTearUp"
      @pointercancel="onTearCancel"
      @touchstart.passive="onTearTouchStart"
      @touchmove="onTearTouchMove"
      @click="swallowTearClick"
    ></button>

    <!-- Die vier beschrifteten Richtungen: Vollbild-Overlay, teleportiert nach
         `body` und in Fensterkoordinaten gelegt — die Begründung steht in der
         Komponente. Es hängt an der Geste, nicht am Zettel: Ursprung ist der
         Aufsetzpunkt, nicht die Zettelmitte.

         **An einem Projekt gar nicht** (Ticket 03): kein Kranz, kein Schleier.
         Die Geste läuft trotzdem weiter — nur „unten" führt dort zu etwas, und
         eine Beschriftung, die drei tote Richtungen anböte, wäre eine falsche
         Aussage.

         **`zettel--pressed` bleibt trotzdem an** — auch am Projekt. Erste
         Fassung hatte es mit unterdrückt („sichtbar passiert nichts"); der QC
         hat gemessen, was das kostet: ab exakt 420 ms sperrt
         `useDirectionPress` den Bildlauf (`onTouchMove` → `preventDefault`)
         und schluckt den Loslass-Klick (`armClickGuard` feuert bei `fired`,
         auch ohne anliegende Richtung) — halten und loslassen ließ den Zettel
         messbar unverändert, der Tipp verpuffte. Das passiert bei JEDEM
         Zettel; der Unterschied ist nur, dass man dort den Kranz sieht und
         deshalb versteht, warum die Wand gerade nicht reagiert. Der Defekt
         war also die fehlende Rückmeldung, nicht der Wächter.

         Das Ticket verbietet den **Kranz**, nicht das Anheben: ein Zettel, der
         sich hebt, sagt „ich höre zu", ohne eine Richtung zu versprechen.
         `.zettel--pressed` hebt nur Schatten und Papierhelligkeit an, weder
         Größe noch Lage noch Neigung (Begründung samt Messwerten an der Regel
         im CSS-Block). Damit passt auch das `gesture-start`/`gesture-end`
         an `pressOpen` zum sichtbaren Zustand, statt ein unsichtbarer
         Nebeneffekt zu sein — deshalb ist dort ebenfalls nichts unterdrückt. -->
    <WallDirectionMenu
      v-if="pressOpen && !isProject"
      :origin="pressOrigin"
      :tip="pressTip"
      :active="pressDirection"
    />

    <!-- Zug nach rechts: erledigen mit angepasstem Aufwand. Dasselbe Modal wie
         in der alten Karte, damit beide Ansichten denselben Ablauf haben. -->
    <TaskCompletionModal
      v-if="showCompletionModal"
      :taskTitle="props.task.title"
      :defaultEffort="props.task.effort"
      :isLoading="taskStore.isLoading"
      @close="showCompletionModal = false"
      @confirm="handleCustomCompletion"
    />

    <!-- Beide Gesten nach unten an einem Projekt: dasselbe Fenster wie der
         Knopf „Am Projekt arbeiten" im klassischen Aussehen. Auswahl UND Notiz
         sind dort Pflicht, nichts ist vorausgewählt — Schließen ohne Eintrag
         bucht nichts. -->
    <ProjectWorkModal
      v-if="showProjectWorkModal"
      :projectTitle="props.task.title"
      :isLoading="isLoggingWork"
      @close="showProjectWorkModal = false"
      @confirm="handleProjectWork"
    />

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
  /* Rückfallfarbe der Reißzwecke ohne Zuständige (`.pin` unten): derselbe
     Grauton wie zuvor, aber auf 45 % gegen das Papier gemischt, damit
     „niemand zuständig" nie kräftiger wirkt als „X ist zuständig". Gemessen:
     `--pw-free` erreichte 3,87:1 gegen das Papier, die blasseste vergebene
     Personenfarbe (#4A90E2) nur 3,23:1 — „niemand" las sich lauter als
     „jemand". Jetzt sind es 1,71:1 gegen Papier und 1,28:1 gegen Kork, also
     klar zurücktretend gegenüber jeder Personenfarbe.

     Bewusst NICHT die Lösung des eigentlichen Problems: dass eine helle
     `user_color` auf Kork wenig hergibt, klärt die kuratierte Palette samt
     Migration in einer eigenen Etappe. Hier wird nur der farblose Zustand
     leiser gedreht, keine gewählte Farbe angetastet.

     Als benutzerdefinierte Eigenschaft hier deklariert (nicht direkt bei
     `.pin`), damit sie an die Reißzwecke als Kindelement vererbt wird. */
  --owner-none: color-mix(in srgb, var(--pw-free) 45%, var(--pw-paper));
  /* **Die Papierfarbe DIESES Zettels**, als benutzerdefinierte Eigenschaft
     deklariert und damit an die Kinder vererbt (Ticket `03`). Gebraucht wird
     sie vom Papier-Halo der obersten Stempellage weit unten: der Halo muss die
     Farbe dieses Zettels treffen, nicht die des Standardpapiers, sonst stünde
     auf einem gelben Notizblock oder auf Packpapier ein weißer Kasten.

     Die drei Typen überschreiben sie bei sich (`.zettel--daily`,
     `.zettel--project`) — **zusammen mit ihrem `background`, direkt daneben**.
     Wer dort das Papier ändert und diese Zeile vergisst, bekommt keinen
     Fehler, nur einen Halo in der falschen Farbe. */
  --note-paper: var(--pw-paper);
  /* Rahmen: bewusst konturlos (`transparent`), die Zuweisungsfarbe steht nach
     der Korrektur zu Ticket 10 ausschließlich an der Reißzwecke (`.pin`
     unten) — kein farbiger Rahmen mehr, das mochte der Nutzer nicht.

     Trotzdem keine `0`: die Breite bleibt als stabile Fläche stehen, auf der
     `.zettel--tear-ready` weiter unten den neutralen „reißt gleich
     ab"-Umriss zeichnet (eigene Farbe und eigener Stil, nur die Breite kommt
     von hier). Ohne Breite hätte dieser Umriss nichts zum Zeichnen — genauer
     Fehlgriff aus der vorigen Runde, siehe Kommentar dort.

     2px ist der Wert von vor Ticket 10 (die zwischenzeitlichen 5px trugen
     „deutlich dicker als bisher" für den inzwischen wieder entfernten
     Zuweisungs-Rahmen; die Forderung ist mit ihm entfallen). Konstant für
     alle Zustände, damit Zuweisen/Zurücknehmen keinen Sprung im Innenraum
     auslöst (`box-sizing: border-box`).

     ACHTUNG, diese 2px stehen nicht nur hier: der umschließende Block der
     absolut positionierten Befestigungen (`.pin`, `.tape`, `.clip`) ist die
     PADDING-Box dieses Elements, während die Wand gegen die Border-Box
     positioniert. Jede Befestigung sitzt dadurch 2px tiefer und 2px weiter
     innen, als ihr eigenes CSS aussagt — und genau daraus rechnet die Wand ihr
     oberes Polster. Wer diesen Wert ändert, ändert `ZETTEL_BORDER` in
     `src/lib/wallLayout.ts` mit, sonst ragen die Befestigungen wieder über den
     Kork (Ticket 04). */
  border: 2px solid transparent;
  border-radius: 3px;
  background: var(--pw-paper);
  color: var(--pw-ink);
  box-shadow: var(--pw-shadow);
  /* Stift und Eselsohr sitzen jetzt UNTEN nebeneinander (Karten-Redesign,
     Ticket 00a) — oben ist deshalb nichts mehr für den Bearbeiten-Knopf
     reserviert, der Titel bekommt die ganze obere Kante. Den Platz für die
     beiden Griffe (je 44 px) reserviert stattdessen `.foot` selbst über ihr
     `padding-right`, weil dort auch der Text drumherum fließen muss. */
  padding: 5px 7px 0 7px;
  min-height: 44px;
  text-align: left;
  will-change: transform;
  /* Ohne das ist der Long-Press (Ticket 10) auf einem Zettel nicht bedienbar:
     ein langes Drücken auf Text startet auf dem Telefon die native
     Textauswahl samt Lupe und Kontextleiste. Der Browser nimmt dabei die Geste
     weg (`pointercancel`) — die Richtungen erschienen und verschwänden sofort
     wieder. Dauerhaft und nicht nur während der Geste, weil die Auswahl schon
     VOR dem Auslösen beginnt.
     Es geht nichts verloren: ein Zettel ist ein Knopf, kein Fließtext. */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}


.title {
  margin: 0;
  /* ×1,2 (Karten-Redesign, Ticket 00a): 13 → 15,6 px. Recherche im Handoff —
     Material 3 Body-Large 16 sp, Apple Body 17 pt, Material Label-Small 11 sp
     als Untergrenze — der vorige Wert lag mit 13/10 px unter allem davon. */
  font-size: 15.6px;
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

/* Fußzeile, zugleich die GRIFFZEILE (Karten-Redesign, Ticket 00a): links der
   Punktwert (plus Stempel/Unteraufgaben-Zeichen, wenn vorhanden), rechts
   Stift und Eselsohr — beide 44 px, deshalb `min-height` UND das rechte
   Polster, das die beiden Griffe freihält. */
.foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 0;
  min-height: 44px;
  padding-right: 88px;
  /* ×1,2 wie der Titel — Begründung dort. */
  font-size: 12px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

/* Nur ein Zettel mit Unteraufgaben reagiert auf ein Antippen der Fläche. */
.zettel--tappable {
  cursor: pointer;
}

/* --- Kopf: Titel plus die Ecke oben rechts (Ticket 00a) -------------------- */

/* Der Zettel selbst ist ein Flex-Container; ein `float` wäre darin
   wirkungslos. Der Kopf ist deshalb ein eigener Block — nur dort wirkt der
   Float der Ecke überhaupt. UMFLOSSEN wird sie dabei nicht: der Titel steht
   in einer verengten Spalte daneben (Begründung am `.corner` im Template).

   `flow-root`, nicht `block`: die Ecke (34 px hoch) kann höher sein als eine
   einzeilige Titelzeile (~18 px) — bei einem kurzen Titel wie „Müll" mit
   aktivem `zettel--meta-top`. Ein bloßer `block` umschließt einen Float
   NICHT automatisch; die Ecke überstünde dann `.head` nach unten und liefe
   sichtbar in die Fußzeile hinein. `flow-root` öffnet einen eigenen
   Block-Formatierungskontext und fängt den Float korrekt ein, ohne sonst am
   Verhalten von `block` etwas zu ändern. */
.head {
  display: flow-root;
  position: relative;
}

/* Der Punktwert steht an ZWEI Stellen im DOM zugleich (Ecke UND Fußzeile);
   sichtbar ist immer nur eine, gesteuert über `zettel--meta-top` (Prop
   `metaTop`, siehe Skript). Ein `v-if` wäre hier falsch: die Wand entscheidet
   das während der Messung, nicht im Render. */
.corner {
  display: none;
}

.zettel--meta-top .corner {
  display: flex;
}

.zettel--meta-top .foot > .points {
  display: none;
}

/* Schwimmt nach rechts — bewusst KEIN `display` in dieser Regel, das steht
   bereits oben. */
.corner {
  float: right;
  align-items: center;
  gap: 5px;
  margin: -1px 0 2px 7px;
}

/* --- Der Gummistempel: der Abdruckstapel -----------------------------------
   Ein Zettel, an dem jemand dreimal nachgedrückt hat, sieht auch danach aus:
   die vorherigen Abdrücke verschwinden nicht, sie bleiben unter dem nächsten
   liegen. Der oberste gilt und ist am besten lesbar, und die **Stapelhöhe ist
   selbst eine Aussage** — man sieht einem Zettel ohne Lesen an, ob einmal oder
   mehrfach nachgedrückt wurde (Ticket `03`, → CONTEXT.md „Überstempeln").

   Die Optik ist **Variante F, „Papier-Halo"**, aus zwei Runden Prototypen
   abgenommen (`stempel-optik-prototypen.md`). Die Werte, die dort GEMESSEN
   wurden und nicht Geschmack sind, stehen an ihrer Stelle einzeln benannt.

   Der Stapel steht IM FLUSS der Fußzeile (ein normales Flex-Kind, keine
   Überlagerung) — dadurch schiebt die Zeile ihn zur Seite, statt dass er einen
   Knopf überdeckt. **Klassenname `.due-stamp` und der Platz als DIREKTES
   Flex-Kind von `.foot` sind Vertrag mit der Breitenmessung in
   `WallView.vue`** (dort steht ein Laufzeit-Wächter); wer eines von beidem
   ändert, bekommt eine still falsche Zettelbreite.

   **Die Breite ist das Maximum über ALLE Lagen, nicht die der obersten.** Der
   Fall, an dem das kippt: ein Projekt trägt unten seinen zehnstelligen Spruch
   und darüber das kürzere DRINGEND — die breiteste Lage liegt also UNTEN.
   Lägen die unteren Lagen absolut, zählten sie nicht zur Breite, ragten aber
   heraus, und der Zettel würde zu schmal gepackt. Deshalb liegen alle Lagen
   als Grid-Elemente in DERSELBEN Zelle (`grid-area: 1 / 1`, unten): der Stapel
   misst damit immer seine breiteste Lage.

   **`place-items: center`, nicht `stretch`:** die Lagen sollen ihre eigene
   natürliche Breite behalten und mittig übereinander liegen. Mit `stretch`
   wären alle so breit wie die breiteste — die schmaleren Abdrücke bekämen
   einen Rahmen um Luft statt um ihr Wort. */
.due-stamp {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  /* Seit Ticket `02` ein Bedienelement, kein Schild mehr — die Fläche muss das
     mit der Maus auch sagen. `.zettel--tappable` färbt den Zeiger nur an
     Zetteln MIT Unteraufgaben; der Stempel ist an jedem Zettel antippbar. */
  cursor: pointer;
}

/* Die Trefferfläche: mindestens 44 px hoch, obwohl ein Abdruck rund 18 px
   misst. Ein Daumen trifft sonst den Zettel statt den Stempel.

   Die Fläche liegt ABSOLUT und damit AUSSER dem Fluss — sie darf die Fußzeile
   weder höher noch breiter machen, sonst ginge sie in `footWidthFull` und über
   `min-height: 44px` der Fußzeile auch in die Wandhöhe ein. `padding` oder
   `min-height` am Stempel selbst wären genau dieser Fehler.

   Sie liegt am STAPEL, nicht an einer Lage: das Ziel ist der Stempel als
   Ganzes, und ein Klick auf das Pseudoelement zielt auf `.due-stamp` selbst —
   es ist ein Kind, kein Geschwister —, der Handler dort fängt ihn also mit.

   **Sie schluckt dem Zettel nichts.** Die Long-Press-Geste hängt an der Wurzel
   und lebt vom Hochblubbern; sie startet auf dieser Fläche genauso wie auf
   blankem Papier (der Stempel steht NICHT in `isPressControl`). Und die Fläche
   ist nur so hoch wie die Fußzeile selbst (44 px) und liegt in ihr — sie deckt
   keinen der beiden Griffe rechts ab, die hinter `padding-right: 88px`
   freigehalten sind. */
.due-stamp::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  min-width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
}

/* Eine Lage des Stapels. Maße und Typografie sind unverändert die des früheren
   einzelnen Abdrucks — die Schriftgröße ist ausdrücklich KEIN Stellknopf
   (Prototypen-Runde 3: 11 px sind die dokumentierte Untergrenze, alles
   darunter nähme die Anhebung des Karten-Redesigns zurück).

   `transform` steht NICHT hier, sondern als Inline-Stil am Element: Versatz
   und Neigung kommen je Lage deterministisch aus der Aufgaben-Kennung
   (→ `stampLayers` im Skript). Weil beides über `transform` läuft, geht es
   NICHT in die Breite der Fußzeile ein — die Lagen liegen versetzt
   übereinander, nicht nebeneinander, und der Stapel bleibt so breit wie sein
   breitestes Wort. */
.stamp-layer {
  grid-area: 1 / 1;
  /* JEDE Lage steht auf Zellbreite, nicht nur die oberste. Sonst fiel eine Lage
     in dem Moment auf ihre Textbreite zurueck, in dem sie ueberstempelt wurde —
     gemessen 78,36 px -> 39,81 px, also 38,55 px Sprung. Der Mittelpunkt blieb
     dabei stehen, deshalb sah es nicht nach Verrutschen aus, sondern nach
     Schrumpfen. Vom Maintainer am Geraet gesehen, nicht von einer Pruefung
     gefunden. */
  min-width: 100%;
  padding: 1px 5px;
  border: 2px solid currentColor;
  border-radius: 3px;
  font-size: 10.8px;
  font-weight: 900;
  letter-spacing: 0.8px;
  white-space: nowrap;
}

/* Die Farbrampe **blau → orange → rot**, vom Maintainer am 01.09.2026
   ausdrücklich der reinen Deckungs-Eskalation vorgezogen.

   **Der Grundabdruck bekommt hier sein Blau.** Ticket `01` hatte ihn
   einheitlich auf `--pw-ink` gestellt, weil die alten Stufen mit den
   abgeschafften Wörtern NIE/HEUTE wegfielen — das war ein Zwischenzustand, bis
   dahin war die Wand einfarbig und ein überfälliger Zettel drängte optisch
   nicht.

   **Und das kostet FÄLLIG sein Rot.** Der Stempel ist seit Ticket `01` nicht
   mehr selten: JEDER Zettel trägt ihn. Bliebe der berechnete Abdruck rot, wäre
   die ganze Wand rot und DRINGEND hätte keine Steigerung mehr übrig. Rot heißt
   ab hier „ein Mensch hat das gesagt", nicht „der Kalender ist abgelaufen" —
   genau die Rangfolge, die ADR-0002 aufmacht.

   Die beiden Festwerte sind aus dem Prototypen übernommen und **nicht gegen
   die Personenfarben am Zettelrand geprüft** — dieselbe offene Baustelle wie
   bei den Punkte-Stickern, dort ebenso benannt. */
.stamp-layer--l0 {
  color: #3a4a6b;
}

.stamp-layer--l1 {
  color: #a35a12;
}

.stamp-layer--l2 {
  color: var(--color-danger);
}

/* Die OBERSTE Lage ist **voll deckend** und bekommt die Papierfarbe des
   Zettels als Hintergrund — den „Papier-Halo", der der Variante ihren Namen
   gibt.

   **Beides ist ein Messergebnis, kein Geschmack.** An der Durchsichtigkeit der
   obersten Lage ist die erste Prototypenrunde gescheitert: dort war jede Lage
   durchsichtig, und die unteren Wörter schienen durch die BUCHSTABEN des
   obersten. Nicht „aufräumen".

   Der Halo löst den offenen Befund aus Ticket `02`: der frühere Nachdruck war
   mit 8,6 px schmaler als viele Grundabdrücke, deckte nur links ab, und rechts
   schaute der Rest des Grundworts heraus — bei WICHTIG an 50 von 93 Zetteln,
   schlimmster Überstand 42,5 px; `IN PLANUNG` las sich mit WICHTIG als
   `[WICHTIG]NUNG`.

   **Gleiche Schriftgröße genügt dafür NICHT**, und genau daran ist der erste
   Anlauf gescheitert: neun Grundabdrücke — sämtlich Projektsprüche — sind
   längere Wörter als `WICHTIG`, und ein Halo kann nur verdecken, was er
   überdeckt. Gemessen blieben 8 von 93 Zetteln übrig, bis 13,06 px; `IN
   PLANUNG` las sich als `WICHTIG G`. Dieselbe Krankheit, nur kleiner.

   Deshalb bemisst sich der Halo an der **Zelle**, nicht an seinem eigenen
   Wort: alle drei Lagen liegen in derselben Grid-Zelle, die Zelle ist also so
   breit wie die BREITESTE Lage. `min-width: 100%` zieht die oberste Lage auf
   genau diese Breite.

   `--halo-slack` gleicht obendrein den seitlichen VERSATZ aus. Eine Lage kann
   um bis zu ±`STAMP_OFFSET` streuen, zwei Lagen also um 11 px gegeneinander;
   ohne Ausgleich schaute die untere seitlich hervor. Der Wert wird je Zettel
   **gerechnet, nicht pauschal gesetzt** (→ `haloSlack` im Skript) — und das
   ist keine Feinsinnigkeit, sondern die Reparatur eines gemessenen Schadens:
   ein pauschaler Zuschlag von 11 px hing wegen `place-items: center` auf
   BEIDEN Seiten je 5,5 px über, obwohl je Zettel nur eine Seite gebraucht
   wird. Gemessen stand der Halo damit auf 34 von 93 Zetteln bis zu 2,4 px
   neben dem Papier (`.zettel` hat `overflow: visible`), und die 88 px für
   Stift und Eselsohr wurden statt um 1,4 um bis zu 8,0 px angeknabbert.

   Gerechnet ist der Zuschlag **auf Stufe 0 gleich null** — dort gibt es keine
   Lage darunter, die zu verdecken wäre. Das ist der Normalfall auf der Wand
   und war zugleich der häufigste Schadensfall.

   Die zyklische Prozentangabe (`100%` an einem Grid-Element, dessen Spur sich
   nach dem Inhalt richtet) soll die Spur laut Spezifikation NICHT aufblähen.
   Gemessen stimmt das: Wandhöhe und Stempelbreiten sind mit und ohne
   `min-width` gleich. **Gemessen wurde allerdings nur Chrome** — WebKit ist
   genau hier für Abweichungen bekannt. Wenn auf dem iPhone die Zettel breiter
   aussehen als hier, ist das die erste Stelle zum Nachsehen.

   Das `text-align: center` gehört dazu: der Kasten ist breiter als sein Wort,
   und ohne Zentrierung klebte das Wort links — gemessen 11,3 px im Median.

   `--note-paper` kommt vom `.zettel` und wird vererbt (weiß / gelb /
   Packpapier je nach Typ) — der Halo trifft damit die Farbe DIESES Zettels,
   nicht die des Standardpapiers. */
.stamp-layer--top {
  background: var(--note-paper);
  text-align: center;
}

/* Der deckende Hof liegt AUSSERHALB des Flusses und bestimmt deshalb keine
   Breite. Frueher stand er als `min-width: calc(100% + slack)` am Kasten
   selbst — und genau daher kam das Schrumpfen beim Ueberstempeln. Gemessen:
   die Variante, den Zuschlag stattdessen jeder Lage in den Kasten zu legen,
   haelt die Breite zwar konstant, laesst aber Rahmen bis 13,32 px ueber die
   Papierkante ragen (276 von 564 Faellen) statt 4,20 px (137 Faelle). */
.stamp-layer--top::after {
  content: '';
  position: absolute;
  inset: 0 calc(var(--halo-slack, 0px) / -2);
  background: var(--note-paper);
  border-radius: 3px;
  z-index: -1;
}

/* Die unteren Lagen bleiben durchsichtig und lugen an den Rändern hervor —
   dort, und nur dort, steckt die sichtbare Stapelhöhe. 40 % für den
   Grundabdruck, 60 % für WICHTIG; nach oben also immer prominenter. */
.stamp-layer--under.stamp-layer--l0 {
  opacity: 0.4;
}

.stamp-layer--under.stamp-layer--l1 {
  opacity: 0.6;
}

/* Eine noch nicht gestempelte Lage: unsichtbar, aber **weiterhin gemessen**.

   `visibility: hidden` und nicht `display: none` — das ist der ganze Punkt.
   Ein `display: none`-Kind fällt aus dem Grid und damit aus der Breite; die
   Fußzeile wüchse dann bei jedem Tipp, und die Wand packt nach einem Tipp
   NICHT neu (`layoutSignature` in `WallView.vue` kennt `emphasis_level` nicht,
   → ADR-0002). Das Layout schöbe sich unter dem Finger weg oder bliebe falsch
   gepackt stehen. So hat der Stapel seinen Platz von Anfang an, unabhängig von
   der Stufe. Ausführlich bei `stampLayers` im Skript.

   Der Preis, benannt: JEDER Zettel ist so breit wie sein dreilagiger Stapel,
   auch der ungestempelte. Das ist gemessen und gehört zur Breitenfrage aus
   Ticket `78`, nicht hierher. */
.stamp-layer--reserved {
  visibility: hidden;
}

/* --- Punkte als aufgeklebter Sticker (Ticket 00a) --------------------------
   Die Form ist die Botschaft: ein Kreis ist eine Kleinigkeit, ein Stern die
   dickste Aufgabe auf der Wand. Wer die Wand überfliegt, sucht die Sterne —
   und muss dafür keine Zahl lesen. Funktioniert auch bei Farbenblindheit,
   weil die Silhouette trägt, nicht nur die Farbe.

     0–1 P  Kreis                ruhig, blass
       2 P  abgerundetes Quadrat
       3 P  Sechseck
       4 P  Wappen
       5 P  Stern                Gold, der Blickfang

   Alle Formen haben dieselbe Kantenlänge (der Stern fällt bewusst aus der
   Reihe, siehe dort); nur Silhouette und Farbe unterscheiden sie. Der
   Schatten kommt aus `drop-shadow`, nicht `box-shadow`: ein `box-shadow` legt
   sich um das RECHTECK und wäre am Stern als Kasten sichtbar.

   Die Farben sind geraten (blass/blau/grün/orange/gold) und konkurrieren mit
   den Personenfarben am Zettelrand — eine kuratierte Palette ist bewusst
   Out of Scope für dieses Ticket (siehe `HANDOFF-kartengroesse.md`). */
.points {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  /* Leicht schief aufgeklebt — wie alles auf dieser Wand. */
  transform: rotate(-6deg);
  color: var(--pw-ink);
  font-size: 14.3px;
  font-weight: 900;
  line-height: 1;
  filter: drop-shadow(1.5px 2px 0 rgba(36, 31, 26, 0.35));
}

.points--s0,
.points--s1 {
  border-radius: 50%;
  background: #e8e0cd;
  box-shadow: inset 0 0 0 1.5px rgba(36, 31, 26, 0.35);
}

.points--s2 {
  border-radius: 7px;
  background: #bcd3e8;
  box-shadow: inset 0 0 0 1.5px rgba(36, 31, 26, 0.35);
}

.points--s3 {
  background: #bfdcc0;
  clip-path: polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%);
}

.points--s4 {
  background: #f0c78a;
  clip-path: polygon(50% 0, 100% 18%, 100% 62%, 50% 100%, 0 62%, 0 18%);
}

/* Der Stern ist absichtlich der einzige, der aus der Reihe fällt: größer,
   golden, stärker geneigt. Fünf Punkte sind der Ausreißer.

   Korrektur 26.08.2026: hier stand "Werte über 5 (Bonus-Unteraufgaben) fallen
   ebenfalls hierauf — bekannt offen". Das trifft nicht zu. tasks.effort und
   task_completions.effort_override tragen beide einen CHECK auf höchstens 5;
   'bonus' bedeutet eine eigene Completion-Zeile mit eigenem Wert ≤ 5, nicht
   eine Summe. In 2910 Completions kommt kein Wert über 5 vor. Das Math.min(5, …)
   in pointsShapeClass ist für Nicht-Projekte damit reine Vorsorge. Real werden
   Werte über 5 erst, wenn die Punkte-Skala verdoppelt wird — dann fällt mit der
   CHECK-Grenze auch diese Palette an (Backlog: 51 und 40). */
.points--s5 {
  width: 39.1px;
  height: 39.1px;
  transform: rotate(-10deg);
  background: #f4cf4a;
  font-size: 13.6px;
  clip-path: polygon(
    50% 0%,
    61% 35%,
    98% 35%,
    68% 57%,
    79% 91%,
    50% 70%,
    21% 91%,
    32% 57%,
    2% 35%,
    39% 35%
  );
}

/* --- Projekt-Abzeichen statt Punkte-Sticker (Ticket 03-3) ------------------
   Ein Projekt hat keine feste Punktzahl mehr. An derselben Stelle steht, wie
   viele Punkte es bis jetzt VERSCHLUNGEN hat — eine Bilanz, kein Versprechen.
   Das Bild ist deshalb bewusst ein anderes: keine aufgeklebte Form, sondern
   eine **Siegelmarke mit umlaufender Skala**.

   Warum getrennt von `.points--s0…s5`: dort bedeutet die Form eine PUNKTZAHL
   (Kreis 1 … Stern 5). Ein Projekt mit 21 Punkten hätte über `Math.min(5, …)`
   den goldenen Fünf-Punkte-Stern getragen und sich als „5 Punkte" gelesen
   statt als „Stufe 5". Die Sticker-Regeln bleiben unangetastet; hier steht
   ein eigenes Bild daneben.

   **Zwei Merkmale tragen die fünf Stufen**, ein drittes schmückt nur:

     1. **Wie dunkel die Marke ist.** Die Scheibe läuft von fast weißem Papier
        (Stufe 1) bis nahezu Tinte (Stufe 5); ab Stufe 4 kippt die Schrift auf
        Papierfarbe. Der Sprung hell→dunkel ist auf Armlänge sichtbar. Die
        Rampe ist streng monoton in der Luminanz (0,921 / 0,615 / 0,325 /
        0,138 / 0,046), Nachbarabstände 1,46 / 1,77 / 2,00 / 1,96 — ab b2
        aufwärts trägt sie deshalb bei jeder Farbfehlsichtigkeit unverändert.
        Nur das schwächste Paar b1↔b2 (1,46) stützt sich zusätzlich auf den
        Tonwechsel cremeweiß→blassblau; wer weder Ton noch diese 1,46 sieht,
        unterscheidet die beiden untersten Stufen nicht. Der Umschlag der
        Ziffer auf Papierfarbe ab b4 ist am Bild der schärfste Einzelhinweis,
        deutlicher als der Helligkeitsschritt selbst.
     2. **Der Umriss.** Stufe 5 ist die einzige mit Zackenkranz (ein gestanztes
        Siegel statt einer glatten Scheibe) — die Silhouette allein sagt
        „ab 100", ohne Farbe und ohne Zahl.

   **Die Skala am Rand trägt NICHT** — sie sieht in der Abnahme aus wie eine
   Kontur, nicht wie ein Füllstand. In 3,4 px Bandbreite bei 34 px Marke ist
   der Unterschied zwischen 80 % und 100 % Füllung am Bild nicht auszumachen,
   und auf b5 frisst der Zackenkranz das Band zusätzlich an; ablesbar wird sie
   erst bei drei- bis vierfacher Vergrößerung. Sie bleibt als Schmuck, weil sie
   der Marke ihre Siegelform gibt — wer sich auf sie als ordinalen Träger
   verlässt, verlässt sich auf nichts. Ein früherer Kommentar hier behauptete
   genau das; er war die Absicht, nicht der Befund.

   Die Bänder (0–9, 10–24, 25–49, 50–99, ab 100) stehen im Skript
   (`badgeStage`), nicht hier.

     Fläche: 34 × 34 px wie der frühere Punkte-Sticker, auf ALLEN Stufen. Das
     Abzeichen wächst bewusst nicht wie `.points--s5` (39,1 px) — die
     Sticker-Ausnahme war genau der Grund, warum ein dreistelliger Wert bisher
     39 statt 34 px maß. Die Zahl passt über `points--fitN` (unten), nicht über
     eine größere Fläche. */
.points--badge {
  --badge-arc: 20%;
  --badge-disc: color-mix(in srgb, var(--pw-accent) 4%, var(--pw-paper));
  /* Die ungefüllte Skala: nur so kräftig, dass der Kreis als Kreis dasteht. */
  --badge-track: color-mix(in srgb, var(--pw-ink) 18%, transparent);
  position: relative;
  border-radius: 50%;
  /* Kein `background` hier: Ring und Scheibe malen die Pseudoelemente. Der
     Hintergrund des Elements SELBST läge unter ihnen (Malreihenfolge:
     Elementhintergrund, dann Nachfahren mit negativem z-index) und wäre nie
     zu sehen. */
  color: var(--badge-text, var(--pw-ink));
}

/* Ring und Scheibe liegen HINTER der Zahl, aber vor dem Elementhintergrund —
   dafür `z-index: -1`. `.points` hat durch `transform`/`filter` einen eigenen
   Stapelkontext, die beiden können also nicht hinter den Zettel rutschen.
   Absolut positioniert heißt außerdem: sie sind keine Grid-Kinder und
   verschieben die zentrierte Zahl nicht. */
.points--badge::before,
.points--badge::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: 50%;
}

/* Die Skala am Rand. `conic-gradient` füllt den Anteil, die Maske schneidet
   daraus ein 3,4 px schmales Band am Rand — die freie Innenfläche bleibt
   dadurch 0,78 × 34 ≈ 26,5 px breit, das Maß, an dem `points--fitN` hängt. */
.points--badge::before {
  background: conic-gradient(
    var(--pw-ink) 0 var(--badge-arc),
    var(--badge-track) var(--badge-arc) 100%
  );
  -webkit-mask: radial-gradient(closest-side, transparent 0 78%, #000 80%);
  mask: radial-gradient(closest-side, transparent 0 78%, #000 80%);
}

/* Die Scheibe, knapp unter das Band geschoben. Ihre eigene Tintenkontur hält
   sie auch auf den hellen Stufen gegen das Packpapier ab. */
.points--badge::after {
  inset: 3px;
  background: var(--badge-disc);
  box-shadow: inset 0 0 0 1.5px rgba(36, 31, 26, 0.55);
}

.points--b1 {
  --badge-arc: 20%;
  --badge-disc: color-mix(in srgb, var(--pw-accent) 4%, var(--pw-paper));
}

.points--b2 {
  --badge-arc: 40%;
  --badge-disc: color-mix(in srgb, var(--pw-accent) 26%, var(--pw-paper));
}

.points--b3 {
  --badge-arc: 60%;
  --badge-disc: color-mix(in srgb, var(--pw-accent) 55%, var(--pw-paper));
}

.points--b4 {
  --badge-arc: 80%;
  --badge-disc: color-mix(in srgb, var(--pw-accent) 84%, var(--pw-paper));
  --badge-text: var(--pw-paper);
}

/* Ab 100 Punkten: volle Skala, fast schwarze Marke — und als einzige Stufe
   ein gestanzter Zackenkranz. Der Ausschnitt trifft nur den Rand; die Zahl
   sitzt in der Scheibe weit innerhalb und wird nicht angeschnitten. */
.points--b5 {
  --badge-arc: 100%;
  --badge-disc: color-mix(in srgb, var(--pw-ink) 35%, var(--pw-accent));
  --badge-text: var(--pw-paper);
  clip-path: polygon(
    50% 0%,
    59.7% 7.6%,
    71.7% 5%,
    77.1% 16%,
    89.1% 18.8%,
    89.2% 31.1%,
    98.7% 38.9%,
    93.5% 50%,
    98.7% 61.1%,
    89.2% 68.9%,
    89.1% 81.2%,
    77.1% 84%,
    71.7% 95%,
    59.7% 92.4%,
    50% 100%,
    40.3% 92.4%,
    28.3% 95%,
    22.9% 84%,
    10.9% 81.2%,
    10.8% 68.9%,
    1.3% 61.1%,
    6.5% 50%,
    1.3% 38.9%,
    10.8% 31.1%,
    10.9% 18.8%,
    22.9% 16%,
    28.3% 5%,
    40.3% 7.6%
  );
}

/* Passung: die Schriftgröße folgt der STELLENZAHL, die Fläche bleibt 34 px.
   Gerechnet gegen die freie Innenfläche von ~26,5 px (Ring 3,4 px + Kontur):

     1–2 Stellen  14,3 px  →  bis ~18,9 px breit  (unverändert wie am Sticker)
     3 Stellen    11,6 px  →  ~20,7 px
     `999+`        10 px    →  ~22,4 px

   `999+` lag zuerst bei 9,6 px und damit unter `--font-xs`, dem kleinsten
   Schriftmaß des Projekts. Gemessen waren es 21,5 px in 26,5 px Fläche — die
   Luft reichte, also steht dort jetzt das Token statt einer eigenen Zahl.

   Steht NACH den Stufenregeln, damit es sie in der Schriftgröße schlägt. */
.points--fit1,
.points--fit2 {
  font-size: 14.3px;
}

.points--fit3 {
  font-size: 11.6px;
  letter-spacing: -0.2px;
}

.points--fit4 {
  font-size: var(--font-xs);
  letter-spacing: -0.3px;
}

/* --- Zeichen für Unteraufgaben (Ticket 00a) --------------------------------
   Ein angeklammerter Stapel: Papier mit gestricheltem Rand, damit er zu den
   Zettelchen gehört, die er ankündigt — und nicht zu den beiden Griffen
   rechts, die etwas mit dem GANZEN Zettel tun.

   Immer sichtbar, auch bei `daily` und reinen Checklisten — vorher verriet
   nur die Fortschrittszahl die Existenz von Unteraufgaben, und die fehlte an
   genau diesen beiden Zetteltypen ganz (→ `tracksProgress` im Skript).
   Aufgeklappt kippt die Farbe um, damit man den Weg zurück findet. */
.subs-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  height: 34px;
  padding: 0 7px;
  border: 1.5px dashed var(--pw-line);
  border-radius: 3px;
  background: var(--pw-paper);
  color: var(--pw-ink);
  font-size: 11.6px;
  font-weight: 800;
  line-height: 1;
  transform: rotate(2deg);
  box-shadow: 1.5px 2px 0 rgba(36, 31, 26, 0.28);
  cursor: pointer;
}

.subs-badge--open {
  border-style: solid;
  background: var(--pw-ink);
  color: var(--pw-paper);
}

.subs-count {
  font-variant-numeric: tabular-nums;
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
  /* Unten Platz für den Bearbeiten-Knopf lassen (Karten-Redesign, Ticket
     00a): der sitzt jetzt UNTEN rechts (44 px, `bottom: 0`) statt oben — bei
     aufgeklapptem Zettel gibt es KEIN `.ear` mehr (siehe dort), aber `.edit`
     bleibt, und ohne dieses Polster läge die letzte Zeile der Zettelchen
     genau darunter. */
  padding-bottom: 44px;
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
  /* ×1,2 wie der Zetteltitel — Begründung dort. */
  font-size: 14.4px;
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
  font-size: 13.8px;
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
  font-size: 11.4px;
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
  /* Wie am großen Eselsohr: erst `none` macht aus dem Zug nach unten eine
     Geste. Ohne `clip-path` — auf einem Zettelchen sitzt kein zweiter Knopf,
     mit dem sich der Griff die Ecke teilen müsste. */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

/* Perforationslinie wie am großen Eselsohr, nur schmaler. */
.mini-ear::after {
  content: '';
  position: absolute;
  right: 1px;
  bottom: 19px;
  width: 19px;
  height: 0;
  border-top: 1.2px dashed rgba(36, 31, 26, 0.4);
}

/* Am Finger: das Zettelchen liegt über seinen Nachbarn (Rest inline, weil der
   Betrag am Zug hängt). */
.mini--tearing {
  border-style: dashed;
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

/* Während der Messung nehmen Titel und Fußzeile ihre EIGENE natürliche
   Breite an. Ohne das sind beide so breit wie der Zettel, und die Wand könnte
   nicht entscheiden, welcher von beiden ihn breit macht (→ `WallView`,
   `zettel--meta-top`). Die gemessene Zettelbreite ändert das nicht: sie ist
   ohnehin das Maximum der beiden. */
.zettel--measuring .title,
.zettel--measuring .foot {
  width: max-content;
}

/* Der Bearbeiten-Knopf sitzt jetzt UNTEN rechts, unmittelbar links neben dem
   Eselsohr — beide 44 × 44 px, nebeneinander in der Griffzeile (Karten-
   Redesign, Ticket 00a). Vorher saß er oben rechts und nahm dem Titel eine
   ganze Zeile weg; jetzt bekommt der Titel die ganze obere Kante.

   Der `clip-path`-Ausschnitt im Eselsohr, der ihn dort früher vor dem Ohr
   schützte, entfällt damit ERSATZLOS (samt der vermessenen Geometrie, siehe
   `.ear` unten) — beide Griffe teilen sich keine Fläche mehr, jeder hat seine
   eigenen vollen 44 × 44 px. */
.edit {
  position: absolute;
  bottom: 0;
  right: 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--pw-ink-soft);
  font-size: 18px;
  line-height: 1;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.edit:active {
  transform: translate(1px, 1px);
}

/* --- Das Eselsohr: der Abreiß-Griff (Etappe 4) ---------------------------- */

/* 44 × 44 px Kasten in der unteren rechten Ecke SEINES Zettels — `right: 0;
   bottom: 0`, kein negativer Versatz: der würde den Griff über die Kante
   schieben und im dichten Packen den Nachbarzettel betätigen, also die
   falsche Aufgabe erledigen. Unsichtbar, nur durch Abtasten der Ecken zu
   finden — deshalb bündig.

   **Kein `clip-path`-Ausschnitt mehr** (Karten-Redesign, Ticket 00a): er
   existierte nur, damit das Stiftsymbol des Bearbeiten-Knopfes — der vorher
   OBEN rechts saß — nicht unter dem Eselsohr verschwand. Jetzt sitzt der
   Stift UNTEN links daneben (→ `.edit`), beide teilen sich keine Fläche mehr,
   und das Eselsohr ist ein volles Quadrat: seine Trefferfläche wächst von
   rund 1500 auf rund 1936 px².

   `touch-action: none` ist die zweite Hälfte des Scroll-Schutzes: nur so wird
   aus einem Zug nach unten überhaupt eine Geste statt eines Bildlaufs.
   **Dauerhaft**, ohne Ausnahme — und ausgerechnet `none`.

   Der Wert wird **einmal** ermittelt, beim Aufsetzen des Fingers, und gilt
   dann für die ganze Geste: „changes … will be ignored for the duration of the
   action" (Pointer Events L3); WebKit friert ihn je Berührung ein. Ein
   Umschalten mitten im Zug wirkt also nicht — es gälte erst für die NÄCHSTE
   Berührung. Und `none` ist auf iOS der einzige verlässliche Wert: die
   Achsenwerte `pan-x`/`pan-y` sind im UI-Prozess laut WebKit-eigenem Kommentar
   gar nicht sauber umgesetzt.

   Früher schaltete `.ear--locked` während des Bildlaufs auf `pan-y` zurück:
   „wer in eine fliegende Wand greift, scrollt weiter". Die Regel ist raus
   (iOS-Korrektur), weil sie eine Rückkopplung war — eine über Berührungen
   hinweg, nicht innerhalb einer: griff man in die fliegende Wand, lag `pan-y`
   an, der nächste Zug am Eselsohr scrollte, das setzte den Wächter erneut
   scharf, und `pan-y` lag wieder an. Auf dem iPhone kam die Wand da nicht mehr
   heraus, weil schon das Gummiband der Homescreen-App den Wächter dauerhaft
   scharf hielt (→ `useScrollQuiet`). Gemeldet als „das Eselsohr wird größer,
   aber die Seite scrollt trotzdem".

   Der Schutz vor dem Fehlgriff in die fliegende Wand geht dabei NICHT
   verloren: er sitzt weiterhin im Riegel am `pointerdown` von
   `useTearGesture` — und der ist tragend, weil `touch-action: none` laut
   WebKit ausgerechnet während des Momentum-Scrollings nicht greift. Was
   entfällt, ist allein die Möglichkeit, eine fliegende Wand ausgerechnet am
   Eselsohr weiterzuscrollen — 44 × 44 px je Zettel, und ein Fingerdruck stoppt
   den Schwung ohnehin.

   Belege in `docs/research/ios-gesten-webkit.md`. */
.ear {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: none;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

/* Die angeknickte Ecke selbst. */
.ear::before {
  content: '';
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 22px;
  height: 22px;
  background: linear-gradient(
    225deg,
    var(--pw-cork) 0 50%,
    rgba(0, 0, 0, 0.16) 50% 54%,
    #efe7d3 54%
  );
  border-left: 1.2px solid rgba(36, 31, 26, 0.6);
  border-top: 1.2px solid rgba(36, 31, 26, 0.6);
}

/* Die Perforationslinie über dem Knick — sie sagt, wo der Zettel reißt. */
.ear::after {
  content: '';
  position: absolute;
  right: 2px;
  bottom: 22px;
  width: 24px;
  height: 0;
  border-top: 1.5px dashed rgba(36, 31, 26, 0.45);
}

/* Auch beim Anfassen wächst nur die Breite, nicht die Höhe — dieselbe
   Begründung wie beim Zustand „reißt gleich" weiter unten. */
.ear:active::before {
  width: 26px;
}

/* Am Finger: der Zettel hebt ab und liegt über allen anderen. `!important`,
   weil `WallView` den z-index als Inline-Style schreibt — und ihn dort auch
   behalten muss (siehe `noteStyle` im Skript). */
.zettel--tearing {
  z-index: 800 !important;
  box-shadow: var(--pw-shadow-lift);
  cursor: grabbing;
}

/* --- Long-Press: der Zettel unter den Beschriftungen (Ticket 10) ----------- */

/* Er hebt sich ab wie beim Abreißen, und aus demselben Grund mit `!important`:
   den z-index schreibt `WallView` als Inline-Style.
   **Ohne jede Änderung an Größe, Lage oder Neigung.** Das Overlay liegt in
   Fensterkoordinaten und hängt am Aufsetzpunkt des Fingers, nicht am Zettel —
   ein Zettel, der beim Auslösen wächst oder springt, rutschte also unter der
   stehenden Geste weg. Der Zustand ist deshalb rein farblich.

   **Zwei Klassen am selben Element (0,2,0), nicht eine (0,1,0) — und das ist
   kein Stilmittel, sondern eine Reparatur.** `.zettel--project` steht weiter
   unten und setzt einen eigenen `box-shadow` (`4px 4px 0`). Bei gleicher
   Spezifität gewinnt die spätere Regel: der Hebe-Schatten erreichte den
   Projekt-Zettel **nie**. Gemessen (QC): Projekt ruhend gegen gehalten
   0 geänderte Pixel, beide PNGs bitgleich — die Klasse stand am Element, die
   Wirkung kam nicht an. Genau das trifft am Projekt am härtesten, weil dort
   seit Ticket 03 gar kein Richtungskranz mehr erscheint und dieser Zustand
   die EINZIGE Rückmeldung auf das Halten ist. `!important` wäre hier falsch
   (es überschriebe auch spätere absichtliche Ausnahmen), Umsortieren ebenso
   (es risse die anderen Typregeln mit).

   **Warum zusätzlich `filter`.** Der Hebe-Schatten allein ist am Projekt fast
   stumm: dessen Ruheschatten ist mit `4px 4px 0` opak ohnehin der kräftigste
   der drei Zetteltypen, `7px 10px 0` bei 35 % Deckkraft ist breiter, aber
   blasser — überschlägig gleich viel Tinte. Das Papier hebt sich deshalb
   zusätzlich ins Licht: dieselbe Aussage wie der Schatten (der Zettel liegt
   nicht mehr auf, er wird gehalten), nur trägt sie hier die ganze Fläche
   statt eines Randstreifens.

   Bewusst KEIN `transform`: die Zettel tragen ihre Neigung als Inline-Style
   (siehe `noteStyle`), und `.zettel--tearing` schiebt sie dem Finger nach —
   ein `transform` hier überschriebe beides, statt sich zu addieren, und der
   Zettel spränge beim Anfassen gerade.

   `filter` öffnet einen Stapelkontext und wäre ein Bezugsrahmen für
   `position: fixed` **innerhalb** des Zettels. Es gibt dort keins: Kranz und
   Dialoge sind allesamt nach `body` teleportiert, liegen also außerhalb. */
.zettel.zettel--pressed {
  z-index: 810 !important;
  box-shadow: var(--pw-shadow-lift);
  filter: brightness(1.09);
}

/* Weit genug gezogen: Loslassen erledigt. Die Perforation reißt sichtbar auf.

   `border-color` steht hier bewusst dazu (QC-Befund, Ticket 10): ohne sie
   erbt der Umriss `transparent` von der Basisregel, und ein `dashed`-Umriss
   in Transparent zeigt nichts an. Bei 48 von 49 Zetteln auf der Testwand war
   „reißt gleich ab" damit faktisch stumm, nur die Perforationslinie am
   Eselsohr blieb (24 × 2 px statt einem Umriss ums ganze Papier). Neutrale
   Tintenfarbe (`--pw-line`, dieselbe wie an Reißzwecken-Kontur,
   Büroklammern und Projekt-Umriss) macht den Umriss sichtbar — jetzt auf
   JEDEM Zettel gleich, seit die Zuweisungsfarbe nach der Korrektur zu
   Ticket 10 nicht mehr am Rahmen steht, sondern nur noch an der Reißzwecke.
   (Vorher überschrieb `.zettel.zettel--assigned` diese Farbe an zugewiesenen
   Zetteln mit der Personenfarbe — die Regel gibt es seit der Korrektur nicht
   mehr.) */
.zettel--tear-ready {
  border-style: dashed;
  border-color: var(--pw-line);
}

.zettel--tear-ready .ear::after {
  border-top-color: var(--pw-accent);
  border-top-width: 2.5px;
}

/* Der Knick wächst beim Ziehen nur in die Breite, seine Höhe bleibt bei
 * 22 px. Vorgeschichte: er wuchs früher auch in der Höhe, was in den (jetzt
 * entfallenen) `clip-path`-Ausschnitt des Bearbeiten-Knopfes ragte — seit
 * `.edit` unten neben statt oben über dem Eselsohr sitzt (Karten-Redesign,
 * Ticket 00a), gibt es diese Kollision gar nicht mehr. Die Breite genügt
 * trotzdem als Ankündigung: ein breiterer Knick liest sich als größeres
 * Eselsohr, und daneben stehen ohnehin schon der gestrichelte Rand des
 * Zettels und die aufleuchtende Perforationslinie. */
.zettel--tear-ready .ear::before {
  width: 27px;
}

/* --- Typ 1: offene Putzaufgabe — weißes Papier, Reißzwecke ---------------- */
/* Ragt über die Oberkante des Zettels; die Wand hält oben Platz dafür frei.
   Wer diesen Wert oder die Maße ändert, ändert `FASTENERS` in
   `src/lib/wallLayout.ts` mit (Ticket 04). */
.pin {
  position: absolute;
  top: -7px;
  left: 50%;
  margin-left: -7px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  /* Reines Ornament, kein Bedienelement (`aria-hidden`, keine Handler) — ragt
     mit `top: -7px` über den eigenen Zettelrand hinaus und lag als Kind mit
     eigener Box im Trefferbereich des Nachbarn darunter, obwohl der
     Zettelkörper selbst sich gar nicht überlappte (QC-Befund, Ticket 11).
     `pointer-events: none` nimmt sie aus dem Hit-Test: der Teil über dem
     EIGENEN Zettel fällt durch auf `.zettel` selbst (unverändertes
     Verhalten, die Handler sitzen am Wurzelelement, nicht hier), nur der
     überstehende Teil gibt jetzt an den wirklich darunterliegenden Nachbarn
     weiter. */
  pointer-events: none;
  /* Trägt die Zuweisungsfarbe (Ticket 10) — mit Zuständigkeit `--owner`,
     ohne die gedämpfte `--owner-none` von oben. Ihre eigene Tintenkontur
     (`border` gleich darunter) hält sie auch farblos sichtbar. Anders als
     der Rahmen des Zettels bleibt die Reißzwecke IMMER sichtbar: sie ist die
     einzige Stelle am Zettel, die auch „niemand zuständig" aktiv zeigt statt
     nur das Fehlen eines Signals. */
  background: var(--owner, var(--owner-none));
  border: 2px solid var(--pw-line);
  box-shadow:
    1px 2px 0 rgba(0, 0, 0, 0.28),
    inset -2px -2px 0 rgba(0, 0, 0, 0.18);
}

/* --- Typ 2: tägliche Aufgabe — gelber Notizblock, Klebestreifen ----------- */
.zettel--daily {
  background: var(--pw-paper-day);
  /* Papierfarbe für den Halo der obersten Stempellage — siehe `--note-paper`
     an `.zettel`. Gehört zum `background` darüber und wird mit ihm geändert. */
  --note-paper: var(--pw-paper-day);
  border-radius: 11px;
  padding-top: 10px;
}

.zettel--daily .title {
  /* ×1,2 wie der Zetteltitel — Begründung dort. */
  font-size: 15px;
}

/* Ragt über die Oberkante des Zettels. Wie weit, hängt nicht nur an diesem
   `top`: der Rahmen von `.zettel` senkt es um 2px, `rotate(-4deg)` weiter unten
   hebt es zusammen mit der Neigung des Zettels selbst (`rotationOf`, -3…+3deg,
   siehe `noteStyle`) wieder an, und weil der Streifen mit 46px der breiteste
   ist, schlägt die Drehung bei ihm am stärksten durch. Die Wand hält oben Platz
   dafür frei; gerechnet wird das in `FASTENERS` / `overhangOf` in
   `src/lib/wallLayout.ts`. Wer `top`, `width`, `height` oder die Drehung
   ändert, ändert die Zeile dort mit (Ticket 04). */
.tape {
  position: absolute;
  top: -9px;
  left: 50%;
  margin-left: -23px;
  width: 46px;
  height: 16px;
  /* Trägt die Zuweisungsfarbe (Ticket 03) — die dritte Befestigungssorte,
     Ticket 10 hatte nur die Reißzwecke geregelt. ZWEI bewusste Abweichungen
     von `.pin` und `.clip`, bitte nicht „angleichen":

     1. Durchscheinend, nicht deckend. `user_color` ist ein roher Hexwert ohne
        Alphakanal, die 62 % müssen deshalb beim Mischen entstehen. Ein
        `rgba()`-Literal kann die Personenfarbe nicht aufnehmen, und `opacity`
        am Element wäre kein Ersatz: sie schlüge auch auf die Tintenkontur
        (`border` gleich darunter) und den Schlagschatten durch. Der Streifen
        soll Klebeband bleiben, kein buntes Washi-Tape.
     2. OHNE Zuständigkeit KEIN Rückfall auf `--owner-none`, sondern
        durchscheinendes Weiß — exakt das bisherige Bild. Reißzwecke und
        Büroklammer zeigen „niemand zuständig" aktiv an, der Klebestreifen
        nicht. Nutzerentscheidung (Q32/Q33). */
  background: color-mix(in srgb, var(--owner, #ffffff) 62%, transparent);
  border: 1.5px solid rgba(36, 31, 26, 0.42);
  transform: rotate(-4deg);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.12);
  /* Ornament, kein Bedienelement — Begründung bei `.pin`. */
  pointer-events: none;
}

/* --- Typ 3: Projekt — Packpapier, doppelte Büroklammer, kantig ------------ */
.zettel--project {
  background: var(--pw-paper-proj);
  /* Wie bei `.zettel--daily`: Papierfarbe für den Halo, siehe `--note-paper`
     an `.zettel`. Die Streifen des `background-image` darunter bleiben außen
     vor — der Halo ist eine Fläche, kein Ausschnitt des Papiers. */
  --note-paper: var(--pw-paper-proj);
  background-image: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.045) 0 1px,
    transparent 1px 7px
  );
  /* Keine eigene `border-width` mehr (vormals 3px): die Basisregel liefert
     jetzt für alle drei Zetteltypen dieselbe Dicke (2px, konturlos, siehe
     `.zettel` oben) — sie trägt nur noch die Fläche für den neutralen
     „reißt gleich ab"-Umriss (`.zettel--tear-ready`), gleich breit auf jedem
     Zetteltyp. Eine schmalere Ausnahme hier hätte diesen Umriss am
     Projekt-Zettel dünner gemacht als an den anderen beiden Typen. */
  border-radius: 0;
  box-shadow: 4px 4px 0 var(--pw-line);
  padding-top: 11px;
}

.zettel--project .title {
  /* ×1,2 wie der Zetteltitel — Begründung dort. */
  font-size: 18px;
}

/* Ragt über die Oberkante des Zettels; die Wand hält oben Platz dafür frei.
   Wer diesen Wert, die Maße oder die Kantenlage und Drehung von
   `.clip--l`/`.clip--r` ändert, ändert `FASTENERS` in `src/lib/wallLayout.ts`
   mit (Ticket 04). Die Kantenlage ist dort der wichtigste Teil: `left: 12px`
   bzw. `right: 12px` geht als `inset` (12 + halbe Breite) in die Rechnung ein
   und ist bei breiten Zetteln der DOMINIERENDE Beitrag — eine Klammer an der
   Kante fährt mit der Neigung des Zettels nach oben. */
.clip {
  position: absolute;
  top: -8px;
  width: 15px;
  height: 20px;
  border: 2.5px solid var(--pw-line);
  border-radius: 3px;
  /* Trägt die Zuweisungsfarbe (Ticket 10, nachgezogen in 03-3) — dieselbe
     Regel wie an der Reißzwecke: mit Zuständigkeit `--owner`, ohne die
     gedämpfte `--owner-none` vom Zettel. An `.zettel--project` gibt es keine
     Reißzwecke, die Regel dort griff bis jetzt ins Leere; das Papier war die
     einzige Stelle, an der ein Projekt gar keine Zuständigkeit zeigte.
     Vorher fest #b9b3a6 („Metall"). Die eigene Tintenkontur (`border` oben)
     hält die Klammer auch in der neutralen Fassung sichtbar. */
  background: var(--owner, var(--owner-none));
  box-shadow: 1px 2px 0 rgba(0, 0, 0, 0.25);
  /* Ornament, kein Bedienelement — Begründung bei `.pin`. `pointer-events`
     ist eine vererbte Eigenschaft, `.clip::after` bekommt sie also automatisch
     mit. */
  pointer-events: none;
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

/* Die `12px` sind nicht nur Zierde: sie setzen die Klammern an die KANTEN des
   Zettels, und dort hebt die Neigung des Zettels (`rotationOf`, siehe
   `noteStyle`) sie mit an — je breiter der Zettel, desto stärker. Auf einem
   aufgeklappten Projekt über die volle Wandbreite ist dieser Hebel der GRÖSSTE
   Beitrag zum Überstand, größer als `top` und die Drehung zusammen. Die Wand
   hält oben Platz dafür frei. Wer hier `left`/`right` oder die Drehung ändert,
   ändert `FASTENERS` in `src/lib/wallLayout.ts` mit — dort stehen beide
   Klammern als getrennte Zeilen mit `anchor` und `inset` (Ticket 04). */
.clip--l {
  left: 12px;
  transform: rotate(-7deg);
}

.clip--r {
  right: 12px;
  transform: rotate(6deg);
}
</style>
