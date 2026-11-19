/**
 * Geometrie der Pinnwand: ein Raster aus gleich breiten Spalten (ADR-0007).
 *
 * Reine Funktionen: kein Vue, kein DOM, keine Seiteneffekte. Die Höhe eines
 * Zettels kann hier nicht berechnet werden — sie hängt am Textumbruch und wird
 * von der Wand bei Spaltenbreite gemessen und hier hereingereicht.
 *
 * **Alles Unordentliche ist deterministisch.** Neigung, Versatz und Reihenfolge
 * kommen aus einem FNV-1a-Hash über die `task_id` — nie aus `Math.random()` und
 * nie aus der Position in der Liste. Eine Neigung, die sich beim Neuladen oder
 * Umsortieren ändert, sieht aus wie ein Fehler; so nimmt ein Zettel seine
 * Neigung überallhin mit.
 */

/** FNV-1a, 32 Bit. Klein, schnell, gut gestreut — kryptografisch irrelevant. */
function fnv1a(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

/** Neigung eines Zettels in Grad, −3.00 … +3.00. */
export function rotationOf(taskId: string): number {
  return (fnv1a(taskId) % 601) / 100 - 3
}

/**
 * Versatz in Pixeln, −range … +range. `key` trennt die Achsen, damit x und y
 * desselben Zettels nicht identisch ausfallen.
 *
 * **Der Schlüssel steht VORN, und das ist keine Kosmetik.** Mit der Kennung
 * vorn (`${taskId}#${key}`) unterscheiden sich Schlüssel wie `stamp-dx0`,
 * `stamp-dx1`, `stamp-dx2` nur in der letzten Ziffer, und FNV-1a mischt den
 * letzten Schritt nicht mehr durch: die Stempellagen korrelieren dann sichtbar
 * (−0,49 bzw. +0,68 über 100 000 Kennungen, an der Wand ein Muster). Mit
 * vorangestelltem Schlüssel liegt die Korrelation bei 0,003.
 *
 * Wer hier Schlüssel vergibt, die sich nur in einem Zeichen am Ende
 * unterscheiden, bekommt das Problem zurück — dann lieber ein eigenes Wort je
 * Achse.
 */
export function jitterOf(taskId: string, key: string, range: number): number {
  return (fnv1a(`${key}#${taskId}`) % (range * 200 + 1)) / 100 - range
}

export type WallNoteKind = 'open' | 'daily' | 'project'

/** Der Zettel-Typ steuert Papier und Befestigung — es gibt keine Überschriften. */
export function kindOfTaskType(taskType: string): WallNoteKind {
  if (taskType === 'project') return 'project'
  if (taskType === 'daily') return 'daily'
  return 'open'
}

/**
 * Spaltenzahl der Zettelchen: zwei, bei durchweg kurzen Titeln drei. Die
 * 12-Zeichen-Grenze ist eine bewusst strenge Setzung (Zeichen, nicht Pixel);
 * liegt sie daneben, wird nur die Dichte falsch, nie die Lesbarkeit.
 */
const SUBTASK_C3_MAX_TITLE = 12

export function subtaskColumns(titles: readonly string[]): 2 | 3 {
  if (titles.length === 0) return 2
  const longest = titles.reduce((max, title) => Math.max(max, title.length), 0)
  return longest <= SUBTASK_C3_MAX_TITLE ? 3 : 2
}

/**
 * Rastermaß einer Spalte: so viele Spalten, wie mit rund 160 px nebeneinander
 * passen (ADR-0007). Auf jedem Handy bis 412 px sind das zwei (nutzbare Wand
 * 276…368 px), auf dem Tablet vier.
 */
const COLUMN_PITCH = 160

/** Auf dem Handy immer mindestens zwei Zettel nebeneinander. */
const MIN_COLUMNS = 2

/**
 * Luft zwischen zwei Spalten. Der waagerechte Versatz (`X_JITTER`) läuft zwei
 * Nachbarn um höchstens 2 × 3 px aufeinander zu; 8 px lassen dann noch 2 px —
 * gerechnet am ungedrehten Kasten.
 */
const COLUMN_GAP = 8

export interface WallGrid {
  columns: number
  /** Breite eines Zettels in einer Spalte, in px. */
  columnWidth: number
  /** Luft zwischen zwei Spalten, in px. */
  columnGap: number
}

/**
 * Das Raster einer Wand dieser Breite. Die Wand braucht es VOR dem Packen:
 * sie setzt jedem Zettel die Spaltenbreite und misst erst dann seine Höhe.
 */
export function wallGrid(wallWidth: number): WallGrid {
  const columns = Math.max(MIN_COLUMNS, Math.floor(wallWidth / COLUMN_PITCH))
  const columnWidth = (wallWidth - (columns - 1) * COLUMN_GAP) / columns
  return { columns, columnWidth, columnGap: COLUMN_GAP }
}

/**
 * Die Rahmenbreite von `.zettel` (`WallNote.vue`, `border: 2px solid transparent`).
 *
 * **Unsichtbar, aber nicht folgenlos.** Eine absolut positionierte Befestigung
 * sitzt in der **Padding-Box** von `.zettel`, das Raster positioniert aber die
 * **Border-Box** — jede Befestigung sitzt 2 px tiefer und weiter innen, als ihr
 * CSS vermuten lässt. Wer diesen Rahmen ändert, verschiebt alle Befestigungen
 * und damit das obere Polster der Wand.
 */
const ZETTEL_BORDER = 2

/**
 * Wo eine Befestigung waagerecht sitzt — der geneigte Zettel hebt alles
 * außerhalb seiner Mitte mit an (→ `overhangOf`). Bei `left`/`right` ist
 * `inset` der Abstand von der Kante der **Padding-Box** bis zur **Mitte** der
 * Befestigung.
 */
type FastenerAnchor = 'center' | 'left' | 'right'

/**
 * Die **Befestigungen** (→ CONTEXT.md) als Geometrie, abgeschrieben aus den
 * CSS-Regeln in `WallNote.vue`.
 *
 * Jede Befestigung sitzt über der Oberkante ihres Zettels (negatives `top`) und
 * ragt in der obersten Reihe über die WAND. Wie viel Platz die Wand oben
 * reserviert, ist deshalb eine Ablesung aus dem Stylesheet: „so hoch wie die
 * höchste Befestigung". Wer eine Sorte hinzufügt, verschiebt, dreht oder
 * umhängt, ändert diese Tabelle mit.
 *
 * Eine Zeile je Befestigung, nicht je Sorte: die Klammerhälften sind
 * verschieden gedreht und sitzen an verschiedenen KANTEN — genau das
 * entscheidet, welche der geneigte Zettel nach oben fährt.
 *
 * **Es ist eine Kopie.** Eine gemeinsame Quelle mit `WallNote.vue` ist nicht
 * herstellbar: das Raster rechnet, bevor ein Zettel im DOM steht. Die Kopplung
 * tragen Kommentare an BEIDEN Enden — die CSS-Regeln in `WallNote.vue`
 * (`.zettel`, `.pin`, `.tape`, `.clip`) verweisen hierher.
 *
 * **Nicht enthalten:** Schlagschatten (werfen nach unten) und die Zusatzneigung
 * der Griff-Zustände (`.zettel--tearing` u. a., bis +9 deg). Die tritt nur mit
 * einer Abwärtsbewegung auf (`pull > 0` in `noteStyle`): je Pixel `pull` wächst
 * der Überstand um höchstens rund 0,24 px, der Zettel sinkt um 1 px.
 */
const FASTENERS: ReadonlyArray<{
  /** Die CSS-Regel in `WallNote.vue`, aus der diese Zeile abgeschrieben ist. */
  css: string
  /** Zettelgruppe, die diese Befestigung trägt — siehe `fastenersOfGroup`. */
  group: Exclude<WallGroup, 'unknown'>
  anchor: FastenerAnchor
  /** Nur bei `left`/`right`: Padding-Box-Kante bis Mitte der Befestigung. */
  inset: number
  /** `top` der CSS-Regel, gegen die Padding-Box von `.zettel`. */
  top: number
  width: number
  height: number
  /** Eigene `rotate()`-Drehung in Grad. */
  rotation: number
}> = [
  /** Reißzwecke — fällige (wiederkehrende, einmalige) Aufgaben. */
  {
    css: '.pin',
    group: 'due',
    anchor: 'center',
    inset: 0,
    top: -7,
    width: 14,
    height: 14,
    rotation: 0,
  },
  /** Klebestreifen — tägliche Aufgaben. Der breiteste, deshalb der drehempfindlichste. */
  {
    css: '.tape',
    group: 'daily',
    anchor: 'center',
    inset: 0,
    top: -9,
    width: 46,
    height: 16,
    rotation: -4,
  },
  // Doppelte Büroklammer — Projekte. `inset` = `left: 12px` plus halbe Breite
  // (7,5) = 19,5 px von der Padding-Box-Kante bis zur Mitte der Klammer.
  /** Linke Hälfte der doppelten Büroklammer (`.clip` + `.clip--l`). */
  {
    css: '.clip--l',
    group: 'project',
    anchor: 'left',
    inset: 19.5,
    top: -8,
    width: 15,
    height: 20,
    rotation: -7,
  },
  /** Rechte Hälfte der doppelten Büroklammer (`.clip` + `.clip--r`). */
  {
    css: '.clip--r',
    group: 'project',
    anchor: 'right',
    inset: 19.5,
    top: -8,
    width: 15,
    height: 20,
    rotation: 6,
  },
  /**
   * Nadelstelle — lose Zettel (Suche). Keine Befestigung, aber ein Knopf, der
   * über die Kante ragt: gerechnet wird seine ganze Trefffläche, nicht nur das
   * gezeichnete Loch, damit auch sie in der obersten Reihe auf dem Kork liegt
   * und nicht unter dem Suchfeld.
   */
  {
    css: '.pin-spot',
    group: 'loose',
    anchor: 'center',
    inset: 0,
    top: -8,
    width: 44,
    height: 36,
    rotation: 0,
  },
]

/**
 * Die Befestigungen, die ein Zettel dieser Gruppe tragen KANN.
 *
 * Gruppe und gezeichnete Sorte decken sich bei `daily` nicht: `dailyTasks`
 * enthält auch `one-time` (`useTaskBoard.ts`), und der trägt eine Reißzwecke
 * (`kindOfTaskType`), bekommt hier aber `.tape`. Das fällt auf die sichere
 * Seite — `.tape` steht weiter über, das Polster wird überschätzt, nie
 * unterschätzt.
 *
 * `unknown` bekommt aus demselben Grund **alle** Befestigungen, nicht keine —
 * sichtbarer Kork ist ein Schönheitsfehler, eine überstehende Befestigung ist
 * der gemeldete Bug.
 */
const fastenersOfGroup = (group: WallGroup): typeof FASTENERS =>
  group === 'unknown' ? FASTENERS : FASTENERS.filter((f) => f.group === group)

const RAD = Math.PI / 180

/**
 * Wie weit eine Befestigung über die Oberkante ihres Zettels hinausragt —
 * in Abhängigkeit von **Zettelbreite** und **Zettelneigung**.
 *
 * **Keine Konstante**, drei Dinge wirken zusammen:
 *
 * 1. **Zettelrahmen** (→ `ZETTEL_BORDER`): SENKT den Überstand um 2 px.
 * 2. **Eigene Drehung** der Befestigung um ihre Mitte (`transform-origin` ist
 *    nirgends gesetzt): die halbe Höhe der umschließenden Kiste wächst auf
 *    `(b·sin α + h·cos α) / 2`. HEBT den Überstand.
 * 3. **Neigung des Zettels** (`rotationOf`, ebenfalls um die Mitte): die
 *    Drehungen komponieren, und eine Befestigung außerhalb der Zettelmitte
 *    fährt mit hoch. Der Hebel ist der Abstand zur Mitte — deshalb
 *    **breitenabhängig** (ein aufgeklappter Zettel ist wandbreit).
 *
 * **Bewusst weggelassen:** die Zettelneigung senkt die Oberkante in der
 * Zettelmitte zusätzlich um `(H/2)·(1 − cos θ)`. Der Term braucht die
 * Zettelhöhe und macht das Ergebnis nur KLEINER; ihn wegzulassen ist die
 * konservative Seite.
 */
const overhangOf = (
  fastener: (typeof FASTENERS)[number],
  noteWidth: number,
  tiltDeg: number,
): number => {
  const tilt = tiltDeg * RAD
  const total = (tiltDeg + fastener.rotation) * RAD
  // Halbe Höhe der umschließenden Kiste der GEDREHTEN Befestigung.
  const halfExtent =
    (fastener.width * Math.abs(Math.sin(total)) + fastener.height * Math.abs(Math.cos(total))) / 2
  // Mitte der Befestigung, gegen die Border-Box des ungeneigten Zettels.
  const centerY = ZETTEL_BORDER + fastener.top + fastener.height / 2
  const centerX =
    fastener.anchor === 'center'
      ? noteWidth / 2
      : fastener.anchor === 'left'
        ? ZETTEL_BORDER + fastener.inset
        : noteWidth - ZETTEL_BORDER - fastener.inset
  // Hebelarm zur Zettelmitte, um die geneigt wird. Positiv = rechts der Mitte.
  const lever = centerX - noteWidth / 2
  return Math.max(0, halfExtent - centerY * Math.cos(tilt) - lever * Math.sin(tilt))
}

/**
 * Das Polster, das die Wand oben freihält, damit **keine** Befestigung über den
 * Kork hinausragt — aufgerundet auf ganze Pixel.
 *
 * **Das Maximum über ALLE Zettel bei Spaltenbreite, nicht über die oberste
 * Reihe**: so hängt das Polster nicht an der Lage. Aufklappen ändert es nicht
 * — ein wandbreites Projekt hätte den größeren Hebel und schöbe sonst die
 * ganze Wand um ein paar Pixel, auch die Zettel vor ihm. Liegt ein
 * aufgeklappter Zettel selbst ganz oben, bekommt er sein eigenes Polster
 * (→ `layoutWall`).
 */
function topPaddingFor(
  notes: ReadonlyArray<{ id: string; group: WallGroup; width: number }>,
): number {
  let worst = 0
  for (const note of notes) {
    const tilt = rotationOf(note.id)
    for (const fastener of fastenersOfGroup(note.group)) {
      const overhang = overhangOf(fastener, note.width, tilt)
      if (overhang > worst) worst = overhang
    }
  }
  return Math.ceil(worst)
}

/**
 * Die Gruppe eines Zettels: Legereihenfolge und Befestigung.
 *
 * - `due` fällig (Reißzwecke), `daily` täglich (Klebestreifen), `project`
 *   Projekt (Büroklammern) — die drei Listen von `useTaskBoard`
 * - `loose` loser Zettel der Suche (Nadelstelle), nach allen angepinnten
 * - `unknown` ein Zettel, den keine Liste kennt. Kommt zuerst und bekommt das
 *   Polster aller Befestigungen (→ `fastenersOfGroup`); **bewusst nicht
 *   `due`**: das gäbe ihm still die Befestigung mit dem kleinsten Überstand.
 */
export type WallGroup = 'unknown' | 'due' | 'daily' | 'project' | 'loose'

/** Legereihenfolge der Gruppen (→ `layoutWall`). */
const GROUP_ORDER: Record<WallGroup, number> = {
  unknown: 0,
  due: 1,
  daily: 2,
  project: 3,
  loose: 4,
}

/** Was die Wand je Zettel hereinreicht. */
export interface WallNoteInput {
  id: string
  /** Bestimmt Legereihenfolge und oberes Polster (→ `WallGroup`). */
  group: WallGroup
  /** Bei der Breite gemessen, die das Raster vorgibt (Spalte oder Wand). */
  height: number
}

export interface PlacedNote {
  id: string
  /** Spalte des Zettels; `null` für einen aufgeklappten, wandbreiten Zettel. */
  column: number | null
  /** Linke Kante samt Versatz, gegen die nutzbare Wand. */
  x: number
  /** Oberkante samt Versatz. */
  y: number
  /** Gesetzte Breite: Spaltenbreite, aufgeklappt die Wandbreite. */
  width: number
  /**
   * Waagerechter Versatz gegen die Spaltenkante — fest je Aufgabe. An den
   * beiden Wandkanten wird `x` auf die Wand geklemmt; `dx` bleibt der Versatz
   * der Aufgabe. Aufgeklappt 0.
   */
  dx: number
  /** Luft über dem Zettel, auf die Unterkante darüber — fest je Aufgabe. */
  dy: number
  /** Neigung in Grad (`rotationOf`) — fest je Aufgabe. */
  rotation: number
  /**
   * Stapelreihenfolge: links liegt über rechts, bei gleicher Spalte oben über
   * unten. Zwei Nachbarn überlappen höchstens über die Neigung, und zwar an
   * der UNTEREN rechten Ecke des linken bzw. oberen — dort sitzen Stift und
   * Eselsohr, die frei bleiben sollen.
   */
  z: number
}

export interface WallLayout extends WallGrid {
  /** In Legereihenfolge. */
  notes: PlacedNote[]
  height: number
}

/** Waagerechter Versatz je Zettel, ±3 px (→ `COLUMN_GAP`). */
const X_JITTER = 3

/** Luft über einem Zettel: 4 … 15 px aus der Kennung. Bricht die Kanten der Reihen. */
function gapAboveOf(taskId: string): number {
  return 4 + (fnv1a(`gap#${taskId}`) % 12)
}

/** Luft über und unter einem aufgeklappten Zettel — ein Block, kein Schnipsel. */
const EXPANDED_GAP = 8

/** Kork unter dem untersten Zettel, damit sein Schatten nicht an der Wandkante endet. */
const BOTTOM_GAP = 8

/**
 * Legt die Zettel ins Raster.
 *
 * **Reihenfolge:** nach Gruppe (fällig → täglich → Projekt → lose), innerhalb der
 * Gruppe die feste Zufallsordnung aus dem Hash der Kennung — nie die
 * Eingabereihenfolge, sonst bewegte eine verschobene Aufgabe im Store die
 * Wand. Jeder Zettel kommt in die gerade kürzeste Spalte (bei Gleichstand die
 * linke); die Gruppen fließen in denselben Spalten weiter. Die Dringlichkeit
 * ordnet nicht (ADR-0002).
 *
 * **Aufgeklappt** (`expanded`) teilt das Raster: was vor dem Zettel liegt,
 * bleibt, wo es ist; er selbst liegt wandbreit unter der tiefsten Spalte, und
 * die Zettel nach ihm beginnen darunter wieder in gleich hohen Spalten. Weil
 * das Legen sequentiell ist, stellt Zuklappen den vorigen Zustand her.
 */
export function layoutWall(
  notes: readonly WallNoteInput[],
  wallWidth: number,
  expanded: ReadonlySet<string> = new Set(),
): WallLayout {
  const grid = wallGrid(wallWidth)
  const { columns, columnWidth, columnGap } = grid
  if (notes.length === 0) return { ...grid, notes: [], height: 0 }

  const top = topPaddingFor(notes.map((note) => ({ ...note, width: columnWidth })))

  const ordered = [...notes].sort(
    (a, b) =>
      GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
      fnv1a(a.id) - fnv1a(b.id) ||
      (a.id < b.id ? -1 : 1),
  )

  const bottoms = new Array<number>(columns).fill(top)
  const placed: PlacedNote[] = []

  for (const note of ordered) {
    const rotation = rotationOf(note.id)
    if (expanded.has(note.id)) {
      const floor = Math.max(...bottoms)
      // Ganz oben (nichts davor): eigenes Polster, wandbreit gerechnet — die
      // Klammern eines aufgeklappten Projekts haben den längeren Hebel.
      const y =
        placed.length === 0
          ? Math.max(top, topPaddingFor([{ ...note, width: wallWidth }]))
          : floor + EXPANDED_GAP
      placed.push({
        id: note.id,
        column: null,
        x: 0,
        y,
        width: wallWidth,
        dx: 0,
        dy: y - floor,
        rotation,
        z: 0,
      })
      bottoms.fill(y + note.height + EXPANDED_GAP)
      continue
    }

    let column = 0
    for (let k = 1; k < columns; k++) if (bottoms[k] < bottoms[column]) column = k

    const left = column * (columnWidth + columnGap)
    const dx = jitterOf(note.id, 'x', X_JITTER)
    const x = Math.max(0, Math.min(wallWidth - columnWidth, left + dx))
    const dy = gapAboveOf(note.id)
    const y = bottoms[column] + dy
    placed.push({ id: note.id, column, x, y, width: columnWidth, dx, dy, rotation, z: 0 })
    bottoms[column] = y + note.height
  }

  // Stapelreihenfolge (→ `PlacedNote.z`): links über rechts, oben über unten.
  // `z` reicht von 1 bis n und bleibt unter den 600…(600+n) der Fluganimation
  // und den 800/810, die `WallNote.vue` für den gezogenen bzw. lang gedrückten
  // Zettel reserviert.
  // Nach Spalte, nicht nach `x`: der Versatz verschiebt `x` innerhalb der
  // Spalte, und oben über unten ginge dabei verloren. Aufgeklappte Zettel
  // überdecken niemanden; sie stehen vorn.
  const stack = [...placed].sort((a, b) => (a.column ?? -1) - (b.column ?? -1) || a.y - b.y)
  stack.forEach((note, index) => {
    note.z = stack.length - index
  })

  return { ...grid, notes: placed, height: Math.max(...bottoms) + BOTTOM_GAP }
}

/**
 * Die zuletzt gepackte Wandhöhe — **modulweit**, nicht je Ansicht.
 *
 * `WallView` läuft bewusst ohne `keep-alive` und wird bei jedem Reiterwechsel
 * neu montiert. Der Platzhalter vor dem ersten Packlauf braucht eine
 * Mindesthöhe, sonst springt die Seite, wenn die Zettel erscheinen; eine
 * geschätzte Konstante stimmt nur für genau eine Wandhöhe. Beim Reiterwechsel
 * sind es dieselben Aufgaben, ein Wert, der die Ansicht überlebt, trifft also
 * nahezu exakt. Ein falscher Wert kostet höchstens den Sprung, den es ohne ihn
 * ohnehin gäbe.
 */
let lastPackedHeight = 0

/** Merkt sich die Höhe eines geglückten Packlaufs. `0` wird nicht gemerkt. */
export function rememberWallHeight(height: number): void {
  if (height > 0) lastPackedHeight = height
}

/** Zuletzt gepackte Höhe in px, oder `0`, wenn in dieser Sitzung noch nie gepackt wurde. */
export function rememberedWallHeight(): number {
  return lastPackedHeight
}
