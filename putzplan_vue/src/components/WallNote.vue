<script setup lang="ts">
/**
 * Ein Zettel an der Pinnwand.
 *
 * Der Zettel bestimmt sein Aussehen selbst, aber **nicht seinen Platz**: Breite,
 * Position und Stapelreihenfolge setzt `WallView` per DOM, weil die Höhe erst
 * nach dem Setzen der Breite messbar ist. Deshalb ist das Wurzelelement nach
 * außen freigegeben.
 *
 * Bewusst nicht hier:
 * - kein Name, keine Initialen, kein Badge — die Zuständigkeit trägt allein die
 *   Befestigung (→ CONTEXT.md „Befestigung")
 * - keine Kategorie, keine Überschrift — der Typ ist am Papier und an der
 *   Befestigung erkennbar (Reißzwecke / Klebeband / Büroklammern)
 * - nur EIN sichtbarer Knopf: Bearbeiten; dessen Folgedialoge bleiben
 *   vollständig erreichbar
 * - der Fetzen zum Zurückkleben (`useTornScrap`)
 *
 * Gesten: Long-Press auf der Fläche öffnet den Kranz (`useDirectionPress`,
 * Beschriftung in `WallDirectionMenu`), der Zug am Eselsohr reißt ab
 * (`useTearGesture`). **Projekte sind die Ausnahme von beidem:** kein Kranz —
 * beim Halten hebt sich nur der Zettel —, beide Gesten nach unten öffnen das
 * `ProjectWorkModal`, es entsteht kein Fetzen; die anderen Richtungen tun
 * nichts, alles Weitere läuft über den Bearbeiten-Stift.
 *
 * Antippen der Fläche klappt die Unteraufgaben auf — nur, wenn es welche gibt.
 * Das Aufklappen wird nur **gemeldet** (`toggle`), den Zustand hält `WallView`:
 * sie muss ihn vor dem Packen kennen, weil ein aufgeklappter Zettel die volle
 * Wandbreite bekommt.
 */
import { computed, ref, watch } from 'vue'
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { projectPhraseOf, projectPhraseStackOf } from '@/lib/projectPhrases'
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
   * Punktwert oben rechts statt in der Fußzeile. Das entscheidet die Wand, weil
   * nur sie beim Packen misst, ob die Fußzeile sonst breiter als der Titel wäre
   * (→ `WallView`, `relayout`).
   *
   * **Bewusst ein Prop, keine per `classList` gesetzte Klasse:** Vue ersetzt
   * `className` bei jedem Patch komplett aus dem berechneten Klassen-Array —
   * eine von außen ans DOM geschriebene Klasse überlebt kein Update.
   */
  metaTop?: boolean
}>()
/**
 * `gesture-start` / `gesture-end`: solange der Finger auf diesem Zettel eine
 * Geste ausführt (Eselsohr **oder** Long-Press), lässt die Wand ihn beim
 * Neupacken aus — sonst kämpfen FLIP-Animation und Finger um dasselbe
 * `transform`, und der Kranz verlöre seinen Bezugspunkt. Bewusst nicht „tear",
 * weil beide Gesten hier melden.
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
  // "Am Projekt arbeiten" ist Buchhaltung, kein Zettel.
  return isProject.value ? all.filter((s) => s.title !== 'Am Projekt arbeiten') : all
})

/** Nur ein Zettel MIT Unteraufgaben klappt auf. */
const hasSubtasks = computed(() => subtasks.value.length > 0)

/**
 * **Ein täglicher Zettel hat keinen Fortschritt — das ist Absicht, kein Bug.**
 *
 * An einem `daily`-Elternteil sind Unteraufgaben nur `bonus`: wiederholbare
 * Belohnungen, die nie zurückgesetzt werden, weil der Elternteil nie „fertig"
 * wird. `taskStore.completeTask` setzt bei ihnen `completed` deshalb NICHT
 * (`isChecklistSubtask || task.task_type !== 'daily'`). Wer das „repariert",
 * bekommt ein dauerhaft durchgestrichenes Zettelchen und ein ewiges `7 / 7`.
 *
 * Darum hier kein Fortschrittszähler und kein Durchstreichen. Dass ein Abreißen
 * angekommen ist, sagt nur die kurze Rückmeldung `recentlyTorn`.
 */
const tracksProgress = computed(() => props.task.task_type !== 'daily')

const doneSubtasks = computed(() => subtasks.value.filter((s) => s.completed).length)

/** Drei Spalten nur bei durchweg kurzen Titeln, sonst zwei. */
const columns = computed(() => subtaskColumns(subtasks.value.map((s) => s.title)))

/**
 * Antippen der Fläche. Der Zettel entscheidet hier nur, **ob** überhaupt etwas
 * passiert; das Aufklappen selbst gehört der Wand, weil sie neu packen muss.
 */
const onSurfaceTap = () => {
  // Den nachlaufenden Klick eines Long-Press fängt `useDirectionPress` schon in
  // der Einfangphase am Fenster ab — hier bewusst KEINE zweite Schluckstelle.
  if (!hasSubtasks.value) return
  emit('toggle', props.task.task_id)
}

// --- Abreißen ----------------------------------------------------------------

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
 * der Fußzeile dieselbe sein. Der ungekürzte `tasks.effort` verspräche bei
 * erledigten `deduct`-Unteraufgaben Punkte, die nie fliegen — eine Zahl am
 * Zettel ist ein Versprechen.
 *
 * Verbindlich rechnet die Edge Function; das hier ist die Schätzung fürs Auge.
 */
const effectivePoints = computed(() => {
  const deductSum = taskStore
    .getSubtasks(props.task.task_id)
    .filter((s) => s.completed && s.subtask_points_mode === 'deduct')
    .reduce((sum, s) => sum + s.effort, 0)
  return Math.max(0, props.task.effort - deductSum)
})

/**
 * Was am Sticker steht: sonst die Zahl, die beim Abreißen fliegt
 * (→ `effectivePoints`). **Ein Projekt hat keine feste Punktzahl** — dort steht,
 * wie viele Punkte es bis jetzt verschlungen hat (`taskStore.projectEffortTotals`).
 * Bewusst NICHT aus `taskStore.completions`: die sind an der Wand leer.
 *
 * Klassenname `.points` und Platz im `.corner` bleiben, weil
 * `WallView.relayout` genau danach misst.
 */
const displayPoints = computed(() =>
  isProject.value ? taskStore.getProjectEffortTotal(props.task.task_id) : effectivePoints.value,
)

/**
 * Was im Sticker STEHT. **Nur das Projekt-Abzeichen klemmt bei `999+`:** vier
 * Stellen sprengen die 34 px. Die Klemme gilt nur der ANZEIGE — die Stufe rechnet
 * mit `displayPoints` (siehe `badgeStage`), sonst fiele 1500 auf die Stufe von 999.
 */
const pointsLabel = computed(() =>
  isProject.value && displayPoints.value > 999 ? '999+' : String(displayPoints.value),
)

/**
 * Stufe des Projekt-Abzeichens: 1–5 über den Bändern 0–9, 10–24, 25–49,
 * 50–99, ab 100 (gesetzt, nicht gemessen).
 *
 * **Bewusst eigene Klassen (`points--b1…b5`) statt `points--s0…s5`:** die
 * Sticker-Stufen sind die PUNKTZAHL einer Aufgabe; ein Projekt mit 21 Punkten
 * bekäme über `Math.min(5, …)` den Fünf-Punkte-Stern und läse sich als
 * „5 Punkte" statt „Stufe 5".
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
 * Projekte bekommen das Abzeichen (Grundform, Stufe, Passung), alle anderen den
 * Punkte-Sticker. `points--fitN` setzt die Schriftgröße nach der Stellenzahl,
 * sonst liefe dreistellig über die Innenfläche. Die Fläche bleibt bei allen
 * Stufen 34 × 34 px — anders als der Sticker, der bei `points--s5` wächst.
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
 * Nur dort gesetzt, wo die Klemme etwas verschweigt — sonst wiederholte der
 * Titel nur die sichtbare Zahl.
 */
const pointsTitle = computed(() =>
  isProject.value && displayPoints.value > 999
    ? `Bisher verschlungene Punkte: ${displayPoints.value}`
    : undefined,
)

/**
 * Startpunkt des Punkteflugs: die Mitte des Griffs in Fensterkoordinaten. Das
 * Rechteck eines geneigten Zettels ist größer als der Zettel, seine Mitte aber
 * dieselbe — wer eine Ecke bräuchte, müsste rechnen.
 */
const centerOf = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

// --- Projekte: arbeiten statt abreißen ---------------------------------------

/**
 * Ein Projekt wird nie fertig, es wird beackert: **beide** Gesten nach unten
 * landen im selben `ProjectWorkModal` — kein Erledigen, kein Fetzen. Doppelt
 * auslösen geht nicht: der Long-Press startet nicht auf dem Eselsohr
 * (`isPressControl`), das Modal ist ein einzelner Zustand, und gebucht wird
 * erst im Fenster.
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
    .find((s) => s.title === 'Am Projekt arbeiten')
  return work?.task_id ?? null
})

/**
 * Ein Projekt ohne diese Unteraufgabe bekommt **kein** Fenster: es
 * hätte nichts, worauf es buchen könnte. Stilles Nachlegen aus einer Geste
 * heraus wäre eine Datenänderung, die niemand angefordert hat.
 */
const openProjectWork = () => {
  if (!projectWorkSubtaskId.value) {
    console.error('Project work subtask not found')
    return
  }
  showProjectWorkModal.value = true
}

/**
 * Buchen auf die Work-Unteraufgabe — die Punkte laufen ins Wochenziel wie bei
 * jeder Erledigung. Rückmeldung ist der Punkteflug, **kein Toast**. **Kein
 * `markAsDirty`**: die Unteraufgabe ist an der Wand ausgeblendet, und ein
 * Zurücksetzen von hier wäre eine zweite Wahrheit neben dem Store.
 *
 * Der Rückgabewert entscheidet über den Flug — ein abgewiesener Doppelgriff darf
 * keine zweite Zahl fliegen lassen. Schlägt es fehl, bleibt das Fenster offen.
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
 * Der Doppeltipp-Schutz sitzt **synchron** in `taskStore.completeTask`
 * (`completionsInFlight`, gesetzt vor dem ersten `await`). Hier bewusst KEIN
 * eigenes `:disabled` — das schreibt Vue erst im nächsten Tick und schützt nicht
 * gegen synchrone Taps. Über den Punkteflug entscheidet der **Rückgabewert**.
 *
 * Was fliegt: bei `bonus` und `deduct` der volle `effort` der Unteraufgabe —
 * beide erhöhen die Wochenpunkte um genau diesen Betrag
 * (`estimateCompletionEffort`; das Minus am `deduct`-Zettelchen meint den
 * späteren Abzug beim Elternteil). Bei `checklist` fliegt nichts; das
 * Zettelchen quittiert selbst (`mini--torn`, ggf. Durchstrich). Verbindlich
 * gerechnet wird in der Edge Function `complete-task`.
 */
const tearSubtask = async (subtaskId: string, handle: HTMLElement) => {
  const subtask = subtasks.value.find((s) => s.task_id === subtaskId)
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
 * **Ein Abriss quittiert immer**, auch mit null Punkten (alles schon über
 * `deduct`-Unteraufgaben eingesammelt) — stumm sieht aus wie ein Fehlgriff. Kein
 * „+0 P", das läse sich wie Verlust oder Fehler; stattdessen fliegt „erledigt"
 * in der ruhigen Papiervariante.
 */
const tearNote = async (handle: HTMLElement) => {
  const origin = centerOf(handle)
  const points = effectivePoints.value
  const applied = await taskStore.completeTask(props.task.task_id)
  if (!applied) return
  if (points > 0) flyPoints(`+${points} P`, origin)
  else flyPoints('erledigt', origin, { muted: true })
  // Der Fetzen erst NACH `applied`: ein abgewiesener Doppelgriff hat nichts
  // erledigt und darf nichts zum Zurücknehmen anbieten. Nur der ganze Zettel
  // bekommt einen — ein Zettelchen bleibt sichtbar stehen, und die Dialogwege
  // sind bewusste Entscheidungen mit Bestätigung.
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
      // Am Projekt reißt nichts ab. Nicht über `tearNote()`: das böte einen
      // Fetzen an, und „Zurückkleben" löschte dort still einen Arbeitseintrag.
      if (isProject.value) openProjectWork()
      else void tearNote(handle)
    } else void tearSubtask(id, handle)
  },
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
  swallowClick: swallowTearClick,
} = tear

/** Wird gerade am Eselsohr DIESES Zettels gezogen (nicht an einem Zettelchen)? */
const isNoteTearing = computed(() => tearActiveId.value === NOTE_HANDLE)

/**
 * Weit genug für ein Abreißen — der Zettel sagt es vor dem Loslassen.
 *
 * **An einem Projekt nie:** Umriss (`.zettel--tear-ready`) und Perforation
 * (`.ear--ready`) kündigten einen Abriss an, den es dort nicht gibt. Das
 * Mitziehen (`.zettel--tearing`) bleibt.
 */
const isTearReady = computed(
  () => !isProject.value && isNoteTearing.value && tearPull.value >= tearDistance,
)

watch(isNoteTearing, (active) => {
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
    boxShadow: '4px 6px 0 rgba(36, 31, 26, 0.34)',
  }
}

/**
 * Antippen eines Zettelchen-Griffs erledigt sofort; die Zieh-Geste kommt daneben.
 * Hat sie ausgelöst, wird der nachlaufende Klick geschluckt.
 *
 * Der Scroll-Schutz gilt auch fürs Antippen — er hängt sonst nur am
 * `pointerdown` der Geste, und der Klick erledigte mitten im Bildlauf doch etwas.
 */
const onMiniEarClick = (subtaskId: string, event: MouseEvent) => {
  if (swallowTearClick(event)) return
  if (tearScrolling.value) return
  void tearSubtask(subtaskId, event.currentTarget as HTMLElement)
}

/**
 * Kurze, **vergängliche** Rückmeldung auf ein Abreißen — an einem täglichen
 * Zettel der einzige Beleg (siehe `tracksProgress`), sonst Überbrückung, bis der
 * Store den Zustand angewandt hat. 700 ms: etwas länger als die 600-ms-Animation,
 * damit sie nicht abgeschnitten wird.
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

// --- Long-Press mit vier Richtungen ------------------------------------------

/**
 * Was diese Geste NICHT starten darf: **nur die Abreiß-Griffe** (`.ear`,
 * `.mini-ear`). Sie haben ihre eigene Geste; weil `pointerdown` bis zum
 * Wurzelelement hochblubbert, liefe der Long-Press sonst **zusätzlich** mit, und
 * derselbe Zug nach unten erledigte zweimal. Abreißen greift laut Glossar sofort
 * und **ohne Kranz**.
 *
 * **Bewusst NICHT hier: `.mini`, `.edit`, `.subs-badge`, `.due-stamp`** — der
 * ganze Zettel ist Griff (→ CONTEXT.md „Greifen"). Die Knöpfe verlieren dadurch
 * nichts: sie hängen an `@click`, und ein Loslassen NACH überschrittener
 * Halte-Schwelle schluckt der Klick-Wächter am Fenster (`armClickGuard` in
 * `useDirectionPress`, feuert bei `fired` auch ohne anliegende Richtung). Ein
 * kurzer Tipp läuft durch — unter 420 ms wird der Wächter nie scharf.
 */
const isPressControl = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('.ear, .mini-ear') !== null

/**
 * Die Belegung ist in `WallDirectionMenu` beschriftet und hier ausgeführt —
 * beide Listen müssen dieselbe Aussage machen. Drei Richtungen öffnen die
 * Dialoge vom Bearbeiten-Knopf; nur „unten" handelt sofort, weil es der
 * Schnellweg ist, den die Beschriftung lehren soll.
 *
 * **Projekte** haben keinen Kranz, also auch keine Beschriftung: „unten" öffnet
 * das Arbeitsfenster, die anderen drei tun **nichts** — eine Aktion ohne
 * Beschriftung wäre eine unsichtbare.
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
  isControl: isPressControl,
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
  onTouchMove: onPressTouchMove,
} = press

/**
 * Solange die Richtungen offen sind, darf ein Neupacken (ein anderes Mitglied
 * ändert etwas) diesen Zettel nicht verschieben — das Overlay liegt in
 * Fensterkoordinaten fest. Beide Gesten teilen sich dafür `gestureNoteId` in
 * `WallView`; das geht, weil sie sich ausschließen (→ `isPressControl`, ein
 * zweiter Finger kommt in keiner durch).
 */
watch(pressOpen, (open) => {
  if (open) emit('gesture-start', props.task.task_id)
  else emit('gesture-end', props.task.task_id)
})

/** Deterministisch aus der `task_id` — nach jedem Neuladen dieselbe Neigung. */
const rotation = computed(() => rotationOf(props.task.task_id))

/**
 * Personenfarbe für die Befestigung — genau so, wie das Mitglied sie gewählt
 * hat; zur Laufzeit wird nichts umgefärbt, aufgehellt oder gerundet. `null`
 * heißt „niemand zuständig": dann bleibt `--owner` ungesetzt und es greift die
 * Rückfallfarbe (`--owner-none`).
 *
 * Die Zuweisungsfarbe steht **ausschließlich** an der Befestigung
 * (→ CONTEXT.md „Befestigung"); der Zettelrahmen bleibt immer konturlos.
 */
const ownerColor = computed(() => {
  if (!props.task.assigned_to) return null
  const member = householdStore.householdMembers.find((m) => m.user_id === props.task.assigned_to)
  return member?.user_color || null
})

/**
 * Ob jemand zuständig ist — über `ownerColor`, damit ein `assigned_to` auf ein
 * nicht (mehr) existierendes Mitglied als „niemand" zählt. Die Klasse
 * `.zettel--assigned` hat derzeit keine CSS-Wirkung; sie bleibt bewusst als
 * Haken für eine spätere, zurückhaltendere Auszeichnung.
 */
const isAssigned = computed(() => ownerColor.value !== null)

/**
 * `--owner` nur, wenn es wirklich eine Person gibt — sonst greift der zweite
 * Parameter von `var(--owner, …)`.
 *
 * Die Zieh-Bewegung des Abreißens steht in derselben `transform`-Zeichenkette
 * wie die Neigung: ein zweites Inline-`transform` überschriebe die Neigung.
 *
 * Der z-index bleibt bewusst **draußen**: den schreibt `WallView` direkt ans
 * Element. Würde Vue ihn hier zeitweise mitverwalten, entfernte es ihn beim
 * Loslassen wieder — der Zettel verlöre seine Stapelposition bis zum nächsten
 * Packen. Das Anheben beim Ziehen macht deshalb `.zettel--tearing` mit
 * `!important`.
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
 * (→ CONTEXT.md „Stempel"). **Jeder Zettel trägt einen.**
 *
 *   tägliche Aufgabe            → BEDARF   (sie wird nicht fällig, sie fällt an)
 *   Projekt                     → Projektspruch (es kann nicht in Verzug geraten)
 *   noch nie erledigt           → NEU
 *   sonst                       → FÄLLIG
 *
 * **Der Typ schlägt NEU, und die Reihenfolge dieser Prüfungen ist die ganze
 * Regel.** Tägliche Aufgaben und Projekte werden nie abgeschlossen und stünden
 * bei umgekehrter Reihenfolge DAUERHAFT auf NEU — ein stiller Fehler: der
 * Stempel sähe plausibel aus, er stünde nur nie wieder um.
 *
 * Keine Dringlichkeitsstufe, keine Tageszahl, kein „HEUTE": auf der Wand sind
 * alle fälligen Aufgaben gleich dringend, der Stempel **ordnet nicht**
 * (→ ADR-0002). Wer hier wieder eine Tageszahl anzeigen will, widerspricht dem
 * Glossareintrag „Stempel" — das ist eine Domänenentscheidung, keine
 * UI-Petitesse. Was von Hand daraufgelegt wird, ist das Überstempeln
 * (`emphasis_level`); der Grundabdruck selbst verfällt nicht.
 */
const stampLabel = computed((): string => {
  // ERST der Typ, DANN der Erledigungs-Status. Nicht umstellen, siehe oben.
  if (props.task.task_type === 'daily') return 'BEDARF'

  // Dieser Zweig läuft derzeit nie: Projekte nehmen in `stampLayers` den Weg
  // über `projectPhraseStackOf`. Er bleibt als Notausgang — der Grundabdruck
  // eines Projekts IST sein Spruch; ohne die Zeile lieferte ein künftiger
  // zweiter Leser still `NEU`/`FÄLLIG` an einem Projekt. Der
  // `warnOnce`-Stolperdraht in `projectPhrases.ts` hängt nicht an ihm.
  if (props.task.task_type === 'project') return projectPhraseOf(props.task)

  return props.task.last_completed_at ? 'FÄLLIG' : 'NEU'
})

/**
 * Der **Nachdruck** — was von Hand auf den Grundabdruck gelegt wurde
 * (→ CONTEXT.md „Überstempeln"); `null` heißt: sauber.
 *
 * Am Projekt gibt es diese Wörter nicht (jede Stufe trägt einen Spruch, die
 * Stufe steht in der Farbe) — dort bewusst `null`, statt ein Wort zu behaupten,
 * das nirgends steht. Gebraucht nur für den Tooltip; was oben liegt, sagt
 * `stampLayers`. Die Modulo-Logik liegt im Store (`cycleEmphasisLevel`).
 */
const emphasisLabel = computed((): string | null => {
  if (props.task.task_type === 'project') return null
  if (props.task.emphasis_level === 1) return 'WICHTIG'
  if (props.task.emphasis_level === 2) return 'DRINGEND'
  return null
})

/**
 * Der Tooltip am Stempel. Am Projekt steht kein Stufenwort da, die Stufe ist
 * eine Farbe — dort wird sie gezählt statt benannt.
 */
const stampTitle = computed((): string => {
  if (props.task.emphasis_level === 0) return 'Tippen: überstempeln'
  if (emphasisLabel.value) return `Überstempelt: ${emphasisLabel.value} — tippen zum Weiterdrehen`
  return `Überstempelt: ${props.task.emphasis_level}× — tippen zum Weiterdrehen`
})

/**
 * Betrag der Neigung eines Abdrucks in Grad und Streubreite je Lage: **9° ± 5°**
 * (am Bild abgenommen, nicht frei gewählt). **Ein Betrag, kein Winkel** — die
 * Richtung kommt aus `tiltSignOf`. Weil `jitterOf` symmetrisch um null streut,
 * ergäbe ein vorzeichenbehafteter Wert eine feste Schräge mit Rauschen: jeder
 * Stempel der Wand nach derselben Seite.
 */
const STAMP_TILT = 9
const STAMP_TILT_JITTER = 5

/**
 * Versatz einer Lage, in Pixeln: ±5,5. **Ein Messergebnis, kein Geschmack:** bei
 * 3 px verschwinden die unteren Lagen unter der deckenden obersten, und die
 * Stapelhöhe soll die Aussage tragen. Nicht „aufräumen".
 *
 * Der Versatz läuft über `transform` und geht deshalb **nicht** in die Breite
 * der Fußzeile ein — was die Breite bestimmt, steht am `.due-stamp`-CSS.
 */
const STAMP_OFFSET = 5.5

/**
 * Nach links oder rechts geneigt — deterministisch aus der Aufgaben-Kennung.
 * **Das Vorzeichen hängt an der LAGE, nicht am Zettel:** jeder Abdruck ist ein
 * eigener Handgriff; kippen alle drei gleich, sieht der Stapel gedruckt aus
 * statt gestempelt.
 *
 * Geometrisch folgenlos: die Hüllbreite eines gedrehten Kastens ist
 * `b·cos θ + h·sin θ`, für +θ und −θ gleich. Gekreuzte Lagen ragen nicht in die
 * 88-px-Reserve und nicht weiter über die Papierkante als gleichsinnige.
 */
const tiltSignOf = (id: string, index: number) =>
  jitterOf(id, `stamp-dir${index}`, 1) < 0 ? -1 : 1

/** Eine Lage des Abdruckstapels, von unten (Grundabdruck) nach oben. */
interface StampLayer {
  /**
   * Stufe: 0 Grundabdruck, 1 und 2 die überstempelten Lagen. Am Projekt stehen
   * auf 1 und 2 Projektsprüche statt `WICHTIG`/`DRINGEND` — deshalb heißt das
   * Feld nach der Stufe, nicht nach dem Wort.
   */
  level: 0 | 1 | 2
  text: string
  /** Die zurzeit oberste, gültige Lage — voll deckend. */
  top: boolean
  /** Noch nicht gestempelt: unsichtbar, aber **weiterhin gemessen** (siehe unten). */
  reserved: boolean
  transform: string
}

/**
 * Der **Abdruckstapel** (→ CONTEXT.md „Überstempeln", ADR-0003).
 *
 * **Alle drei Lagen stehen IMMER im DOM — auch die noch nicht gestempelten.**
 * Nach einem Tipp wird bewusst NICHT neu gepackt (`layoutSignature` in
 * `WallView.vue` kennt `emphasis_level` nicht, → ADR-0002). Wüchse die Fußzeile
 * beim Stempeln, schöbe sich das Layout unter dem Finger weg — oder bliebe,
 * schlimmer, falsch gepackt stehen. Die noch nicht gesetzten Lagen sind deshalb
 * nur `visibility: hidden`: unsichtbar, aber im Grid weiterhin vermessen. Die
 * naheliegende Alternative — Nachdrücke absolut über den Grundabdruck legen —
 * ist gemessen und verworfen (→ ADR-0003, Alternativen).
 *
 * **Versatz und Neigung kommen deterministisch aus der Aufgaben-Kennung**
 * (`jitterOf`, derselbe FNV-1a wie beim Zettelversatz) — nie `Math.random`, nie
 * die Listenposition. Ein Stempel, der beim Neuladen woanders sitzt, sieht aus
 * wie ein Fehler; auf einem zweiten Gerät säße er anders als hier.
 *
 * **Der Versatz hängt an der LAGE, nicht an ihrer Rolle — und JEDE Lage hat
 * einen, auch der Grundabdruck.** Hinge er an `top`, spränge der Grundabdruck
 * beiseite, sobald der erste Nachdruck daraufkommt — ein Abdruck auf dem Papier
 * verrutscht aber nicht mehr. Und erst der Versatz von Lage 0 macht den Stapel
 * unter einem deckenden Nachdruck sichtbar.
 */
const stampLayers = computed((): StampLayer[] => {
  // An einem Projekt trägt jede Stufe einen Spruch (→ CONTEXT.md „Projektspruch");
  // die Dringlichkeit steht allein in der Farbe der obersten Lage — die Rampe
  // darf deshalb nie ans Wort gebunden werden. Alle drei kommen aus dem EINEN
  // gespeicherten Listenplatz (`projectPhraseStackOf`); hier wird nichts gezogen.
  const texts =
    props.task.task_type === 'project'
      ? projectPhraseStackOf(props.task)
      : [stampLabel.value, 'WICHTIG', 'DRINGEND']
  const level = props.task.emphasis_level
  const id = props.task.task_id
  const offsets = texts.map((_, index) => jitterOf(id, `stamp-dx${index}`, STAMP_OFFSET))

  return texts.map((text, index) => {
    const top = index === level
    const tilt =
      tiltSignOf(id, index) * (STAMP_TILT + jitterOf(id, `stamp-rot${index}`, STAMP_TILT_JITTER))
    const dx = offsets[index]
    const dy = jitterOf(id, `stamp-dy${index}`, STAMP_OFFSET)

    return {
      level: index as 0 | 1 | 2,
      text,
      top,
      reserved: index > level,
      transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg)`,
    }
  })
})

/**
 * Ein Tipp dreht den Stempel weiter: sauber → WICHTIG → DRINGEND → sauber. Am
 * Projekt zieht das Abräumen zusätzlich einen neuen Spruch — das macht der
 * Store; diese Stelle weiß davon nichts und soll es nicht wissen.
 *
 * **Kein `await`, kein Rückgabewert, kein Toast.** Der Store ist optimistisch,
 * mehrfaches schnelles Antippen ist vorgesehen; ein Erfolgs-Toast blitzte dabei
 * dreimal auf. Scheitert das Schreiben, meldet der Store es selbst mit **einem**
 * Toast.
 *
 * **Kein Doppeltipp-Riegel:** `emphasis_level` ist ein Zustand, kein Ereignis,
 * und `runOptimistic` reiht die Schreibvorgänge je `task_id` auf (`enqueue`) —
 * nichts wird gebucht.
 *
 * Gedrückthalten auf dem Stempel greift den Zettel; den nachlaufenden Klick
 * schluckt der Klick-Wächter (→ `isPressControl`) in der Einfangphase, also
 * vor dem `@click.stop` am Stempel. Auf Bubbling umgestellt, stempelte ein
 * Long-Press zusätzlich.
 */
const onStampTap = () => {
  void taskStore.cycleEmphasisLevel(props.task.task_id)
}

// --- Bearbeiten und seine Folgedialoge --------------------------------------

const showEditModal = ref(false)
const showAssignmentModal = ref(false)
const showSubtaskManagementModal = ref(false)
const showPostponeModal = ref(false)
/** „Erledigen mit angepasstem Aufwand" — nur über den Zug nach rechts. */
const showCompletionModal = ref(false)

/**
 * Erledigen mit angepasstem Aufwand. Doppeltipp-Schutz und Flug wie beim
 * Abreißen (`completionsInFlight` im Store, Rückgabewert entscheidet).
 *
 * **Was fliegt, ist der gewählte Aufwand, nicht `effectivePoints`:** ein
 * `effortOverride` ersetzt die Rechnung samt `deduct`-Abzug — so rechnet auch
 * `estimateCompletionEffort`. Startpunkt ist die Zettelmitte, weil der Zug nicht
 * von der Ecke ausging. 0 kommt hier nicht an (das Modal lässt nur 1–5 zu).
 */
const handleCustomCompletion = async (effortOverride: number, note: string) => {
  const el = root.value
  const origin = el ? centerOf(el) : null
  const applied = await taskStore.completeTask(props.task.task_id, effortOverride, note)
  if (!applied) return
  showCompletionModal.value = false
  if (origin) flyPoints(`+${effortOverride} P`, origin)
}

/** Folge-Dialog-Muster: Bearbeiten schließt, der nächste öffnet. */
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
    order_index: maxOrderIndex + 1,
  })
}

const handleUpdateSubtaskPointsMode = async (
  subtaskId: string,
  mode: 'checklist' | 'deduct' | 'bonus',
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
  <!-- `@contextmenu.prevent`: die native Langdruck-Geste des Browsers ist der
       einzige Mechanismus, der ortsabhängig ist — sie hängt daran, WAS unter
       dem Finger liegt (Text, Bild, Auswahlbares), während unser eigener Timer
       in `useDirectionPress` die Stelle gar nicht kennt. Sie feuert die native
       Haptik (die App selbst ruft nirgends `navigator.vibrate`) und nimmt uns
       danach den Zeiger per `pointercancel` weg. `user-select: none`
       unterdrückt nur die SICHTBARE Auswahl — Marker und Lupe bleiben aus, die
       Geste läuft trotzdem. Erst das Abbestellen des Kontextmenüs bricht sie ab.
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
        'zettel--assigned': isAssigned,
      },
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

    <!-- Kopf: der Titel bekommt die ganze obere Kante. Der Punktwert steht HIER
         ein zweites Mal im DOM — sichtbar ist immer nur eine der beiden Stellen,
         gesteuert über `zettel--meta-top` (Prop `metaTop`, siehe Skript und
         `WallView`). -->
    <div class="head">
      <!-- Schwimmt nach rechts — der Titel fließt aber NICHT darum herum:
           `.title` öffnet mit `overflow: hidden` einen eigenen Block-
           Formatierungskontext, und ein solcher Kasten darf den Float-Kasten
           nicht überlappen. Der Titel steht deshalb über seine GANZE Höhe in
           einer um die Ecke verengten Spalte; auch die zweite und dritte
           Zeile bleiben kurz. Die Ecken sind NICHT alle gleich breit:
           `.points--s5` macht den Fünf-Punkte-Stern breiter.

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
         Punktwert, rechts Stift und Eselsohr — beide 44×44 px nebeneinander. -->
    <div class="foot">
      <!-- NICHT `task.effort`: hier steht, was das Abreißen wirklich noch
           einbringt (→ `effectivePoints`) — dieselbe Zahl, die gleich fliegt.

           Punkte als aufgeklebter Sticker: die FORM trägt den Wert (Kreis 1,
           Quadrat 2, Sechseck 3, Wappen 4, Stern 5), die Zahl bestätigt ihn
           nur — die Silhouette trägt auch bei Farbenblindheit. Werte über 5
           (Bonus-Unteraufgaben) fallen alle auf den Stern; bekannt offen.

           Bei einem PROJEKT steht hier die Bilanz der verschlungenen Punkte
           (→ `displayPoints`), als Abzeichen mit eigenem Bild (`points--badge`):
           die Sticker-Formen bedeuten eine Punktzahl, das Abzeichen eine Stufe. -->
      <span class="points" :class="pointsShapeClass" :title="pointsTitle">
        {{ pointsLabel }}
      </span>
      <!-- Unteraufgaben haben IMMER ein eigenes Zeichen: sonst verriete nur die
           Fortschrittszahl ihre Existenz, und die fehlt bei `daily`
           (→ `tracksProgress`). Ein echter Knopf, weil die aufklappende
           Zettelfläche es niemandem sagt. Der Zähler steht nur, wo Fortschritt
           etwas bedeutet; sonst die blanke Anzahl. -->
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
      <!-- Der Gummistempel (→ `stampLabel` im Skript) — **JEDER Zettel trägt
           einen**, sonst gäbe es keine Fläche zum Überstempeln.

           Er steht IM FLUSS der Fußzeile, nicht darüber: so kann er sich mit
           keinem Knopf überschneiden, egal wie schmal der Zettel wird — die
           Zeile schiebt ihn zur Seite, statt ihn zu überlagern.

           **`v-if` gibt es hier bewusst nicht.** Das Element ist unbedingt da,
           und die Breitenmessung in `WallView.vue` verlässt sich darauf: sie
           sucht `.due-stamp` per `querySelector` und zählt danach die
           Flex-`gap`s der Fußzeile ab. **Klassenname und Platz als
           DIREKTES Flex-Kind von `.foot` sind Vertrag mit dieser Messung** —
           wer eines von beidem ändert, ohne `WallView.vue` mitzuziehen,
           bekommt eine still falsche Zettelbreite: kein Fehler, keine Warnung,
           nur ein Zettel, der nicht passt. -->
      <!-- Ein Tipp dreht den Nachdruck weiter (→ `onStampTap` im Skript).
           `@click.stop` hält den Zettel davon ab, dabei auch noch auf- oder
           zuzuklappen (`onSurfaceTap` an der Wurzel) — es ist die EINZIGE
           Abgrenzung zwischen den beiden Tipp-Zielen auf diesem Zettel. Nicht in
           `isPressControl` — Begründung dort.

           Kein `<button>`: das Element ist Vertrag mit der Breitenmessung in
           `WallView.vue` (Klassenname UND Platz als direktes Flex-Kind von
           `.foot`), und ein Knopf brächte eigene Polster, Schrift und Kästen
           mit, die diese Messung still verschieben. -->
      <span
        class="due-stamp"
        :data-emphasis="props.task.emphasis_level"
        :title="stampTitle"
        @click.stop="onStampTap"
      >
        <!-- Der Abdruckstapel (→ `stampLayers` im Skript). **Immer alle drei
             Lagen**, die noch nicht gestempelten als `.stamp-layer--reserved`
             unsichtbar, aber im Grid weiterhin gemessen (→ ADR-0003).

             `v-for` über `level` statt über den Text: der Schlüssel ist die
             LAGE, nicht das Wort. Dass am Projekt nie zweimal derselbe Spruch
             steht, garantiert `projectPhraseStackOf` — diese Zusage gehört
             dorthin und nicht in einen Vue-Schlüssel. -->
        <span
          v-for="layer in stampLayers"
          :key="layer.level"
          class="stamp-layer"
          :class="[
            `stamp-layer--l${layer.level}`,
            layer.top ? 'stamp-layer--top' : 'stamp-layer--under',
            { 'stamp-layer--reserved': layer.reserved },
          ]"
          :style="{ transform: layer.transform }"
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
          'mini--tearing': tearActiveId === subtask.task_id,
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

    <!-- Hier endet oft ein Zug nach unten oder rechts, und der Long-Press
         startet auch AUF diesem Knopf. Dass dabei kein Modal aufgeht, regelt der
         Klick-Wächter am Fenster in der Einfangphase, vor diesem `@click.stop`
         (→ `isPressControl`, `useDirectionPress`). -->
    <button class="edit" title="Aufgabe bearbeiten" @click.stop="showEditModal = true">
      <i class="bi bi-pencil" aria-hidden="true"></i>
    </button>

    <!-- Das Eselsohr: der Abreiß-Griff. Kein Text daneben — die angeknickte
         Ecke mit der Perforationslinie sagt „hier anfassen". Ein Antippen tut
         ausdrücklich NICHTS (der Klick wird nur geschluckt, damit er den Zettel
         nicht aufklappt): ein Griff, der schon auf Antippen erledigt, wäre die
         versehentlichste Erledigung der ganzen App.

         **Am AUFGEKLAPPTEN Zettel gibt es ihn nicht.** Dort sitzt in derselben
         Ecke der Griff des letzten Zettelchens, und beide Trefferflächen lägen
         übereinander. Der Zettel steht im DOM später und gewänne — ein Zug am
         letzten Zettelchen erledigte die ganze Aufgabe statt der Unteraufgabe.
         Eingeklappt ist die Ecke frei. -->
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
         Komponente. Ursprung ist der Aufsetzpunkt, nicht die Zettelmitte.

         **An einem Projekt gar nicht:** kein Kranz, kein Schleier — eine
         Beschriftung, die drei tote Richtungen anböte, wäre eine falsche Aussage.

         **`zettel--pressed` bleibt trotzdem an**, auch am Projekt: ab 420 ms
         sperrt `useDirectionPress` bei JEDEM Zettel den Bildlauf und schluckt
         den Loslass-Klick — ohne sichtbares Anheben verpuffte der Tipp
         unerklärt. Ein Zettel, der sich hebt, sagt „ich höre zu", ohne eine
         Richtung zu versprechen. -->
    <WallDirectionMenu
      v-if="pressOpen && !isProject"
      :origin="pressOrigin"
      :tip="pressTip"
      :active="pressDirection"
    />

    <!-- Zug nach rechts: erledigen mit angepasstem Aufwand. -->
    <TaskCompletionModal
      v-if="showCompletionModal"
      :taskTitle="props.task.title"
      :defaultEffort="props.task.effort"
      :isLoading="taskStore.isLoading"
      @close="showCompletionModal = false"
      @confirm="handleCustomCompletion"
    />

    <!-- Beide Gesten nach unten an einem Projekt: das Arbeitseintrag-Fenster.
         Auswahl UND Notiz sind Pflicht, nichts ist vorausgewählt — Schließen
         ohne Eintrag bucht nichts. -->
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
  /* Rückfallfarbe der Befestigung ohne Zuständige: auf 45 % gegen das Papier
     gemischt, damit „niemand zuständig" nie kräftiger wirkt als „X ist
     zuständig" — ungemischt las sich `--pw-free` lauter als die blasseste
     Personenfarbe. Gewählte Farben werden nicht angetastet.

     Hier deklariert (nicht direkt bei `.pin`), damit sie an die Befestigung
     als Kindelement vererbt wird. */
  --owner-none: color-mix(in srgb, var(--pw-free) 45%, var(--pw-paper));
  /* **Die Papierfarbe DIESES Zettels**, vererbt an die Kinder. Gebraucht vom
     Papier-Halo der obersten Stempellage: der Halo muss die Farbe dieses
     Zettels treffen, sonst stünde auf einem gelben Notizblock oder auf
     Packpapier ein weißer Kasten.

     Die Typen überschreiben sie bei sich (`.zettel--daily`, `.zettel--project`)
     — **zusammen mit ihrem `background`, direkt daneben**. Wer dort das Papier
     ändert und diese Zeile vergisst, bekommt keinen Fehler, nur einen Halo in
     der falschen Farbe. */
  --note-paper: var(--pw-paper);
  /* Rahmen: bewusst konturlos (`transparent`) — die Zuweisungsfarbe steht
     ausschließlich an der Befestigung.

     Trotzdem keine `0`: auf dieser Breite zeichnet `.zettel--tear-ready` den
     neutralen „reißt gleich ab"-Umriss; ohne Breite hätte er nichts zum
     Zeichnen. Konstant für alle Zustände, damit Zuweisen/Zurücknehmen keinen
     Sprung im Innenraum auslöst (`box-sizing: border-box`).

     ACHTUNG, diese 2px stehen nicht nur hier: der umschließende Block der
     absolut positionierten Befestigungen (`.pin`, `.tape`, `.clip`) ist die
     PADDING-Box dieses Elements, während die Wand gegen die Border-Box
     positioniert. Jede Befestigung sitzt dadurch 2px tiefer und 2px weiter
     innen, als ihr eigenes CSS aussagt — und genau daraus rechnet die Wand ihr
     oberes Polster. Wer diesen Wert ändert, ändert `ZETTEL_BORDER` in
     `src/lib/wallLayout.ts` mit, sonst ragen die Befestigungen wieder über den
     Kork. */
  border: 2px solid transparent;
  border-radius: 3px;
  background: var(--pw-paper);
  color: var(--pw-ink);
  box-shadow: var(--pw-shadow);
  /* Stift und Eselsohr sitzen UNTEN nebeneinander, der Titel bekommt die ganze
     obere Kante. Den Platz für die beiden Griffe (je 44 px) reserviert `.foot`
     selbst über ihr `padding-right`. */
  padding: 5px 7px 0 7px;
  min-height: 44px;
  text-align: left;
  will-change: transform;
  /* Ohne das ist der Long-Press auf einem Zettel nicht bedienbar:
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
  /* 15,6 px: nahe Material 3 Body-Large 16 sp und Apple Body 17 pt; 13 px
     wären darunter. */
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

/* Fußzeile, zugleich die GRIFFZEILE: links der Punktwert (plus Stempel und
   Unteraufgaben-Zeichen), rechts Stift und Eselsohr — beide 44 px, deshalb
   `min-height` UND das rechte Polster, das die beiden Griffe freihält. */
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

.zettel--tappable {
  cursor: pointer;
}

/* --- Kopf: Titel plus die Ecke oben rechts ---------------------------------- */

/* Der Zettel selbst ist ein Flex-Container; ein `float` wäre darin
   wirkungslos. Der Kopf ist deshalb ein eigener Block — nur dort wirkt der
   Float der Ecke überhaupt. UMFLOSSEN wird sie dabei nicht: der Titel steht
   in einer verengten Spalte daneben (Begründung am `.corner` im Template).

   `flow-root`, nicht `block`: die Ecke (34 px) kann höher sein als eine
   einzeilige Titelzeile (~18 px). Ein bloßer `block` umschließt einen Float
   NICHT; die Ecke liefe sichtbar in die Fußzeile hinein. */
.head {
  display: flow-root;
  position: relative;
}

/* Der Punktwert steht an ZWEI Stellen im DOM zugleich (Ecke UND Fußzeile);
   sichtbar ist immer nur eine, gesteuert über `zettel--meta-top`. Ein `v-if`
   wäre hier falsch: die Wand entscheidet das während der Messung, nicht im
   Render. */
.corner {
  display: none;
}

.zettel--meta-top .corner {
  display: flex;
}

.zettel--meta-top .foot > .points {
  display: none;
}

/* Bewusst KEIN `display` in dieser Regel, das steht bereits oben. */
.corner {
  float: right;
  align-items: center;
  gap: 5px;
  margin: -1px 0 2px 7px;
}

/* --- Der Gummistempel: der Abdruckstapel -----------------------------------
   Die vorherigen Abdrücke bleiben unter dem nächsten liegen; die
   **Stapelhöhe ist selbst eine Aussage** (→ CONTEXT.md „Überstempeln"). Optik
   „Papier-Halo"; die gemessenen, nicht geschmacklichen Werte stehen an ihrer
   Stelle einzeln benannt (Herleitung → docs/pinnwand-layout.md, „Stempelstapel").

   Der Stapel steht IM FLUSS der Fußzeile (ein normales Flex-Kind, keine
   Überlagerung) — dadurch schiebt die Zeile ihn zur Seite, statt dass er einen
   Knopf überdeckt. **Klassenname `.due-stamp` und der Platz als DIREKTES
   Flex-Kind von `.foot` sind Vertrag mit der Breitenmessung in
   `WallView.vue`** (dort steht ein Laufzeit-Wächter); wer eines von beidem
   ändert, bekommt eine still falsche Zettelbreite.

   **Die Breite ist das Maximum über ALLE Lagen, nicht die der obersten:** an
   einem Projekt kann die breiteste Lage UNTEN liegen. Lägen die unteren Lagen
   absolut, zählten sie nicht zur Breite, ragten aber heraus. Deshalb liegen
   alle Lagen als Grid-Elemente in DERSELBEN Zelle (`grid-area: 1 / 1`).

   **`place-items: center`:** die Lagen liegen mittig übereinander; auf
   Zellbreite stehen sie über `min-width: 100%` an `.stamp-layer`. */
.due-stamp {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  /* Ein Bedienelement — die Fläche muss das mit der Maus auch sagen.
     `.zettel--tappable` färbt den Zeiger nur an Zetteln MIT Unteraufgaben; der
     Stempel ist an jedem Zettel antippbar. */
  cursor: pointer;
}

/* Die Trefferfläche: mindestens 44 px hoch, obwohl ein Abdruck rund 18 px
   misst. Ein Daumen trifft sonst den Zettel statt den Stempel.

   Die Fläche liegt ABSOLUT und damit AUSSER dem Fluss — sie darf die Fußzeile
   weder höher noch breiter machen, sonst ginge sie in `footWidthFull` und über
   `min-height: 44px` der Fußzeile auch in die Wandhöhe ein. `padding` oder
   `min-height` am Stempel selbst wären genau dieser Fehler.

   Sie liegt am STAPEL, nicht an einer Lage: ein Klick auf das Pseudoelement
   zielt auf `.due-stamp` selbst, der Handler dort fängt ihn mit.

   **Sie schluckt dem Zettel nichts:** der Long-Press startet auf ihr wie auf
   blankem Papier (Hochblubbern zur Wurzel), und sie deckt keinen der beiden
   Griffe rechts ab, die hinter `padding-right: 88px` freigehalten sind. */
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

/* Eine Lage des Stapels. Die Schriftgröße ist ausdrücklich KEIN Stellknopf:
   11 px sind die dokumentierte Untergrenze, alles darunter
   nähme die Anhebung der Schrift zurück (→ ADR-0003, „Den Stempel schmaler
   setzen").

   `transform` steht NICHT hier, sondern als Inline-Stil am Element: Versatz
   und Neigung kommen je Lage deterministisch aus der Aufgaben-Kennung
   (→ `stampLayers` im Skript). Weil beides über `transform` läuft, geht es
   NICHT in die Breite der Fußzeile ein — der Stapel bleibt so breit wie sein
   breitestes Wort. */
.stamp-layer {
  grid-area: 1 / 1;
  /* JEDE Lage steht auf Zellbreite, nicht nur die oberste — sonst fiele eine
     Lage beim Überstempeln auf ihre Textbreite zurück und sähe geschrumpft aus. */
  min-width: 100%;
  /* ZENTRIERT WIRD IN JEDER LAGE, nicht nur in der obersten. Der Kasten steht
     auf der Breite des BREITESTEN Worts im Stapel; ohne Zentrierung klebte das
     Wort links und spränge beim Überstempeln, während der Kasten stehen bleibt.
     Ein Abdruck, der einmal auf dem Papier ist, verrutscht nicht mehr — auch
     nicht sein Wort. Am Projekt (drei verschieden breite Sprüche) fällt es am
     meisten auf. */
  text-align: center;
  padding: 1px 5px;
  border: 2px solid currentColor;
  border-radius: 3px;
  font-size: 10.8px;
  font-weight: 900;
  letter-spacing: 0.8px;
  white-space: nowrap;
}

/* Die Farbrampe **blau → orange → rot**, vom Maintainer der reinen
   Deckungs-Eskalation vorgezogen.

   **Der Grundabdruck ist blau, FÄLLIG also nicht rot.** JEDER Zettel trägt den
   Stempel; bliebe der berechnete Abdruck rot, wäre die ganze Wand rot und
   DRINGEND hätte keine Steigerung mehr übrig. Rot heißt „ein Mensch hat das
   gesagt", nicht „der Kalender ist abgelaufen" (→ ADR-0002).

   Die beiden Festwerte sind **nicht gegen die Personenfarben geprüft** —
   dieselbe offene Baustelle wie bei den Punkte-Stickern. */
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
   Zettels als Hintergrund — den „Papier-Halo".

   **Beides ist ein Messergebnis, kein Geschmack.** Mit durchsichtiger oberster
   Lage schienen die unteren Wörter durch die BUCHSTABEN des obersten. Nicht
   „aufräumen". Der Halo bemisst sich an der **Zelle** (`min-width: 100%` an
   `.stamp-layer`), nicht an seinem Wort — er kann nur verdecken, was er
   überdeckt.

   **Bewusst KEIN seitlicher Zuschlag über die Zelle hinaus:** er beschnitte den
   Rahmen der Lage darunter fast überall (→ docs/pinnwand-layout.md,
   „Stempelstapel").

   Die zyklische Prozentangabe (`100%` an einem Grid-Element, dessen Spur sich
   nach dem Inhalt richtet) soll die Spur laut Spezifikation NICHT aufblähen.
   Gemessen stimmt das: Wandhöhe und Stempelbreiten sind mit und ohne
   `min-width` gleich. **Gemessen wurde allerdings nur Chrome** — WebKit ist
   genau hier für Abweichungen bekannt. Wenn auf dem iPhone die Zettel breiter
   aussehen als hier, ist das die erste Stelle zum Nachsehen.

   `--note-paper` kommt vom `.zettel` und wird vererbt (weiß / gelb /
   Packpapier je nach Typ). */
.stamp-layer--top {
  background: var(--note-paper);
}

/* Die unteren Lagen bleiben durchsichtig und lugen an den Rändern hervor —
   dort, und nur dort, steckt die sichtbare Stapelhöhe. 40 % für Lage 0,
   60 % für Lage 1; nach oben immer prominenter. Die Regel hängt an der STUFE,
   nicht am Wort (am Projekt ist Lage 1 ein Projektspruch). */
.stamp-layer--under.stamp-layer--l0 {
  opacity: 0.4;
}

.stamp-layer--under.stamp-layer--l1 {
  opacity: 0.6;
}

/* Eine noch nicht gestempelte Lage: unsichtbar, aber **weiterhin gemessen**.

   `visibility: hidden` und nicht `display: none` — das ist der ganze Punkt:
   ein `display: none`-Kind fiele aus dem Grid und damit aus der Breite, und
   die Fußzeile wüchse bei jedem Tipp (→ `stampLayers` im Skript, ADR-0003). */
.stamp-layer--reserved {
  visibility: hidden;
}

/* --- Punkte als aufgeklebter Sticker ----------------------------------------
   Die Form ist die Botschaft: ein Kreis ist eine Kleinigkeit, ein Stern die
   dickste Aufgabe auf der Wand — lesbar ohne Zahl und auch bei
   Farbenblindheit, weil die Silhouette trägt, nicht nur die Farbe.

     0–1 P  Kreis                ruhig, blass
       2 P  abgerundetes Quadrat
       3 P  Sechseck
       4 P  Wappen
       5 P  Stern                Gold, der Blickfang

   Alle Formen haben dieselbe Kantenlänge (der Stern fällt bewusst aus der
   Reihe, siehe dort). Der Schatten kommt aus `drop-shadow`, nicht
   `box-shadow`: ein `box-shadow` legt sich um das RECHTECK und wäre am Stern
   als Kasten sichtbar.

   Die Farben sind gesetzt, nicht gegen die Personenfarben geprüft — eine
   kuratierte Palette ist offen. */
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

   Werte über 5 gibt es nicht: `tasks.effort` und
   `task_completions.effort_override` tragen beide einen CHECK auf höchstens 5,
   `bonus` ist eine eigene Completion mit eigenem Wert ≤ 5. Das `Math.min(5, …)`
   in `pointsShapeClass` ist für Nicht-Projekte reine Vorsorge; fällt die
   CHECK-Grenze, fällt auch diese Palette an. */
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

/* --- Projekt-Abzeichen statt Punkte-Sticker ---------------------------------
   An dieser Stelle steht beim Projekt, wie viele Punkte es bis jetzt
   VERSCHLUNGEN hat — eine Bilanz, kein Versprechen. Das Bild ist deshalb ein
   anderes: eine **Siegelmarke mit umlaufender Skala**, getrennt von
   `.points--s0…s5` (Begründung bei `badgeStage` im Skript).

   **Zwei Merkmale tragen die fünf Stufen**, ein drittes schmückt nur:

     1. **Wie dunkel die Marke ist.** Die Scheibe läuft von fast weißem Papier
        (Stufe 1) bis nahezu Tinte (Stufe 5); ab Stufe 4 kippt die Schrift auf
        Papierfarbe — der schärfste Einzelhinweis. Die Rampe ist streng monoton
        in der Luminanz und trägt ab b2 bei jeder Farbfehlsichtigkeit; nur das
        schwächste Paar b1↔b2 stützt sich zusätzlich auf den Tonwechsel
        cremeweiß→blassblau.
     2. **Der Umriss.** Stufe 5 ist die einzige mit Zackenkranz — die
        Silhouette allein sagt „ab 100", ohne Farbe und ohne Zahl.

   **Die Skala am Rand trägt NICHT** — in 3,4 px Bandbreite sieht sie aus wie
   eine Kontur, nicht wie ein Füllstand. Sie bleibt als Schmuck, weil sie der
   Marke ihre Siegelform gibt; wer sich auf sie als ordinalen Träger verlässt,
   verlässt sich auf nichts.

   Die Bänder (0–9, 10–24, 25–49, 50–99, ab 100) stehen im Skript
   (`badgeStage`), nicht hier.

     Fläche: 34 × 34 px auf ALLEN Stufen. Das Abzeichen wächst bewusst nicht
     wie `.points--s5` (39,1 px); die Zahl passt über `points--fitN` (unten),
     nicht über eine größere Fläche. */
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

     1–2 Stellen  14,3 px  →  bis ~18,9 px breit  (wie am Sticker)
     3 Stellen    11,6 px  →  ~20,7 px
     `999+`        10 px    →  ~22,4 px  (`--font-xs`, nicht kleiner als das
                                          kleinste Schriftmaß des Projekts)

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

/* --- Zeichen für Unteraufgaben ---------------------------------------------
   Ein angeklammerter Stapel: Papier mit gestricheltem Rand, damit er zu den
   Zettelchen gehört, die er ankündigt — und nicht zu den beiden Griffen
   rechts, die etwas mit dem GANZEN Zettel tun. Immer sichtbar, auch bei
   `daily` (→ `tracksProgress` im Skript). Aufgeklappt kippt die Farbe um,
   damit man den Weg zurück findet. */
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
  /* Unten Platz für den Bearbeiten-Knopf (44 px, `bottom: 0`): aufgeklappt gibt
     es KEIN `.ear` (siehe dort), aber `.edit` bleibt, und ohne dieses Polster
     läge die letzte Zeile der Zettelchen genau darunter. */
  padding-bottom: 44px;
}

.mini {
  position: relative;
  flex: 1 1 calc(50% - 4.5px);
  /* Ohne das staucht Flexbox ein langes Wort NICHT weg, sondern bläst das
     Zettelchen über seine Spalte hinaus: die Vorgabe ist `min-width: auto`,
     also die inhaltliche Mindestbreite. */
  min-width: 0;
  /* Untergrenze für Trefferflächen — und die Bedingung dafür, dass der
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

/* Am Finger (Lage und Anheben inline, weil der Betrag am Zug hängt). */
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

/* Der Bearbeiten-Knopf sitzt UNTEN rechts, unmittelbar links neben dem
   Eselsohr — beide 44 × 44 px, nebeneinander in der Griffzeile, ohne geteilte
   Fläche. Oben bekommt der Titel dadurch die ganze Kante. */
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

/* --- Das Eselsohr: der Abreiß-Griff ---------------------------------------- */

/* 44 × 44 px Kasten in der unteren rechten Ecke SEINES Zettels — `right: 0;
   bottom: 0`, kein negativer Versatz: der würde den Griff über die Kante
   schieben und im dichten Packen den Nachbarzettel betätigen, also die
   falsche Aufgabe erledigen. Unsichtbar, nur durch Abtasten der Ecken zu
   finden — deshalb bündig.

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

/* --- Long-Press: der Zettel unter den Beschriftungen ------------------------ */

/* Er hebt sich ab wie beim Abreißen, und aus demselben Grund mit `!important`:
   den z-index schreibt `WallView` als Inline-Style.
   **Ohne jede Änderung an Größe, Lage oder Neigung.** Das Overlay liegt in
   Fensterkoordinaten und hängt am Aufsetzpunkt des Fingers, nicht am Zettel —
   ein Zettel, der beim Auslösen wächst oder springt, rutschte also unter der
   stehenden Geste weg. Der Zustand ist deshalb rein farblich.

   **Zwei Klassen am selben Element (0,2,0), nicht eine (0,1,0).**
   `.zettel--project` steht weiter unten und setzt einen eigenen `box-shadow`;
   bei gleicher Spezifität gewönne die spätere Regel, und der Hebe-Schatten
   erreichte den Projekt-Zettel nie — dort ist dieser Zustand ohne Kranz die
   EINZIGE Rückmeldung auf das Halten. `!important` wäre hier falsch (es
   überschriebe auch spätere absichtliche Ausnahmen), Umsortieren ebenso (es
   risse die anderen Typregeln mit).

   **Warum zusätzlich `filter`:** der Hebe-Schatten allein ist am Projekt fast
   stumm, dessen Ruheschatten ist ohnehin der kräftigste. Das Papier hebt sich
   deshalb zusätzlich ins Licht — dieselbe Aussage, über die ganze Fläche.

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

   `border-color` steht hier bewusst dazu: ohne sie erbt der Umriss
   `transparent` von der Basisregel, und ein `dashed`-Umriss in Transparent
   zeigt nichts an. Neutrale Tintenfarbe (`--pw-line`, wie Reißzwecken-Kontur,
   Büroklammern und Projekt-Umriss), auf JEDEM Zettel gleich. */
.zettel--tear-ready {
  border-style: dashed;
  border-color: var(--pw-line);
}

.zettel--tear-ready .ear::after {
  border-top-color: var(--pw-accent);
  border-top-width: 2.5px;
}

/* Der Knick wächst beim Ziehen nur in die Breite, seine Höhe bleibt bei
 * 22 px. Die Breite genügt als Ankündigung: ein breiterer Knick liest sich als
 * größeres Eselsohr, und daneben stehen ohnehin der gestrichelte Rand des
 * Zettels und die aufleuchtende Perforationslinie. */
.zettel--tear-ready .ear::before {
  width: 27px;
}

/* --- Typ 1: offene Putzaufgabe — weißes Papier, Reißzwecke ---------------- */
/* Ragt über die Oberkante des Zettels; die Wand hält oben Platz dafür frei.
   Wer diesen Wert oder die Maße ändert, ändert `FASTENERS` in
   `src/lib/wallLayout.ts` mit. */
.pin {
  position: absolute;
  top: -7px;
  left: 50%;
  margin-left: -7px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  /* Reines Ornament, kein Bedienelement (`aria-hidden`, keine Handler). Sie ragt
     mit `top: -7px` über den eigenen Zettelrand und läge sonst mit eigener Box
     im Trefferbereich des Nachbarn darunter. `pointer-events: none` nimmt sie
     aus dem Hit-Test: über dem EIGENEN Zettel fällt der Treffer auf `.zettel`
     (dort sitzen die Handler), der überstehende Teil geht an den wirklich
     darunterliegenden Nachbarn. */
  pointer-events: none;
  /* Trägt die Zuweisungsfarbe — mit Zuständigkeit `--owner`, ohne die gedämpfte
     `--owner-none` von oben. Ihre eigene Tintenkontur (`border` gleich darunter)
     hält sie auch farblos sichtbar; so zeigt sie auch „niemand zuständig" aktiv
     statt nur das Fehlen eines Signals. */
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
   ändert, ändert die Zeile dort mit. */
.tape {
  position: absolute;
  top: -9px;
  left: 50%;
  margin-left: -23px;
  width: 46px;
  height: 16px;
  /* Trägt die Zuweisungsfarbe wie jede Befestigung — mit ZWEI bewussten
     Abweichungen von `.pin` und `.clip`, bitte nicht „angleichen":

     1. Durchscheinend, nicht deckend. `user_color` ist ein roher Hexwert ohne
        Alphakanal, die 62 % müssen deshalb beim Mischen entstehen. Ein
        `rgba()`-Literal kann die Personenfarbe nicht aufnehmen, und `opacity`
        am Element wäre kein Ersatz: sie schlüge auch auf die Tintenkontur
        (`border` gleich darunter) und den Schlagschatten durch. Der Streifen
        soll Klebeband bleiben, kein buntes Washi-Tape.
     2. OHNE Zuständigkeit KEIN Rückfall auf `--owner-none`, sondern
        durchscheinendes Weiß. Reißzwecke und Büroklammer zeigen „niemand
        zuständig" aktiv an, der Klebestreifen nicht — Nutzerentscheidung. */
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
  /* Keine eigene `border-width`: die Basisregel liefert allen Zetteltypen
     dieselbe Dicke, damit der „reißt gleich ab"-Umriss (`.zettel--tear-ready`)
     auf jedem Typ gleich breit ist. */
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
   mit. Die Kantenlage ist dort der wichtigste Teil: `left: 12px`
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
  /* Trägt die Zuweisungsfarbe — dieselbe Regel wie an der Reißzwecke: mit
     Zuständigkeit `--owner`, ohne die gedämpfte `--owner-none` vom Zettel. Die
     eigene Tintenkontur (`border` oben) hält die Klammer auch in der neutralen
     Fassung sichtbar. */
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
   Klammern als getrennte Zeilen mit `anchor` und `inset`. */
.clip--l {
  left: 12px;
  transform: rotate(-7deg);
}

.clip--r {
  right: 12px;
  transform: rotate(6deg);
}
</style>
