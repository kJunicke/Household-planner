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
 * zuweisen, rechts erledigen mit angepasstem Aufwand — bei jedem Aufgabentyp
 * identisch. Die Geste steckt in `useDirectionPress`, die Beschriftung in
 * `WallDirectionMenu`.
 *
 * **Das Eselsohr** unten rechts ist der Abreiß-Griff (Ticket 09): von dort aus
 * nach unten ziehen erledigt die Aufgabe, sofort und ohne vorheriges langes
 * Drücken. Die Geste selbst steckt in `useTearGesture`.
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
import { scheduleOf } from '@/lib/taskSchedule'
import { kindOfTaskType, rotationOf, subtaskColumns } from '@/lib/wallLayout'
import { useTearGesture } from '@/composables/useTearGesture'
import { useDirectionPress, type PressDirection } from '@/composables/useDirectionPress'
import { flyPoints } from '@/lib/pointsFlight'
import { offerScrap } from '@/composables/useTornScrap'
import WallDirectionMenu from './WallDirectionMenu.vue'
import TaskCompletionModal from './TaskCompletionModal.vue'
import TaskEditModal from './TaskEditModal.vue'
import TaskAssignmentModal from './TaskAssignmentModal.vue'
import SubtaskManagementModal from './SubtaskManagementModal.vue'
import TaskPostponeModal from './TaskPostponeModal.vue'

const props = defineProps<{ task: Task; expanded?: boolean }>()
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
    if (id === NOTE_HANDLE) void tearNote(handle)
    else void tearSubtask(id, handle)
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
  swallowClick: swallowTearClick
} = tear

/** Wird gerade am Eselsohr DIESES Zettels gezogen (nicht an einem Zettelchen)? */
const isNoteTearing = computed(() => tearActiveId.value === NOTE_HANDLE)

/** Weit genug für ein Abreißen — der Zettel sagt es, bevor losgelassen wird. */
const isTearReady = computed(() => isNoteTearing.value && tearPull.value >= tearDistance)

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
 * Das Eselsohr und die Griffe der Zettelchen haben ihre eigene Geste
 * (`useTearGesture`), der Bearbeiten-Knopf seinen Klick. Weil `pointerdown` bis
 * zum Wurzelelement hochblubbert, würde der Long-Press dort sonst **zusätzlich**
 * mitlaufen: ein Zug am Eselsohr hätte nach 420 ms auch die Richtungen
 * eingeblendet, und dieselbe Fingerbewegung nach unten hätte zweimal erledigt.
 *
 * Das ganze Zettelchen (`.mini`) ist ausgenommen, nicht nur sein Griff: es liegt
 * im aufgeklappten Zettel als eigene Fläche darin, und ein Long-Press auf einer
 * Unteraufgabe, der Richtungen für den ELTERN-Zettel einblendet, wäre eine
 * Aussage über das falsche Ding.
 */
const isPressControl = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('.ear, .mini, .edit') !== null

/**
 * Die Belegung ist in `WallDirectionMenu` beschriftet und hier ausgeführt —
 * beide Listen müssen dieselbe Aussage machen.
 *
 * **Kontextunabhängig, ausdrücklich ohne Fallunterscheidung nach Aufgabentyp**
 * (Spec): dieselbe Bewegung tut auf jedem Zettel dasselbe. Deshalb steht hier
 * kein `if (task_type === …)` und darf auch keins dazukommen.
 *
 * Drei der vier Richtungen öffnen genau die Dialoge, die schon am
 * Bearbeiten-Knopf hängen; nur „unten" handelt sofort, weil es der Schnellweg
 * ist, den die Beschriftung lehren soll.
 */
const onPressDirection = (direction: PressDirection) => {
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
  isControl: isPressControl,
  anchorEl: () => root.value
})

// Einzeln herausgezogen — verschachtelte Refs werden im Template nicht
// ausgepackt (dieselbe Falle wie bei der Abreiß-Geste oben).
const {
  open: pressOpen,
  direction: pressDirection,
  anchor: pressAnchor,
  onPointerDown: onPressDown,
  onPointerMove: onPressMove,
  onPointerUp: onPressUp,
  onPointerCancel: onPressCancel,
  onTouchMove: onPressTouchMove
} = press

/**
 * Dieselbe Ausnahme wie beim Abreißen: solange die Richtungen offen sind, darf
 * ein Neupacken der Wand (ein anderes Mitglied ändert etwas) diesen Zettel nicht
 * durch die Gegend fliegen lassen. Der Kranz liegt in Fensterkoordinaten fest —
 * ein wegfliegender Zettel ließe Beschriftung und Bezugspunkt auseinanderlaufen.
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
  <div
    ref="root"
    class="zettel"
    :class="[
      `zettel--${kind}`,
      {
        'zettel--tappable': hasSubtasks,
        'zettel--tearing': isNoteTearing,
        'zettel--tear-ready': isTearReady,
        'zettel--pressed': pressOpen
      }
    ]"
    :style="noteStyle"
    @click="onSurfaceTap"
    @pointerdown="onPressDown"
    @pointermove="onPressMove"
    @pointerup="onPressUp"
    @pointercancel="onPressCancel"
    @touchmove="onPressTouchMove"
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
      <!-- NICHT `task.effort`: hier steht, was das Abreißen wirklich noch
           einbringt (→ `effectivePoints`). Die Zahl ist das Versprechen, das
           der Punkteflug gleich einlöst — beide kommen aus derselben Quelle. -->
      <!-- PROTOTYP: der Punktwert ist ein aufgeklebter Sticker, keine Zeile
           Text mehr. Die FORM traegt den Wert (Kreis 1 … Stern 5), die Zahl
           bestaetigt ihn nur — auf einen Blick erkennbar, ohne zu lesen. -->
      <span class="points" :class="`points--s${Math.min(5, Math.max(0, effectivePoints))}`">
        {{ effectivePoints }}
      </span>
      <!-- PROTOTYP: Unteraufgaben haben jetzt IMMER ein eigenes Zeichen — ein
           angeklammerter Zettelstapel. Vorher verriet nur die Fortschrittszahl,
           dass es welche gibt, und die fehlt am täglichen Zettel und bei reinen
           Checklisten ganz: dort war das Aufklappen unsichtbar.

           Es ist ein Knopf, nicht nur ein Zeichen — die ganze Zettelfläche
           klappt zwar weiterhin auf, aber sie sagt es niemandem. Der Zähler
           steht nur dort, wo Fortschritt überhaupt etwas bedeutet
           (→ `tracksProgress`); sonst steht die blanke Anzahl. -->
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
          :class="{ 'ear--locked': tearScrolling }"
          :title="`„${subtask.title}“ abreißen`"
          @pointerdown="onTearDown(subtask.task_id, $event)"
          @pointermove="onTearMove"
          @pointerup="onTearUp"
          @pointercancel="onTearCancel"
          @click="onMiniEarClick(subtask.task_id, $event)"
        ></button>
      </div>
    </div>

    <!-- Der nachlaufende Klick eines Long-Press kann sehr wohl hier landen: der
         Knopf sitzt oben rechts, also genau dort, wo ein Zug nach oben oder
         rechts hinführt. Dass er das Modal trotzdem nicht öffnet, regelt der
         Klick-Wächter am Fenster (→ `useDirectionPress`) — er sieht den Klick
         in der Einfangphase, vor diesem `@click.stop`. -->
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
      :class="{ 'ear--locked': tearScrolling, 'ear--ready': isTearReady }"
      :title="`„${props.task.title}“ nach unten abreißen`"
      @pointerdown="onTearDown(NOTE_HANDLE, $event)"
      @pointermove="onTearMove"
      @pointerup="onTearUp"
      @pointercancel="onTearCancel"
      @click="swallowTearClick"
    ></button>

    <!-- Die vier beschrifteten Richtungen. Teleportiert nach `body` und in
         Fensterkoordinaten gelegt — die Begründung steht in der Komponente. -->
    <WallDirectionMenu v-if="pressOpen" :anchor="pressAnchor" :active="pressDirection" />

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
  /* PROTOTYP: rechts oben ist nichts mehr reserviert — der Titel bekommt die
     ganze obere Kante. Unten liegt die Griffzeile (Stift + Eselsohr); wie viel
     Platz sie braucht, haengt davon ab, ob die Fusszeile sich die Zeile teilt. */
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
  font-size: calc(13px * var(--proto-scale, 1));
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
  /* PROTOTYP: die Fusszeile ist die GRIFFZEILE des Zettels. Links stehen
     Punktwert und Faelligkeit, rechts sitzen Stift und Eselsohr — beide gleich
     gross (`--proto-hit`) und nebeneinander. Ihre Hoehe gibt die Zeilenhoehe
     vor, deshalb `min-height`; ihre Breite haelt das `padding-right` frei. */
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 0;
  min-height: var(--proto-hit, 48px);
  padding-right: calc(2 * var(--proto-hit, 48px));
  font-size: calc(10px * var(--proto-scale, 1));
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

/* Rot trägt die Bedeutung „überfällig" — deshalb steht daneben nur noch die
   Dauer, nicht das Wort. */
.meta {
  color: var(--color-danger);
}

/* --- PROTOTYP: Punkte als aufgeklebter Sticker ---------------------------- */

/* Die Form ist die Botschaft: ein Kreis ist eine Kleinigkeit, ein Stern ist
   die dickste Aufgabe auf der Wand. Wer die Wand ueberfliegt, sucht die
   Sterne — und muss dafuer keine Zahl lesen.

     0–1 P  Kreis          ruhig, blass
       2 P  abgerundetes Quadrat
       3 P  Sechseck
       4 P  Wappen
       5 P  Stern          Gold, der Blickfang

   Alle Formen haben dieselbe Kantenlaenge; nur die Silhouette und die Farbe
   unterscheiden sie. Der Schatten kommt von `drop-shadow` und nicht von
   `box-shadow`: ein `box-shadow` legt sich um das RECHTECK und wuerde am
   Stern als Kasten sichtbar. */
.points {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: var(--proto-sticker, 34px);
  height: var(--proto-sticker, 34px);
  /* Leicht schief aufgeklebt — wie alles auf dieser Wand. */
  transform: rotate(-6deg);
  color: #2b241c;
  font-size: calc(var(--proto-sticker, 34px) * 0.42);
  font-weight: 900;
  line-height: 1;
  opacity: 1;
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

/* Der Stern ist absichtlich der einzige, der aus der Reihe faellt: groesser,
   golden, staerker geneigt. Fuenf Punkte sind der Ausreisser. */
.points--s5 {
  width: calc(var(--proto-sticker, 34px) * 1.15);
  height: calc(var(--proto-sticker, 34px) * 1.15);
  transform: rotate(-10deg);
  background: #f4cf4a;
  font-size: calc(var(--proto-sticker, 34px) * 0.4);
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

/* --- PROTOTYP: Zeichen fuer Unteraufgaben --------------------------------- */

/* Ein angeklammerter Stapel: Papier mit gestricheltem Rand, damit er zu den
   Zettelchen gehoert, die er ankuendigt — und NICHT zu den beiden Griffen
   rechts, die etwas mit dem Zettel selbst tun.

   Gleiche Hoehe wie der Punkte-Sticker, aber breiter: er traegt Zeichen UND
   Zahl. Aufgeklappt kippt er die Farbe um, damit man den Weg zurueck findet. */
.subs-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  height: var(--proto-sticker, 34px);
  padding: 0 7px;
  border: 1.5px dashed rgba(36, 31, 26, 0.5);
  border-radius: 3px;
  background: #f3ece0;
  color: #2b241c;
  font-size: calc(var(--proto-sticker, 34px) * 0.34);
  font-weight: 800;
  line-height: 1;
  transform: rotate(2deg);
  box-shadow: 1.5px 2px 0 rgba(36, 31, 26, 0.28);
  cursor: pointer;
}

.subs-badge--open {
  border-style: solid;
  background: #2b241c;
  color: #f3ece0;
}

.subs-count {
  font-variant-numeric: tabular-nums;
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
  font-size: calc(12px * var(--proto-scale, 1));
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
  font-size: calc(11.5px * var(--proto-scale, 1));
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
  font-size: calc(9.5px * var(--proto-scale, 1));
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

/* Die einzige sichtbare Aktion. Oben rechts, weil unten rechts das Eselsohr
   liegt. 40 px wie in dichten Listen — 48 px wären auf einem 44-px-Zettel die
   ganze Fläche.

   **Warum das Stiftsymbol nicht in der Mitte seines Knopfes sitzt.** Ein Zettel
   ist mindestens 44 px hoch, und genau so hoch ist auch das Eselsohr. Auf einem
   Zettel dieser Mindesthöhe liegen beide Trefferflächen übereinander; senkrecht
   ist kein Platz für zwei Ziele. Das Eselsohr lässt deshalb per `clip-path`
   eine Ecke frei, und das Stiftsymbol rückt dort hinein.

   **Eine diagonale Trennlinie war dafür zu knapp — hier stehen die Messwerte,
   nicht meine Rechnung.** Erster Entwurf: 45°-Schnitt mit 34 px Schenkeln, dazu
   der Stift bei Schriftgröße 14 und 3 px Polster. Gerechnet kam ich auf „rund
   10 px" Abstand zur Trennlinie. Der QC hat im **gedrehten** Koordinatensystem
   bei 0,25 px Raster nachgemessen:

     Abstand Stiftmitte zur Trennlinie   4,16 px   (gerechnet: „rund 10")
     Stiftfläche auf dem Eselsohr        20,6 %
     Trefferfläche des Eselsohrs         1328 px²  (gerechnet: 1358)
     betroffen                           11 von 23 Zetteln

   Ein Fünftel des sichtbaren Stiftes lag also auf dem Eselsohr, auf knapp der
   halben Wand: sichtbares Ziel, keine Reaktion.

   **Die Lösung ist jetzt ein rechteckiger Ausschnitt statt einer Diagonalen.**
   Eine Diagonale schneidet dort am meisten weg, wo der Stift sitzt, und lässt
   dort am meisten stehen, wo ohnehin niemand hingreift. Der Ausschnitt (24 ×
   18 px in der oberen linken Ecke des Eselsohr-Kastens) gibt dem Stift eine
   eigene, rechteckige Zone und kostet das Eselsohr weniger Fläche als vorher
   die Diagonale.

   Symbolgröße 12, Polster 1 px oben / 4 px links.

   **Die Höhe war erst 16 px und das war um Haaresbreite zu wenig.** Gemessen:
   das Glyphenkästchen endet bei Zettel-lokal y ≈ 15,9 — es stand also bündig
   an der Kante des Ausschnitts, und jedes Antialiasing-Pixel darunter gehörte
   dem Eselsohr. Ergebnis: **13,2 % des sichtbaren Stiftes auf dem Ohr, auf 10
   von 20 Zetteln**, konkret die unteren rund 2,4 px. Mit 18 px bleiben
   **2,1 px** Luft. Das ist knapp, und es ist **absichtlich** knapp
   aufgeschrieben: wer an Symbolgröße, Polster oder Schriftart dreht, kippt es
   sofort wieder. Nachmessen ist hier Pflicht, nicht Kür.

   Messwerte zum jeweiligen Stand (alle vom QC, nicht gerechnet):

     Trefferfläche Eselsohr    Diagonale 34 px   1328 px²
                               Ausschnitt 24×16  1512 px²  (gerechnet 1552)
                               Ausschnitt 24×18  gerechnet 1504 — ungemessen
     Restfläche Bearbeiten     Ausschnitt 24×16   273 px², Stift zu 86,8 %
                               trefferwirksam; ein Klick auf die Glyphmitte
                               öffnet das Modal nachweislich
                               Ausschnitt 24×18  gerechnet +48 px² — ungemessen

   Dass der Bearbeiten-Knopf dabei von 399 auf 273 px² gefallen ist, ist in
   Ordnung: entscheidend ist, dass das **sichtbare** Ziel trifft, nicht wie
   groß die unsichtbare Fläche darum herum ist.

   Was einen Fehlgriff harmlos macht: ein Tipp, der doch im Eselsohr landet,
   tut **nichts** (es reagiert nur auf Ziehen). Er erledigt nie versehentlich —
   gemessen liegt der sichtbare Knick zu 97,7 % im Eselsohr, ein Griff dorthin
   öffnet also auch kein Modal mitten in der Geste. */
.edit {
  /* PROTOTYP: unten rechts, unmittelbar LINKS neben dem Eselsohr (44 px).
     Die untere rechte Ecke ist ohnehin die Griff-Ecke des Zettels — dort
     sucht der Daumen, und oben wird eine ganze Titelzeile frei.

     Der Glyph fuellt seine Flaeche jetzt aus (`place-items: center`) statt in
     ihrer Ecke zu sitzen: gezielt wird auf das Sichtbare, nicht auf die
     unsichtbare Flaeche darum herum. */
  position: absolute;
  top: auto;
  bottom: 0;
  right: var(--proto-hit, 48px);
  width: var(--proto-hit, 48px);
  height: var(--proto-hit, 48px);
  padding: 0;
  border: 0;
  background: none;
  color: #2b241c;
  font-size: calc(var(--proto-hit, 48px) * 0.42);
  line-height: 1;
  display: grid;
  place-items: stretch;
  padding: 7px;
  cursor: pointer;
}

/* PROTOTYP: der Stift sitzt auf einem eigenen aufgeklebten Patch — dieselbe
   Sprache wie der Punkte-Sticker daneben. Vorher war er eine graue Glyphe im
   Nichts: man sah nicht, dass da ein Knopf ist. */
.edit > i {
  display: grid;
  place-items: center;
  border-radius: 5px;
  background: #d9c9ec;
  box-shadow:
    inset 0 0 0 1.5px rgba(36, 31, 26, 0.35),
    1.5px 2px 0 rgba(36, 31, 26, 0.3);
  transform: rotate(3deg);
}

.edit:active {
  transform: translate(1px, 1px);
}

/* --- Das Eselsohr: der Abreiß-Griff (Etappe 4) ---------------------------- */

/* 44 × 44 px Kasten in der unteren rechten Ecke SEINES Zettels — `right: 0;
   bottom: 0`, kein negativer Versatz. Der Prototyp setzt hier −2 px; das würde
   den Griff über die Kante schieben und im dichten Packen den Nachbarzettel
   betätigen, also die falsche Aufgabe erledigen. Unsichtbar, nur durch Abtasten
   der Ecken zu finden — deshalb bündig.

   `clip-path` nimmt aus der oberen linken Ecke ein **Rechteck** von 24 × 18 px
   heraus und überlässt es dem Bearbeiten-Knopf; warum ein Rechteck und keine
   Diagonale, steht ausführlich dort. 24/44 = 54,5 %, 18/44 = 40,9 %.

   **Wie eng es zwischen Ausschnitt und Zeichnung wirklich ist** (Ohr-lokale
   y-Werte, 0 = Oberkante des Kastens; eine frühere Fassung dieses Kommentars
   nannte das „strukturell sicher" — das war zu großzügig, der QC hat genau hier
   einen Anschnitt gemessen):

     Unterkante des Ausschnitts                 y = 18
     Oberkante des Knicks (44 − 2 − 22)         y = 20   → 2 px frei
     Perforationslinie (44 − 22)                y = 22   → 4 px frei

   Zwei Pixel sind kein Puffer. Was hier **doch** strukturell hält, ist etwas
   anderes: die **Höhe** des Knicks ändert sich in keinem Zustand mehr, auch
   nicht im „reißt gleich" (siehe dort — er wächst nur noch in die Breite). Der
   Anschnitt kann damit nicht mehr aus einem Zustandswechsel entstehen, sondern
   nur noch daraus, dass jemand an einer dieser drei Zahlen dreht. Dann bitte
   alle drei nachrechnen und nachmessen.

   Trefferfläche, gemessen und gerechnet nebeneinander:

     Ausschnitt 24 × 16   gemessen 1512 px²   (gerechnet 1552, −2,6 %)
     Ausschnitt 24 × 18   gerechnet 1504 px², ungemessen
     Diagonale 34 px      gemessen 1328 px²   (der Vorgänger)

   Der Griff ist mit dem Ausschnitt also größer als mit der Diagonalen — und
   der Stift trotzdem frei.

   `touch-action: none` ist die zweite Hälfte des Scroll-Schutzes: nur so wird
   aus einem Zug nach unten überhaupt eine Geste statt eines Bildlaufs. Solange
   die Seite scrollt (plus Nachlauf), schaltet `.ear--locked` auf `pan-y` zurück
   — wer in eine fliegende Wand greift, scrollt weiter und reißt nichts ab.

   **Was das kostet, ist vermessen** (QC, beide Stände):

     Diagonale 34 px      1329 px² je Ohr = 68,6 % des Kastens,
                          über die Wand rund 6,4 % der Fläche
     Ausschnitt 24 × 16   1538 px² je Ohr = 79,4 % des Kastens
     Ausschnitt 24 × 18   gerechnet rund 1490 px², ungemessen

   Der weggeschnittene Teil scrollt in allen Ständen korrekt durch. Der
   Wandanteil ist nur für den diagonalen Stand gemessen; mit dem größeren Griff
   liegt er höher als 6,4 % — das ist die Untergrenze, nicht der neue Wert. Wer
   den Preis für zu hoch hält, kann den Kasten
   verkleinern; `touch-action: pan-y` als Dauerzustand ist **keine** Option:
   damit beginnt der Browser beim Zug nach unten zu scrollen und schickt
   `pointercancel`, bevor die Geste je erkannt würde. */
.ear {
  position: absolute;
  right: 0;
  bottom: 0;
  width: var(--proto-hit, 48px);
  height: var(--proto-hit, 48px);
  padding: 0;
  border: 0;
  background: none;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  /* PROTOTYP: KEIN Ausschnitt mehr. Er existierte nur, damit der Stift oben
     rechts nicht unter dem Eselsohr verschwand — jetzt stehen beide
     nebeneinander in der Fusszeile und teilen sich keine Flaeche mehr. Das
     Eselsohr ist damit ein volles Quadrat, seine Trefferflaeche waechst. */
}

.ear--locked {
  /* Während des Scrollens gehört die Geste wieder dem Browser. */
  touch-action: pan-y;
}

/* Die angeknickte Ecke selbst. */
.ear::before {
  content: '';
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: var(--proto-knick, 30px);
  height: var(--proto-knick, 30px);
  background: linear-gradient(
    225deg,
    var(--pw-cork) 0 50%,
    rgba(0, 0, 0, 0.16) 50% 54%,
    #efe7d3 54%
  );
  border-left: 1.2px solid rgba(36, 31, 26, 0.6);
  border-top: 1.2px solid rgba(36, 31, 26, 0.6);
}

/* Die Perforationslinie über dem Knick — sie sagt, wo der Zettel reißt. Sie
   liegt 22 px über dem unteren Rand, der Ausschnitt endet 18 px unter der
   Oberkante. Die Länge ist damit gleichgültig, die *Dicke* aber nicht:

     normal (1 px)                 Oberkante y = 20  →  2,0 px frei
     reißt gleich (2,5 px Akzent)  Oberkante y = 18  →  0,0 px frei

   Beide gemessen. Im Alarmzustand liegt die Linie also **exakt bündig** auf der
   Ausschnittkante — sie schneidet nicht an, aber die Reserve ist null. Wächst
   die Akzentlinie je über 2,5 px, entsteht dieselbe Kerbe, die der Knick hier
   schon zweimal erzeugt hat (siehe die Knickregeln oben: dort ist die Höhe
   deshalb in allen Zuständen festgenagelt). Wer diese Linie dicker macht, muss
   den Ausschnitt mitwachsen lassen. */
.ear::after {
  content: '';
  position: absolute;
  right: 2px;
  bottom: var(--proto-knick, 30px);
  width: calc(var(--proto-knick, 30px) + 2px);
  height: 0;
  border-top: 1.5px dashed rgba(36, 31, 26, 0.45);
}

/* Auch beim Anfassen wächst nur die Breite — dieselbe Begründung wie beim
   Zustand „reißt gleich" weiter unten. Die Höhe des Knicks ist an dieser Ecke
   die einzige Zahl, die den Ausschnitt des Bearbeiten-Knopfes treffen kann, und
   sie ist deshalb in allen Zuständen fest. */
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
   **Ohne jede Änderung an Größe, Lage oder Neigung** — der Zettel ist der
   Bezugspunkt des Richtungskranzes, der in Fensterkoordinaten daneben liegt.
   Ein Zettel, der beim Auslösen wächst oder springt, verschöbe seine Mitte
   gegen die bereits festgelegte Mitte des Kranzes. Der Zustand ist deshalb
   rein farblich. */
.zettel--pressed {
  z-index: 810 !important;
  box-shadow: var(--pw-shadow-lift);
}

/* Weit genug gezogen: Loslassen erledigt. Die Perforation reißt sichtbar auf. */
.zettel--tear-ready {
  border-style: dashed;
}

.zettel--tear-ready .ear::after {
  border-top-color: var(--pw-accent);
  border-top-width: 2.5px;
}

/* Der Knick wächst **nur in die Breite**, seine Höhe bleibt bei 22 px.
 *
 * Vorgeschichte: erst wuchs er auf 30 × 30, dann auf 27 × 27, und beides ragte
 * in den Ausschnitt des Bearbeiten-Knopfes. Der QC hat den zweiten Versuch
 * nachgemessen — bei 27 px liegt die Oberkante bei y = 15, der Ausschnitt
 * reichte bis y = 16: **−1 px über eine Breite von 9 px**. Eine Kerbe an der
 * Wahrnehmungsgrenze, aber eine Kerbe.
 *
 * Zweimal knapp danebenliegen heißt, dass die Zahl das falsche Werkzeug ist.
 * Deshalb wächst hier keine Höhe mehr: die Oberkante des Knicks steht in JEDEM
 * Zustand bei y = 20 und damit unter dem Ausschnitt (y = 18). Der Anschnitt
 * kann aus diesem Zustandswechsel nicht mehr entstehen — unabhängig davon,
 * welche Breite hier künftig steht.
 *
 * Als Ankündigung reicht die Breite: ein breiterer Knick liest sich als
 * größeres Eselsohr, und daneben stehen ohnehin schon der gestrichelte Rand des
 * Zettels und die aufleuchtende Perforationslinie. */
.zettel--tear-ready .ear::before {
  width: 27px;
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
  font-size: calc(12.5px * var(--proto-scale, 1));
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
  font-size: calc(15px * var(--proto-scale, 1));
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
