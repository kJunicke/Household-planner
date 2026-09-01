<script setup lang="ts">
/**
 * Die Pinnwand (Pinnwand-Redesign, Etappe 2).
 *
 * Eigene Komponente **neben** `CleaningView`, nicht dessen Umbau: `HomeView`
 * entscheidet anhand der Aussehen-Einstellung, welche der beiden gerendert
 * wird. Beide arbeiten auf denselben Stores und derselben Auswahl
 * (`useTaskBoard`), damit ein Umschalten nichts verliert.
 *
 * Es gibt keine Kategorie-Chipleiste und keine Überschriften. Die drei Gruppen
 * fällig → täglich → Projekt bestimmen zwar die grobe Leserichtung von oben
 * nach unten (`packWall`, Ticket 02: ein Projekt landet nie oberhalb einer
 * fälligen Aufgabe), aber **innerhalb** einer Gruppe packt die Skyline frei —
 * nicht nach Dringlichkeit. Auf der Wand gelten alle fälligen Aufgaben als
 * gleich dringend (→ CONTEXT.md, „Stempel"; ADR docs/adr/0002-stempel-ordnet-nicht.md:
 * der Stempel ordnet nichts um); den Typ trägt ohnehin das Papier.
 *
 * Oben klebt die Statusleiste mit dem gemeinsamen Wochenziel (Etappe 3).
 *
 * Unter der Wand liegt die Erledigt-Liste (Etappe 5), unten rechts der
 * schwebende Doppel-Knopf für Suche und neue Aufgabe.
 *
 * Ein Zettel mit Unteraufgaben klappt beim Antippen auf und nimmt dabei die
 * volle Wandbreite ein. Welche Zettel offen sind, weiß die Wand und nicht der
 * Zettel — sie muss es beim Packen wissen.
 *
 * Erledigt wird am **Eselsohr** des Zettels (Etappe 4, Ticket 09), und langes
 * Drücken blendet die vier Richtungen ein (Ticket 10). Beide Gesten stecken im
 * Zettel; die Wand weiß davon nur, dass sie einen Zettel unter dem Finger nicht
 * gleichzeitig durch die Gegend animieren darf. Er meldet dafür
 * `gesture-start` / `gesture-end` — ein gemeinsamer Zustand für beide Gesten,
 * unter der Bedingung, dass sie sich ausschließen (→ `gestureNoteId`).
 *
 * Über der Erledigt-Liste hängt der **Fetzen** (Ticket 11): ein Tipp klebt den
 * zuletzt abgerissenen Zettel zurück. Er verfällt nicht, sondern hängt bis zum
 * Verlassen der Pinnwand. Sein Zustand liegt in `useTornScrap` und nicht hier —
 * er entsteht im Zettel und wird unter der Wand gezeigt, die Wand selbst hat
 * damit nichts zu tun.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import WallNote from '../components/WallNote.vue'
import WallDoneList from '../components/WallDoneList.vue'
import WallScrap from '../components/WallScrap.vue'
import TaskCard from '../components/TaskCard.vue'
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
  rotationOf,
  type WallNoteShape
} from '@/lib/wallLayout'
import type { Task } from '@/types/Task'

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()
const board = useTaskBoard(() => taskStore.tasks)

/**
 * Reihenfolge der Wand. `pendingTasks` ist bereits nach Dringlichkeit sortiert;
 * die Listen aus dem Composable sind `readonly`, deshalb wird kopiert statt
 * sortiert.
 */
const wallTasks = computed((): Task[] => [
  ...board.pendingTasks.value,
  ...board.dailyTasks.value,
  ...board.projectTasks.value
])

/**
 * Erledigte Aufgaben — gehen unter die Wand, nicht auf sie. Reihenfolge
 * unverändert aus dem gemeinsamen Composable; nicht sortiert, deshalb keine
 * Kopie nötig.
 *
 * Eigene Konstante statt `board.completedTasks.value` im Template: in einem
 * Objekt verschachtelte Refs werden im Template NICHT ausgepackt.
 */
const doneTasks = computed((): readonly Task[] => board.completedTasks.value)

// --- Layout ------------------------------------------------------------------

/**
 * Luft zum Wandrand links und rechts — **fest, nicht anteilig**.
 *
 * **Warum fest.** Der Rand existiert für den **Daumen**: ein Zettel ganz am
 * Rand muss noch zu greifen und zu ziehen sein. Ein Daumen wächst nicht mit
 * der Bildschirmbreite. Ein anteiliger Rand gibt ausgerechnet dort am
 * wenigsten, wo am wenigsten Platz ist — und kostet dort am meisten. Gemessen
 * (Ticket 14, QC): 5 % geben dem 412-px-Gerät 19,6 px und dem 360-px-Gerät
 * 17,0 px — praktisch dasselbe für den Daumen —, kosten das 360-px-Gerät aber
 * **+22,9 % Wandhöhe**, das 390-px-Gerät nur +3,6 % (Rand allein, siehe
 * nächsten Absatz). Ein Prozentsatz wurde deshalb verworfen; wer ihn wieder
 * einführt, dreht das Ergebnis um.
 *
 * **Was die 12 px kosten — und was der Packer kostet.** Ticket 14 hat zwei
 * Dinge zugleich geändert: diesen Rand (14a-0) und die Reservierung im Packer
 * (14a-1/14a-2, → `wallLayout.ts`). Beides schlägt auf die Wandhöhe durch, und
 * die beiden Anteile sind auseinanderzuhalten, sonst hält der nächste Leser
 * den Rand für teurer oder billiger, als er ist. Im Browser gemessen (QC zu
 * Ticket 14, identischer Bestand von 86 Zetteln, Ausgangswert 4847,63 px bei
 * 390 px Fensterbreite):
 *
 * | Fenster | Rand allein | Packer allein | **gesamt** |
 * |---|---|---|---|
 * | 390 px | +0,66 % | +1,86 % | **+2,53 %** (→ 4970,49) |
 * | 375 px | +5,77 % | +3,77 % | **+9,76 %** |
 * | 360 px | +17,47 % | +4,06 % | **+22,24 %** (5207,55 → 6365,82) |
 *
 * **Diese Zahlen stammen aus dem Browser, nicht aus der Node-Fuzz-Bank.** Die
 * Bank aus der Entwicklung von 14a-2 sagte für 390 px 5076,76 px (+4,47 %) —
 * rund 2,1 % daneben, weil sie mit den Breiten der Baseline rechnet, statt sie
 * neu zu planen. Für Vorher-Nachher-Vergleiche taugt sie, als Absolutwert
 * nicht. Wer die Tabelle fortschreibt, misst im Browser.
 *
 * **Die 12 sind ein Kompromiss, keine Herleitung** — eine runde Zahl zwischen
 * Greifbarkeit und Wandhöhe. Sie sind ausdrücklich **nicht** auf die
 * gemessene Klippe hin optimiert: bei `usableWidth ≈ 324` kostet ein einzelnes
 * Pixel +8,3 % Höhe (bei 360 px Fenster liegt sie zwischen Rand 7 und 8). Ein
 * knapp darunter geparkter Rand wäre scheinbar gratis und **bräche still**,
 * sobald sich ein Aufgabentitel ändert — die Klippe ist eine Eigenschaft des
 * heutigen Bestands, nicht des Codes.
 *
 * Bezugsgröße bleibt die Wand (`wall.clientWidth`), nie `window.innerWidth`.
 */
const EDGE = 12

/**
 * Zuschlag auf jede gemessene Breite.
 *
 * Zwischen der am Wurzelelement gemessenen Breite und der Breite, die der
 * Titel später tatsächlich zur Verfügung hat, liegt eine kleine, nicht
 * herleitbare Differenz: der Browser rundet die Auflösung von Rahmen und
 * Innenabstand sowie die Breite des Textlaufs unabhängig voneinander.
 *
 * **War bisher teilweise, aber nie vollständig, ein Ersatz für die fehlende
 * Zettel-Chrome.** Bevor `chromeWidth` (siehe `relayout`) Rahmen und
 * Innenabstand von `.zettel` selbst zu `natural`/`minimum` dazuzählte,
 * fehlten dort 18 px (2 px Rahmen + 7 px Polster, je Seite — `WallNote.vue`,
 * Regel `.zettel`). Diese 4 px deckten davon nur einen Teil; der Rest
 * (18 − 4 = 14 px) blieb Loch — sichtbar als der vom QC gemessene, über die
 * fußzeilengebundenen Zettel konstante Überstand von 14,72 px. Mit
 * `chromeWidth` ist dieses Loch eigenständig und exakt geschlossen; diese
 * Marge trägt jetzt wieder nur die Rolle aus ihrem Namen: den kleinen,
 * nicht herleitbaren Rundungsrest aus Rahmen-/Innenabstand-Auflösung und
 * Textlauf, nicht die Chrome selbst.
 *
 * Diese Marge ist deshalb **bemessen, nicht bewiesen**. Bei einem Zuschlag von
 * 1 px lag die geringste gemessene Restluft über 25 Zettel bei 0,50 px
 * („Keller entrümpeln"), danach 0,61 px und 0,96 px — es ist nie umgebrochen,
 * aber die nächste Änderung an Schriftgröße oder Innenabstand hätte darüber
 * entschieden. Mit 4 px lag derselbe Wert bei rund 3,5 px.
 *
 * **Nachgemessen mit `chromeWidth`:** bei den 15 Zetteln, die ihre volle
 * `natural`-Breite bekommen, liegt die Restluft gegen die bindende Größe bei
 * 4,00…4,86 px — diese 4 px plus der `Math.ceil`-Rest.
 *
 * Die übrigen 45 weichen in ZWEI Richtungen ab, nicht nur in einer: die einen
 * sind durch den 45-%-Deckel oder den Streifenfüller **absichtlich** schmaler
 * als einzeilig, die anderen umgekehrt BREITER als der Deckel, weil ihr
 * `minimum` ihn sticht — `defaultNoteWidth` kann nur anheben, nie unter
 * `natural` drücken. Wie viele auf jede Gruppe entfallen, ist nicht gezählt.
 *
 * Dieses `minimum` ist auch nicht mehr allein fußzeilengetrieben: seit
 * `cornerExtra` in der oberen Fassung mitzählt (Ticket 12, siehe `relayout`),
 * bindet bei 27 von 60 Zetteln `titleMinimum + cornerExtra`. Bei dreien wirkt
 * es bis in die gesetzte Breite durch — „QC-LANGTITEL: Fenster im
 * Wohnzimmer…" steht auf 163 statt 161 px, und 163 = ⌈99,5 + 41 + 18⌉ + 4 ist
 * eine reine Titelrechnung, in der die Fußzeile gar nicht vorkommt.
 *
 * Die Fußzeilen-Untergrenze selbst hält über **alle** 60 Zettel mit mindestens
 * 4,00 px Luft. 4 px ist damit die richtige Größenordnung, nicht nur eine
 * Vermutung.
 *
 * 15 und 45 sind keine Konstanten: sie gelten für `wall.clientWidth = 370`,
 * wo der 45-%-Deckel bei 161 px liegt. Bei anderer Wandbreite fällt die
 * Aufteilung anders aus.
 *
 * Die 3,5 px im Absatz davor sind **nicht dieselbe Größe**: sie stammen von
 * vor `chromeWidth` und messen den Platz, den der Titel tatsächlich hatte, in
 * einer Welt mit 14 px Loch. Nebeneinander gelesen sieht es aus, als sei die
 * Luft durch die Korrektur gewachsen — sie ist zum ersten Mal die Größe, die
 * die Formel vorsieht.
 *
 * Die frühere Doppelrolle ist rückwirkend bestätigt, nicht nur plausibel:
 * 18 (Chrome) − 4 (diese Marge) = 14, nahe an den vorher gemessenen 14,72 px
 * Überstand; die 0,72 sind der `Math.ceil`-Rest.
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
 * Die gemerkten Oberkanten der aufgeklappten Zettel (Ticket 13): der aufgeklappte
 * Zettel bleibt liegen, wo er lag, und die anderen weichen ihm aus.
 *
 * `packWall` ist zustandslos und kennt kein „vorher"; das „vorher" steht hier.
 * Eingetragen wird die y-Koordinate, die der Zettel **unmittelbar vor dem
 * Antippen** hatte (`lastPositions`), verworfen wird beim Zuklappen — und beim
 * Verschwinden von der Wand, zusammen mit `expandedIds`.
 *
 * **Die Reihenfolge ist Teil des Zustands.** Eine `Map` behält ihre
 * Einfügereihenfolge; der letzte Eintrag ist der zuletzt angetippte Zettel, und
 * genau der gewinnt, wenn sich zwei Vorgaben nicht gleichzeitig einhalten lassen
 * (→ `resolvePins` in `wallLayout.ts`). Ein `Set`/`Map` wird beim erneuten
 * Antippen deshalb erst gelöscht und dann neu gesetzt — sonst bliebe der Zettel
 * auf seinem alten Platz in der Reihenfolge stehen.
 *
 * Bewusst **nicht** reaktiv: gelesen wird das ausschließlich in `relayout`, und
 * jede Änderung daran zieht ohnehin selbst ein `relayout` nach sich. Ein `ref`
 * würde hier nur eine Abhängigkeit vortäuschen, die es nicht gibt.
 */
const pinnedTops = new Map<string, number>()

/**
 * Zettel, deren Punktwert oben rechts statt in der Fußzeile steht
 * (Karten-Redesign, Ticket 00a, Handoff Punkt 6 — ursprünglich „Punktwert
 * UND Rückstand"; der Rückstandstext ist seither entfernt, siehe `urgency`
 * im Skript von `WallNote.vue`, die Fußzeile ist dadurch etwas schmaler
 * geworden). Die Entscheidung fällt während der Messung in `relayout` — nur
 * dort sind Titel- und Fußzeilenbreite bekannt —, wird aber HIER als
 * Vue-Zustand festgehalten und über das `meta-top`-Prop an `WallNote`
 * gereicht.
 *
 * **`relayout` fasst diese Klasse an KEINER Stelle mehr per `classList` an
 * — weder setzend noch entfernend.** Ein Blocker-Befund des QC zeigte, dass
 * schon das ENTFERNEN allein genügt, um sie dauerhaft zu verlieren: Vue
 * vergleicht bei jedem Patch nur seinen eigenen zuletzt berechneten
 * Klassen-String gegen den neu berechneten, sieht dort keine Änderung (die
 * Entscheidung blieb ja gleich) und schreibt `className` gar nicht neu — die
 * extern entfernte Klasse kommt dann NIE zurück, außer eine völlig
 * UNABHÄNGIGE Bindungsänderung am selben Element patcht zufällig die ganze
 * Klassenliste neu. Einzige Quelle ist deshalb ausschließlich dieses Set
 * über das `meta-top`-Prop — siehe die Messung in `relayout` für die Technik,
 * mit der die nötige Breite OHNE DOM-Mutation ermittelt wird.
 */
const metaTopIds = ref(new Set<string>())

/**
 * Der Zettel, der gerade **unter einer Geste des Fingers steht** — und deshalb
 * von der Animation ausgenommen ist.
 *
 * Das sind zwei Gesten: das Ziehen am Eselsohr (Abreißen, Ticket 09) und das
 * lange Drücken mit den vier Richtungen (Ticket 10). Der Name sagt bewusst
 * nicht „tearing": er hieß einmal so, und das war falsch, sobald die zweite
 * Geste dazukam.
 *
 * **Ein Zustand für beide, und die Bedingung dafür:** die Gesten schließen sich
 * gegenseitig aus. Der Long-Press startet nicht auf dem Eselsohr (→
 * `isPressControl` im Zettel), und in keiner der beiden kommt ein zweiter
 * Finger durch. Genau deshalb kann hier höchstens eine ID stehen. Fällt diese
 * Bedingung — etwa wenn eine dritte Geste dazukommt, die überall startet —,
 * fällt die Konstruktion und es braucht einen Zustand je Geste.
 *
 * Warum überhaupt: beim Neupacken schreibt die FLIP-Animation `transform`, und
 * genau das schreibt auch die Zieh-Geste; der Richtungskranz wiederum liegt in
 * Fensterkoordinaten fest. Ohne diese Ausnahme flöge der Zettel unter dem
 * Finger davon, wenn währenddessen ein anderes Mitglied etwas ändert. Seine
 * neue **Position** (`left`/`top`) bekommt er trotzdem — die Wand bleibt
 * korrekt gepackt, der Zettel springt nur dorthin, statt zu fliegen.
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
 * rechnen, Positionen schreiben. Muss nach jedem Datenwechsel, nach dem Laden
 * der Schrift und nach jeder Breitenänderung laufen — sonst stünden die Zettel
 * auf Maßen, die nicht mehr gelten.
 *
 * Der Reihenfolge nach: erst wird **jeder** Zettel gemessen, dann werden **alle**
 * Breiten geplant, dann werden sie gesetzt. Ein Zettel kann seine Breite nicht
 * allein bestimmen, weil sie davon abhängt, was neben ihn passt — deshalb die
 * getrennten Durchläufe statt einer Schleife.
 *
 * **Kosten.** Ein vollständiger Lauf über 23 Zettel wurde vom QC mit 8,1–19,2 ms
 * gemessen, davon 5,5–13,0 ms allein in Schritt 1. Das ist fast vollständig
 * DOM-Messung: jeder Zettel erzwingt dort zwei Layouts (`max-content` und
 * `min-content`). Die Rechnung selbst — `planNoteWidths` plus `packWall` — liegt
 * bei rund 0,05 ms und ist damit belanglos. Wer diese Zahlen zitiert, muss
 * dazusagen, welche von beiden gemeint ist; die Messung skaliert linear mit der
 * Zahl der Zettel und liegt bereits in der Größenordnung eines Frames.
 *
 * Die Zahlen stammen von VOR dem Karten-Redesign (Ticket 00a): Schritt 1 misst
 * seither pro Zettel zusätzlich `.foot` und `.title` einzeln (für
 * `zettel--meta-top`, siehe dort) — zwei weitere erzwungene Layouts. Neu
 * gemessen ist das nicht; erwartbar ist ein spürbarer, aber kein
 * größenordnungsmäßiger Aufschlag auf Schritt 1.
 *
 * **`tappedId`** ist der angetippte Zettel beim Auf- und Zuklappen. Er steht
 * still — beim Aufklappen, weil seine gemerkte Oberkante als Vorgabe in
 * `packWall` geht (→ `pinnedTops`), beim Zuklappen, weil er ohne Vorgabe
 * wieder dort landet, wo er als schmaler Zettel schon vorher lag. Gebraucht
 * wird die Kennung hier nur noch, um ihn von der Flug-Animation auszunehmen.
 */
const relayout = (animate: boolean, tappedId?: string) => {
  const wall = wallEl.value
  if (!wall) return

  // `EDGE` steht hier und beim Setzen von `left` (`note.x + EDGE`) — es muss
  // an beiden Stellen derselbe Wert sein, und deshalb ist es eine Konstante
  // und keine Rechnung: `packWall` klemmt jeden Zettel intern auf
  // `[0, usableWidth − Breite]`, die rechte Wandkante steht also bei
  // `EDGE + usableWidth`. Wer den Rand hier aus der Wandbreite rechnet und
  // dort auch nur um 1 px anders rundet, lässt genau den Zettel, der an der
  // Klemmung hängt, über die Kante ragen — ohne dass irgendetwas darauf
  // aufmerksam macht.
  const usableWidth = wall.clientWidth - 2 * EDGE
  if (usableWidth <= 0) return

  const before = new Map(lastPositions)

  // Gruppenzuordnung je Zettel (0 = fällig, 1 = täglich, 2 = Projekt) — steuert
  // die freie Packreihenfolge und die weiche Gruppengrenze in `packWall`. Die
  // drei Listen aus dem Composable sind bereits genau diese drei Gruppen; hier
  // wird nur zurück auf die `task_id` gemappt, weil `packWall` keine Task-
  // Objekte kennt.
  const taskGroups = new Map<string, number>()
  board.pendingTasks.value.forEach(task => taskGroups.set(task.task_id, 0))
  board.dailyTasks.value.forEach(task => taskGroups.set(task.task_id, 1))
  board.projectTasks.value.forEach(task => taskGroups.set(task.task_id, 2))

  // Schritt 1 — messen, was jeder Zettel an Breite braucht.
  //
  // Gemessen wird mit `getBoundingClientRect()`, NICHT mit `offsetWidth`.
  // `offsetWidth` ist eine ganze Zahl und rundet ab: bei einer echten
  // Textbreite von 123,4 px liefert es 123, wir setzen 123 als feste Breite
  // — und der Titel passt um 0,4 px nicht mehr in seine Zeile und bricht um.
  // Das trifft im Mittel jeden zweiten Titel und sieht wie ein Zufall aus.
  // `getBoundingClientRect().width` liefert die Nachkommastellen; danach
  // wird aufgerundet und `MEASURE_SAFETY` addiert. Was das garantiert, steht
  // dort — kurz: die Marge ist bemessen, nicht bewiesen, und geht nach oben.
  //
  // Zwei Werte je Zettel:
  // - `max-content` (Titel per Klasse einzeilig gestellt) = natürliche Breite,
  // - `min-content` = die Breite, unter der ein Wort abgeschnitten würde.
  //
  // Die Untergrenze wird gemessen und nicht am Text abgelesen: `min-content`
  // kennt die tatsächlichen Umbruchstellen des Browsers, eine Suche nach
  // Leerzeichen im Titel nur die vermuteten. Wo beide Werte gleich sind, hat
  // der Titel keine Umbruchstelle — genau die Zettel bleiben vom zweiten Lauf
  // ausgenommen.
  const shapes: WallNoteShape[] = []
  const nextMetaTopIds = new Set<string>()
  const elements = new Map<string, HTMLElement>()
  const lineHeights = new Map<string, number>()

  for (const task of wallTasks.value) {
    const el = noteEls.get(task.task_id)
    if (!el) continue

    // Aufgeklappt heißt: volle Wandbreite, ohne Messung.
    //
    // Ein aufgeklappter Zettel darf hier NICHT durch die Messung laufen. Bei
    // `width: max-content` misst sie nicht mehr den Titel, sondern die Reihe
    // der Zettelchen daneben — ein Vielfaches der Wandbreite, aus dem der
    // Planer dann eine Breite ableiten würde, die der Zettel nie haben soll.
    //
    // `natural = minimum = usableWidth` ist die Form, die dem Planer genau das
    // sagt, was gilt: der Zettel ist so breit wie die Wand und lässt sich nicht
    // verschmälern (`minimum` = `natural`, also keine Umbruchstelle). Er belegt
    // damit von selbst eine Reihe allein.
    if (expandedIds.value.has(task.task_id)) {
      el.style.width = `${usableWidth}px`
      shapes.push({ id: task.task_id, natural: usableWidth, minimum: usableWidth })
      elements.set(task.task_id, el)
      lineHeights.set(task.task_id, 0)
      // Die bisherige Entscheidung über den Punktwert oben rechts wird
      // MITGENOMMEN, obwohl dieser Zettel nicht gemessen wird (Ticket 13).
      //
      // Ohne diese Zeile fiel er aus `nextMetaTopIds` heraus und verlor die
      // Klasse `zettel--meta-top`, solange er offen war — der Sticker sprang
      // sichtbar von der Ecke in die Fußzeile und beim Zuklappen zurück. Der
      // Schaden war aber nicht nur kosmetisch: `zettel--meta-top` verengt den
      // Titelkasten um die Ecke (`cornerExtra`, 41…46 px), der Titel braucht
      // damit unter Umständen eine Zeile mehr. Beim Zuklappen wird die Klasse
      // in DIESEM Lauf zwar neu entschieden, sie erreicht das DOM aber erst
      // im nächsten Tick — Schritt 4 misst dann noch die Höhe der ALTEN
      // Fassung und `packWall` packt die Wand auf eine Höhe, die es gleich
      // nicht mehr gibt (gemessen: bis zu ±18 px, eine Titelzeile, bei 21 von
      // 83 Zetteln). Die Wand pendelte dadurch je nach zuletzt aufgeklapptem
      // Zettel zwischen zwei Packungen — dieselbe Eingabe, zwei Ergebnisse.
      // Der Prüfschritt „Zuklappen stellt die Wandhöhe exakt wieder her"
      // scheiterte schon daran.
      if (metaTopIds.value.has(task.task_id)) nextMetaTopIds.add(task.task_id)
      continue
    }

    el.classList.add('zettel--measuring', 'zettel--single-line')
    el.style.maxWidth = 'none'

    const titleEl = el.querySelector<HTMLElement>('.title')
    const footEl = el.querySelector<HTMLElement>('.foot')

    // Waagerechte Zettel-CHROME: `titleWidth`/`correctedFootWidth` (unten)
    // sind Content-Box-Breiten von `.title`/`.foot`, den KINDERN von
    // `.zettel`. Gesetzt wird später aber die Border-Box-Breite von `.zettel`
    // SELBST (`box-sizing: border-box`, `base.css` Universalregel) — Rahmen
    // und Innenabstand von `.zettel` liegen AUSSERHALB dieser Kindbreiten und
    // müssen extra dazugerechnet werden, sonst schneidet die gesetzte Breite
    // die Fußzeile ab (QC-Befund).
    //
    // Aus `WallNote.vue`, Regel `.zettel`: `border: 2px solid transparent`
    // plus `padding: 5px 7px 0 7px` — links und rechts also je 2 px Rahmen +
    // 7 px Polster. Gilt unverändert für alle drei Zetteltypen: weder
    // `.zettel--daily` noch `.zettel--project` überschreiben Rahmenbreite
    // oder linkes/rechtes Polster, nur `padding-top` (siehe Kommentar bei
    // `.zettel--project`, „Keine eigene border-width mehr").
    //
    // Gemessen statt fest verdrahtet: `getComputedStyle` liefert, was am
    // Element tatsächlich gilt, eine Konstante hier würde bei einer
    // künftigen Änderung an Rahmen oder Polster still auseinanderlaufen —
    // genau die Fehlerklasse, die dieser Fix beseitigt. Der Mehrpreis ist
    // ein `getComputedStyle`-Aufruf je Zettel, im selben Messlauf, der
    // ohnehin mehrere `getBoundingClientRect`-Aufrufe je Zettel macht.
    const zettelStyle = getComputedStyle(el)
    const chromeWidth =
      parseFloat(zettelStyle.borderLeftWidth) +
      parseFloat(zettelStyle.borderRightWidth) +
      parseFloat(zettelStyle.paddingLeft) +
      parseFloat(zettelStyle.paddingRight)

    // --- Punktwert oben rechts? (Karten-Redesign, Ticket 00a, Handoff
    // Punkt 6) ----------------------------------------------------------
    //
    // Der Sticker wandert nach oben, wenn der Zettel DADURCH schmaler wird.
    // Nicht schon dann, wenn die Fußzeile breiter als der Titel ist: oben
    // kostet er `cornerExtra` (er verengt den Titelkasten, siehe dort), unten
    // kostet er `pointsWidth` plus `gap`. Verglichen werden deshalb die beiden
    // Breiten, die der Zettel wirklich BEKÄME — und zwar die geplanten, nicht
    // die gewünschten (siehe `defaultNoteWidth` unten). Titel UND Fußzeile
    // stehen für die Messung auf `max-content` (Regeln dazu in `WallNote.vue`,
    // `.zettel--measuring .title`/`.foot`).
    //
    // **`zettel--meta-top` gehört AUSSCHLIESSLICH Vue** (Prop `metaTop`,
    // siehe `metaTopIds` oben und `WallNote.vue`). Weder `add`/`toggle` NOCH
    // `remove` dürfen diese Klasse hier anfassen — auch das Entfernen nicht,
    // so wie es vorher hier stand. QC-Befund: Vue vergleicht bei jedem Patch
    // nur den von IHM zuletzt berechneten Klassen-String mit dem NEUEN
    // berechneten; eine extern (per `classList`) veränderte Klasse fällt aus
    // diesem Vergleich komplett heraus. Blieb die Entscheidung über zwei
    // Läufe gleich (der Normalfall — nichts an DIESEM Zettel hat sich
    // geändert), hielt Vue seinen Klassen-String für unverändert und schrieb
    // `className` gar nicht neu — die extern entfernte Klasse kam NIE
    // zurück. Nur eine völlig UNABHÄNGIGE Bindungsänderung am selben Element
    // (z. B. `zettel--tear-ready` beim Abreißen) brachte sie zufällig wieder
    // mit, weil Vue dabei den GANZEN Klassen-String neu schreibt.
    //
    // Die Breite, die die Fußzeile MIT Punkte-Sticker hätte, wird deshalb aus
    // dem GERADE gerenderten Zustand REKONSTRUIERT statt am DOM erzwungen:
    // `wasMetaTop` sagt, ob der Sticker aktuell in der Ecke sitzt (dann fehlt
    // er der Fußzeile und wird rechnerisch wieder dazugezählt) oder schon in
    // der Fußzeile steht (dann ist nichts zu tun). Gemessen wird der Sticker
    // an der Stelle, an der er GERADE TATSÄCHLICH im DOM steht — Ecke oder
    // Fußzeile —, weil `.points--sN` an beiden Orten dieselbe Größe vorgibt.
    const wasMetaTop = metaTopIds.value.has(task.task_id)
    el.style.width = 'max-content'
    const footWidthCurrent = footEl?.getBoundingClientRect().width ?? 0
    const titleWidth = titleEl?.getBoundingClientRect().width ?? 0
    const visiblePointsEl = wasMetaTop
      ? el.querySelector<HTMLElement>('.corner .points')
      : el.querySelector<HTMLElement>('.foot > .points')

    // Der Sticker klebt SCHIEF (`.points { transform: rotate(-6deg) }`, der
    // Stern `-10deg`). `getBoundingClientRect()` liefert das Rechteck NACH der
    // Transformation, also den gedrehten Umriss — für das Layout zählt aber
    // die ungedrehte Breite: eine Drehung verschiebt nichts im Fluss. QC
    // gemessen: 37,37 statt 34,00 px, beim Stern 45,29 statt 39,09 px. Die
    // Differenz ginge in `cornerExtra` UND in `footWidthFull` ein und machte
    // jeden Zettel mit Sticker oben rund 3 px zu breit.
    //
    // Die Neigung wird für den Moment der Messung per Inline-Style
    // abgeschaltet und danach zurückgenommen (`''`, denn im Ruhezustand steht
    // dort nichts) — dasselbe Muster wie bei `.title` und `min-content` unten.
    // `offsetWidth` wäre der falsche Ausweg: es rundet auf ganze Zahlen ab,
    // wogegen der Kommentar am Kopf dieses Messblocks steht. Und
    // `zettel--measuring` hilft hier nicht: dessen `transform: none` gilt für
    // den ZETTEL, nicht für den Sticker.
    if (visiblePointsEl) visiblePointsEl.style.transform = 'none'
    const pointsWidth = visiblePointsEl?.getBoundingClientRect().width ?? 0
    if (visiblePointsEl) visiblePointsEl.style.transform = ''

    // Ob die Fußzeile außer dem Punktwert noch etwas trägt (Unteraufgaben-
    // Zeichen, Stempel) — entscheidet, ob beim Herausrechnen des Punktwerts
    // ein Flex-`gap` mitzählt: ein `gap` entsteht nur ZWISCHEN Geschwistern,
    // bei einem einzelnen Kind gibt es keinen.
    const hasOtherFootContent = !!el.querySelector('.subs-badge, .due-stamp')
    const footGap = hasOtherFootContent ? 6 : 0 // `.foot { gap: 6px }`
    const footWidthFull = wasMetaTop ? footWidthCurrent + pointsWidth + footGap : footWidthCurrent
    const footWidthWithoutPoints = wasMetaTop
      ? footWidthCurrent
      : Math.max(0, footWidthCurrent - pointsWidth - footGap)

    // Die Breite, unter der ein Wort abgeschnitten würde — `.title` SELBST auf
    // `min-content` gestellt (nicht der ganze Zettel, dessen Breite von der
    // jetzt Vue-exklusiven `zettel--meta-top`-Klasse mitbestimmt würde).
    // Steht HIER und nicht mehr hinter der Entscheidung, weil die Entscheidung
    // sie inzwischen braucht: `defaultNoteWidth` klemmt nach unten gegen
    // `minimum`, und `minimum` hängt an dieser Messung.
    el.classList.remove('zettel--single-line')
    if (titleEl) titleEl.style.width = 'min-content'
    const titleMinimum = titleEl?.getBoundingClientRect().width ?? titleWidth
    if (titleEl) titleEl.style.width = ''

    // Was der Sticker OBEN kostet.
    //
    // Der Anlass (Ticket 12): ohne diesen Zuschlag setzten **21 von 60**
    // Zetteln ihren Titel mehrzeilig, obwohl sie ihre volle natürliche Breite
    // hatten — die Messung beschrieb einen Titel, den es so nie gab. Mit ihm
    // sind es 0 von 60. An dieser Spanne merkt der Nächste, ob die Korrektur
    // noch trägt.
    //
    // `.corner` ist in `WallNote.vue` ein `float: right` in `.head`
    // (`display: flow-root`) — der Titel steht aber NICHT „um ihn herum": weil
    // `.title` mit `overflow: hidden` einen eigenen Block-Formatierungskontext
    // öffnet, darf sein Kasten den Float-Margin-Kasten nicht überlappen. Der
    // Titel wird deshalb über seine GANZE Höhe schmaler, nicht nur in der
    // ersten Zeile — der Text steht in einer verengten Spalte neben dem
    // Sticker, jede Zeile gleich kurz. QC-Beleg: `head.clientWidth −
    // title.clientWidth` ist bei jedem `metaTop`-Zettel die Breite dieser Ecke
    // und bei allen anderen 0 — gemessen 41 bei 36 Zetteln und 46 bei zweien.
    //
    // Die Ecke ist also NICHT über alle Zettel gleich breit: die beiden
    // Ausreißer sind die Fünf-Punkte-Sterne, die `.points--s5` auf 39,1 statt
    // 34 px verbreitert. Wer hier mit einer festen 41 rechnet, rechnet für
    // jeden Stern falsch.
    //
    // Die beiden Zahlen sind ganzzahlig, weil `clientWidth` es ist — der
    // Zähler zeigt den gerundeten Wert, nicht den gerechneten. `cornerExtra`
    // selbst ergibt 41,000 bzw. 46,094 px; die fehlenden 0,094 px des Sterns
    // sind keine Abweichung, sondern die Auflösung des Messwerkzeugs.
    //
    // Verengt wird um die Sticker-Breite plus dessen waagerechte Ränder
    // (`.corner { margin: -1px 0 2px 7px }`: links 7 px, rechts 0).
    //
    // Gemessen, nicht verdrahtet — dieselbe Begründung wie bei `chromeWidth`:
    // eine Konstante `41` liefe bei der nächsten Änderung an Sticker-Größe
    // oder Rand still auseinander, und sie stimmte ohnehin nur für vier der
    // fünf Sticker-Formen (der Stern ist breiter, `.points--s5`).
    //
    // `getComputedStyle` für die Ränder und NICHT `getBoundingClientRect`:
    // ohne `zettel--meta-top` ist `.corner` `display: none` und liefert ein
    // Rechteck der Breite 0. Ein Rand in px ist dagegen ohne Layout auflösbar
    // und kommt auch bei `display: none` richtig heraus. Kurz einschalten
    // wäre keine Alternative — die Klasse gehört ausschließlich Vue (siehe
    // oben).
    const cornerEl = el.querySelector<HTMLElement>('.corner')
    const cornerStyle = cornerEl ? getComputedStyle(cornerEl) : null
    const cornerMargins = cornerStyle
      ? parseFloat(cornerStyle.marginLeft) + parseFloat(cornerStyle.marginRight)
      : NaN
    // Zwei Ausfälle, beide nur erreichbar, wenn `WallNote` sein Markup
    // ändert — der Vollständigkeit halber, nicht weil sie vorkommen:
    // - Ohne `.corner` im DOM (oder mit Rändern, die nicht als Zahl
    //   herauskommen) ist `cornerExtra` 0. Der Sticker oben kostet dann
    //   rechnerisch nichts, und es entscheidet wieder allein die Fußzeile —
    //   also die zu großzügige Rechnung von VOR diesem Ticket, kein sicherer
    //   Wert.
    // - Findet sich kein sichtbarer Sticker, ist `pointsWidth` 0 und
    //   `cornerExtra` gleich dem Rand allein (7 px). Der Zettel wird oben
    //   dann nie schmaler als unten, `metaTop` ist immer `false` — der
    //   Punktwert bliebe dauerhaft in der Fußzeile.
    const cornerExtra = Number.isFinite(cornerMargins) ? pointsWidth + cornerMargins : 0

    // Die beiden Fassungen des Zettels, zwischen denen die Entscheidung wählt.
    // Jede rechnet mit IHRER Fußzeile — die eine ohne Punktwert (der steht
    // dann oben), die andere mit. Dass `natural`/`minimum` zur GERADE
    // getroffenen Entscheidung passen und nicht zur vorigen (`wasMetaTop`),
    // ist damit strukturell erledigt: unten wird eine der beiden Fassungen
    // GANZ übernommen, es gibt keine dritte Rechnung mehr, die auseinander
    // laufen könnte.
    //
    // Beide Fassungen enthalten:
    // - `natural`: der Titel einzeilig, mindestens so breit wie die Fußzeile
    //   es verlangt;
    // - `minimum`: derselbe Boden, aber der Titel darf an Wortgrenzen
    //   umbrechen;
    // - `chromeWidth`: Rahmen und Innenabstand von `.zettel` selbst (siehe
    //   oben) — ohne sie fehlt der gesetzten Border-Box-Breite genau der Rand,
    //   den Rahmen und Innenabstand brauchen;
    // - `MEASURE_SAFETY`: die Rundungsmarge, Begründung dort.
    //
    // `cornerExtra` zählt in der oberen Fassung zu BEIDEN Titelmaßen. Auch zu
    // `minimum`: der Titelkasten ist über seine ganze Höhe um `cornerExtra`
    // verengt (siehe oben), das längste Wort muss also in die VERENGTE Spalte
    // passen — sonst schneidet `text-overflow: ellipsis` es still ab, obwohl
    // `minimum` genau für dieses Wort berechnet war. QC-Negativkontrolle mit
    // ersetztem Titeltext: ohne diesen Zuschlag werden 14, 23 und 35 px
    // abgeschnitten, mit ihm 0.
    //
    // **Gratis ist die Zusage nicht**, auch wenn sie meist folgenlos bleibt:
    // der Zuschlag hebt `minimum` der oberen Fassung bei 27 von 60 Zetteln um
    // 3…47 px, ändert dadurch bei 9 die geplante Breite, und 3 davon stehen am
    // Ende wirklich mit Sticker oben und sind breiter als ohne ihn (161 → 163,
    // 161 → 179, 220 → 223 px, live gemessen). Die ENTSCHEIDUNG `metaTop`
    // kippt dabei bei keinem einzigen Zettel. Wer sich später fragt, warum
    // drei Zettel breiter sind als ihr Titel verlangt: das ist der Preis
    // dafür, dass kein Wort still abgeschnitten wird.
    const shapeWithMetaTop: WallNoteShape = {
      id: task.task_id,
      natural:
        Math.ceil(Math.max(titleWidth + cornerExtra, footWidthWithoutPoints) + chromeWidth) +
        MEASURE_SAFETY,
      minimum:
        Math.ceil(Math.max(titleMinimum + cornerExtra, footWidthWithoutPoints) + chromeWidth) +
        MEASURE_SAFETY
    }
    const shapeWithMetaFoot: WallNoteShape = {
      id: task.task_id,
      natural: Math.ceil(Math.max(titleWidth, footWidthFull) + chromeWidth) + MEASURE_SAFETY,
      minimum: Math.ceil(Math.max(titleMinimum, footWidthFull) + chromeWidth) + MEASURE_SAFETY
    }

    // Entschieden wird gegen die Breite, die TATSÄCHLICH herauskommt — nicht
    // gegen die gewünschte. Der Unterschied ist der 45-%-Deckel: übersteigen
    // beide Fassungen ihn, sind sie in Wahrheit gleich breit, und dann ist der
    // Sticker oben die schlechtere Wahl, weil er dem Titel bei identischer
    // Zettelbreite `cornerExtra` je Zeile wegnimmt, ohne dass der Zettel dafür
    // schmaler würde. Ein QC hat genau das gemessen: mit der gewünschten
    // Breite als Maßstab wurden 13 Zettel um 13…20 px breiter, ohne eine Zeile
    // zu gewinnen — die Wand wuchs dadurch um 13,4 % in der Höhe, obwohl die
    // Zettel zusammen 5 % niedriger waren.
    //
    // Das ist ein Beleg, keine Zusage: die Regel minimiert die Breite des
    // EINZELNEN Zettels und schaut nie auf die Wandhöhe — auch nicht auf die
    // Höhe des Zettels selbst. Ein schmaler Zettel ist ein hoher Zettel: acht
    // Zettel sind seit dieser Runde sechs- oder siebenzeilig (vorher einer).
    // Vom Nutzer gesehen und so entschieden — die Wand ist unterm Strich
    // kürzer (3548,12 gegen 3596,72 gemessen). Wer hier später Höhe
    // optimieren will, baut eine andere Regel, nicht diese um.
    //
    // Benutzt wird die ECHTE Regel aus `wallLayout.ts` statt einer Kopie des
    // Deckels an dieser Stelle. Eine zweite Fassung derselben Entscheidung ist
    // genau die Fehlerklasse, um die es hier geht.
    //
    // Bei Gleichstand bleibt der Sticker UNTEN: `<`, nicht `<=`. Beide Werte
    // sind ganze Pixel, der Umzug muss also mindestens 1 px echt einsparen.
    // Dass die Fußzeile dabei nie abgeschnitten wird, garantiert `minimum` —
    // `defaultNoteWidth` klemmt nach unten nie darunter.
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

  // Die frisch getroffene `metaTop`-Entscheidung wird VORWÄRTS ans DOM
  // übergeben, bevor irgendeine Höhe gemessen wird (Ticket 19 — die
  // Resize-Hälfte des Mechanismus aus Ticket 13).
  //
  // Das Set unten erreicht das DOM als Klasse `zettel--meta-top` erst im
  // NÄCHSTEN Tick; Schritt 3 (Zeilen zählen) und Schritt 4 (Höhen messen)
  // laufen aber noch in DIESEM. Für jeden Zettel, dessen Entscheidung gerade
  // gekippt ist, beschrieben beide Schritte damit die ALTE Fassung: nach einer
  // Breitenänderung kippten 20 von 86 Zetteln, 16 Höhen änderten sich NACH dem
  // Packlauf um bis zu +53 px, und `packed.height` blieb rund 300 px unter dem
  // konvergierten Wert — sichtbar, weil diese Zahl als Inline-Höhe am
  // Wand-Element steht. Der Resize-Wächter (`width === lastWidth`) lässt
  // bewusst nur EINEN Lauf zu, es gab also nichts, das das später heilte.
  //
  // Die Klasse selbst darf hier NICHT gesetzt werden — sie gehört
  // ausschließlich Vue (Begründung oben im Messblock). Sie schaltet aber nur
  // `display` an zwei ohnehin vorhandenen Knoten um (`WallNote.vue`:
  // `.zettel--meta-top .corner { display: flex }`, `.zettel--meta-top .foot >
  // .points { display: none }`). Genau diese Wirkung wird deshalb als
  // Inline-`display` vorweggenommen: das DOM zeigt die NEUE Fassung sofort,
  // die Messungen treffen sie, und wenn Vue im nächsten Tick die Klasse
  // schreibt, ändert sich an der Darstellung nichts mehr.
  //
  // Aufgeräumt wird per `nextTick`, NACH Vues DOM-Update: dann sagt die Klasse
  // dasselbe wie der Inline-Stil, und der Stil muss weg, weil er sonst jede
  // SPÄTERE Klassenänderung überstimmen würde (Inline schlägt Stylesheet).
  // Sofortiges Zurücknehmen nach der Messung wäre falsch: bis zum Klassen-
  // Update stünde wieder die alte Fassung im DOM, und genau das — Höhen, die
  // sich nach dem Packlauf noch ändern — ist der Fehler dieses Tickets.
  //
  // Der Lade-Pfad bleibt davon unberührt, sobald er konvergiert ist (dort
  // kippt keine Entscheidung, die Schleife unten findet nichts); im expanded-
  // Zweig kippt nie etwas, weil die Entscheidung dort mitgenommen wird
  // (Ticket 13).
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
  //
  // Ob eine geplante Verschmälerung den Zettel zu hoch macht, lässt sich nur
  // messen: wie viele Zeilen ein Titel bei einer Breite braucht, weiß der
  // Umbruch-Algorithmus des Browsers, keine Formel.
  //
  // **Bezugsgröße der Grenze ist `fallback`** — die Breite, die dieser Zettel
  // ohne den zweiten Packlauf bekäme, also die bereits bei `MAX_WIDTH_RATIO`
  // gedeckelte. NICHT die natürliche, einzeilige Breite. Gemessen wird also
  // „eine Zeile mehr, als dieser Zettel ohnehin gehabt hätte"; ein Zettel, der
  // schon gedeckelt zweizeilig ist, darf dreizeilig werden. Das ist Absicht:
  // der Deckel ist der Bestand, gegen den dieses Ticket antritt.
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

  // Zurücknehmen — auf `fallback`, also auf den Stand ohne zweiten Packlauf.
  //
  // Vorher gab es hier eine Kette „Paar zurücknehmen, wenn zu hoch": die
  // Paar-Erzwingung in `planNoteWidths` konnte zwei Zettel gemeinsam
  // verschmälern, und wer davon zu hoch wurde, musste den Partner mitverwerfen
  // (sonst stünde die andere Hälfte schmal UND ohne Gegenwert allein). Die
  // Paar-Erzwingung ist entfallen (Ticket 02) — übrig bleibt nur noch der
  // Streifen-Füller, der Zettel einzeln verschmälert, also braucht es keine
  // Partner-Rücknahme mehr.
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
      group: taskGroups.get(shape.id) ?? 0,
      // Wo dieser Zettel im vorigen Lauf stand. `packWall` braucht das nur,
      // solange eine Vorgabe im Spiel ist: wer vorher unter oder neben dem
      // vorgegebenen Zettel lag, darf danach nicht darüber stehen. Beim ersten
      // Lauf ist die Karte leer — dann gibt es auch keine Vorgabe.
      previousTop: before.get(shape.id)?.y
    })
  }

  // Vorgaben für die aufgeklappten Zettel, in Antipp-Reihenfolge (Ticket 13).
  // Gefiltert auf das, was gerade wirklich an der Wand hängt — eine Vorgabe für
  // einen Zettel, den `packWall` gar nicht bekommt, wäre nur ein stiller
  // Konfliktpartner für die übrigen.
  const onWall = new Set(metrics.map(note => note.id))
  const pins = [...pinnedTops]
    .filter(([id]) => onWall.has(id))
    .map(([id, top]) => ({ id, top }))

  const packed = packWall(metrics, usableWidth, pins)
  wallHeight.value = packed.height

  lastPositions.clear()
  const moved: Array<{ el: HTMLElement; id: string; dx: number; dy: number; z: number }> = []

  for (const note of packed.notes) {
    const el = noteEls.get(note.id)
    if (!el) continue
    // Derselbe `EDGE` wie oben bei `usableWidth` — siehe die Begründung dort.
    const x = note.x + EDGE
    const y = note.y
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.zIndex = String(note.z)
    lastPositions.set(note.id, { x, y })

    // Der angetippte Zettel wird NICHT animiert.
    //
    // Aufklappen ist eine Aussage über genau diesen Zettel. Rutscht er dabei
    // selbst sichtbar weg, ist der Bezugspunkt der Handlung verloren: die
    // Bewegung der anderen Zettel liest sich als „die Wand ordnet sich um mich
    // herum" — richtig —, die eigene Bewegung als „ich habe danebengetippt" —
    // falsch. Die Anheft-Bewegung der Spec gilt den ANDEREN Zetteln.
    //
    // Seit Ticket 13 steht er ohnehin still (seine Oberkante ist Vorgabe, →
    // `pinnedTops`); das Auslassen hier bleibt trotzdem: die eine Ausnahme, in
    // der er doch wandert — zwei Vorgaben, die sich nicht vertragen —, ist
    // gerade die, in der eine Flugbahn am meisten verwirrte.
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

  // Hier stand bis Ticket 13 die **Scroll-Nachführung**: sie merkte sich die
  // Bildschirmposition des angetippten Zettels, schrieb die neue Wandhöhe vorab
  // ans Element (damit ein Bildlauf nach unten nicht am alten Seitenende
  // abschnitt) und zog den Bildlauf um die Wanderstrecke des Zettels nach. Sie
  // ist ersatzlos entfallen: sie existierte nur, um einen wandernden Zettel im
  // Blick zu halten. Er wandert nicht mehr — und der Bildlauf einer Seite ist
  // das, was der Nutzer eingestellt hat, nicht das, was die Wand für richtig
  // hält. Gemessen wurde vor dem Umbau ein Nachzug von bis zu 906 px pro
  // Aufklappen; nach oben war er bei `scrollY = 0` abgeschnitten, sodass der
  // Zettel dann doch aus dem Bild sprang.
  if (!animate || prefersReducedMotion?.matches) return
  animateMoves(moved)
}

/**
 * Auf- und Zuklappen eines Zettels mit Unteraufgaben.
 *
 * Seit Ticket 02 packt die Skyline **frei innerhalb ihrer Gruppe** (→
 * `packWall`): sie wählt bei jedem Schritt den Zettel mit der aktuell
 * niedrigsten möglichen Oberkante, nicht strikt die Eingabereihenfolge. Ändert
 * sich dadurch die Höhe des aufklappenden Zettels, kann sich deshalb auch die
 * Platzierung **anderer** Zettel derselben Gruppe verschieben — nicht nur die
 * der nachfolgenden. Es gibt hier bewusst keine Garantie „Zettel oberhalb
 * bewegen sich um 0 px" mehr; das FLIP-Animationssystem (`animateMoves`)
 * behandelt das bereits: es animiert jeden Zettel, dessen Position sich
 * tatsächlich ändert, und lässt den Rest unangetastet.
 *
 * **Der angetippte Zettel selbst bleibt liegen** (Ticket 13). Beim Aufklappen
 * wird seine aktuelle Oberkante gemerkt und geht `packWall` als Vorgabe mit; die
 * anderen weichen ihm aus. Vorher wanderte er ans untere Ende seiner Gruppe —
 * mit voller Wandbreite verliert er jeden Vergleich um die niedrigste Oberkante
 * — und ein Scroll-Anker zog die Seite hinterher. Beides ist weg.
 *
 * Gemerkt wird die zuletzt GESETZTE Position (`lastPositions`), nicht eine frisch
 * gemessene: sie ist die Zahl, die `packWall` ausgerechnet hat, und genau die
 * soll er behalten. Eine Messung am DOM lieferte hier den Wert MITTEN in einer
 * laufenden Fluganimation — der Zettel bliebe dann dort liegen, wo er zufällig
 * gerade schwebte.
 *
 * Steht dort noch nichts (erster Lauf, Zettel gerade erst eingehängt), gibt es
 * keine Vorgabe und der Zettel packt frei mit — sichtbar wie vor diesem Ticket,
 * aber nicht falsch.
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
  nextTick(() => relayout(true, taskId))
}

/**
 * FLIP über die Web Animations API: abnehmen (Schatten wächst, Neigung richtet
 * sich auf) → fliegen → kleiner Überschwinger → andocken. Nur Zettel, deren
 * Platz sich wirklich geändert hat, bewegen sich — der Rest bleibt still.
 */
const animateMoves = (
  moved: Array<{ el: HTMLElement; id: string; dx: number; dy: number; z: number }>
) => {
  moved.forEach(({ el, id, dx, dy, z }, index) => {
    const rot = rotationOf(id)
    const lift = `translate(${dx * 0.6}px, ${dy * 0.6 - 8}px) rotate(${rot * 0.25}deg) scale(1.07)`
    // Während des Flugs über die ruhenden Zettel gehoben (600), aber NICHT
    // nach Laufnummer sortiert: `z` ist der bereits von `packWall` berechnete
    // Stapelwert (Ticket 11, kleineres x/y oben) — damit gilt „der linke
    // Zettel liegt oben" auch WÄHREND der Bewegung, nicht erst danach.
    // `z` reicht von 1 bis `placed.length` (real deutlich unter 100), also
    // bleibt `600 + z` sicher unter den 800/810, die `WallNote.vue` per
    // `!important` für den gezogenen bzw. lang gedrückten Zettel reserviert
    // (siehe Obergrenze in `packWall`). Die Staffelung der Verzögerung
    // (`delay` unten) bleibt an der Laufnummer `index` hängen — sie sagt nur,
    // WANN ein Zettel losfliegt, nicht wer oben liegt; das sind zwei
    // verschiedene Aussagen.
    el.style.zIndex = String(600 + z)
    const animation = el.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1)`,
          boxShadow: 'var(--pw-shadow)',
          offset: 0
        },
        { transform: lift, boxShadow: 'var(--pw-shadow-lift)', offset: 0.3 },
        {
          transform: `translate(0, 0) rotate(${rot * 0.6}deg) scale(1.035)`,
          boxShadow: 'var(--pw-shadow-lift)',
          offset: 0.74
        },
        {
          transform: `translate(0, 0) rotate(${rot + 1.4}deg) scale(.985)`,
          boxShadow: 'var(--pw-shadow)',
          offset: 0.88
        },
        {
          transform: `translate(0, 0) rotate(${rot}deg) scale(1)`,
          boxShadow: 'var(--pw-shadow)',
          offset: 1
        }
      ],
      {
        duration: 430 + Math.min(160, Math.hypot(dx, dy)),
        delay: Math.min(120, index * 7),
        easing: 'cubic-bezier(.28,.9,.32,1)',
        fill: 'backwards'
      }
    )
    animation.onfinish = () => {
      el.style.zIndex = String(z)
    }
  })
}

const scheduleRelayout = (animate: boolean) => {
  nextTick(() => relayout(animate))
}

/**
 * Nur Änderungen, die das Packen betreffen, lösen ein Neupacken aus: Menge,
 * Reihenfolge, Titel (steuert die Breite) und Typ (steuert das Papier). Eine
 * geänderte Zuweisung färbt nur um und darf die Wand nicht durchschütteln.
 */
const layoutSignature = computed(() =>
  wallTasks.value.map(task => `${task.task_id}:${task.task_type}:${task.title}`).join('|')
)

watch(layoutSignature, () => {
  // Ein Zettel, der von der Wand verschwindet (erledigt, gelöscht), nimmt
  // seinen Aufklapp-Zustand mit. Ohne das stünde er beim Wiederauftauchen —
  // etwa nach „wieder dreckig" — unvermittelt offen da.
  const onWall = new Set(wallTasks.value.map(task => task.task_id))
  if ([...expandedIds.value].some(id => !onWall.has(id))) {
    expandedIds.value = new Set([...expandedIds.value].filter(id => onWall.has(id)))
  }
  // Mit dem Aufklapp-Zustand geht auch die gemerkte Oberkante (Ticket 13).
  // Bliebe sie hängen, käme der Zettel nach einem „wieder dreckig" mit einer
  // Vorgabe aus einer Wand zurück, die es nicht mehr gibt.
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
      .filter(task => task.task_type === 'project')
      .map(task => `${task.task_id}:${taskStore.getProjectEffortTotal(task.task_id)}`)
      .join('|'),
  () => scheduleRelayout(true)
)

let resizeObserver: ResizeObserver | null = null
let lastWidth = 0

onMounted(async () => {
  // Parallel: die Projekt-Punktesummen kommen aus einer EIGENEN Abfrage (die
  // Wand lädt keine Erledigungen), und sie müssen vor dem ersten `relayout`
  // stehen — die Stellenzahl am Abzeichen geht in die gemessene Zettelbreite ein.
  await Promise.all([taskStore.loadTasks(), taskStore.loadProjectEffortTotals()])
  taskStore.subscribeToTasks()
  householdStore.loadWeeklyCompletions()

  scheduleRelayout(false)

  // Breitenänderung (Drehen, Fensterbreite) → neu packen. Die Höhe der Wand
  // setzen wir selbst; würde sie mitzählen, drehte sich der Observer im Kreis.
  if (wallEl.value && typeof ResizeObserver !== 'undefined') {
    lastWidth = wallEl.value.clientWidth
    resizeObserver = new ResizeObserver(() => {
      const width = wallEl.value?.clientWidth ?? 0
      if (width === lastWidth) return
      lastWidth = width
      relayout(false)
    })
    resizeObserver.observe(wallEl.value)
  }

  // Die Schrift bestimmt die Textbreite und damit JEDE Zettelbreite. Wird mit
  // der Ersatzschrift gemessen, fallen alle Zettel zu schmal aus und die Titel
  // brechen um — dasselbe Schadensbild wie bei einer abgerundeten Messung.
  // `relayout()` misst die Breiten neu, deshalb genügt hier ein weiterer Lauf,
  // sobald die Schriften stehen. Ist bereits alles geladen, löst das Promise
  // sofort aus und der Lauf kostet nichts.
  //
  // Der Lauf liegt in einem `requestAnimationFrame`, nicht direkt im
  // `then`-Callback: `fonts.ready` ist beim **Umschalten des Aussehens** bereits
  // erfüllt und löst dann als Mikrotask aus — also möglicherweise noch bevor der
  // Browser die eben gesetzte Wandhöhe angewandt hat. Gemessen würde dann in
  // einem Zwischenzustand, und weil `wallEl.clientWidth` davon abhängt, ob die
  // Seite in diesem Moment schon eine Bildlaufleiste hat, fällt die Wandbreite
  // um deren Breite anders aus als nach einem Neuladen — genau das Bild aus dem
  // QC-Befund (ein Zettel rutscht beim Umschalten in die zweite Reihe, nach dem
  // Neuladen steht er wieder oben). Ein Frame später steht der Zustand.
  document.fonts?.ready.then(() => requestAnimationFrame(() => relayout(false)))
})

onUnmounted(() => {
  taskStore.unsubscribeFromTasks()
  // Ohne die Abmeldung zöge der Store die Projekt-Summen auch im klassischen
  // Aussehen weiter nach, wo sie niemand liest.
  taskStore.stopProjectEffortTotals()
  resizeObserver?.disconnect()
})

// --- Suche, Erstellen, Quick-Aufgabe (funktional unverändert) ----------------

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
} = useOverlayHistoryEntry<'modal'>('suche', (reason) => {
  if (reason === 'modal') return
  searchQuery.value = ''
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
    <!-- Die Statusleiste (`WallStatusBar`) steckt seit Ticket 08 im globalen
         App-Header (`Header.vue`) und läuft auf jeder Route mit — sie wird
         hier bewusst NICHT mehr eingebunden, sonst rendert sie doppelt. -->

    <!-- Die Wand: Kork, absolut positionierte Zettel, keine Überschriften. -->
    <div ref="wallEl" class="pw-wall wall" :style="{ height: `${wallHeight}px` }">
      <WallNote
        v-for="task in wallTasks"
        :key="task.task_id"
        :ref="instance => setNoteEl(task.task_id, instance)"
        :task="task"
        :expanded="expandedIds.has(task.task_id)"
        :meta-top="metaTopIds.has(task.task_id)"
        @toggle="toggleNote"
        @gesture-start="gestureNoteId = $event"
        @gesture-end="gestureNoteId = gestureNoteId === $event ? null : gestureNoteId"
      />
    </div>

    <p v-if="!taskStore.isLoading && wallTasks.length === 0" class="wall-empty">
      Nichts angepinnt.
    </p>

    <!-- Der Fetzen: hängt über der Erledigt-Liste und klebt den zuletzt
         abgerissenen Zettel auf einen Tipp zurück (Ticket 11). Er rendert
         nichts, solange nichts abgerissen wurde, und verschwindet erst beim
         Verlassen der Pinnwand. -->
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

    <!-- Such-Overlay: funktional unverändert, inklusive der bestehenden Karte
         als Ergebniszeile — sie bleibt in dieser Etappe der Weg zum Erledigen. -->
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
          <button class="search-overlay-close" aria-label="Suche schließen" @click="closeSearchOverlay()">
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
            <div
              v-for="result in searchResults"
              :key="result.task.task_id"
              class="search-result-item"
            >
              <div class="search-result-category">{{ result.categoryLabel }}</div>
              <TaskCard :task="result.task" />
            </div>
          </template>

          <div v-else-if="searchResults && searchResults.length === 0" class="search-overlay-initial">
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
  /* Unten kommt zum FAB-Polster die Höhe des oben klebenden App-Headers dazu
     (Header-Zeile + eingebettete Wochenziel-Leiste zusammen). Seit Ticket 08
     ist `WallStatusBar` kein eigenständiges sticky-Element mehr, sondern Teil
     von `Header.vue` — `--wall-status-height` ist deshalb ENTFALLEN (bewusst,
     siehe Kommentar in `WallStatusBar.vue`) und durch `--app-header-height`
     ersetzt, das der Header ohnehin schon meldet (`useElementHeightVar`). Eine
     feste Pixelzahl wäre falsch, weil der Header kompakt/nicht kompakt und je
     nach Mitgliederzahl unterschiedlich hoch ist. Ohne dieses Polster bleiben
     am Seitenende Zettel dauerhaft unter dem Header verdeckt und ihr Eselsohr
     (Etappe 4) wäre unerreichbar — derselbe Effekt, den vor Ticket 08
     `--wall-status-height` allein für die (damals separate) Statusleiste
     abgedeckt hat. */
  /* Der untere Wert ist gerechnet, nicht gemessen: der FAB sitzt 64 + 18 px
     über der Unterkante, ist 52 px hoch und trägt Rahmen samt Schlagschatten —
     zusammen rund 138 px. Mit 148 px bleibt am Seitenende Luft unter ihm, statt
     dass er die letzte Zeile bzw. das Eselsohr des untersten Zettels verdeckt.
     Nachmessen, wenn sich `.fab-card` ändert. */
  padding: 10px 8px calc(148px + env(safe-area-inset-bottom) + var(--app-header-height, 0px));
}

/* Der Bezugsrahmen der absolut positionierten Zettel. Die Höhe kommt aus dem
   Packen, nicht aus dem Inhalt. `.pw-wall` (pinnwand.css) liefert den Kork. */
.wall {
  position: relative;
  width: 100%;
  /* Während der Breitenmessung ist ein Zettel kurzzeitig `max-content` breit
     und kann die Wand überragen. `clip` verhindert, dass dabei ein waagerechter
     Bildlauf aufblitzt; `visible` in der Senkrechten hält Reißzwecke und
     Klebeband sichtbar, die über die Oberkante hinausragen. */
  overflow-x: clip;
  overflow-y: visible;
  border: 2px solid rgba(0, 0, 0, 0.12);
  transition: height 0.42s cubic-bezier(0.2, 0.8, 0.3, 1);
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

/* --- FAB als schwebende Papierkarte ---------------------------------------- */
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

/* --- Such-Overlay (Aufbau wie im Putzen-Screen) ----------------------------- */
.search-overlay {
  position: fixed;
  inset: 0;
  /* Über dem FAB (1000), unter der Modal-Ebene (1050, utilities.css): die
     Modals der Ergebniskarten teleportieren nach <body>. */
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
  width: 24px;
  height: 24px;
  padding: 4px;
  font-size: 1rem;
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
  margin-bottom: 0.5rem;
}

.search-result-category {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.25rem;
  padding-left: 0.5rem;
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .wall {
    transition: none;
  }
}
</style>
