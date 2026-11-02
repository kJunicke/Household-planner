<script setup lang="ts">
/**
 * Die Pinnwand — der Putzen-Screen der Route `/`.
 *
 * Keine Kategorie-Chips, keine Überschriften. Die Gruppen fällig → täglich →
 * Projekt bestimmen die grobe Leserichtung (`packWall`: ein Projekt landet nie
 * oberhalb einer fälligen Aufgabe); **innerhalb** einer Gruppe packt die Skyline
 * frei, nicht nach Dringlichkeit (→ CONTEXT.md „Stempel"; ADR
 * docs/adr/0002-stempel-ordnet-nicht.md). Den Typ trägt das Papier.
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
import { searchTasks } from '@/lib/taskSearch'
import {
  defaultNoteWidth,
  packWall,
  planNoteWidths,
  rememberWallHeight,
  rememberedWallHeight,
  rotationOf,
  type WallNoteShape,
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
 * Erledigte Aufgaben — unter die Wand, nicht auf sie. Eigene Konstante statt
 * `board.completedTasks.value` im Template: in einem Objekt verschachtelte Refs
 * werden im Template NICHT ausgepackt.
 */
const doneTasks = computed((): readonly Task[] => board.completedTasks.value)

/**
 * Luft zum Wandrand links und rechts — **fest, nicht anteilig**. Der Rand ist
 * für den Daumen da, und der wächst nicht mit dem Bildschirm; ein Prozentsatz
 * gäbe dem schmalsten Gerät am wenigsten Rand und kostete es die meiste
 * Wandhöhe. 12 ist ein Kompromiss, bewusst nicht auf eine Höhenklippe des
 * aktuellen Bestands hin optimiert → docs/pinnwand-layout.md („Wandrand `EDGE`").
 *
 * Bezugsgröße bleibt die Wand (`wall.clientWidth`), nie `window.innerWidth`.
 */
const EDGE = 12

/**
 * Zuschlag auf jede gemessene Breite. Deckt den nicht herleitbaren Rundungsrest,
 * mit dem der Browser Rahmen, Innenabstand und Textlauf unabhängig voneinander
 * auflöst. Rahmen und Innenabstand von `.zettel` selbst zählt `chromeWidth`
 * (→ `relayout`) — diese Marge ist kein Ersatz dafür.
 *
 * **Bemessen, nicht bewiesen:** mit 4 px hält die Fußzeilen-Untergrenze über alle
 * gemessenen Zettel mindestens 4,00 px Luft → docs/pinnwand-layout.md
 * („Messmarge `MEASURE_SAFETY`").
 *
 * Ein paar Pixel zusätzliche Zettelbreite sieht niemand; ein fehlendes halbes
 * Pixel bricht den Titel um. Die Marge geht deshalb immer nach oben.
 */
const MEASURE_SAFETY = 4

/**
 * Wie viele Titelzeilen der zweite Packlauf einem Zettel zusätzlich zumuten
 * darf. Ein Zettel, der in einen schmalen Streifen gequetscht wird und dadurch
 * vierzeilig wird, kostet mehr Fläche, als er spart.
 *
 * Eins, nicht zwei: bei einem einzeiligen Zettel ist das die Verdopplung der
 * Texthöhe. Wer mehr zulässt, tauscht eine waagerechte Lücke gegen eine
 * senkrechte.
 */
const MAX_EXTRA_LINES = 1

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
 * Verlässlichkeit.
 *
 * Geändert wird durch **Ersetzen** des Sets. Ein `ref` macht ein `Set` zwar
 * tief reaktiv, aber die Zuweisung ist der Weg, der auch dann noch stimmt, wenn
 * jemand hier später auf `shallowRef` umstellt.
 */
const expandedIds = ref(new Set<string>())

/**
 * Gemerkte Oberkanten der aufgeklappten Zettel: der aufgeklappte Zettel bleibt
 * liegen, wo er lag, die anderen weichen ihm aus. `packWall` ist zustandslos; das
 * Gedächtnis steht hier. Eingetragen wird die y-Koordinate unmittelbar vor dem
 * Antippen (`lastPositions`), verworfen beim Zuklappen und beim Verschwinden von
 * der Wand, zusammen mit `expandedIds`.
 *
 * **Die Reihenfolge ist Teil des Zustands.** Der letzte Eintrag der `Map` ist der
 * zuletzt angetippte Zettel und gewinnt, wenn sich zwei Vorgaben nicht vertragen
 * (→ `resolvePins` in `wallLayout.ts`). Beim erneuten Antippen deshalb erst
 * löschen, dann setzen — sonst bliebe er auf seinem alten Platz in der Reihenfolge.
 *
 * Bewusst **nicht** reaktiv: gelesen nur in `relayout`, und jede Änderung zieht
 * ohnehin selbst ein `relayout` nach sich.
 */
const pinnedTops = new Map<string, number>()

/**
 * Zettel, deren Punktwert oben rechts statt in der Fußzeile steht. Entschieden
 * wird beim Messen in `relayout` (nur dort sind Titel- und Fußzeilenbreite
 * bekannt), festgehalten aber HIER und über das `meta-top`-Prop an `WallNote`
 * gereicht.
 *
 * **`relayout` fasst diese Klasse an KEINER Stelle per `classList` an — weder
 * setzend noch entfernend.** Schon das Entfernen allein genügt, um sie dauerhaft
 * zu verlieren: Vue vergleicht beim Patch nur seinen eigenen zuletzt berechneten
 * Klassen-String mit dem neuen; bleibt die Entscheidung gleich, schreibt es
 * `className` gar nicht neu, und die extern entfernte Klasse kommt NIE zurück —
 * außer eine UNABHÄNGIGE Bindungsänderung am selben Element patcht zufällig die
 * ganze Klassenliste. Einzige Quelle ist deshalb dieses Set.
 */
const metaTopIds = ref(new Set<string>())

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
 * Packt die Wand neu: Breiten messen, Breiten planen, Höhen messen, Skyline
 * rechnen, Positionen schreiben. Muss nach jedem Datenwechsel, nach dem Laden der
 * Schrift und nach jeder Breitenänderung laufen.
 *
 * Erst wird **jeder** Zettel gemessen, dann werden **alle** Breiten geplant, dann
 * gesetzt — die Breite eines Zettels hängt davon ab, was neben ihn passt.
 *
 * **Kosten** liegen fast ganz in der DOM-Messung von Schritt 1 (mehrere erzwungene
 * Layouts je Zettel, linear in der Zettelzahl, in der Größenordnung eines Frames);
 * `planNoteWidths` plus `packWall` sind mit rund 0,05 ms belanglos.
 *
 * **`tappedId`** ist der angetippte Zettel beim Auf- und Zuklappen. Er steht
 * still — beim Aufklappen über seine Vorgabe (→ `pinnedTops`), beim Zuklappen,
 * weil er ohne Vorgabe dort landet, wo er als schmaler Zettel lag. Hier wird er
 * nur von der Flug-Animation ausgenommen.
 *
 * Liefert `false`, wenn der Lauf nicht vollständig war (→ `runRelayout`).
 */
const relayout = (animate: boolean, tappedId?: string): boolean => {
  const wall = wallEl.value
  if (!wall) return false

  // `EDGE` steht hier und beim Setzen von `left` (`note.x + EDGE`) — es muss an
  // beiden Stellen derselbe Wert sein: `packWall` klemmt jeden Zettel intern auf
  // `[0, usableWidth − Breite]`, die rechte Wandkante steht also bei
  // `EDGE + usableWidth`. Wer den Rand hier aus der Wandbreite rechnet und dort
  // auch nur um 1 px anders rundet, lässt genau den Zettel, der an der Klemmung
  // hängt, über die Kante ragen — ohne dass irgendetwas darauf aufmerksam macht.
  const usableWidth = wall.clientWidth - 2 * EDGE
  if (usableWidth <= 0) return false

  const before = new Map(lastPositions)

  // Für den Stempel-Wächter unten: EIN Hinweis je Packlauf, nicht einer je
  // Zettel — sonst ginge die Meldung im Rauschen unter.
  let stampWarned = false

  // Gruppe je Zettel (0 = fällig, 1 = täglich, 2 = Projekt) für Packreihenfolge
  // und Gruppengrenze in `packWall`, das keine Task-Objekte kennt.
  const taskGroups = new Map<string, number>()
  board.pendingTasks.value.forEach((task) => taskGroups.set(task.task_id, 0))
  board.dailyTasks.value.forEach((task) => taskGroups.set(task.task_id, 1))
  board.projectTasks.value.forEach((task) => taskGroups.set(task.task_id, 2))

  // Schritt 1 — messen, was jeder Zettel an Breite braucht.
  //
  // Gemessen wird mit `getBoundingClientRect()`, NICHT mit `offsetWidth`.
  // `offsetWidth` ist eine ganze Zahl und rundet ab: bei 123,4 px Textbreite
  // setzten wir 123 — und der Titel bricht um, im Mittel bei jedem zweiten und
  // scheinbar zufällig. Danach wird aufgerundet und `MEASURE_SAFETY` addiert.
  //
  // Zwei Werte je Zettel:
  // - `max-content` (Titel per Klasse einzeilig gestellt) = natürliche Breite,
  // - `min-content` = die Breite, unter der ein Wort abgeschnitten würde.
  //
  // Die Untergrenze wird gemessen und nicht am Text abgelesen: nur der Browser
  // kennt seine tatsächlichen Umbruchstellen. Sind beide Werte gleich, hat der
  // Titel keine Umbruchstelle — genau die bleiben vom zweiten Lauf ausgenommen.
  const shapes: WallNoteShape[] = []
  const nextMetaTopIds = new Set<string>()
  const elements = new Map<string, HTMLElement>()
  const lineHeights = new Map<string, number>()

  /**
   * Zettel, die dieser Lauf mangels Element übersprungen hat. Messen und
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

  for (const task of wallTasks.value) {
    const el = noteEls.get(task.task_id)
    if (!el) {
      skipped++
      continue
    }

    // Aufgeklappt heißt: volle Wandbreite, ohne Messung. Bei `width: max-content`
    // mäße sie die Reihe der Zettelchen, ein Vielfaches der Wandbreite.
    // `natural = minimum = usableWidth` sagt dem Planer: so breit wie die Wand,
    // nicht verschmälerbar — der Zettel belegt von selbst eine Reihe allein.
    if (expandedIds.value.has(task.task_id)) {
      el.style.width = `${usableWidth}px`
      shapes.push({ id: task.task_id, natural: usableWidth, minimum: usableWidth })
      elements.set(task.task_id, el)
      lineHeights.set(task.task_id, 0)
      // Die bisherige Punktwert-Entscheidung wird MITGENOMMEN, obwohl dieser
      // Zettel nicht gemessen wird. Sonst verlöre er `zettel--meta-top`, solange
      // er offen ist. Die Klasse verengt den Titel um `cornerExtra`; beim
      // Zuklappen erreichte die neu entschiedene Klasse das DOM erst im nächsten
      // Tick, Schritt 4 mäße die Höhe der ALTEN Fassung, und die Wand pendelte je
      // nach zuletzt aufgeklapptem Zettel zwischen zwei Packungen — dieselbe
      // Eingabe, zwei Ergebnisse. „Zuklappen stellt die Wandhöhe exakt wieder
      // her" hängt an dieser Zeile.
      if (metaTopIds.value.has(task.task_id)) nextMetaTopIds.add(task.task_id)
      continue
    }

    el.classList.add('zettel--measuring', 'zettel--single-line')
    el.style.maxWidth = 'none'

    const titleEl = el.querySelector<HTMLElement>('.title')
    const footEl = el.querySelector<HTMLElement>('.foot')

    // Waagerechte Zettel-Chrome: `titleWidth` und die Fußzeilenbreiten (unten)
    // sind Content-Box-Breiten der KINDER `.title`/`.foot`. Gesetzt wird aber die
    // Border-Box-Breite von `.zettel` SELBST (`box-sizing: border-box`, `base.css`
    // Universalregel) — Rahmen und Innenabstand von `.zettel` (`WallNote.vue`,
    // gilt für alle Zetteltypen) müssen dazu, sonst schneidet die gesetzte Breite
    // die Fußzeile ab.
    //
    // Gemessen statt fest verdrahtet: eine Konstante liefe bei der nächsten
    // Änderung an Rahmen oder Polster still auseinander.
    const zettelStyle = getComputedStyle(el)
    const chromeWidth =
      parseFloat(zettelStyle.borderLeftWidth) +
      parseFloat(zettelStyle.borderRightWidth) +
      parseFloat(zettelStyle.paddingLeft) +
      parseFloat(zettelStyle.paddingRight)

    // Punktwert oben rechts? Der Sticker wandert nach oben, wenn der Zettel
    // DADURCH schmaler wird — oben kostet er `cornerExtra` (er verengt den
    // Titelkasten), unten `pointsWidth` plus `gap`. Verglichen werden die
    // geplanten Breiten, nicht die gewünschten (→ `defaultNoteWidth` unten).
    // Titel UND Fußzeile stehen für die Messung auf `max-content` (`WallNote.vue`,
    // `.zettel--measuring .title`/`.foot`).
    //
    // **`zettel--meta-top` gehört AUSSCHLIESSLICH Vue** (Prop `metaTop`, siehe
    // `metaTopIds` oben und `WallNote.vue`). Weder `add`/`toggle` NOCH `remove`
    // dürfen diese Klasse hier anfassen — Begründung bei `metaTopIds`.
    //
    // Die Fußzeilenbreite MIT Punkte-Sticker wird deshalb aus dem GERADE
    // gerenderten Zustand REKONSTRUIERT statt am DOM erzwungen: `wasMetaTop` sagt,
    // ob der Sticker in der Ecke sitzt (dann fehlt er der Fußzeile und wird
    // rechnerisch dazugezählt) oder schon in der Fußzeile steht. Gemessen wird er
    // dort, wo er GERADE TATSÄCHLICH im DOM steht — `.points--sN` gibt an beiden
    // Orten dieselbe Größe vor.
    const wasMetaTop = metaTopIds.value.has(task.task_id)
    el.style.width = 'max-content'
    const footWidthCurrent = footEl?.getBoundingClientRect().width ?? 0
    const titleWidth = titleEl?.getBoundingClientRect().width ?? 0
    const visiblePointsEl = wasMetaTop
      ? el.querySelector<HTMLElement>('.corner .points')
      : el.querySelector<HTMLElement>('.foot > .points')

    // Der Sticker klebt SCHIEF (`.points { transform: rotate(-6deg) }`, der Stern
    // `-10deg`). `getBoundingClientRect()` liefert den gedrehten Umriss, für das
    // Layout zählt die ungedrehte Breite — sonst würde jeder Zettel mit Sticker
    // oben rund 3 px zu breit (über `cornerExtra` UND `footWidthFull`).
    //
    // Die Neigung wird für die Messung per Inline-Style abgeschaltet und danach
    // zurückgenommen (`''`, im Ruhezustand steht dort nichts). `offsetWidth` wäre
    // der falsche Ausweg (rundet ab, siehe Kopf dieses Messblocks), und
    // `zettel--measuring` hilft nicht: dessen `transform: none` gilt für den
    // ZETTEL, nicht für den Sticker.
    if (visiblePointsEl) visiblePointsEl.style.transform = 'none'
    const pointsWidth = visiblePointsEl?.getBoundingClientRect().width ?? 0
    if (visiblePointsEl) visiblePointsEl.style.transform = ''

    // Beim Herausrechnen des Punktwerts zählt ein Flex-`gap` mit — ein `gap`
    // entsteht nur ZWISCHEN Geschwistern. Der Punktwert ist in der Fußzeile
    // **nie** das einzige Kind: JEDER Zettel trägt einen Stempel (→ `WallNote.vue`,
    // `stampLabel`).
    //
    // Die Rechnung steht auf ZWEI Annahmen über `WallNote.vue`: der
    // Stempel heißt `.due-stamp`, und er ist ein DIREKTES Flex-Kind von
    // `.foot`. Fällt eine davon, ist `footGap` falsch, und die Zettel werden
    // still falsch breit gepackt — kein Fehler, keine Warnung, nur ein Zettel,
    // der nicht passt. Deshalb wird sie geprüft und laut gemeldet, statt
    // stumm auf 0 zurückzufallen.
    //
    // Die 6 selbst bleibt verdrahtet (`.foot { gap: 6px }`) statt aus dem
    // `getComputedStyle` der Fußzeile gelesen — bekannte Lücke, bewusst hier
    // nicht mitgeändert.
    if (!stampWarned && !footEl?.querySelector(':scope > .due-stamp')) {
      stampWarned = true
      console.warn(
        '[WallView] Kein `.due-stamp` als direktes Kind von `.foot` — die ' +
          'Breitenmessung rechnet mit einem Flex-`gap`, den es dann nicht ' +
          'gibt. Wurde der Stempel in `WallNote.vue` umbenannt oder verschoben? ' +
          '(Dieser Hinweis erscheint einmal je Packlauf, nicht einmal je Zettel.)',
      )
    }
    const footGap = 6
    const footWidthFull = wasMetaTop ? footWidthCurrent + pointsWidth + footGap : footWidthCurrent
    const footWidthWithoutPoints = wasMetaTop
      ? footWidthCurrent
      : Math.max(0, footWidthCurrent - pointsWidth - footGap)

    // Die Breite, unter der ein Wort abgeschnitten würde — `.title` SELBST auf
    // `min-content` gestellt (nicht der ganze Zettel, dessen Breite die
    // Vue-exklusive `zettel--meta-top`-Klasse mitbestimmt). Steht vor der
    // Entscheidung, weil `defaultNoteWidth` nach unten gegen `minimum` klemmt.
    el.classList.remove('zettel--single-line')
    if (titleEl) titleEl.style.width = 'min-content'
    const titleMinimum = titleEl?.getBoundingClientRect().width ?? titleWidth
    if (titleEl) titleEl.style.width = ''

    // Was der Sticker OBEN kostet. Ohne diesen Zuschlag setzt ein Teil der Zettel
    // seinen Titel mehrzeilig, obwohl er die volle natürliche Breite hat.
    //
    // `.corner` ist in `WallNote.vue` ein `float: right` in `.head`
    // (`display: flow-root`) — der Titel steht aber NICHT „um ihn herum": weil
    // `.title` mit `overflow: hidden` einen eigenen Block-Formatierungskontext
    // öffnet, darf sein Kasten den Float-Margin-Kasten nicht überlappen. Der
    // Titel wird deshalb über seine GANZE Höhe schmaler, nicht nur in der ersten
    // Zeile.
    //
    // Verengt wird um die Sticker-Breite plus dessen waagerechte Ränder
    // (`.corner { margin: -1px 0 2px 7px }`: links 7 px, rechts 0). Gemessen,
    // nicht verdrahtet: die Ecke ist nicht über alle Zettel gleich breit — der
    // Fünf-Punkte-Stern `.points--s5` ist breiter; eine feste 41 rechnete für
    // jeden Stern falsch.
    //
    // `getComputedStyle` für die Ränder und NICHT `getBoundingClientRect`: ohne
    // `zettel--meta-top` ist `.corner` `display: none` und misst 0. Ein Rand in px
    // ist auch dann richtig auflösbar. Kurz einschalten geht nicht — die Klasse
    // gehört ausschließlich Vue (siehe oben).
    const cornerEl = el.querySelector<HTMLElement>('.corner')
    const cornerStyle = cornerEl ? getComputedStyle(cornerEl) : null
    const cornerMargins = cornerStyle
      ? parseFloat(cornerStyle.marginLeft) + parseFloat(cornerStyle.marginRight)
      : NaN
    // Zwei Ausfälle, beide nur erreichbar, wenn `WallNote` sein Markup ändert:
    // - Ohne `.corner` (oder mit Rändern, die keine Zahl ergeben) ist
    //   `cornerExtra` 0 — der Sticker oben kostet rechnerisch nichts, es
    //   entscheidet allein die Fußzeile. Zu großzügig, kein sicherer Wert.
    // - Ohne sichtbaren Sticker ist `pointsWidth` 0 und `cornerExtra` nur der
    //   Rand; `metaTop` bleibt dann immer `false`.
    const cornerExtra = Number.isFinite(cornerMargins) ? pointsWidth + cornerMargins : 0

    // Die beiden Fassungen des Zettels, zwischen denen die Entscheidung wählt,
    // jede mit IHRER Fußzeile (ohne bzw. mit Punktwert). Unten wird eine davon
    // GANZ übernommen — so passen `natural`/`minimum` strukturell zur gerade
    // getroffenen Entscheidung, nicht zur vorigen (`wasMetaTop`).
    //
    // - `natural`: Titel einzeilig, mindestens so breit wie die Fußzeile;
    // - `minimum`: derselbe Boden, aber der Titel darf an Wortgrenzen umbrechen;
    // - plus `chromeWidth` (Rahmen und Innenabstand, siehe oben) und
    //   `MEASURE_SAFETY` (Rundungsmarge, Begründung dort).
    //
    // `cornerExtra` zählt in der oberen Fassung zu BEIDEN Titelmaßen, auch zu
    // `minimum`: der Titelkasten ist über seine ganze Höhe verengt, das längste
    // Wort muss in die VERENGTE Spalte passen — sonst schneidet `text-overflow:
    // ellipsis` es still ab. Der Preis: einzelne Zettel mit Sticker oben sind ein
    // paar Pixel breiter, als ihr Titel verlangt.
    const shapeWithMetaTop: WallNoteShape = {
      id: task.task_id,
      natural:
        Math.ceil(Math.max(titleWidth + cornerExtra, footWidthWithoutPoints) + chromeWidth) +
        MEASURE_SAFETY,
      minimum:
        Math.ceil(Math.max(titleMinimum + cornerExtra, footWidthWithoutPoints) + chromeWidth) +
        MEASURE_SAFETY,
    }
    const shapeWithMetaFoot: WallNoteShape = {
      id: task.task_id,
      natural: Math.ceil(Math.max(titleWidth, footWidthFull) + chromeWidth) + MEASURE_SAFETY,
      minimum: Math.ceil(Math.max(titleMinimum, footWidthFull) + chromeWidth) + MEASURE_SAFETY,
    }

    // Entschieden wird gegen die Breite, die TATSÄCHLICH herauskommt, nicht gegen
    // die gewünschte. Übersteigen beide Fassungen den 45-%-Deckel, sind sie gleich
    // breit, und der Sticker oben nähme dem Titel `cornerExtra` je Zeile, ohne
    // dass der Zettel schmaler würde.
    //
    // Die Regel minimiert die Breite des EINZELNEN Zettels und schaut nie auf
    // Höhen — ein schmaler Zettel ist ein hoher Zettel. So entschieden, weil die
    // Wand unterm Strich kürzer wird; wer Höhe optimieren will, baut eine andere
    // Regel, nicht diese um.
    //
    // Benutzt wird die ECHTE Regel aus `wallLayout.ts` statt einer Kopie des
    // Deckels — eine zweite Fassung derselben Entscheidung liefe auseinander.
    //
    // Bei Gleichstand bleibt der Sticker UNTEN: `<`, nicht `<=`; der Umzug muss
    // mindestens 1 px echt einsparen. Dass die Fußzeile nie abgeschnitten wird,
    // garantiert `minimum` — `defaultNoteWidth` klemmt nach unten nie darunter.
    const widthWithMetaTop = defaultNoteWidth(shapeWithMetaTop, usableWidth)
    const widthWithMetaFoot = defaultNoteWidth(shapeWithMetaFoot, usableWidth)

    const metaTop = widthWithMetaTop < widthWithMetaFoot
    if (metaTop) nextMetaTopIds.add(task.task_id)

    // Eine der beiden Fassungen wird GANZ übernommen — kein Nachrechnen.
    const shape = metaTop ? shapeWithMetaTop : shapeWithMetaFoot

    el.classList.remove('zettel--measuring')
    el.style.maxWidth = ''
    el.style.width = ''

    const lineHeight = titleEl ? parseFloat(getComputedStyle(titleEl).lineHeight) : NaN

    shapes.push(shape)
    elements.set(task.task_id, el)
    // Ohne brauchbare Zeilenhöhe gibt es keine Zeilenobergrenze — dann bleibt
    // es bei der natürlichen Breite (siehe Schritt 3).
    lineHeights.set(task.task_id, Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 0)
  }

  // Die frisch getroffene `metaTop`-Entscheidung wird VORWÄRTS ans DOM gegeben,
  // bevor eine Höhe gemessen wird. Das Set erreicht das DOM als Klasse
  // `zettel--meta-top` erst im NÄCHSTEN Tick, Schritt 3 (Zeilen) und Schritt 4
  // (Höhen) laufen aber in DIESEM. Für jeden gekippten Zettel mäßen sie die ALTE
  // Fassung, und `packed.height` (Inline-Höhe der Wand) stünde nach einer
  // Breitenänderung deutlich zu niedrig. Der Resize-Wächter (`width ===
  // lastWidth`) lässt bewusst nur EINEN Lauf zu — nichts heilte das später.
  //
  // Die Klasse selbst darf hier NICHT gesetzt werden — sie gehört ausschließlich
  // Vue. Sie schaltet aber nur `display` an zwei vorhandenen Knoten um
  // (`WallNote.vue`: `.zettel--meta-top .corner { display: flex }`,
  // `.zettel--meta-top .foot > .points { display: none }`). Genau diese Wirkung
  // wird als Inline-`display` vorweggenommen; schreibt Vue im nächsten Tick die
  // Klasse, ändert sich an der Darstellung nichts mehr.
  //
  // Aufgeräumt wird per `nextTick`, NACH Vues DOM-Update — sonst überstimmte der
  // Inline-Stil jede SPÄTERE Klassenänderung. Sofort nach der Messung
  // zurücknehmen wäre falsch: bis zum Klassen-Update stünde wieder die alte
  // Fassung im DOM. Im expanded-Zweig kippt nie etwas, weil die Entscheidung dort
  // mitgenommen wird.
  const flippedEls: HTMLElement[] = []
  for (const shape of shapes) {
    const el = elements.get(shape.id)
    if (!el) continue
    const isMetaTop = nextMetaTopIds.has(shape.id)
    if (isMetaTop === metaTopIds.value.has(shape.id)) continue
    const cornerEl = el.querySelector<HTMLElement>('.corner')
    const footPointsEl = el.querySelector<HTMLElement>('.foot > .points')
    // `flex` und `grid` sind die Werte der jeweiligen Stylesheet-Regeln in
    // `WallNote.vue` (`.zettel--meta-top .corner` bzw. `.points`).
    if (cornerEl) cornerEl.style.display = isMetaTop ? 'flex' : 'none'
    if (footPointsEl) footPointsEl.style.display = isMetaTop ? 'none' : 'grid'
    flippedEls.push(el)
  }
  metaTopIds.value = nextMetaTopIds

  // Das Aufräumen wird NACH der Zuweisung oben angemeldet: erst dann steht
  // Vues Flush an, und `nextTick` hängt sich an genau diesen Flush — der
  // Rückruf läuft also verlässlich NACH dem Klassen-Update. Vorher angemeldet
  // liefe er an einer bereits aufgelösten Promise womöglich DAVOR, und die
  // alte Fassung stünde für einen Moment wieder im DOM.
  if (flippedEls.length > 0) {
    nextTick(() => {
      for (const el of flippedEls) {
        const cornerEl = el.querySelector<HTMLElement>('.corner')
        const footPointsEl = el.querySelector<HTMLElement>('.foot > .points')
        if (cornerEl) cornerEl.style.display = ''
        if (footPointsEl) footPointsEl.style.display = ''
      }
    })
  }

  // Schritt 2 — Breiten planen (zweiter Packlauf, siehe `planNoteWidths`).
  const planned = planNoteWidths(shapes, usableWidth)

  // Schritt 3 — geplante Breiten setzen, Zeilen prüfen, zu Hohes zurücknehmen.
  // Wie viele Zeilen ein Titel bei einer Breite braucht, weiß nur der
  // Umbruch-Algorithmus des Browsers, keine Formel.
  //
  // **Bezugsgröße der Grenze ist `fallback`** — die Breite ohne zweiten Packlauf,
  // also die bereits bei `MAX_WIDTH_RATIO` gedeckelte, NICHT die einzeilige. Ein
  // gedeckelt zweizeiliger Zettel darf also dreizeilig werden. Absicht: der Deckel
  // ist der Bestand, gegen den der zweite Lauf antritt.
  const fallbacks = new Map<string, number>()
  const widths = new Map<string, number>()
  for (const shape of shapes) {
    const el = elements.get(shape.id)
    if (!el) continue
    const fallback = defaultNoteWidth(shape, usableWidth)
    const width = planned.get(shape.id) ?? fallback
    fallbacks.set(shape.id, fallback)
    widths.set(shape.id, width)
    el.style.width = `${width}px`
  }

  // Zeilen zählen — nur bei den wenigen Zetteln, die der zweite Lauf
  // überhaupt verschmälert hat.
  const rejected = new Set<string>()
  for (const shape of shapes) {
    const el = elements.get(shape.id)
    const width = widths.get(shape.id) ?? 0
    const fallback = fallbacks.get(shape.id) ?? width
    const lineHeight = lineHeights.get(shape.id) ?? 0
    // Ohne brauchbare Zeilenhöhe gibt es keine Grenze; dann bleibt die Planung.
    if (!el || width >= fallback || lineHeight <= 0) continue

    const titleEl = el.querySelector<HTMLElement>('.title')
    if (!titleEl) continue
    const lines = Math.round(titleEl.clientHeight / lineHeight)
    // Bei `fallback` ist der Titel einzeilig, solange der Deckel nicht griff.
    // Nur der bereits gedeckelte Langtitel muss dafür erneut gemessen werden.
    let baseLines = 1
    if (fallback < shape.natural) {
      el.style.width = `${fallback}px`
      baseLines = Math.round(titleEl.clientHeight / lineHeight)
      el.style.width = `${width}px`
    }
    if (lines > baseLines + MAX_EXTRA_LINES) rejected.add(shape.id)
  }

  // Zurücknehmen — auf `fallback`, den Stand ohne zweiten Packlauf. Der
  // Streifen-Füller verschmälert Zettel einzeln, eine Partner-Rücknahme braucht
  // es deshalb nicht.
  for (const id of rejected) {
    const el = elements.get(id)
    const fallback = fallbacks.get(id)
    if (!el || fallback === undefined) continue
    widths.set(id, fallback)
    el.style.width = `${fallback}px`
  }

  // Schritt 4 — Höhen messen. Erst hier, wenn keine Breite sich mehr ändert:
  // eine Höhe zu einer überholten Breite wäre wertlos.
  const metrics = []
  for (const shape of shapes) {
    const el = elements.get(shape.id)
    if (!el) continue
    metrics.push({
      id: shape.id,
      width: widths.get(shape.id) ?? 0,
      height: el.offsetHeight,
      expanded: expandedIds.value.has(shape.id),
      // **`-1`, nicht `0` — das ist Absicht, bitte nicht „aufräumen".**
      //
      // Die drei Listen (`pendingTasks` / `dailyTasks` / `projectTasks`) teilen
      // `wallTasks` heute vollständig auf. Träte der Fall je ein, wäre `0` die
      // schlechteste Antwort: Gruppe 0 ist eine ECHTE Gruppe (fällig, Reißzwecke),
      // und `fastenersOfGroup` in `wallLayout.ts` gäbe dem Zettel still die
      // Befestigung mit dem KLEINSTEN Überstand — die Wand polsterte oben zu knapp,
      // die Befestigung ragte über den Kork.
      //
      // `-1` ist keine Gruppe: `fastenersOfGroup` fällt auf ALLE Befestigungen
      // zurück und polstert für die ungünstigste. Für das Packen unschädlich — ein
      // unbekannter Zettel landet ganz oben in einer eigenen Gruppe.
      group: taskGroups.get(shape.id) ?? -1,
      // Wo dieser Zettel im vorigen Lauf stand. `packWall` braucht das nur,
      // solange eine Vorgabe im Spiel ist: wer vorher unter oder neben dem
      // vorgegebenen Zettel lag, darf danach nicht darüber stehen. Beim ersten
      // Lauf ist die Karte leer — dann gibt es auch keine Vorgabe.
      previousTop: before.get(shape.id)?.y,
    })
  }

  // Vorgaben der aufgeklappten Zettel in Antipp-Reihenfolge, gefiltert auf das,
  // was gerade an der Wand hängt — eine Vorgabe für einen Zettel, den `packWall`
  // nicht bekommt, wäre ein stiller Konfliktpartner für die übrigen.
  const onWall = new Set(metrics.map((note) => note.id))
  const pins = [...pinnedTops].filter(([id]) => onWall.has(id)).map(([id, top]) => ({ id, top }))

  const packed = packWall(metrics, usableWidth, pins)
  wallHeight.value = packed.height

  lastPositions.clear()
  const moved: Array<{ el: HTMLElement; id: string; dx: number; dy: number; z: number }> = []

  for (const note of packed.notes) {
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
    // Zetteln. Meist steht er ohnehin still (Vorgabe, → `pinnedTops`); die
    // Ausnahme — zwei unverträgliche Vorgaben — ist gerade die, in der eine
    // Flugbahn am meisten verwirrte.
    // Ebenso der Zettel, der gerade unter einer Geste steht (→ `gestureNoteId`).
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

  // Bewusst keine Scroll-Nachführung: der angetippte Zettel wandert nicht, und
  // der Bildlauf gehört dem Nutzer, nicht der Wand.
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
    // genau den Sprung, den die Mindesthöhe verhindern soll.
    rememberWallHeight(packed.height)
  }

  if (!animate || prefersReducedMotion?.matches) return complete
  animateMoves(moved)
  return complete
}

/**
 * Auf- und Zuklappen eines Zettels mit Unteraufgaben.
 *
 * Die Skyline packt frei innerhalb ihrer Gruppe (→ `packWall`): ändert sich die
 * Höhe des aufklappenden Zettels, können sich auch **andere** Zettel derselben
 * Gruppe verschieben, nicht nur die nachfolgenden. Bewusst keine Garantie
 * „oberhalb bewegt sich nichts" — `animateMoves` animiert jeden Zettel, dessen
 * Position sich tatsächlich ändert.
 *
 * **Der angetippte Zettel selbst bleibt liegen:** seine Oberkante geht `packWall`
 * als Vorgabe mit, die anderen weichen aus. Gemerkt wird die zuletzt GESETZTE
 * Position (`lastPositions`), nicht eine frisch gemessene — eine DOM-Messung
 * träfe ihn mitten in einer laufenden Fluganimation. Steht dort noch nichts
 * (erster Lauf), packt er ohne Vorgabe frei mit.
 */
const toggleNote = (taskId: string) => {
  const next = new Set(expandedIds.value)
  if (next.delete(taskId)) {
    // Zuklappen: Vorgabe verwerfen. Der Zettel ist danach wieder schmal und
    // packt normal mit — er landet dabei wieder dort, wo er vor dem Aufklappen
    // lag, weil die Wand rechnerisch in denselben Zustand zurückfällt.
    pinnedTops.delete(taskId)
  } else {
    next.add(taskId)
    const top = lastPositions.get(taskId)?.y
    // Erst löschen, dann setzen: die Einfügereihenfolge der `Map` IST die
    // Antipp-Reihenfolge, und der zuletzt Angetippte muss hinten stehen — er
    // gewinnt, wenn sich zwei Vorgaben nicht vertragen.
    pinnedTops.delete(taskId)
    if (top !== undefined) pinnedTops.set(taskId, top)
  }
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
    // Laufnummer sortiert: `z` ist der Stapelwert aus `packWall`, damit „der linke
    // Zettel liegt oben" auch WÄHREND der Bewegung gilt. `600 + z` bleibt sicher
    // unter den 800/810, die `WallNote.vue` per `!important` für den gezogenen
    // bzw. lang gedrückten Zettel reserviert (siehe Obergrenze in `packWall`).
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
 * Reihenfolge, Titel (steuert die Breite) und Typ (steuert das Papier). Eine
 * geänderte Zuweisung färbt nur um und darf die Wand nicht durchschütteln.
 */
const layoutSignature = computed(() =>
  wallTasks.value.map((task) => `${task.task_id}:${task.task_type}:${task.title}`).join('|'),
)

watch(layoutSignature, () => {
  // Ein Zettel, der von der Wand verschwindet (erledigt, gelöscht), nimmt
  // seinen Aufklapp-Zustand mit. Ohne das stünde er beim Wiederauftauchen —
  // etwa nach „wieder dreckig" — unvermittelt offen da.
  const onWall = new Set(wallTasks.value.map((task) => task.task_id))
  if ([...expandedIds.value].some((id) => !onWall.has(id))) {
    expandedIds.value = new Set([...expandedIds.value].filter((id) => onWall.has(id)))
  }
  // Mit dem Aufklapp-Zustand geht auch die gemerkte Oberkante — sonst käme der
  // Zettel mit einer Vorgabe aus einer Wand zurück, die es nicht mehr gibt.
  for (const id of [...pinnedTops.keys()]) {
    if (!onWall.has(id)) pinnedTops.delete(id)
  }
  // Dasselbe für den Zettel unter der Geste: verschwindet er von der Wand
  // (erledigt, gelöscht), kommt das `gesture-end` seiner Komponente nicht an — sie ist
  // ausgehängt. Ohne diese Zeile bliebe seine ID hängen und genau dieser Zettel
  // würde nach einem „wieder dreckig" nie wieder mitfliegen.
  if (gestureNoteId.value !== null && !onWall.has(gestureNoteId.value)) gestureNoteId.value = null
  scheduleRelayout(true)
})

/**
 * Wächst ein Projekt-Abzeichen von einer auf zwei oder drei Stellen, ändert sich
 * die gemessene Breite seines Zettels. `layoutSignature` sieht das nicht — dort
 * stehen nur Menge, Reihenfolge, Titel und Typ.
 */
watch(
  () =>
    wallTasks.value
      .filter((task) => task.task_type === 'project')
      .map((task) => `${task.task_id}:${taskStore.getProjectEffortTotal(task.task_id)}`)
      .join('|'),
  () => scheduleRelayout(true),
)

let resizeObserver: ResizeObserver | null = null
let lastWidth = 0

onMounted(async () => {
  // Zuerst abonnieren, dann laden: was zwischen dem Ende des SELECT und dem
  // Beitritt geschieht, käme sonst nie an. Der Beitritt lädt selbst nach.
  taskStore.subscribeToTasks()
  // Parallel: die Projekt-Punktesummen kommen aus einer EIGENEN Abfrage (die
  // Wand lädt keine Erledigungen), und sie müssen vor dem ersten `relayout`
  // stehen — die Stellenzahl am Abzeichen geht in die gemessene Zettelbreite ein.
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

  // Die Schrift bestimmt JEDE Zettelbreite; mit der Ersatzschrift gemessen,
  // fallen alle Zettel zu schmal aus und die Titel brechen um. Deshalb ein
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
const searchQuery = ref('')

// Das Such-Overlay ist ein eigener Verlaufseintrag, damit die Rückgängig-Geste
// es schließt, statt die Ansicht zu wechseln. Reguläres Schließen verbraucht
// den Eintrag wieder → `useOverlayHistoryEntry`.
//
// Der Grund des Schließens kommt als Argument zurück: beim Weitergehen ins
// Modal bleibt die Eingabe als Titelvorschlag stehen, sonst wird sie geleert.
// Er reist durch das Composable mit, weil das Schließen per Verlaufssprung
// erst verzögert zurückmeldet.
const {
  isOpen: showSearchOverlay,
  open: openSearchOverlay,
  close: closeSearchOverlay,
} = useOverlayHistoryEntry<'modal' | 'jump'>('suche', (reason) => {
  if (reason === 'modal') return
  searchQuery.value = ''
  if (reason === 'jump') revealJumpTarget()
})

const searchResults = computed(() => searchTasks(taskStore.tasks, searchQuery.value))

// `immediate`, weil das Overlay beim Aufbau der View **schon offen sein kann**:
// die Marke im Verlauf überlebt das Neuladen und die Rückkehr aus einer fremden
// Seite. Ein Watcher nur auf den Übergang liesse den Fokus dort aus, und
// dasselbe Overlay verhielte sich je nach Herkunft anders.
watch(
  showSearchOverlay,
  (open) => {
    if (!open) return
    setTimeout(() => {
      const input = document.querySelector('.search-overlay-input') as HTMLInputElement | null
      input?.focus()
    }, 100)
  },
  { immediate: true },
)

// Ein Suchtreffer ist ein Sprung, keine zweite Karte: der Tipp schließt die
// Suche und zeigt auf den Zettel bzw. auf die Zeile der Erledigt-Liste. Bedient
// wird die Aufgabe dann dort, mit denselben Gesten und Knöpfen wie sonst auch.
// `useTaskBoard` verteilt jede Hauptaufgabe auf genau eine der beiden Stellen.
//
// Gezeigt wird erst nach dem Schließen: das läuft über einen Verlaufssprung,
// und ein Scrollen davor könnte die Scroll-Wiederherstellung des Browsers
// zurücksetzen.
let jumpTargetId: string | null = null
let jumpPulse: Animation | null = null

/**
 * Stapelhöhe des Zettels, solange sein Sprung-Ring pulsiert: über allen ruhenden
 * (1…n) und fliegenden (600 + z) Zetteln, damit kein Nachbar den Ring verdeckt;
 * unter dem gezogenen bzw. lang gedrückten Zettel (800/810, `WallNote.vue`) und
 * unter Navigation (900), Header samt Statusleiste (950), FAB (1000) und
 * Such-Overlay (1010). Die Wand bildet keinen eigenen Stapelkontext — die Zettel
 * konkurrieren direkt mit diesen Ebenen.
 */
const JUMP_PULSE_Z = '799'

const jumpToResult = (taskId: string) => {
  jumpTargetId = taskId
  closeSearchOverlay('jump')
}

function revealJumpTarget() {
  const id = jumpTargetId
  jumpTargetId = null
  if (!id) return
  void nextTick(() =>
    requestAnimationFrame(() => {
      const note = noteEls.get(id)
      const el =
        note ?? document.querySelector<HTMLElement>(`.done-row[data-task-id="${CSS.escape(id)}"]`)
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
  closeSearchOverlay('modal')
  showCreateModal.value = true
}

const openQuickFromSearch = () => {
  closeSearchOverlay('modal')
  showQuickModal.value = true
}

const handleCreateTask = async (taskData: {
  title: string
  effort: 1 | 2 | 3 | 4 | 5
  recurrence_days: number
  task_type: 'recurring' | 'daily' | 'one-time' | 'project'
}) => {
  try {
    await taskStore.createTask(taskData)
    showCreateModal.value = false
    searchQuery.value = ''
  } catch (error) {
    console.error('Fehler beim Erstellen:', error)
  }
}

const handleCreateQuickTask = async (data: {
  title: string
  effort: 1 | 2 | 3 | 4 | 5
  note?: string
}) => {
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

      <!-- Die Zettel werden IMMER gerendert, auch vor dem ersten Packlauf —
           `relayout` misst sie am DOM, ein `v-if` hier nähme ihm die Vorlage.
           Verborgen werden sie deshalb nur optisch, über die Hülle: `opacity`
           lässt die Messung unberührt (anders als `display: none`). -->
      <div class="wall-notes">
        <WallNote
          v-for="task in wallTasks"
          :key="task.task_id"
          :ref="(instance) => setNoteEl(task.task_id, instance)"
          :task="task"
          :expanded="expandedIds.has(task.task_id)"
          :meta-top="metaTopIds.has(task.task_id)"
          @toggle="toggleNote"
          @gesture-start="gestureNoteId = $event"
          @gesture-end="gestureNoteId = gestureNoteId === $event ? null : gestureNoteId"
        />
      </div>
    </div>

    <p v-if="hasPacked && !taskStore.isLoading && wallTasks.length === 0" class="wall-empty">
      Nichts angepinnt.
    </p>

    <!-- Der Fetzen: klebt den zuletzt abgerissenen Zettel auf einen Tipp zurück.
         Rendert nichts, solange nichts abgerissen wurde. -->
    <WallScrap />

    <!-- Erledigt: kompakter Streifen UNTER der Wand, nicht auf ihr. -->
    <WallDoneList :tasks="doneTasks" />

    <!-- FAB: schwebende Papierkarte, nicht angepinnt — Suche und Neuanlegen
         bleiben hier und wandern nicht in den Header. Dass er nichts verdeckt,
         regelt das Bodenpolster von `.wall-page`, nicht seine eigene Höhe. -->
    <div class="fab-card">
      <button
        class="fab-btn"
        :disabled="taskStore.isLoading"
        aria-label="Aufgabe suchen oder hinzufügen"
        @click="openSearchOverlay"
      >
        <i class="bi bi-search" aria-hidden="true"></i>
        <span class="fab-plus" aria-hidden="true"><i class="bi bi-plus"></i></span>
      </button>
    </div>

    <!-- Such-Overlay. Ein Treffer springt zum Zettel bzw. zur Erledigt-Zeile
         (→ `jumpToResult`). -->
    <div v-if="showSearchOverlay" class="search-overlay">
      <div class="search-overlay-backdrop" @click="closeSearchOverlay()"></div>
      <div class="search-overlay-content">
        <div class="search-overlay-header">
          <div class="search-overlay-input-wrapper">
            <i class="bi bi-search"></i>
            <input
              v-model="searchQuery"
              type="text"
              class="search-overlay-input"
              placeholder="Aufgabe suchen oder erstellen..."
              @keyup.esc="closeSearchOverlay()"
            />
            <button
              v-if="searchQuery"
              class="search-clear-btn"
              aria-label="Eingabe löschen"
              @click="searchQuery = ''"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <button
            class="search-overlay-close"
            aria-label="Suche schließen"
            @click="closeSearchOverlay()"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div v-if="searchQuery.trim()" class="search-overlay-actions">
          <button class="btn btn-primary" @click="openCreateFromSearch">
            <i class="bi bi-plus-lg"></i> Aufgabe erstellen
          </button>
          <button class="btn btn-success" @click="openQuickFromSearch">
            <i class="bi bi-lightning-charge-fill"></i> Quick-Aufgabe abschließen
          </button>
        </div>

        <div class="search-overlay-body">
          <template v-if="searchResults && searchResults.length > 0">
            <button
              v-for="result in searchResults"
              :key="result.task.task_id"
              type="button"
              class="search-result-item"
              @click="jumpToResult(result.task.task_id)"
            >
              <span class="search-result-text">
                <span class="search-result-category">{{ result.categoryLabel }}</span>
                <span class="search-result-title">{{ result.task.title }}</span>
              </span>
              <i class="bi bi-arrow-right-short" aria-hidden="true"></i>
            </button>
          </template>

          <div
            v-else-if="searchResults && searchResults.length === 0"
            class="search-overlay-initial"
          >
            <i class="bi bi-search"></i>
            <p>Keine Aufgaben gefunden für "{{ searchQuery }}"</p>
          </div>

          <div v-else class="search-overlay-initial">
            <i class="bi bi-search"></i>
            <p>Suche über alle Aufgaben...</p>
          </div>
        </div>
      </div>
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
   Packen selbst (`topPaddingFor` in `wallLayout.ts`): die oberste Reihe beginnt
   nicht bei `y = 0`, sondern darunter, und `packed.height` bringt den Betrag
   mit. Hier ginge es auch gar nicht — der Betrag ist keine Konstante, sondern
   hängt an Breite und Neigung der gepackten Zettel (Begründung dort). Ein
   Polster an dieser Stelle wäre eine zweite, stille Quelle derselben Zahl, und
   die absolut positionierten Zettel rechnen ohnehin gegen die Padding-Box:
   ein `padding-top` verschöbe sie nicht einmal. */
.wall {
  position: relative;
  width: 100%;
  /* Während der Breitenmessung ist ein Zettel kurzzeitig `max-content` breit
     und kann die Wand überragen. `clip` verhindert, dass dabei ein waagerechter
     Bildlauf aufblitzt; `visible` in der Senkrechten hält Reißzwecke und
     Klebeband sichtbar, die über die Oberkante hinausragen. Bleibt, obwohl oben
     Platz für sie reserviert ist: es trägt den kurzzeitig überstehenden Zettel. */
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
   Zettel am DOM (`getBoundingClientRect`), und ausgeblendete Elemente messen
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

.search-overlay {
  position: fixed;
  inset: 0;
  /* Über dem FAB (1000), unter der Modal-Ebene (1050, utilities.css): die
     Modals aus der Suche heraus teleportieren nach <body>. */
  z-index: 1010;
}

.search-overlay-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(36, 31, 26, 0.5);
  z-index: 1;
}

.search-overlay-content {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
}

.search-overlay-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--color-background-elevated);
  border-bottom: 2px solid var(--pw-line);
  flex-shrink: 0;
}

.search-overlay-input-wrapper {
  flex: 1;
  /* Mit `auto` setzte die Eigenbreite des Felds die Untergrenze, und der
     Schließen-Knopf rutschte auf schmalen Geräten aus dem Bild. */
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--pw-paper);
  border: 2px solid var(--pw-line);
  border-radius: var(--radius-md);
}

.search-overlay-input {
  flex: 1;
  /* Siehe Hülle: ein `<input>` hat eine Eigenbreite (`size`), die `auto` als
     Untergrenze nimmt. */
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 1rem;
  color: var(--color-text-primary);
}

.search-clear-btn,
.search-overlay-close {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.search-clear-btn {
  position: relative;
  width: 24px;
  height: 24px;
  padding: 4px;
  font-size: 1rem;
}

/* Sichtbar 24px, damit das Feld seine Höhe behält; die Trefferfläche wächst per
   Pseudo-Element auf 48px. Sie ragt je 12px über den Knopf und bleibt damit
   innerhalb von Innenabstand plus Rand der Hülle — rechts davon liegen noch die
   12px Abstand zum Schließen-Knopf, den sie nicht erreicht. */
.search-clear-btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--touch-target-min, 48px);
  height: var(--touch-target-min, 48px);
  transform: translate(-50%, -50%);
}

.search-overlay-close {
  width: 44px;
  height: 44px;
  font-size: 1.4rem;
}

.search-overlay-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-background-elevated);
  border-bottom: 2px solid var(--pw-line);
  flex-shrink: 0;
}

.search-overlay-actions .btn {
  flex: 1 1 200px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

.search-overlay-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.search-overlay-initial {
  text-align: center;
  padding: 3rem 2rem;
  color: var(--color-text-secondary);
}

.search-overlay-initial i {
  display: block;
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.3;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: var(--touch-target-min);
  margin-bottom: 8px;
  padding: 8px 8px 8px 12px;
  text-align: left;
  color: var(--pw-ink);
  background: var(--pw-paper);
  border: 1.5px solid var(--pw-line);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.search-result-item > .bi {
  flex: none;
  font-size: 1.5rem;
  color: var(--pw-ink-soft);
}

/* `min-width: 0`, sonst kürzt der lange Titel nicht und schiebt den Pfeil raus. */
.search-result-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.search-result-category {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
}

.search-result-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 15px;
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .wall {
    transition: none;
  }
}
</style>
