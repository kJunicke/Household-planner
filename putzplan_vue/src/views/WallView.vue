<script setup lang="ts">
/**
 * Die Pinnwand — der Putzen-Screen der Route `/`.
 *
 * Keine Kategorie-Chips, keine Überschriften. Die Wand ist ein Raster aus gleich
 * breiten Spalten (`layoutWall`, ADR-0007): die Gruppen fällig → täglich →
 * Projekt fließen nacheinander in dieselben Spalten, **innerhalb** einer Gruppe
 * gilt eine feste Zufallsordnung, nicht die Dringlichkeit (→ CONTEXT.md
 * „Stempel"; ADR docs/adr/0002-stempel-ordnet-nicht.md). Den Typ trägt das
 * Papier.
 *
 * Welche Zettel aufgeklappt sind, weiß die Wand und nicht der Zettel — sie muss
 * es beim Packen wissen. Die Gesten (Abreißen am Eselsohr, Kranz) stecken im
 * Zettel; die Wand weiß nur, dass sie einen Zettel unter dem Finger nicht
 * zugleich animieren darf (→ `gestureNoteId`). Der Fetzen lebt in
 * `useTornScrap`: er entsteht im Zettel und wird unter der Wand gezeigt.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import WallNote from '../components/WallNote.vue'
import WallDoneList from '../components/WallDoneList.vue'
import WallScrap from '../components/WallScrap.vue'
import TaskCreateModal from '../components/TaskCreateModal.vue'
import QuickTaskModal from '../components/QuickTaskModal.vue'
import { useTaskStore } from '../stores/taskStore'
import { useHouseholdStore } from '../stores/householdStore'
import { useTaskBoard } from '@/composables/useTaskBoard'
import { useOverlayHistoryEntry } from '@/composables/useOverlayHistoryEntry'
import { searchWall } from '@/lib/taskSearch'
import { tornScrapState } from '@/composables/useTornScrap'
import {
  layoutWall,
  rememberWallHeight,
  rememberedWallHeight,
  rotationOf,
  wallGrid,
  type WallGroup,
} from '@/lib/wallLayout'
import type { Task } from '@/types/Task'

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()
const board = useTaskBoard(() => taskStore.tasks)

/**
 * Reihenfolge der Wand. `pendingTasks` ist bereits nach Dringlichkeit sortiert;
 * die Listen aus dem Composable sind `readonly`, deshalb Kopie.
 */
const wallTasks = computed((): Task[] => [
  ...board.pendingTasks.value,
  ...board.dailyTasks.value,
  ...board.projectTasks.value,
])

/**
 * Die **Suche** filtert die Wand selbst (→ CONTEXT.md „Suche"): das Suchfeld
 * liegt über der Wand, und wer nicht passt, verschwindet — die Spalten rücken
 * auf, weil `layoutWall` nur die sichtbaren Zettel bekommt. Ein Treffer ist
 * derselbe `WallNote` wie sonst, mit allen Gesten; einen eigenen Such-Pfad für
 * Abreißen, Kranz oder Punktwahl gibt es nicht.
 *
 * Das offene Suchfeld ist ein eigener Verlaufseintrag, damit die Zurück-Geste
 * es schließt, statt die Ansicht zu wechseln (→ `useOverlayHistoryEntry`).
 * Der Grund des Schließens kommt als Argument zurück: beim Weitergehen ins
 * Modal bleibt die Eingabe als Titelvorschlag stehen, sonst wird sie geleert
 * und die Wand zeigt den zuletzt in der Suche erledigten oder angepinnten
 * Zettel.
 */
const searchQuery = ref('')
const searchInputEl = ref<HTMLInputElement | null>(null)

const {
  isOpen: showSearch,
  open: openSearch,
  close: closeSearch,
} = useOverlayHistoryEntry<'modal'>('suche', (reason) => {
  const target = searchTargetId
  searchTargetId = null
  if (reason === 'modal') return
  searchQuery.value = ''
  if (target) revealNote(target)
})

/** `null`, solange nichts gesucht wird — dann zeigt die Wand alles. */
const wallSearch = computed(() =>
  showSearch.value ? searchWall(taskStore.tasks, searchQuery.value) : null,
)

/**
 * Die Zettel, die gerade an der Wand stehen: alle, oder nur die Treffer — die
 * angepinnten und dahinter die **losen Zettel** (erledigte Treffer, die nicht an
 * der Wand hängen). Die Reihenfolge ist egal — `layoutWall` sortiert selbst;
 * dass die losen nach den angepinnten kommen, sagt ihre Gruppe (`loose`).
 */
const shownTasks = computed((): Task[] => {
  const search = wallSearch.value
  if (!search) return wallTasks.value
  const hits = new Set(search.pinned.map((task) => task.task_id))
  return [...wallTasks.value.filter((task) => hits.has(task.task_id)), ...search.loose]
})

/** Die gerade gezeigten losen Zettel — leer, solange nichts gesucht wird. */
const looseIds = computed(() => new Set(wallSearch.value?.loose.map((task) => task.task_id) ?? []))

/**
 * Der Zettel, zu dem die Wand nach dem Schließen der Suche scrollt: der
 * zuletzt **in der Suche** erledigte. Erkannt am Fetzen — ihn bietet jeder
 * Abriss an, egal über welche Geste, und `WallView` muss dafür nichts von den
 * Gesten im Zettel wissen. Ebenso der zuletzt in der Suche angepinnte lose
 * Zettel (→ `repinFromSearch`).
 */
let searchTargetId: string | null = null

/**
 * **wieder dreckig** von der Nadelstelle eines losen Zettels: die Aufgabe ist
 * wieder dran und steht, sobald der Store neu geladen hat, als angepinnter
 * Treffer in der Suche. Nach dem Schließen scrollt die Wand zu ihr.
 *
 * Der Riegel gegen den Doppeltipp sitzt synchron vor dem ersten `await` —
 * dieselbe Regel wie in `WallDoneList.markDirty`.
 */
const repinBusy = new Set<string>()

const repinFromSearch = async (taskId: string) => {
  if (repinBusy.has(taskId)) return
  repinBusy.add(taskId)
  try {
    if (await taskStore.markAsDirty(taskId)) searchTargetId = taskId
  } finally {
    repinBusy.delete(taskId)
  }
}

watch(tornScrapState.scrap, (scrap) => {
  if (scrap && showSearch.value) searchTargetId = scrap.taskId
})

// `immediate`, weil das Suchfeld beim Aufbau der View **schon offen sein kann**:
// die Marke im Verlauf überlebt das Neuladen und die Rückkehr aus einer fremden
// Seite.
watch(
  showSearch,
  (open) => {
    if (!open) return
    searchTargetId = null
    setTimeout(() => searchInputEl.value?.focus(), 100)
  },
  { immediate: true },
)

/**
 * Erledigte Aufgaben — unter die Wand, nicht auf sie. Eigene Konstante statt
 * `board.completedTasks.value` im Template: in einem Objekt verschachtelte Refs
 * werden im Template NICHT ausgepackt.
 */
const doneTasks = computed((): readonly Task[] => board.completedTasks.value)

/**
 * Luft zum Wandrand links und rechts — **fest, nicht anteilig**. Der Rand ist
 * für den Daumen da, und der wächst nicht mit dem Bildschirm; ein Prozentsatz
 * gäbe dem schmalsten Gerät am wenigsten Rand. → docs/pinnwand-layout.md
 * („Wandrand `EDGE`").
 *
 * Bezugsgröße bleibt die Wand (`wall.clientWidth`), nie `window.innerWidth`.
 */
const EDGE = 12

const wallEl = ref<HTMLElement | null>(null)
const wallHeight = ref(0)

/**
 * Hat auf dieser Ansicht schon **ein** Packlauf durchgehalten? Bis dahin sitzen
 * alle Zettel auf `left: 0; top: 0` (`WallNote.vue`) übereinander, und die Wand
 * zeigt den Platzhalter.
 *
 * **Bewusst NICHT der übliche Wächter `isLoading && liste.length === 0`.**
 * `WallView` läuft ohne `keep-alive` und wird bei jedem Reiterwechsel neu
 * montiert; die Aufgaben liegen dann schon im Store, `wallTasks` ist sofort
 * nicht leer und `isLoading` womöglich schon `false` — und genau dann sind die
 * Zettel unpositioniert. Der Wächter muss „noch nie erfolgreich gepackt" heißen,
 * nicht „lädt noch".
 *
 * Einmal `true`, bleibt es `true`: ein späterer vertagter Lauf darf die Wand
 * nicht erneut ausblenden.
 */
const hasPacked = ref(false)

/**
 * Mindesthöhe der Wand, solange der Platzhalter steht: die zuletzt gepackte Höhe
 * aus `wallLayout` (überlebt das Neumontieren beim Reiterwechsel). Gelesen
 * **einmal** beim Aufbau — ein Wert, der sich unter dem Platzhalter noch ändert,
 * wäre selbst ein Höhensprung.
 *
 * Ohne Vorwissen (erster Aufruf der Sitzung) `60vh`, absichtlich kleiner als das
 * Fenster: `.wall-page` trägt `min-height: 100vh`, die Seite ist dann genau einen
 * Bildschirm hoch, und ein späteres Schrumpfen der Wand bewegt nichts.
 *
 * **Der Schutz hat eine Grenze:** das Polster von `.wall-page` (plus Header und
 * Safe-Area) liegt INNERHALB der 100vh. Ab etwa 640 px Fensterhöhe abwärts — oder
 * mit einem hohen Header — bewegt auch das Schrumpfen etwas; wächst die Wand über
 * das Fenster, ohnehin. Beides trifft nur den ersten Aufruf einer Sitzung und ist
 * bewusst in Kauf genommen, statt eine zweite Schätzung einzuführen.
 */
const placeholderMinHeight = (() => {
  const remembered = rememberedWallHeight()
  return remembered > 0 ? `${remembered}px` : '60vh'
})()

let revealFrame = 0

/**
 * Gibt die Zettel frei — einen Frame **nach** dem geglückten Packlauf. Aufgerufen
 * nur hinter der Schleife, die `left`/`top` schreibt, und nur bei vollständigem
 * Lauf (→ `skipped`): die Freigabe darf erst fallen, wenn jeder Zettel steht.
 *
 * Der Frame verhindert einen Höhensprung: `wallHeight` erreicht das DOM erst im
 * nächsten Vue-Tick. Fiele `hasPacked` im selben Tick, verlöre die Wand ihre
 * Mindesthöhe genau, während ihre echte Höhe von `0` aus gesetzt wird
 * (`.wall--unpacked` schaltet die Transition dafür ab).
 */
const revealNotes = () => {
  if (hasPacked.value || revealFrame) return
  revealFrame = requestAnimationFrame(() => {
    revealFrame = 0
    hasPacked.value = true
  })
}

/**
 * Aufgeklappte Zettel. Mehrere dürfen gleichzeitig offen sein — ein Zettel, der
 * sich beim Antippen eines anderen still schließt, nimmt dem Aufklappen die
 * Verlässlichkeit. Jeder teilt die Spalten an seiner Stelle (→ `layoutWall`).
 *
 * Geändert wird durch **Ersetzen** des Sets. Ein `ref` macht ein `Set` zwar
 * tief reaktiv, aber die Zuweisung ist der Weg, der auch dann noch stimmt, wenn
 * jemand hier später auf `shallowRef` umstellt.
 */
const expandedIds = ref(new Set<string>())

/**
 * Der Zettel, der gerade **unter einer Geste des Fingers steht** — Abreißen am
 * Eselsohr oder langes Drücken mit Kranz — und deshalb von der Animation
 * ausgenommen ist.
 *
 * **Ein Zustand für beide, und die Bedingung dafür:** die Gesten schließen sich
 * gegenseitig aus. Der Long-Press startet nicht auf dem Eselsohr (→
 * `isPressControl` im Zettel), und in keiner der beiden kommt ein zweiter Finger
 * durch — deshalb höchstens eine ID. Kommt eine Geste dazu, die überall startet,
 * braucht es einen Zustand je Geste.
 *
 * Warum überhaupt: die FLIP-Animation schreibt `transform`, genau wie die
 * Zieh-Geste, und der Kranz liegt in Fensterkoordinaten fest. Ohne Ausnahme
 * flöge der Zettel unter dem Finger davon, wenn ein anderes Mitglied etwas
 * ändert. Seine neue Position (`left`/`top`) bekommt er trotzdem — er springt
 * dorthin, statt zu fliegen.
 */
const gestureNoteId = ref<string | null>(null)
const noteEls = new Map<string, HTMLElement>()
/** Zuletzt gesetzte Positionen — Ausgangspunkt jeder FLIP-Animation. */
const lastPositions = new Map<string, { x: number; y: number }>()

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

type NoteExposed = { root: HTMLElement | null } | null

const setNoteEl = (taskId: string, instance: unknown) => {
  const el = (instance as NoteExposed)?.root ?? null
  if (el) noteEls.set(taskId, el)
  else noteEls.delete(taskId)
}

/**
 * Packt die Wand neu: Spaltenbreite setzen, Höhen messen, Raster rechnen
 * (`layoutWall`), Positionen schreiben. Muss nach jedem Datenwechsel, nach dem
 * Laden der Schrift und nach jeder Breitenänderung laufen.
 *
 * Die Breite eines Zettels kommt allein aus dem Raster (Spaltenbreite,
 * aufgeklappt die Wandbreite), nie aus seinem Inhalt: ein langer Titel bricht
 * um, ein Abdruck ragt (ADR-0007). Deshalb verrutscht beim Stempeln nichts.
 *
 * Erst bekommen **alle** Zettel ihre Breite, dann werden **alle** Höhen gelesen
 * — so erzwingt der Lauf ein einziges Layout statt eines je Zettel.
 *
 * **`tappedId`** ist der angetippte Zettel beim Auf- und Zuklappen; er wird
 * nur von der Flug-Animation ausgenommen.
 *
 * Liefert `false`, wenn der Lauf nicht vollständig war (→ `runRelayout`).
 */
const relayout = (animate: boolean, tappedId?: string): boolean => {
  const wall = wallEl.value
  if (!wall) return false

  // `EDGE` steht hier und beim Setzen von `left` (`note.x + EDGE`) — es muss an
  // beiden Stellen derselbe Wert sein: `layoutWall` klemmt jeden Zettel auf
  // `[0, usableWidth − Breite]`, die rechte Wandkante steht also bei
  // `EDGE + usableWidth`.
  const usableWidth = wall.clientWidth - 2 * EDGE
  if (usableWidth <= 0) return false

  const before = new Map(lastPositions)
  const { columnWidth } = wallGrid(usableWidth)

  // Gruppe je Zettel für Legereihenfolge und oberes Polster in `layoutWall`,
  // das keine Task-Objekte kennt.
  const taskGroups = new Map<string, WallGroup>()
  board.pendingTasks.value.forEach((task) => taskGroups.set(task.task_id, 'due'))
  board.dailyTasks.value.forEach((task) => taskGroups.set(task.task_id, 'daily'))
  board.projectTasks.value.forEach((task) => taskGroups.set(task.task_id, 'project'))
  looseIds.value.forEach((id) => taskGroups.set(id, 'loose'))

  /**
   * Zettel, die dieser Lauf mangels Element übersprungen hat. Breite setzen und
   * Positionieren zählen hier hoch; ein Lauf mit auch nur einem übersprungenen
   * Zettel gilt als **nicht** geglückt. Der Rückgabewert ist das Freigabesignal
   * für den Platzhalter — meldete ein Teillauf `true`, stünden gestapelte Zettel
   * offen da. Der Rückgabewert muss halten, was er behauptet.
   *
   * Erreichbar vor allem über die Nachhol-Leiter: sie ruft `relayout` direkt aus
   * einem `requestAnimationFrame`, also NICHT hinter `nextTick`. Ändert sich
   * `wallTasks` in dem Moment (Realtime-Subscription), misst sie einen Stand, den
   * Vue noch nicht gepatcht hat.
   */
  let skipped = 0

  // Schritt 1 — Breiten setzen: Spaltenbreite, aufgeklappt die ganze Wand.
  // Nur die gezeigten Zettel: die anderen sind während der Suche gar nicht
  // gerendert und zählten sonst als übersprungen.
  const elements = new Map<string, HTMLElement>()
  for (const task of shownTasks.value) {
    const el = noteEls.get(task.task_id)
    if (!el) {
      skipped++
      continue
    }
    const width = expandedIds.value.has(task.task_id) ? usableWidth : columnWidth
    el.style.width = `${width}px`
    elements.set(task.task_id, el)
  }

  // Schritt 2 — Höhen messen, bei der eben gesetzten Breite.
  const notes = [...elements].map(([id, el]) => ({
    id,
    // Die drei Listen und die losen Zettel teilen `shownTasks` heute
    // vollständig auf; `unknown` ist das Netz dafür (→ `WallGroup`).
    group: taskGroups.get(id) ?? 'unknown',
    height: el.offsetHeight,
  }))

  const layout = layoutWall(notes, usableWidth, expandedIds.value)
  wallHeight.value = layout.height

  lastPositions.clear()
  const moved: Array<{ el: HTMLElement; id: string; dx: number; dy: number; z: number }> = []

  for (const note of layout.notes) {
    const el = noteEls.get(note.id)
    if (!el) {
      skipped++
      continue
    }
    // Derselbe `EDGE` wie oben bei `usableWidth` — siehe die Begründung dort.
    const x = note.x + EDGE
    const y = note.y
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.zIndex = String(note.z)
    lastPositions.set(note.id, { x, y })

    // Der angetippte Zettel wird NICHT animiert: rutschte er selbst sichtbar,
    // läse sich das als „ich habe danebengetippt". Die Bewegung gilt den ANDEREN
    // Zetteln. Ebenso der Zettel, der gerade unter einer Geste steht
    // (→ `gestureNoteId`).
    if (note.id === tappedId || note.id === gestureNoteId.value) continue

    const previous = before.get(note.id)
    if (previous) {
      const dx = previous.x - x
      const dy = previous.y - y
      if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) {
        moved.push({ el, id: note.id, dx, dy, z: note.z })
      }
    }
  }

  // Bewusst keine Scroll-Nachführung: der Bildlauf gehört dem Nutzer, nicht der
  // Wand.
  //
  // Geglückt ist der Lauf nur, wenn JEDER gerenderte Zettel eine Position
  // bekommen hat (→ `skipped`). Sonst meldet er `false`, wird vertagt und
  // nachgeholt — und der Platzhalter bleibt so lange stehen.
  const complete = skipped === 0
  if (complete) {
    // Erst jetzt dürfen die Zettel sichtbar werden; `revealNotes` wartet
    // zusätzlich einen Frame ab (Begründung dort).
    revealNotes()
    // Höhengedächtnis für `placeholderMinHeight` — NUR bei vollständigem Lauf:
    // ein Teillauf liefert eine zu kleine Höhe und damit beim nächsten Montieren
    // genau den Sprung, den die Mindesthöhe verhindern soll. Ebenso wenig die
    // Höhe einer gefilterten Wand: gemerkt wird die volle.
    if (!wallSearch.value) rememberWallHeight(layout.height)
  }

  if (!animate || prefersReducedMotion?.matches) return complete
  animateMoves(moved)
  return complete
}

/**
 * Auf- und Zuklappen eines Zettels mit Unteraufgaben.
 *
 * Der aufgeklappte Zettel teilt die Spalten (→ `layoutWall`): was vor ihm
 * hängt, bleibt liegen; er selbst geht wandbreit unter die tiefste Spalte, was
 * nach ihm kommt, setzt sich darunter fort. Zuklappen stellt den vorigen
 * Zustand her — das Raster ist zustandslos, es gibt nichts zu merken.
 */
const toggleNote = (taskId: string) => {
  const next = new Set(expandedIds.value)
  if (!next.delete(taskId)) next.add(taskId)
  expandedIds.value = next
  // Erst nach dem Rendern der Zettelchen packen — vorher ist die Höhe des
  // Zettels noch die alte.
  nextTick(() => runRelayout(true, taskId))
}

/**
 * FLIP über die Web Animations API: abnehmen (Schatten wächst, Neigung richtet
 * sich auf) → fliegen → kleiner Überschwinger → andocken. Nur Zettel, deren
 * Platz sich wirklich geändert hat, bewegen sich — der Rest bleibt still.
 */
const animateMoves = (
  moved: Array<{ el: HTMLElement; id: string; dx: number; dy: number; z: number }>,
) => {
  moved.forEach(({ el, id, dx, dy, z }, index) => {
    const rot = rotationOf(id)
    const lift = `translate(${dx * 0.6}px, ${dy * 0.6 - 8}px) rotate(${rot * 0.25}deg) scale(1.07)`
    // Während des Flugs über die ruhenden Zettel gehoben (600), aber NICHT nach
    // Laufnummer sortiert: `z` ist der Stapelwert aus `layoutWall`, damit „der linke
    // Zettel liegt oben" auch WÄHREND der Bewegung gilt. `600 + z` bleibt sicher
    // unter den 800/810, die `WallNote.vue` per `!important` für den gezogenen
    // bzw. lang gedrückten Zettel reserviert (siehe Obergrenze in `layoutWall`).
    // Die Verzögerung (`delay`) hängt an `index` — sie sagt, WANN ein Zettel
    // losfliegt, nicht wer oben liegt.
    el.style.zIndex = String(600 + z)
    const animation = el.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1)`,
          boxShadow: 'var(--pw-shadow)',
          offset: 0,
        },
        { transform: lift, boxShadow: 'var(--pw-shadow-lift)', offset: 0.3 },
        {
          transform: `translate(0, 0) rotate(${rot * 0.6}deg) scale(1.035)`,
          boxShadow: 'var(--pw-shadow-lift)',
          offset: 0.74,
        },
        {
          transform: `translate(0, 0) rotate(${rot + 1.4}deg) scale(.985)`,
          boxShadow: 'var(--pw-shadow)',
          offset: 0.88,
        },
        {
          transform: `translate(0, 0) rotate(${rot}deg) scale(1)`,
          boxShadow: 'var(--pw-shadow)',
          offset: 1,
        },
      ],
      {
        duration: 430 + Math.min(160, Math.hypot(dx, dy)),
        delay: Math.min(120, index * 7),
        easing: 'cubic-bezier(.28,.9,.32,1)',
        fill: 'backwards',
      },
    )
    animation.onfinish = () => {
      el.style.zIndex = String(z)
    }
  })
}

/**
 * Ein Packlauf ohne brauchbare Wandbreite ist **nicht gescheitert, sondern
 * vertagt**. Ohne Nachholen bliebe der Abbruch endgültig: `layoutSignature`
 * ändert sich beim Reiterwechsel nicht, und der Resize-Wächter
 * (`width === lastWidth`) schluckt den Nachschlag — die Zettel blieben bis zum
 * Neuladen gestapelt.
 *
 * Die Vertagung hängt am **Rückgabewert**, nicht an den bekannten
 * `return`-Stellen: jeder Abbruchweg, der `false` liefert (auch `skipped`), wird
 * ohne weiteres Zutun nachgeholt.
 *
 * **Was die Nachhol-Schleife stoppt** — zwei getrennte Bremsen:
 * 1. Die Frame-Leiter ist auf `MAX_DEFER_FRAMES` begrenzt. Bleibt die Breite
 *    dauerhaft unbrauchbar (Wand `display: none`), läuft sie einmal ab — es wird
 *    nichts gepollt.
 * 2. Danach hängt der Nachschlag nur noch am `ResizeObserver`, der nur bei einer
 *    echten Größenänderung feuert. Kein Timer, kein Selbstaufruf.
 * Ein geglückter Lauf entwaffnet die Vertagung sofort.
 */
const MAX_DEFER_FRAMES = 60

/**
 * Steht ein Nachschlag aus? Nur ein Merker: ein vertagter Lauf **animiert nicht**
 * und trägt keinen angetippten Zettel mit. Bei den Breiten-Abbrüchen ist keine
 * Position geschrieben, es gibt kein „vorher", von dem aus ein Zettel fliegen
 * könnte; und `tappedId` Frames später anzuwenden träfe eine längst vergangene
 * Handlung.
 *
 * Beim Abbruch über `skipped` gäbe es ein „vorher" — verloren geht dort eine
 * Animation, eine falsche entsteht nicht. Bewusst bezahlt, statt ein Gedächtnis
 * für Absichten zu führen.
 */
let relayoutDeferred = false
let deferFrame = 0
let deferFramesLeft = 0

const cancelDeferredRelayout = () => {
  relayoutDeferred = false
  deferFramesLeft = 0
  if (deferFrame) {
    cancelAnimationFrame(deferFrame)
    deferFrame = 0
  }
}

/**
 * Einziger Weg, einen Packlauf auszulösen. Bricht er ab, wird er vertagt statt
 * fallen gelassen.
 */
const runRelayout = (animate: boolean, tappedId?: string) => {
  if (relayout(animate, tappedId)) {
    cancelDeferredRelayout()
    return
  }

  // Ein vertagter Lauf holt die Wand nur in Ordnung: ohne Animation, ohne
  // angetippten Zettel (Begründung bei `relayoutDeferred`).
  relayoutDeferred = true
  deferFramesLeft = MAX_DEFER_FRAMES
  if (deferFrame) return
  const step = () => {
    deferFrame = 0
    if (!relayoutDeferred) return
    if (relayout(false)) {
      cancelDeferredRelayout()
      return
    }
    // Bremse 1 — ab hier wartet der Observer. `relayoutDeferred` bleibt dabei
    // ABSICHTLICH gesetzt: nur so bleibt der Resize-Wächter unten entschärft
    // und jedes spätere Feuern zieht den Lauf nach. Das ist kein vergessenes
    // Aufräumen; der Merker wird ausschließlich von einem geglückten Lauf oder
    // vom Aushängen der Ansicht gelöscht.
    if (deferFramesLeft-- <= 0) return
    deferFrame = requestAnimationFrame(step)
  }
  deferFrame = requestAnimationFrame(step)
}

const scheduleRelayout = (animate: boolean) => {
  nextTick(() => runRelayout(animate))
}

/**
 * Nur Änderungen, die das Packen betreffen, lösen ein Neupacken aus: Menge,
 * Reihenfolge, Titel (steuert die Höhe) und Typ (steuert das Papier). Eine
 * geänderte Zuweisung färbt nur um und darf die Wand nicht durchschütteln.
 *
 * Gebaut aus den **gezeigten** Zetteln: jeder Tastendruck in der Suche, der
 * die Treffer ändert, packt neu.
 */
const layoutSignature = computed(() =>
  shownTasks.value
    .map(
      (task) =>
        // Der lose Zustand gehört dazu: ein angepinnter loser Zettel behält
        // Kennung, Typ und Titel, wechselt aber die Gruppe.
        `${task.task_id}:${task.task_type}:${task.title}:${looseIds.value.has(task.task_id) ? 'l' : 'p'}`,
    )
    .join('|'),
)

watch(layoutSignature, () => {
  // Ein Zettel, der von der Wand verschwindet (erledigt, gelöscht), nimmt
  // seinen Aufklapp-Zustand mit. Ohne das stünde er beim Wiederauftauchen —
  // etwa nach „wieder dreckig" — unvermittelt offen da. Gemessen an der
  // **ganzen** Wand, nicht an den Treffern: wer nur weggefiltert ist, bleibt
  // aufgeklappt, wenn die Suche ihn wieder zeigt. Lose Zettel zählen mit,
  // solange sie gezeigt werden — sonst klappte jeder Packlauf sie wieder zu.
  const onWall = new Set([...wallTasks.value.map((task) => task.task_id), ...looseIds.value])
  if ([...expandedIds.value].some((id) => !onWall.has(id))) {
    expandedIds.value = new Set([...expandedIds.value].filter((id) => onWall.has(id)))
  }
  // Dasselbe für den Zettel unter der Geste: verschwindet er (erledigt,
  // gelöscht, weggefiltert), kommt das `gesture-end` seiner Komponente nicht an
  // — sie ist ausgehängt. Ohne diese Zeile bliebe seine ID hängen und genau
  // dieser Zettel würde nach einem „wieder dreckig" nie wieder mitfliegen.
  const shown = new Set(shownTasks.value.map((task) => task.task_id))
  if (gestureNoteId.value !== null && !shown.has(gestureNoteId.value)) gestureNoteId.value = null
  scheduleRelayout(true)
})

let resizeObserver: ResizeObserver | null = null
let lastWidth = 0

onMounted(async () => {
  // Zuerst abonnieren, dann laden: was zwischen dem Ende des SELECT und dem
  // Beitritt geschieht, käme sonst nie an. Der Beitritt lädt selbst nach.
  taskStore.subscribeToTasks()
  // Parallel: die Projekt-Punktesummen kommen aus einer EIGENEN Abfrage (die
  // Wand lädt keine Erledigungen); geladen vor dem ersten `relayout`, damit das
  // Abzeichen nicht nach dem Erscheinen der Wand umspringt.
  await Promise.all([taskStore.loadTasks(), taskStore.loadProjectEffortTotals()])
  householdStore.loadWeeklyCompletions()

  scheduleRelayout(false)

  // Breitenänderung (Drehen, Fensterbreite) → neu packen. Die Höhe der Wand
  // setzen wir selbst; würde sie mitzählen, drehte sich der Observer im Kreis.
  if (wallEl.value && typeof ResizeObserver !== 'undefined') {
    lastWidth = wallEl.value.clientWidth
    resizeObserver = new ResizeObserver(() => {
      const width = wallEl.value?.clientWidth ?? 0
      // `&& !relayoutDeferred`: bei ausstehendem Nachschlag ist die Breite oft
      // dieselbe wie beim abgebrochenen Lauf (Reiterwechsel), und dieser Wächter
      // verschluckte ihn. Keine Schleife: der Observer feuert nur bei einer echten
      // Größenänderung.
      if (width === lastWidth && !relayoutDeferred) return
      lastWidth = width
      runRelayout(false)
    })
    resizeObserver.observe(wallEl.value)
  }

  // Die Schrift bestimmt den Umbruch und damit JEDE Zettelhöhe; mit der
  // Ersatzschrift gemessen, stünden die Zettel zu eng oder zu weit. Deshalb ein
  // weiterer Lauf, sobald die Schriften stehen (sind sie schon geladen, kostet
  // er nichts).
  //
  // In einem `requestAnimationFrame`, nicht direkt im `then`: beim **Umschalten
  // des Aussehens** ist `fonts.ready` schon erfüllt und löst als Mikrotask aus,
  // womöglich bevor die eben gesetzte Wandhöhe angewandt ist. `wallEl.clientWidth`
  // hängt dann davon ab, ob schon eine Bildlaufleiste da ist — ein Zettel rutscht
  // in die zweite Reihe und steht erst nach dem Neuladen wieder oben.
  document.fonts?.ready.then(() => requestAnimationFrame(() => runRelayout(false)))
})

onUnmounted(() => {
  taskStore.unsubscribeFromTasks()
  // Ohne die Abmeldung zöge der Store die Projekt-Summen auch auf den anderen
  // Routen weiter nach, wo sie niemand liest.
  taskStore.stopProjectEffortTotals()
  resizeObserver?.disconnect()
  // Sonst liefe die Frame-Leiter eines vertagten Laufs an der ausgehängten
  // Ansicht weiter.
  cancelDeferredRelayout()
  if (revealFrame) cancelAnimationFrame(revealFrame)
})

const showCreateModal = ref(false)
const showQuickModal = ref(false)
let jumpPulse: Animation | null = null

/**
 * Stapelhöhe des Zettels, solange sein Sprung-Ring pulsiert: über allen ruhenden
 * (1…n) und fliegenden (600 + z) Zetteln, damit kein Nachbar den Ring verdeckt;
 * unter dem gezogenen bzw. lang gedrückten Zettel (800/810, `WallNote.vue`) und
 * unter Navigation (900), Suchfeld (940), Header samt Statusleiste (950) und
 * FAB (1000). Die Wand bildet keinen eigenen Stapelkontext — die Zettel
 * konkurrieren direkt mit diesen Ebenen.
 */
const JUMP_PULSE_Z = '799'

/**
 * Zeigt nach dem Schließen der Suche auf den zuletzt dort erledigten oder
 * angepinnten Zettel: scrollt hin und lässt einen Ring pulsieren.
 *
 * Erst nach dem Schließen: das läuft über einen Verlaufssprung, und ein
 * Scrollen davor könnte die Scroll-Wiederherstellung des Browsers
 * zurücksetzen. Und erst nach dem Neupacken der vollen Wand — der `nextTick`
 * hier kommt nach dem des Packlaufs, das `requestAnimationFrame` danach.
 */
function revealNote(id: string) {
  void nextTick(() =>
    requestAnimationFrame(() => {
      const note = noteEls.get(id)
      // Ein erledigter Zettel hängt nicht mehr an der Wand: dann seine Zeile in
      // der Erledigt-Liste, und falls die noch nicht gerendert ist, der Fetzen —
      // er ist das, worauf es nach dem Abreißen ankommt.
      const el =
        note ??
        document.querySelector<HTMLElement>(`.done-row[data-task-id="${CSS.escape(id)}"]`) ??
        document.querySelector<HTMLElement>('.scrap')
      if (!el) return
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
      // Per Web Animations statt per Klasse: `class` gehört Vue und würde beim
      // nächsten Rendern überschrieben. Der Zettel ist gedreht, der Umriss dreht
      // mit. Die Zeile liegt in einer Liste mit Rand, deshalb nach innen.
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--pw-accent')
      const ring = `3px solid ${accent.trim()}`
      const offset = note ? '4px' : '-3px'
      // Der z-index reist IN der Animation mit, nicht als Inline-Style: den
      // Inline-Wert schreibt `relayout` (und `animateMoves`) bei jedem Lauf neu.
      // Die Animation liegt in der Kaskade darüber und lässt ihn unberührt — beim
      // Ende, beim Abbruch und beim nächsten Sprung gilt deshalb wieder genau der
      // Wert, den die Wand zuletzt gesetzt hat. Ein gemerkter Altwert wäre nach
      // einem Packlauf während des Pulses veraltet.
      const lift = note ? { zIndex: JUMP_PULSE_Z } : {}
      jumpPulse?.cancel()
      jumpPulse = el.animate(
        [
          { outline: ring, outlineOffset: offset, ...lift },
          { outline: '3px solid transparent', outlineOffset: offset, ...lift },
        ],
        { duration: 500, iterations: 4, easing: 'ease-in', delay: reduceMotion ? 0 : 250 },
      )
    }),
  )
}

// Aus der Suche heraus weiter: erst den eigenen Verlaufseintrag verbrauchen,
// dann das Modal öffnen. `searchQuery` bleibt als Titelvorschlag stehen und
// wird deshalb erst nach dem Schließen des Modals geleert.
const openCreateFromSearch = () => {
  closeSearch('modal')
  showCreateModal.value = true
}

const openQuickFromSearch = () => {
  closeSearch('modal')
  showQuickModal.value = true
}

const handleCreateTask = async (taskData: {
  title: string
  effort: number
  recurrence_days: number
  task_type: 'recurring' | 'daily' | 'one-time' | 'project'
}) => {
  try {
    // Abgewiesen (etwa weil es den Titel schon gibt): das Formular bleibt mit
    // allen Eingaben offen, der Toast sagt warum.
    if (!(await taskStore.createTask(taskData))) return
    showCreateModal.value = false
    searchQuery.value = ''
  } catch (error) {
    console.error('Fehler beim Erstellen:', error)
  }
}

const handleCreateQuickTask = async (data: { title: string; effort: number; note?: string }) => {
  const result = await taskStore.createQuickTask(data)
  if (result) {
    showQuickModal.value = false
    searchQuery.value = ''
  }
}
</script>

<template>
  <main class="wall-page">
    <!-- Die Statusleiste (`WallStatusBar`) steckt im globalen App-Header
         (`Header.vue`) und läuft auf jeder Route mit — hier NICHT einbinden,
         sonst rendert sie doppelt. -->

    <!-- Das Suchfeld liegt oben über der Wand und klebt unter dem App-Header.
         Jeder Tastendruck filtert die Wand darunter (→ `shownTasks`). -->
    <div v-if="showSearch" class="wall-search">
      <div class="wall-search-row">
        <div class="wall-search-field">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input
            ref="searchInputEl"
            v-model="searchQuery"
            type="text"
            class="wall-search-input"
            placeholder="Aufgabe suchen oder erstellen..."
            @keyup.esc="closeSearch()"
          />
          <button
            v-if="searchQuery"
            class="wall-search-clear"
            aria-label="Eingabe löschen"
            @click="searchQuery = ''"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <button class="wall-search-close" aria-label="Suche schließen" @click="closeSearch()">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <div v-if="wallSearch" class="wall-search-actions">
        <button v-if="wallSearch.offerCreate" class="btn btn-primary" @click="openCreateFromSearch">
          <i class="bi bi-plus-lg"></i> Aufgabe erstellen
        </button>
        <button class="btn btn-success" @click="openQuickFromSearch">
          <i class="bi bi-lightning-charge-fill"></i> Quick-Aufgabe abschließen
        </button>
      </div>
    </div>

    <!-- Die Wand: Kork, absolut positionierte Zettel, keine Überschriften. -->
    <div
      ref="wallEl"
      class="pw-wall wall"
      :class="{ 'wall--unpacked': !hasPacked }"
      :style="{
        height: `${wallHeight}px`,
        minHeight: hasPacked ? undefined : placeholderMinHeight,
      }"
    >
      <!-- Platzhalter, solange noch kein Packlauf durchgehalten hat. Er steht IN
           der Wand: so trägt die Wand selbst die Mindesthöhe und die Seite springt
           nicht, wenn die Zettel erscheinen. -->
      <div v-if="!hasPacked" class="skeleton-loading wall-skeleton">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>

      <!-- Die gezeigten Zettel werden IMMER gerendert, auch vor dem ersten
           Packlauf — `relayout` misst sie am DOM, ein `v-if` hier nähme ihm die
           Vorlage. Verborgen werden sie deshalb nur optisch, über die Hülle:
           `opacity` lässt die Messung unberührt (anders als `display: none`).
           Was die Suche wegfiltert, fehlt dagegen ganz (`shownTasks`) und wird
           deshalb auch nicht gemessen. -->
      <div class="wall-notes">
        <WallNote
          v-for="task in shownTasks"
          :key="task.task_id"
          :ref="(instance) => setNoteEl(task.task_id, instance)"
          :task="task"
          :expanded="expandedIds.has(task.task_id)"
          :loose="looseIds.has(task.task_id)"
          @toggle="toggleNote"
          @repin="repinFromSearch"
          @gesture-start="gestureNoteId = $event"
          @gesture-end="gestureNoteId = gestureNoteId === $event ? null : gestureNoteId"
        />
      </div>
    </div>

    <p v-if="wallSearch && shownTasks.length === 0" class="wall-empty">
      Kein Zettel passt zu „{{ searchQuery.trim() }}“.
    </p>
    <p v-else-if="hasPacked && !taskStore.isLoading && shownTasks.length === 0" class="wall-empty">
      Nichts angepinnt.
    </p>

    <!-- Der Fetzen: klebt den zuletzt abgerissenen Zettel auf einen Tipp zurück.
         Rendert nichts, solange nichts abgerissen wurde. Bleibt auch während der
         Suche stehen — ein Treffer, der dort abgerissen wird, lässt sich gleich
         zurückkleben. -->
    <WallScrap />

    <!-- Erledigt: kompakter Streifen UNTER der Wand, nicht auf ihr. -->
    <WallDoneList :tasks="doneTasks" />

    <!-- FAB: schwebende Papierkarte, nicht angepinnt — Suche und Neuanlegen
         bleiben hier und wandern nicht in den Header. Dass er nichts verdeckt,
         regelt das Bodenpolster von `.wall-page`, nicht seine eigene Höhe.
         Während der Suche weg: sie ist schon offen. -->
    <div v-if="!showSearch" class="fab-card">
      <button
        class="fab-btn"
        :disabled="taskStore.isLoading"
        aria-label="Aufgabe suchen oder hinzufügen"
        @click="openSearch"
      >
        <i class="bi bi-search" aria-hidden="true"></i>
        <span class="fab-plus" aria-hidden="true"><i class="bi bi-plus"></i></span>
      </button>
    </div>

    <TaskCreateModal
      v-if="showCreateModal"
      :initialTitle="searchQuery.trim()"
      :isLoading="taskStore.isLoading"
      @close="showCreateModal = false"
      @create="handleCreateTask"
    />

    <QuickTaskModal
      v-if="showQuickModal"
      :initialTitle="searchQuery.trim()"
      :isLoading="taskStore.isLoading"
      @close="showQuickModal = false"
      @complete="handleCreateQuickTask"
    />
  </main>
</template>

<style scoped>
.wall-page {
  min-height: 100vh;
  background: var(--pw-cork-deep);
  /* Unten kommt zum FAB-Polster die Höhe des klebenden App-Headers dazu
     (`--app-header-height`, gemeldet von `Header.vue` per `useElementHeightVar`;
     er enthält die Wochenziel-Leiste). Keine feste Pixelzahl: der Header ist je
     nach Kompaktheit und Mitgliederzahl verschieden hoch. Ohne dieses Polster
     blieben am Seitenende Zettel samt Eselsohr dauerhaft unter dem Header
     verdeckt. */
  /* Der untere Wert ist gerechnet, nicht gemessen: der FAB sitzt 64 + 18 px
     über der Unterkante, ist 52 px hoch und trägt Rahmen samt Schlagschatten —
     zusammen rund 138 px. Mit 148 px bleibt am Seitenende Luft unter ihm, statt
     dass er die letzte Zeile bzw. das Eselsohr des untersten Zettels verdeckt.
     Nachmessen, wenn sich `.fab-card` ändert. */
  padding: 10px 8px calc(148px + env(safe-area-inset-bottom) + var(--app-header-height, 0px));
}

/* Der Bezugsrahmen der absolut positionierten Zettel. Die Höhe kommt aus dem
   Packen, nicht aus dem Inhalt. `.pw-wall` (pinnwand.css) liefert den Kork.

   KEIN `padding-top` für die überstehenden Befestigungen. Das Polster steckt im
   Raster selbst (`topPaddingFor` in `wallLayout.ts`): die oberste Reihe beginnt
   nicht bei `y = 0`, sondern darunter, und `layout.height` bringt den Betrag
   mit. Hier ginge es auch gar nicht — der Betrag ist keine Konstante, sondern
   hängt an Breite und Neigung der Zettel (Begründung dort). Ein
   Polster an dieser Stelle wäre eine zweite, stille Quelle derselben Zahl, und
   die absolut positionierten Zettel rechnen ohnehin gegen die Padding-Box:
   ein `padding-top` verschöbe sie nicht einmal. */
.wall {
  position: relative;
  width: 100%;
  /* Ein Abdruck darf über den Papierrand ragen (ADR-0007), am rechten Zettel
     auch über die Wand. `clip` verhindert, dass dabei ein waagerechter Bildlauf
     entsteht; `visible` in der Senkrechten hält Reißzwecke und Klebeband
     sichtbar, die über die Oberkante hinausragen. */
  overflow-x: clip;
  overflow-y: visible;
  border: 2px solid rgba(0, 0, 0, 0.12);
  transition: height 0.42s cubic-bezier(0.2, 0.8, 0.3, 1);
}

/* Vor dem ersten geglückten Packlauf. Die Mindesthöhe steht inline
   (→ `placeholderMinHeight`). Die erste Höhe darf NICHT von `0` heranfahren —
   ein Wachsen unter dem Platzhalter wäre genau der Höhensprung, den die
   Mindesthöhe verhindert. */
.wall--unpacked {
  transition: none;
}

/* Die Hülle der Zettel ist NUR ein Deckel für das Einblenden: `position:
   static`, damit die absolut positionierten Zettel weiterhin gegen `.wall`
   rechnen, und ohne eigene Größe, weil ihre Kinder alle aus dem Fluss sind. */
.wall-notes {
  opacity: 1;
  transition: opacity 0.15s ease-out;
}

/* `opacity`, nicht `display: none` oder `visibility`: `relayout` misst die
   Höhen am DOM (`offsetHeight`), und ausgeblendete Elemente messen
   sich als 0 — die Wand käme nie über den ersten Lauf hinaus. */
.wall--unpacked .wall-notes {
  opacity: 0;
  pointer-events: none;
}

/* Der Platzhalter liegt IN der Wand, aber nicht unter den Zetteln — beim
   Erscheinen ist er weg, die Regel wirkt also nur währenddessen. */
.wall-skeleton {
  margin: 0;
  padding: 8px;
}

.wall-skeleton .skeleton-card {
  height: 120px;
}

@media (prefers-reduced-motion: reduce) {
  .wall-notes {
    transition: none;
  }
}

.wall-empty {
  margin: 24px auto 0;
  max-width: 240px;
  padding: 14px 12px;
  text-align: center;
  background: var(--pw-paper);
  border: 2px solid var(--pw-line);
  box-shadow: var(--pw-shadow);
  transform: rotate(-1.2deg);
  font-weight: 800;
  font-size: 13px;
  color: var(--pw-ink-soft);
}

.fab-card {
  position: fixed;
  right: 18px;
  bottom: calc(64px + 18px + env(safe-area-inset-bottom));
  z-index: 1000;
  background: var(--pw-paper);
  border: 2px solid var(--pw-line);
  border-radius: 5px;
  box-shadow:
    4px 5px 0 var(--pw-line),
    0 10px 18px rgba(36, 31, 26, 0.28);
  transform: rotate(-1.8deg);
}

.fab-btn {
  position: relative;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--pw-ink);
  font-size: 21px;
  cursor: pointer;
}

.fab-btn:active:not(:disabled) {
  transform: translate(1px, 1px);
}

.fab-btn:disabled {
  opacity: 0.5;
}

.fab-plus {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  background: var(--pw-tape);
  border: 1.5px solid var(--pw-line);
  border-radius: 50%;
}

/* Das Suchfeld klebt unter dem App-Header (sticky, `top` = seine gemeldete
   Höhe), damit es beim Scrollen durch die Treffer greifbar bleibt. Ebene 940:
   über den Zetteln (bis 810 beim Ziehen) und der Navigation (900), unter dem
   Header (950) — der Header überdeckt es nie, weil es unter ihm klebt.
   Die negativen Seitenränder heben das Polster von `.wall-page` auf: die Leiste
   geht über die volle Breite, die Wand darunter behält ihren Rand. */
.wall-search {
  position: sticky;
  top: var(--app-header-height, 0px);
  z-index: 940;
  margin: -10px -8px 10px;
  padding: 10px 12px;
  background: var(--color-background-elevated);
  border-bottom: 2px solid var(--pw-line);
}

.wall-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wall-search-field {
  flex: 1;
  /* Mit `auto` setzte die Eigenbreite des Felds die Untergrenze, und der
     Schließen-Knopf rutschte auf schmalen Geräten aus dem Bild. */
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--pw-paper);
  border: 2px solid var(--pw-line);
  border-radius: var(--radius-md);
}

.wall-search-input {
  flex: 1;
  /* Siehe Hülle: ein `<input>` hat eine Eigenbreite (`size`), die `auto` als
     Untergrenze nimmt. */
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  /* 16px, nicht weniger: darunter zoomt iOS beim Fokussieren in die Seite. */
  font-size: 1rem;
  color: var(--color-text-primary);
}

.wall-search-clear,
.wall-search-close {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.wall-search-clear {
  position: relative;
  width: 24px;
  height: 24px;
  padding: 4px;
  font-size: 1rem;
}

/* Sichtbar 24px, damit das Feld seine Höhe behält; die Trefferfläche wächst per
   Pseudo-Element auf 48px. Sie ragt je 12px über den Knopf und bleibt damit
   innerhalb der Hülle (rechts im Innenabstand) — die Fläche des Schließen-Knopfs
   erreicht sie nicht. */
.wall-search-clear::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--touch-target-min, 48px);
  height: var(--touch-target-min, 48px);
  transform: translate(-50%, -50%);
}

.wall-search-close {
  position: relative;
  width: 44px;
  height: 44px;
  font-size: 1.4rem;
}

/* Trefffläche 48px, ohne die Leiste höher zu machen. Sie ragt je 2px über den
   Knopf — links bleibt sie damit im Abstand zur Hülle und erreicht die Fläche
   des Lösch-× nicht. */
.wall-search-close::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--touch-target-min, 48px);
  height: var(--touch-target-min, 48px);
  transform: translate(-50%, -50%);
}

.wall-search-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.wall-search-actions .btn {
  flex: 1 1 200px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .wall {
    transition: none;
  }
}
</style>
