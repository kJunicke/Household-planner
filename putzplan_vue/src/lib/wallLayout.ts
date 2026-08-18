/**
 * Geometrie der Pinnwand (Pinnwand-Redesign, Etappe 2).
 *
 * Reine Funktionen: kein Vue, kein DOM, keine Seiteneffekte. Die Höhe eines
 * Zettels kann hier nicht berechnet werden — sie hängt am Textumbruch und wird
 * von der Wand gemessen und hier hereingereicht.
 *
 * **Alles Unordentliche ist deterministisch.** Rotation, Versatz und Abstand
 * kommen aus einem FNV-1a-Hash über die `task_id` — nie aus `Math.random()` und
 * nie aus der Position in der Liste. Eine Neigung, die sich beim Neuladen oder
 * beim Umsortieren ändert, sieht aus wie ein Fehler. Weil die `task_id` die
 * einzige Eingabe ist, liegt derselbe Zettel nach jedem Neuladen exakt gleich
 * schief, und ein Zettel, der von Platz 7 auf Platz 2 wandert, nimmt seine
 * Neigung mit.
 */

/** FNV-1a, 32 Bit. Klein, schnell, gut gestreut — kryptografisch irrelevant. */
export function fnv1a(input: string): number {
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
 */
export function jitterOf(taskId: string, key: string, range: number): number {
  return (fnv1a(`${taskId}#${key}`) % (range * 200 + 1)) / 100 - range
}

/** Abstand unter einem Zettel: 2 … 15 px. */
export function gapOf(taskId: string): number {
  return 2 + (fnv1a(`${taskId}#gap`) % 14)
}

export type WallNoteKind = 'open' | 'daily' | 'project'

/** Der Zettel-Typ steuert Papier und Befestigung — es gibt keine Überschriften. */
export function kindOfTaskType(taskType: string): WallNoteKind {
  if (taskType === 'project') return 'project'
  if (taskType === 'daily') return 'daily'
  return 'open'
}

/**
 * Die Breite eines Zettels bestimmt sein **Titel**, nicht eine Formel: die Wand
 * misst den Titel einzeilig im Browser (`width: max-content` bei
 * `white-space: nowrap`) und übernimmt das Ergebnis. Ein Umbruch ist damit der
 * Notfall — er tritt nur ein, wenn der Titel selbst über die volle Wandbreite
 * nicht in eine Zeile passt.
 *
 * Eine Zeichenzahl-Schätzung stünde hier nur im Weg: sie hinge an Schriftart
 * und Schriftschnitt und läge bei Umlauten und Großbuchstaben regelmäßig
 * daneben. Deshalb gibt es in diesem Modul keine `noteWidth()` mehr, sondern
 * nur die Untergrenze.
 *
 * Untergrenze, damit ein Zettel mit sehr kurzem Titel („Müll") nicht zum
 * Schnipsel wird und der Bearbeiten-Knopf seinen Platz behält.
 */
// PROTOTYP: `let` statt `const`, damit `wallProto.ts` die Untergrenze je
// Variante umstellen kann. Beim Zurückbauen wieder `const 96`.
export let MIN_NOTE_WIDTH = 96

/** PROTOTYP — Untergrenze zur Laufzeit setzen. */
export function setMinNoteWidth(width: number): void {
  MIN_NOTE_WIDTH = width
}

/**
 * Obergrenze für Zettel mit **mehrwortigen** Titeln, als Anteil der Wandbreite.
 * Kurze Titel erreichen sie nie und bleiben einzeilig; lange brechen an einer
 * Wortgrenze um, statt eine ganze Reihe für sich zu beanspruchen.
 *
 * Ein Titel ohne Wortgrenze ist ausgenommen — er kann nicht umbrechen, ein
 * Deckel würde ihn nur abschneiden.
 */
export const MAX_WIDTH_RATIO = 0.68

/**
 * Waagerechte Luft, die zwei Zettel derselben Reihe voneinander trennen soll.
 *
 * Der x-Versatz aus `jitterOf` beträgt ±5 px **je Zettel**; zwei benachbarte
 * Zettel können also um bis zu 10 px aufeinander zulaufen. 12 px lassen dann
 * noch 2 px Luft. Die Zahl ist gerechnet, nicht gemessen — sie ist bewusst die
 * kleinste, die den Versatz vollständig abdeckt.
 */
const PAIR_GAP = 12

export interface WallNoteMetrics {
  id: string
  /** Bereits gesetzte Breite. */
  width: number
  /** Nach dem Setzen der Breite gemessene Höhe. */
  height: number
  /**
   * Aufgeklappt (Unteraufgaben sichtbar). Ein solcher Zettel nimmt die volle
   * Wandbreite ein und bekommt **keinen** Versatz: der x-Versatz wäre bei voller
   * Breite ohnehin weggeklemmt, und ein y-Versatz von bis zu −6,5 px würde ihn
   * unter den Zettel darüber schieben. Statt des unregelmäßigen Abstands steht
   * unter ihm ein fester (`EXPANDED_GAP`) — eine aufgeklappte Aufgabe ist ein
   * Block, kein bepinnter Schnipsel.
   */
  expanded?: boolean
}

/**
 * Abstand unter einem aufgeklappten Zettel. Übernommen aus dem Prototypen
 * `r5-freiewand.html` (`gap = open ? 8 : gapOf(id)`) — gestalterisch gesetzt,
 * nicht gemessen.
 */
const EXPANDED_GAP = 8

/**
 * Spaltenzahl der Zettelchen eines aufgeklappten Zettels: zwei, bei durchweg
 * kurzen Titeln drei.
 *
 * Die Grenze von 12 Zeichen stammt aus dem Prototypen und ist eine Setzung,
 * keine Messung: sie zählt Zeichen, nicht Pixel, und kennt die Schriftbreite
 * nicht. Sie ist bewusst streng — drei Spalten sind der Sonderfall („Regale",
 * „Boden", „Lampen"), zwei der Regelfall. Fällt ein Titel zu lang aus, verteilt
 * die Zeile ihn auf zwei Zeilen; falsch wird nur die Dichte, nie die Lesbarkeit.
 */
export const SUBTASK_C3_MAX_TITLE = 12

export function subtaskColumns(titles: readonly string[]): 2 | 3 {
  if (titles.length === 0) return 2
  const longest = titles.reduce((max, title) => Math.max(max, title.length), 0)
  return longest <= SUBTASK_C3_MAX_TITLE ? 3 : 2
}

/**
 * Was die Wand an einem Zettel gemessen hat, bevor sie seine Breite festlegt.
 * Beide Werte sind ganzzahlig und enthalten bereits den Sicherheitszuschlag der
 * Messung — das Planen rechnet ausschließlich in ganzen Zahlen, damit dieselben
 * Eingaben immer dieselben Breiten ergeben.
 */
export interface WallNoteShape {
  id: string
  /** Breite bei `max-content`: der Titel steht in einer Zeile. */
  natural: number
  /**
   * Breite bei `min-content`: das breiteste unteilbare Stück des Zettels —
   * in der Regel das längste Wort des Titels, bei sehr kurzen Titeln die
   * Fußzeile. Schmaler heißt **abschneiden**, nicht umbrechen.
   */
  minimum: number
}

/** Was der zweite Packlauf für einen Zettel vorschlägt. */
export interface NoteWidthPlan {
  width: number
  /**
   * Der Zettel, mit dem dieser zu einem Paar verschmälert wurde — oder `null`,
   * wenn die Breite für sich allein steht (natürliche Breite, Deckel oder
   * Reststreifen). Wer eine Paarhälfte verwirft, muss die andere mitverwerfen.
   */
  pairedWith: string | null
}

/** Ein Titel ohne Wortgrenze misst bei `min-content` so viel wie einzeilig. */
const wraps = (shape: WallNoteShape) => shape.minimum < shape.natural

/**
 * Die Breite nach der Voreinstellung „Breite folgt dem Titel", ohne den zweiten
 * Packlauf: die natürliche Breite, für **mehrwortige** Titel gedeckelt.
 *
 * Kurze Titel erreichen den Deckel nie und bleiben einzeilig; ein langer,
 * mehrwortiger Titel bricht lieber an einer Wortgrenze um, als die halbe Wand
 * zu beanspruchen. Ein einzelnes langes Wort ist ausgenommen — es kann nicht
 * umbrechen, ein Deckel würde es nur abschneiden; es bekommt so viel Breite,
 * wie es braucht, höchstens die ganze Wand.
 *
 * Auch die Rückfallbreite des zweiten Laufs: was er verwirft, landet wieder
 * hier.
 */
export function defaultNoteWidth(shape: WallNoteShape, wallWidth: number): number {
  const cap = Math.min(wallWidth, Math.round(wallWidth * MAX_WIDTH_RATIO))
  const wanted = shape.natural > cap && wraps(shape) ? cap : shape.natural
  return Math.max(MIN_NOTE_WIDTH, Math.min(wallWidth, wanted))
}

/**
 * Zweiter Packlauf: Breiten so wählen, dass möglichst zwei Zettel
 * nebeneinander stehen.
 *
 * Voreinstellung bleibt „Breite folgt dem Titel": jeder Zettel bekommt seine
 * natürliche Breite (gedeckelt bei `MAX_WIDTH_RATIO`). Das erzeugt auf schmalen
 * Wänden aber Reststreifen: ein Zettel misst 210 px auf einer 347-px-Wand,
 * daneben bleiben 125 px, und dort passt nur hinein, wessen Titel zufällig
 * darunter liegt. Bleibt keiner übrig, verkommt die Wand zur einspaltigen
 * Liste.
 *
 * Zwei Eingriffe, in dieser Reihenfolge:
 *
 * 1. **Streifen füllen** — passt der nächste Zettel nicht mit seiner
 *    natürlichen Breite in den Rest der Reihe, wohl aber an einer Wortgrenze,
 *    bekommt er die Breite des Streifens.
 * 2. **Paar erzwingen** — würde ein Zettel die Reihe allein belegen, weil
 *    hinter ihm kein Streifen mehr bleibt, der den nächsten trägt, werden
 *    **beide** auf die halbe Wandbreite gezogen.
 *
 * Beides greift nur, wenn der Zettel dabei kein Wort abschneidet
 * (`minimum`) und `MIN_NOTE_WIDTH` gewahrt bleibt.
 *
 * **Das Reihenmodell ist eine Näherung.** Gepackt wird danach weiter mit der
 * Skyline, die Höhen kennt und keine Reihen; dieses Modell entscheidet nur über
 * Breiten. Es unterstellt gleich hohe Zettel — das ist der Regelfall, weil
 * nahezu jeder Zettel einzeilig ist. Wo die Näherung danebenliegt, packt die
 * Skyline trotzdem gültig, nur eben nicht so dicht wie erhofft.
 *
 * **Die Zeilenobergrenze steckt nicht hier.** Ob ein verschmälerter Zettel
 * dadurch zu hoch wird, kann nur die Wand entscheiden, weil sie die Höhe misst
 * (→ `WallView`). Diese Funktion liefert Vorschläge, keine Zusagen.
 *
 * Deshalb trägt jedes Paar aus Eingriff 2 den Partner im Ergebnis (`pairedWith`).
 * Verwirft die Wand die eine Hälfte, muss sie die andere mitverwerfen: 165 px
 * am ersten Zettel gelten **nur** unter der Annahme, dass der zweite daneben
 * steht. Bleibt der erste breit, ist der zweite schmal und hoch ohne
 * Gegenwert — genau der grundlos schmale Einzelzettel, den es zu vermeiden
 * gilt. (Gefunden vom QC an „Fenster im Wohnzimmer putzen": 233,8 → 167,0 px
 * breit, 61,0 → 75,0 px hoch, kein Nachbar.)
 *
 * Die Reihenfolge der Eingabe wird **nie** verändert — die dringendste Aufgabe
 * bleibt vorn.
 */
export function planNoteWidths(
  shapes: readonly WallNoteShape[],
  wallWidth: number
): Map<string, NoteWidthPlan> {
  const pairWidth = Math.floor((wallWidth - PAIR_GAP) / 2)

  /**
   * Untergrenze dieses Zettels: schmaler schneidet ab. Bewusst **nicht** auf
   * die Wandbreite geklemmt — ein einzelnes Wort, das breiter als die Wand
   * ist, schließt sich dadurch von jeder Verschmälerung selbst aus.
   */
  const floorOf = (s: WallNoteShape) => Math.max(MIN_NOTE_WIDTH, s.minimum)
  const defaultOf = (s: WallNoteShape) => defaultNoteWidth(s, wallWidth)
  /** Passt der Zettel in `width`, ohne ein Wort zu zerschneiden? */
  const fitsShrunk = (s: WallNoteShape, width: number) => wraps(s) && width >= floorOf(s)
  /** Passt er dort, mit oder ohne Verschmälern? */
  const fitsAt = (s: WallNoteShape, width: number) => defaultOf(s) <= width || fitsShrunk(s, width)

  const plan = new Map<string, NoteWidthPlan>()

  let index = 0
  while (index < shapes.length) {
    // Erster Zettel der Reihe.
    const first = shapes[index]
    let width = defaultOf(first)
    const next = shapes[index + 1]

    // Bliebe hinter ihm ein Streifen, der den nächsten Zettel trägt? Wenn
    // nicht, stünde er allein — dann lohnt das Paar. Beide müssen die halbe
    // Wand vertragen, sonst wird nur einer schmaler und steht trotzdem allein.
    let partner: string | null = null
    if (
      next &&
      !fitsAt(next, wallWidth - width - PAIR_GAP) &&
      pairWidth >= MIN_NOTE_WIDTH &&
      fitsAt(first, pairWidth) &&
      fitsAt(next, pairWidth)
    ) {
      width = Math.min(width, pairWidth)
      partner = next.id
    }

    plan.set(first.id, { width, pairedWith: partner })
    let rest = wallWidth - width - PAIR_GAP
    index++

    // Weitere Zettel derselben Reihe.
    while (index < shapes.length) {
      const shape = shapes[index]
      const wanted = defaultOf(shape)
      // Nur der unmittelbar folgende Zettel ist die zweite Hälfte des Paares.
      const pairedWith = shape.id === partner ? first.id : null
      let taken: number
      if (wanted <= rest) {
        taken = wanted
      } else if (fitsShrunk(shape, rest)) {
        // Reststreifen füllen: der Titel bricht an einer Wortgrenze um.
        taken = rest
      } else {
        break
      }
      plan.set(shape.id, { width: taken, pairedWith })
      rest -= taken + PAIR_GAP
      index++
    }
  }

  return plan
}

/**
 * PROTOTYP: Wie weit ein Zettel an der LINKEN Wandkante zusaetzlich eingerueckt
 * werden darf, in Pixeln.
 *
 * Die Skyline setzt jeden Zettel, der links Platz findet, exakt auf x = 0 —
 * dadurch stehen die meisten Zettel auf einer perfekten Linie untereinander.
 * So pinnt kein Mensch. Der Versatz aus `jitterOf` (±5 px) faellt dagegen nicht
 * ins Gewicht.
 *
 * Eingerueckt wird nur an der linken Kante und nur nach rechts: ein Zettel darf
 * nicht ueber den Rand hinausragen, und mitten in der Reihe wuerde die
 * Einrueckung ein Loch reissen.
 */
let LEFT_INDENT_MAX = 0

export function setLeftIndent(max: number): void {
  LEFT_INDENT_MAX = max
}

/** Einrueckung dieses Zettels: 0 … max, deterministisch aus der `task_id`. */
export function indentOf(taskId: string, max: number): number {
  if (max <= 0) return 0
  return fnv1a(`${taskId}#indent`) % (max + 1)
}

export interface PackedNote {
  id: string
  x: number
  y: number
  /** Stapelreihenfolge: spätere Zettel liegen über früheren. */
  z: number
}

export interface PackedWall {
  notes: PackedNote[]
  height: number
}

/** Auflösung der Skyline in Pixeln. Feiner kostet Zeit, gröber verschenkt Platz. */
const SKYLINE_RESOLUTION = 4

/**
 * Skyline-Packing: jeder Zettel kommt an die Stelle mit der niedrigsten
 * Oberkante, die seine Breite trägt. Reihenfolge der Eingabe = Reihenfolge der
 * Platzierung, also steht die dringendste Aufgabe oben.
 *
 * Grund für absolute Positionierung statt Grid: ein Zettel muss später
 * aufklappen und höher werden können, **ohne** dass seine Nachbarn mitwachsen.
 *
 * Positionen werden auf `[0, wallWidth − Breite]` geklemmt — kein Zettel ragt
 * über den Rand, auch nicht durch den Versatz.
 */
export function packWall(notes: readonly WallNoteMetrics[], wallWidth: number): PackedWall {
  const columns = Math.max(1, Math.ceil(wallWidth / SKYLINE_RESOLUTION))
  const skyline = new Array<number>(columns).fill(0)
  const placed: PackedNote[] = []

  notes.forEach((note, index) => {
    const width = Math.min(note.width, wallWidth)
    const span = Math.min(columns, Math.max(1, Math.ceil(width / SKYLINE_RESOLUTION)))

    let bestColumn = 0
    let bestTop = Infinity
    for (let start = 0; start + span <= columns; start++) {
      let top = 0
      for (let k = start; k < start + span; k++) {
        if (skyline[k] > top) top = skyline[k]
      }
      if (top < bestTop - 0.001) {
        bestTop = top
        bestColumn = start
      }
    }
    if (bestTop === Infinity) bestTop = 0

    const indent = note.expanded || bestColumn !== 0 ? 0 : indentOf(note.id, LEFT_INDENT_MAX)
    const dx = (note.expanded ? 0 : jitterOf(note.id, 'x', 5)) + indent
    const dy = note.expanded ? 0 : jitterOf(note.id, 'y', 4) - 2.5
    const x = Math.max(0, Math.min(wallWidth - width, bestColumn * SKYLINE_RESOLUTION + dx))
    const y = Math.max(0, bestTop + dy)

    const gap = note.expanded ? EXPANDED_GAP : gapOf(note.id)
    for (let k = bestColumn; k < bestColumn + span; k++) {
      skyline[k] = y + note.height + gap
    }

    placed.push({ id: note.id, x, y, z: index + 1 })
  })

  return { notes: placed, height: Math.max(0, ...skyline) }
}
