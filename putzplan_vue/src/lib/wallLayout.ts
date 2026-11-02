/**
 * Geometrie der Pinnwand.
 *
 * Reine Funktionen: kein Vue, kein DOM, keine Seiteneffekte. Die Höhe eines
 * Zettels kann hier nicht berechnet werden — sie hängt am Textumbruch und wird
 * von der Wand gemessen und hier hereingereicht.
 *
 * **Alles Unordentliche ist deterministisch.** Rotation, Versatz und Abstand
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

/** Abstand unter einem Zettel: 2 … 15 px. */
function gapOf(taskId: string): number {
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
 * Obergrenze für Zettel mit **mehrwortigen** Titeln, als Anteil der Wandbreite;
 * lange Titel brechen an einer Wortgrenze um. Fest bei 45 %: so passen immer
 * zwei Zettel nebeneinander. Ein adaptiver Deckel ist bewusst verworfen — sonst
 * ließe das Anlegen einer Aufgabe unbeteiligte Zettel umbrechen.
 *
 * Ein Titel ohne Wortgrenze ist ausgenommen — ein Deckel würde ihn nur
 * abschneiden; er bekommt so viel Breite, wie er braucht, höchstens die Wand.
 */
const MAX_WIDTH_RATIO = 0.45

/**
 * Basisabstand zum rechten Nachbarn. Der x-Versatz aus `jitterOf` beträgt
 * ±5 px je Zettel, zwei Nachbarn laufen also um bis zu 10 px aufeinander zu;
 * 12 px lassen dann noch 2 px Luft (gerechnet, nicht gemessen).
 */
const ROW_GAP_BASE = 12

const ROW_GAP_JITTER = 4

/**
 * Abstand zum rechten Nachbarn, 8…16 px aus der Kennung des LINKEN Zettels.
 * Eigener Hash-Schlüssel (`hgap`): die Streuung muss von Neigung und Versatz
 * unabhängig sein.
 */
function rowGapOf(taskId: string): number {
  return ROW_GAP_BASE + jitterOf(taskId, 'hgap', ROW_GAP_JITTER)
}

/**
 * Zusätzliche Einrückung (0…12 px) für einen Zettel an der LINKEN Wandkante.
 * Die Skyline setzt jeden Zettel, der links Platz findet, exakt auf x = 0 —
 * fast alle Zettel stünden auf einer perfekten Linie untereinander. So pinnt
 * kein Mensch, und der Versatz aus `jitterOf` (±5 px) reicht nicht, um die
 * Linie zu brechen.
 */
const LEFT_INDENT_MAX = 12

function indentOf(taskId: string): number {
  return fnv1a(`${taskId}#indent`) % (LEFT_INDENT_MAX + 1)
}

export interface WallNoteMetrics {
  id: string
  /** Bereits gesetzte Breite. */
  width: number
  /** Nach dem Setzen der Breite gemessene Höhe. */
  height: number
  /**
   * Aufgeklappt: volle Wandbreite, **kein** Versatz (ein y-Versatz bis −6,5 px
   * schöbe ihn unter den Zettel darüber) und fester Abstand `EXPANDED_GAP` —
   * ein Block, kein bepinnter Schnipsel.
   */
  expanded?: boolean
  /** 0 = fällig, 1 = täglich, 2 = Projekt — Packreihenfolge und Gruppengrenze, siehe `packWall`. */
  group: number
  /**
   * Oberkante im **vorigen** Lauf, sofern bekannt. Nur relevant, solange ein
   * anderer Zettel eine Vorgabe hat (`WallPin`): wer vorher auf gleicher Höhe
   * oder darunter lag, darf danach nicht darüber stehen. Fehlt der Wert (neuer
   * Zettel), darf der Zettel überall hin.
   */
  previousTop?: number
}

/**
 * Vorgabe für genau einen Zettel: er steht bei `top` und nimmt am Wettbewerb um
 * die niedrigste Oberkante nicht teil (→ CONTEXT.md, „Aufklappen").
 *
 * Die Reihenfolge des Feldes ist die **Antipp-Reihenfolge**; bei Konflikt
 * gewinnt der spätere Eintrag (→ `resolvePins`).
 */
export interface WallPin {
  id: string
  /** Gewünschte Oberkante in Wandkoordinaten. */
  top: number
}

/** Abstand unter einem aufgeklappten Zettel — gestalterisch gesetzt, nicht gemessen. */
const EXPANDED_GAP = 8

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
 * Was die Wand an einem Zettel gemessen hat, bevor sie seine Breite festlegt.
 * Ganzzahlig und inklusive Sicherheitszuschlag — damit dieselben Eingaben
 * immer dieselben Breiten ergeben.
 */
export interface WallNoteShape {
  id: string
  /** Breite bei `max-content`: der Titel steht in einer Zeile. */
  natural: number
  /**
   * Breite bei `min-content`: das breiteste unteilbare Stück (meist das
   * längste Titelwort, sonst die Fußzeile). Schmaler heißt **abschneiden**.
   *
   * `overflow: hidden` an `.title` senkt das nicht auf 0: die automatische
   * Mindestgröße gilt nur für die Flex-HAUPTachse, und `.zettel` steht auf
   * `flex-direction: column`.
   */
  minimum: number
}

/** Ein Titel ohne Wortgrenze misst bei `min-content` so viel wie einzeilig. */
const wraps = (shape: WallNoteShape) => shape.minimum < shape.natural

/**
 * Die Breite nach der Voreinstellung „Breite folgt dem Titel": die natürliche
 * Breite, für **mehrwortige** Titel gedeckelt (→ `MAX_WIDTH_RATIO`). Auch die
 * Rückfallbreite des zweiten Laufs.
 *
 * Die natürliche Breite misst die Wand im Browser (`max-content`, `nowrap`);
 * eine Zeichenzahl-Schätzung hinge an der Schrift und läge bei Umlauten und
 * Großbuchstaben regelmäßig daneben.
 *
 * **Keine eigene Untergrenzen-Konstante** — die Untergrenze ist strukturell:
 * `shape.minimum` enthält immer die volle Fußzeile, und darin reserviert
 * allein die Griffzeile `padding-right: 88px` für Bearbeiten-Stift und
 * Eselsohr (je 44 px, `WallNote.vue`, `.foot`) — dazu kommen 18 px waagerechte
 * Zettel-Chrome (`chromeWidth`) und 4 px `MEASURE_SAFETY` (beide
 * `WallView.vue`). 88 + 18 + 4 = **110** px, die Breite eines Zettels mit
 * leerer sichtbarer Fußzeile. Wer die Griffe verkleinert oder `padding-right`
 * senkt, senkt damit auch diese Untergrenze — ohne diesen Kommentar fiele das
 * niemandem auf, und ein kurzer Titel würde wieder zum Schnipsel.
 */
export function defaultNoteWidth(shape: WallNoteShape, wallWidth: number): number {
  const cap = Math.min(wallWidth, Math.round(wallWidth * MAX_WIDTH_RATIO))
  const wanted = shape.natural > cap && wraps(shape) ? cap : shape.natural
  // `shape.minimum` sticht den Deckel: eine volle Fußzeile kann breiter sein
  // als 45 % der Wand und liefe sonst über den Zettelrand und die Griffe
  // hinaus. Die Wandklemmung bleibt trotzdem außen.
  return Math.min(wallWidth, Math.max(wanted, shape.minimum))
}

/**
 * Zweiter Packlauf: Breiten so wählen, dass möglichst zwei Zettel
 * nebeneinander stehen.
 *
 * Mit natürlichen Breiten bleiben auf schmalen Wänden Reststreifen, in die nur
 * zufällig etwas passt. Deshalb **Streifen füllen**: passt der nächste Zettel
 * nicht mit seiner natürlichen Breite in den Rest der Reihe, wohl aber an einer
 * Wortgrenze (ohne ein Wort abzuschneiden, `minimum`), bekommt er die Breite
 * des Streifens. Keine Paar-Erzwingung — was hier nicht nebeneinandersteht,
 * platziert die freie Skyline (`packWall`).
 *
 * **Das Reihenmodell ist eine Näherung**: es entscheidet nur Breiten und
 * unterstellt gleich hohe Zettel (Regelfall: einzeilig). Liegt es daneben,
 * packt die Skyline trotzdem gültig, nur weniger dicht.
 *
 * Ob ein verschmälerter Zettel zu hoch wird, entscheidet die Wand, die die
 * Höhe misst (→ `WallView`) — Vorschläge, keine Zusagen. Die Eingabereihenfolge
 * bestimmt nur, wer im Reihenmodell Nachbar ist; wo ein Zettel am Ende steht,
 * entscheidet `packWall`.
 */
export function planNoteWidths(
  shapes: readonly WallNoteShape[],
  wallWidth: number,
): Map<string, number> {
  const defaultOf = (s: WallNoteShape) => defaultNoteWidth(s, wallWidth)
  /**
   * Passt der Zettel in `width`, ohne ein Wort zu zerschneiden? Bewusst
   * **nicht** auf die Wandbreite geklemmt — ein einzelnes Wort, das breiter
   * als die Wand ist, schließt sich dadurch von jeder Verschmälerung selbst aus.
   */
  const fitsShrunk = (s: WallNoteShape, width: number) => wraps(s) && width >= s.minimum

  const plan = new Map<string, number>()

  let index = 0
  while (index < shapes.length) {
    const first = shapes[index]
    const width = defaultOf(first)
    plan.set(first.id, width)
    let rest = wallWidth - width - rowGapOf(first.id)
    index++

    while (index < shapes.length) {
      const shape = shapes[index]
      const wanted = defaultOf(shape)
      let taken: number
      if (wanted <= rest) {
        taken = wanted
      } else if (fitsShrunk(shape, rest)) {
        // Reststreifen füllen: der Titel bricht an einer Wortgrenze um.
        taken = rest
      } else {
        break
      }
      plan.set(shape.id, taken)
      rest -= taken + rowGapOf(shape.id)
      index++
    }
  }

  return plan
}

interface PackedNote {
  id: string
  x: number
  y: number
  /**
   * Stapelreihenfolge. **Nicht** die Packreihenfolge — die folgt der Skyline
   * und weiß nichts von links und rechts. Kleineres `x` gewinnt: der linke
   * Zettel liegt über dem rechten, sein Eselsohr (untere rechte Ecke) bleibt
   * frei statt vom rechten Nachbarn verdeckt. Bei gleichem `x` gewinnt kleineres `y` — aus derselben
   * Begründung: zwei Zettel untereinander überlappen an der UNTEREN Kante des
   * oberen, wo Stift und Eselsohr sitzen, also gewinnt wieder der frühere.
   * Vergeben wird `z` erst NACH dem Packen, aus der fertigen Position — siehe
   * `packWall`.
   */
  z: number
}

export interface PackedWall {
  notes: PackedNote[]
  height: number
}

/** Auflösung der Skyline in Pixeln. Feiner kostet Zeit, gröber verschenkt Platz. */
const SKYLINE_RESOLUTION = 4

/**
 * Die Rahmenbreite von `.zettel` (`WallNote.vue`, `border: 2px solid transparent`).
 *
 * **Unsichtbar, aber nicht folgenlos.** Eine absolut positionierte Befestigung
 * sitzt in der **Padding-Box** von `.zettel`, der Packer positioniert aber die
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
 * herstellbar: der Packer rechnet, bevor ein Zettel im DOM steht. Die Kopplung
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
  group: 0 | 1 | 2
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
    group: 0,
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
    group: 1,
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
    group: 2,
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
    group: 2,
    anchor: 'right',
    inset: 19.5,
    top: -8,
    width: 15,
    height: 20,
    rotation: 6,
  },
]

/**
 * Die Befestigungen, die ein Zettel dieser Gruppe tragen KANN.
 *
 * Gruppe und gezeichnete Sorte decken sich bei Gruppe 1 nicht: `dailyTasks`
 * enthält auch `one-time` (`useTaskBoard.ts`), und der trägt eine Reißzwecke
 * (`kindOfTaskType`), bekommt hier aber `.tape`. Das fällt auf die sichere
 * Seite — `.tape` steht weiter über, das Polster wird überschätzt, nie
 * unterschätzt.
 *
 * Eine **unbekannte** Gruppe bekommt aus demselben Grund **alle**
 * Befestigungen, nicht keine — sichtbarer Kork ist ein Schönheitsfehler, eine
 * überstehende Befestigung ist der gemeldete Bug. Damit dieser Zweig überhaupt
 * erreichbar ist, meldet `WallView` einen Zettel ohne Gruppenzuordnung als
 * `-1` und nicht als `0`; ein `?? 0` dort führte ihn still zur KNAPPSTEN Sorte
 * und machte dieses Netz wirkungslos.
 */
const fastenersOfGroup = (group: number): typeof FASTENERS => {
  const own = FASTENERS.filter((f) => f.group === group)
  return own.length > 0 ? own : FASTENERS
}

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
 *    **breitenabhängig**, und deshalb reicht kein Skalar.
 *
 * **Bewusst weggelassen:** die Zettelneigung senkt die Oberkante in der
 * Zettelmitte zusätzlich um `(H/2)·(1 − cos θ)` (bei 3 deg höchstens rund
 * 0,3 px). Der Term braucht die Zettelhöhe und macht das Ergebnis nur
 * KLEINER; ihn wegzulassen ist die konservative Seite und spart die
 * Abhängigkeit.
 *
 * @param noteWidth Border-Box-Breite des Zettels, wie `WallView` sie setzt.
 * @param tiltDeg   Neigung des Zettels in Grad (`rotationOf`).
 * @returns Überstand über die Zettel-Oberkante in px, nie negativ.
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
 * Gerechnet über die Zettel, die wirklich gepackt werden: Breite aus
 * `WallNoteMetrics`, Neigung aus `rotationOf(id)` wie in `WallNote.vue` —
 * exakt, kein Worst Case.
 *
 * **Das Maximum über ALLE Zettel, nicht über die oberste Reihe**: die steht
 * erst nach dem Packen fest, das Polster muss vorher feststehen. Preis: ein
 * paar Pixel leerer Kork, wenn der größte Überstand nicht oben hängt.
 *
 * **Erwartete Bewegung, kein Fehler:** bei Projekten hängt der Überstand an der
 * Breite. Klappt ein Projekt auf (volle Wandbreite), wächst das Polster um rund
 * 4 px, die ganze Wand rutscht über die FLIP-Schwelle und **alle** Zettel
 * fliegen mit; Zuklappen bewegt sie zurück. Ein Polster, das nie schrumpft,
 * kostete stattdessen dauerhaft Kork.
 *
 * Ohne Zettel ist das Polster **0**, sonst merkte sich `rememberWallHeight`
 * leeren Kork als Mindesthöhe. Die Unterkante bleibt bewusst ohne Polster.
 */
function topPaddingFor(notes: readonly WallNoteMetrics[]): number {
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
 * Wie weit der y-Versatz einen Zettel höchstens nach UNTEN schiebt.
 * `jitterOf(id, 'y', 4) - 2.5` liegt in [−6,5; +1,5] — nach unten also 1,5 px.
 *
 * Gebraucht beim Packen oberhalb einer Vorgabe: geprüft wird die GEPLANTE
 * Oberkante, gezeichnet die verschobene; ohne Zuschlag ragte ein Zettel bis
 * 1,5 px in den vorgegebenen hinein. Eine Ableitung, keine Setzung — wer
 * `jitterOf`-Bereich oder Mitte ändert, zieht sie mit.
 */
const JITTER_DOWN_MAX = 1.5

/**
 * Vorgaben in tatsächliche Oberkanten übersetzen.
 *
 * Jede Vorgabe beansprucht ein Fenster [top, top + Höhe + `EXPANDED_GAP`].
 * Überschneiden sich zwei Fenster, **gewinnt der zuletzt angetippte** — deshalb
 * von hinten nach vorn: wer später drankommt und anstößt, rutscht unter das
 * störende Fenster. Typisch: erst unten aufgeklappt (A), dann darüber (B), B
 * wächst in A hinein — B bleibt liegen, A rutscht auf B's Unterkante.
 *
 * Terminiert: jeder Ausweichschritt setzt `top` auf die Unterkante eines
 * vergebenen Fensters, das danach nicht mehr stören kann.
 *
 * Vorgaben ohne bekannte Höhe (Zettel hängt nicht mehr an der Wand) fallen
 * heraus.
 */
function resolvePins(
  pins: readonly WallPin[],
  heightOf: (id: string) => number | undefined,
): Map<string, number> {
  const resolved = new Map<string, number>()
  const claimed: Array<{ top: number; bottom: number }> = []

  for (let i = pins.length - 1; i >= 0; i--) {
    const pin = pins[i]
    const height = heightOf(pin.id)
    if (height === undefined) continue

    let top = pin.top
    for (;;) {
      const clash = claimed.find(
        (window) => top < window.bottom - 0.001 && top + height + EXPANDED_GAP > window.top + 0.001,
      )
      if (!clash) break
      top = clash.bottom
    }
    claimed.push({ top, bottom: top + height + EXPANDED_GAP })
    resolved.set(pin.id, top)
  }

  return resolved
}

/**
 * Skyline-Packing: **frei innerhalb dreier Gruppen** (0 = fällig, 1 = täglich,
 * 2 = Projekt, aus `WallNoteMetrics.group`).
 *
 * Innerhalb einer Gruppe wählt der Packer selbst, welcher Zettel als Nächstes
 * kommt: der mit der insgesamt niedrigsten möglichen Oberkante. Die
 * dringendste Aufgabe steht deshalb NICHT zwingend oben (→ CONTEXT.md,
 * „Stempel").
 *
 * **Tiebreak bei exaktem Gleichstand ist ein Hash der Kennung (`fnv1a`), NICHT
 * die Position im Pool.** Gleichstand ist bei nie erledigten Aufgaben der
 * Normalfall, und die Poolposition spiegelt die Store-Reihenfolge — eine
 * verschobene Aufgabe im Store bewegte sonst die ganze Wand. Das Ergebnis
 * hängt nur von der Menge der Zettel ab, nie von ihrer Reihenfolge.
 *
 * **Weiche Gruppengrenze.** Kein Zettel einer Gruppe darf mit seiner
 * sichtbaren Oberkante über `floor` landen — sonst stünde z. B. ein Projekt
 * über einer fälligen Aufgabe. `floor` steigt nach jeder Gruppe auf das
 * Maximum von `y` (die GEZEICHNETE Oberkante, nach dem y-Versatz) über ALLE
 * Zettel der Gruppe — nicht auf den zuletzt platzierten: der Versatz bricht
 * die Monotonie der geplanten Oberkanten. Innerhalb der Gruppe bleibt `floor`
 * fest; so läuft eine Gruppe in die Reststreifen der vorigen, ohne je darüber
 * zu landen. Erzwungen beim Suchen und am fertigen `y`, damit auch ein
 * negativer Versatz die Garantie nicht unterläuft.
 *
 * **Waagerechte Luft** (`rowGapOf`): rechts neben einem gesetzten Zettel
 * bleiben die Spalten bis zu diesem Abstand auf seiner Höhe blockiert —
 * sonst reservierte nur `planNoteWidths` die Luft, und auf der Skyline
 * stünden Nachbarn Kante an Kante.
 *
 * Absolute Positionierung statt Grid: ein Zettel muss aufklappen können,
 * **ohne** dass seine Nachbarn mitwachsen. Positionen werden auf
 * `[0, wallWidth − Breite]` geklemmt, auch gegen den Versatz.
 *
 * **Linke Einrückung** (`indentOf`) nur in Spalte 0 und nicht aufgeklappt —
 * mitten in einer Reihe risse sie ein Loch, statt die Kante aufzulockern.
 *
 * **Vorgaben (`pins`).** Ein aufgeklappter Zettel bleibt liegen, wo er lag; die
 * anderen weichen ihm aus. Die Funktion ist zustandslos, die Wand reicht die
 * gemerkte Oberkante herein. Für einen vorgegebenen Zettel gilt:
 *
 * - Seine Oberkante ist gesetzt, er bekommt **keinen** y-Versatz — ein Versatz
 *   wäre genau die Bewegung, die ausbleiben soll.
 * - Er wird nach unten gegen `floor` geklemmt und zusätzlich gegen die echten
 *   Unterkanten seiner Spalten (`contentLine`), nicht gegen die Skyline mit
 *   ihrem Zierabstand. Lassen sich „bleibt liegen" und „überlappt nicht" nicht
 *   zugleich einhalten, gewinnt „überlappt nicht".
 * - Er wirkt als **Sperrlinie**: danach liegt die Skyline in seinen Spalten auf
 *   seiner Unterkante, in allen übrigen mindestens auf seiner Oberkante.
 * - **Wer vorher unter (oder neben) ihm lag, bleibt unter ihm.** Oberhalb der
 *   Vorgabe packen nur Zettel mit `previousTop` echt kleiner als die Vorgabe,
 *   und nur, wenn sie GANZ darüber passen — sonst rutschte ein Zettel von unten
 *   in die Lücke, die der vorgegebene Zettel als schmaler hinterlassen hat.
 * - Waagerecht landet er in Spalte 0 ohne Einrückung — für den einzigen
 *   Anwendungsfall, den wandbreiten aufgeklappten Zettel, die einzige Stelle.
 */
export function packWall(
  notes: readonly WallNoteMetrics[],
  wallWidth: number,
  pins: readonly WallPin[] = [],
): PackedWall {
  const columns = Math.max(1, Math.ceil(wallWidth / SKYLINE_RESOLUTION))
  /** Einmal vorab: der Wert trägt die ganze Rechnung und darf sich währenddessen nicht ändern. */
  const topPadding = topPaddingFor(notes)
  // Die Skyline startet beim Polster, nicht bei 0: der ganze Packer rechnet in
  // Wandkoordinaten MIT Polster, und `pins` und `previousTop` — beide aus einem
  // früheren Packergebnis — liegen im selben Bezugssystem. Ein Versatz erst am
  // Ausgang verlangte eine Umrechnung am Eingang, mit Drift je Lauf, sobald
  // man sie vergisst.
  const skyline = new Array<number>(columns).fill(topPadding)
  /**
   * Die UNTERKANTEN des Gesetzten je Spalte, ohne den Zierabstand der
   * `skyline`. Damit wird eine Vorgabe geklemmt — gegen `skyline` wanderte sie
   * bis zu 15 px, obwohl nichts überlappt.
   */
  const contentLine = new Array<number>(columns).fill(0)
  const placed: PackedNote[] = []
  /**
   * Die fertigen Rechtecke, parallel zu `placed` — für die senkrechte Klemmung
   * in `place`. Nicht `contentLine`: die ist auf `SKYLINE_RESOLUTION` gerundet
   * und meldet Berührung, wo eine Lücke ist. Eigenes Feld, weil Breite und Höhe
   * keine Zusage an den Aufrufer sind.
   */
  const placedBoxes: Array<{ x: number; width: number; y: number; height: number }> = []

  // Nach Gruppennummer aufsteigend abarbeiten (fällig → täglich → Projekt). Die
  // Wand reicht die Zettel zwar bereits so sortiert herein, aber das ist keine
  // Zusage dieser Funktion.
  const byGroup = new Map<number, WallNoteMetrics[]>()
  for (const note of notes) {
    const bucket = byGroup.get(note.group)
    if (bucket) bucket.push(note)
    else byGroup.set(note.group, [note])
  }
  const groupKeys = [...byGroup.keys()].sort((a, b) => a - b)

  const heights = new Map<string, number>(notes.map((note) => [note.id, note.height]))
  /** Vorgegebene Oberkanten, Konflikte bereits aufgelöst (siehe `resolvePins`). */
  const pinnedTops = resolvePins(pins, (id) => heights.get(id))

  /**
   * Weiche Untergrenze der aktuellen Gruppe. Startet auf `topPadding`, nicht 0:
   * die angehobene Skyline allein reicht NICHT, denn `dy` zieht bis zu 6,5 px
   * nach oben, und die Befestigung des obersten Zettels stünde wieder über dem
   * Kork.
   */
  let floor = topPadding

  /**
   * Waagerechter Versatz je Zettel, gemerkt: `drawnBox` läuft je
   * Kandidatenspalte. `indent` gilt nur in Spalte 0 — das entscheidet
   * `drawnBox`.
   */
  const offsetCache = new Map<string, { jitter: number; indent: number }>()
  const offsetsOf = (note: WallNoteMetrics, pinned: boolean) => {
    // Ein aufgeklappter oder vorgegebener Zettel bekommt keinen Versatz — auch
    // keinen x-Jitter: die Sperrlinie läuft über die GEZEICHNETE Position und
    // stünde sonst um den Versatz neben dem Zettel.
    if (note.expanded || pinned) return { jitter: 0, indent: 0 }
    const hit = offsetCache.get(note.id)
    if (hit) return hit
    const fresh = { jitter: jitterOf(note.id, 'x', 5), indent: indentOf(note.id) }
    offsetCache.set(note.id, fresh)
    return fresh
  }

  /**
   * **Die einzige Stelle, die weiß, wo ein Zettel tatsächlich gezeichnet wird.**
   * Suche, Reservierung und Zeichnung müssen denselben Kasten samt Versatz
   * (`jitterOf` + `indentOf`) sehen — sonst ragt ein versetzter Zettel in
   * Spalten, die niemand für ihn zurückgelegt hat.
   *
   * **Deshalb wird er VOR der Spaltensuche gerufen, nicht danach.** „Erst
   * suchen, dann breiter reservieren" reicht nicht: ein Zettel mit negativem
   * `dx` ragt nach **links** in eine Spalte, deren Skyline höher liegen kann —
   * er würde in seinen linken Nachbarn gezeichnet.
   *
   * `colEnd` ist **exklusiv**.
   */
  const drawnBox = (note: WallNoteMetrics, column: number, pinned: boolean) => {
    const width = Math.min(note.width, wallWidth)
    const offsets = offsetsOf(note, pinned)
    const dx = offsets.jitter + (column === 0 ? offsets.indent : 0)
    const x = Math.max(0, Math.min(wallWidth - width, column * SKYLINE_RESOLUTION + dx))
    const colStart = Math.max(0, Math.floor(x / SKYLINE_RESOLUTION))
    const colEnd = Math.min(
      columns,
      Math.max(colStart + 1, Math.ceil((x + width) / SKYLINE_RESOLUTION)),
    )
    return { x, width, colStart, colEnd }
  }

  for (const groupKey of groupKeys) {
    const members = byGroup.get(groupKey)!
    const pool = members.filter((note) => !pinnedTops.has(note.id))
    // Vorgaben dieser Gruppe von oben nach unten abarbeiten. Bei exakt gleicher
    // Oberkante entscheidet der Hash, nicht die Eingabereihenfolge — dieselbe
    // Begründung wie beim Tiebreak des freien Packens.
    const pinnedHere = members
      .filter((note) => pinnedTops.has(note.id))
      .sort((a, b) => pinnedTops.get(a.id)! - pinnedTops.get(b.id)! || fnv1a(a.id) - fnv1a(b.id))
    let groupFloor = floor

    /**
     * Setzt einen Zettel, zieht die Skyline nach und merkt die Untergrenze.
     * `pinned` schaltet den y-Versatz ab (der vorgegebene Zettel soll exakt
     * liegen bleiben) und macht ihn zur Sperrlinie über die ganze Wandbreite.
     */
    const place = (note: WallNoteMetrics, column: number, top: number, pinned: boolean) => {
      // Dieselbe Rechnung wie im Suchlauf (`packFree`) — beide fragen
      // `drawnBox`. Weicht die eine von der anderen ab, reserviert der Packer
      // woanders, als er zeichnet.
      const { x, width, colStart, colEnd } = drawnBox(note, column, pinned)
      const dy = note.expanded || pinned ? 0 : jitterOf(note.id, 'y', 4) - 2.5

      // Eine Vorgabe wird zusätzlich gegen die UNTERKANTEN ihrer Spalten
      // geklemmt: `floor` ist das Maximum der OBERKANTEN der Vorgruppe, ein
      // hoher Zettel dort ist für `floor` unsichtbar — die Vorgabe landete
      // mitten in ihm. „Überlappt nicht" schlägt „bleibt liegen". Innerhalb der
      // eigenen Gruppe ist das wirkungslos (`packFree` setzt vor der Vorgabe nur,
      // was GANZ darüber passt); es greift an der Gruppengrenze.
      let clamped = top
      if (pinned) {
        // Über die GEZEICHNETEN Spalten, nicht über `column … column + span` —
        // sonst klemmt die Vorgabe gegen fremde Spalten. Dass beide heute
        // gleich sind (Vorgabe wandbreit ab Spalte 0), ist eine Eigenschaft des
        // einzigen Aufrufers, keine dieser Funktion.
        for (let k = colStart; k < colEnd; k++) {
          if (contentLine[k] > clamped) clamped = contentLine[k]
        }
      }

      // **Senkrechte Klemmung gegen die echten Rechtecke** (nicht gegen die
      // gerundete `contentLine`, die kostete Wandhöhe). `gapOf + dy` kann bis
      // −4,5 px fallen; deshalb nach unten gegen jeden gesetzten Zettel, mit dem
      // er sich waagerecht überschneidet — **0 px Überlapp per Konstruktion**:
      // jedes Paar wird beim Setzen des späteren geprüft, und die Klemmung
      // schiebt nur nach unten. Sie greift nur bei negativem `dy`.
      let contentMax = 0
      for (const box of placedBoxes) {
        if (box.x >= x + width || x >= box.x + box.width) continue
        const bottom = box.y + box.height
        if (bottom > contentMax) contentMax = bottom
      }

      // Auf `floor` geklemmt, sonst unterliefe der Versatz die Gruppengrenze.
      const y = Math.max(floor, contentMax, clamped + dy)

      const vGap = note.expanded ? EXPANDED_GAP : gapOf(note.id)
      const bottom = y + note.height + vGap
      // **Nie senken.** Bei einer Vorgabe kommt `top` von außen; eine Zuweisung
      // senkte die Skyline und löschte die Kollision, die die Sperrlinie
      // festhalten soll (zu klein gemeldete `height`).
      //
      // **Voraussetzung**, dass beim freien Packen nichts sinkt: `note.height +
      // vGap` muss größer sein als der Aufwärtsschub von `dy` (höchstens
      // 6,5 px). Wer Zettel unter ~10 px zulässt (oder `display:none` misst),
      // muss hier nachdenken.
      const face = y + note.height
      for (let k = colStart; k < colEnd; k++) {
        if (skyline[k] < bottom) skyline[k] = bottom
        if (contentLine[k] < face) contentLine[k] = face
      }

      if (pinned) {
        // Sperrlinie: kein später gesetzter Zettel kommt seitlich an ihm vorbei
        // nach oben. Auch hier die GEZEICHNETEN Spalten, sonst stünde sie um den
        // Versatz neben dem Zettel.
        for (let k = 0; k < columns; k++) {
          const barrier = k >= colStart && k < colEnd ? bottom : y
          if (skyline[k] < barrier) skyline[k] = barrier
        }
      } else if (!note.expanded) {
        // Waagerechte Luft rechts vom GEZEICHNETEN Kasten. **Ab der exakten
        // rechten Kante, nicht ab `colEnd`**: zweimal aufrunden ergäbe bis zu
        // ~7 px, die niemand bestellt hat.
        const marginEnd = Math.min(
          columns,
          Math.ceil((x + width + rowGapOf(note.id)) / SKYLINE_RESOLUTION),
        )
        for (let k = colEnd; k < marginEnd; k++) {
          if (skyline[k] < bottom) skyline[k] = bottom
        }
      }

      // `z` ist ein Platzhalter — vergeben wird es erst nach der Schleife aus
      // der fertigen Position (→ `PackedNote.z`).
      placed.push({ id: note.id, x, y, z: 0 })
      placedBoxes.push({ x, width, y, height: note.height })
      // `y`, nicht die geplante Oberkante — siehe Funktionskommentar, „Weiche
      // Gruppengrenze".
      groupFloor = Math.max(groupFloor, y)
    }

    /**
     * Freies Packen aus `pool`, bis nichts mehr passt. `limitTop` ist die
     * Oberkante der nächsten Vorgabe (sonst `Infinity`): nur was GANZ darüber
     * passt und schon vorher darüber lag, kommt zum Zug — geprüft je SPALTE
     * und notfalls ohne Zierabstand (→ `noteTier`).
     */
    const packFree = (limitTop: number) => {
      const limited = limitTop !== Infinity
      for (;;) {
        // Für jeden verbliebenen Zettel zuerst die beste EIGENE Spalte, danach
        // der Zettel mit der niedrigsten Oberkante; Gleichstand entscheidet der
        // Hash (→ Funktionskommentar, „Der Tiebreak…").
        let bestIndex = -1
        let bestColumn = 0
        let bestTop = Infinity
        let bestHash = 0

        for (let i = 0; i < pool.length; i++) {
          const note = pool[i]
          // Wer vorher auf gleicher Höhe oder tiefer lag, darf nicht darüber; ein
          // neuer Zettel darf.
          if (limited && (note.previousTop ?? -Infinity) >= limitTop - 0.001) continue

          let noteTop = Infinity
          let noteColumn = 0
          // **Spaltenwahl vor einer Sperrlinie:** unter den Spalten, in denen der
          // Zettel GANZ darüber passt, die Nähe zur ALTEN Oberkante
          // (`previousTop`); ohne Vorgeschichte die niedrigste. Welcher Zettel
          // zuerst kommt, bleibt gierig nach niedrigster Oberkante
          // (→ docs/pinnwand-layout.md).
          const prevTarget = limited ? note.previousTop : undefined
          let noteScore = Infinity
          /**
           * Stufe der Spalte: 0 = passt samt Zierabstand (Skyline), 1 = nur
           * gegen die echten Unterkanten (`contentLine`) — lieber ohne
           * Zierabstand über der Sperrlinie als ganz darunter. Überlappfrei
           * bleibt beides (`place` klemmt gegen `placedBoxes`), und
           * `JITTER_DOWN_MAX` gilt auch in Stufe 1, damit die Sperrlinie nicht
           * nachrutscht.
           */
          let noteTier = 2
          // **Über ALLE Startspalten, nicht nur `start + span <= columns`**: bei
          // negativem `dx` ergeben die letzten Startspalten noch NEUE Positionen
          // an der rechten Kante. Die Duplikate dahinter kosten nur Rechenzeit.
          for (let start = 0; start < columns; start++) {
            const box = drawnBox(note, start, false)
            let top = floor
            for (let k = box.colStart; k < box.colEnd; k++) {
              if (skyline[k] > top) top = skyline[k]
            }
            // Ausschluss je Spalte (samt `JITTER_DOWN_MAX`), nicht nach der
            // Spaltenwahl — so kommt eine etwas tiefere Spalte noch zum Zug.
            let tier = 0
            if (limited && top + note.height + JITTER_DOWN_MAX > limitTop) {
              let face = floor
              for (let k = box.colStart; k < box.colEnd; k++) {
                if (contentLine[k] > face) face = contentLine[k]
              }
              if (face + note.height + JITTER_DOWN_MAX > limitTop) continue
              tier = 1
              top = face
            }
            // Stufe 0 sticht Stufe 1, danach entscheidet `score`.
            const score = prevTarget === undefined ? top : Math.abs(top - prevTarget)
            if (tier < noteTier || (tier === noteTier && score < noteScore - 0.001)) {
              noteTier = tier
              noteScore = score
              noteTop = top
              noteColumn = start
            }
          }
          if (limited && noteTop === Infinity) continue
          if (noteTop === Infinity) noteTop = floor

          const hash = fnv1a(note.id)
          const better =
            bestIndex === -1 ||
            noteTop < bestTop - 0.001 ||
            (Math.abs(noteTop - bestTop) <= 0.001 && hash < bestHash)
          if (better) {
            bestTop = noteTop
            bestColumn = noteColumn
            bestIndex = i
            bestHash = hash
          }
        }

        if (bestIndex === -1) return
        place(pool.splice(bestIndex, 1)[0], bestColumn, bestTop, false)
      }
    }

    for (const note of pinnedHere) {
      const top = Math.max(floor, pinnedTops.get(note.id)!)
      // Erst alles, was noch echt über die Vorgabe passt …
      packFree(top)
      // … dann die Vorgabe selbst als Sperrlinie.
      place(note, 0, top, true)
    }

    packFree(Infinity)

    floor = groupFloor
  }

  // Stapelreihenfolge (→ `PackedNote.z`): bei erneutem Gleichstand ein Hash
  // statt der Position im Feld — eine verschobene Aufgabe im Store darf den
  // Stapel nicht ändern.
  //
  // Sortiert wird eine KOPIE; mutiert werden die `z`-Felder der Objekte in
  // `placed`, deren Array-Reihenfolge die Packreihenfolge bleibt (jeder
  // Konsument liest `note.z`). `sortedAsc[0]` muss das HÖCHSTE `z` bekommen —
  // deshalb `length − index`.
  const sortedAsc = [...placed].sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x
    if (a.y !== b.y) return a.y - b.y
    return fnv1a(a.id) - fnv1a(b.id)
  })
  sortedAsc.forEach((note, index) => {
    note.z = sortedAsc.length - index
  })

  // `z` reicht von 1 bis `placed.length` und muss unter den `z-index`-Werten
  // bleiben, die `WallNote.vue` per `!important` für den gezogenen (800) bzw.
  // lang gedrückten (810) Zettel reserviert, und unter 600…(600+n) der
  // Fluganimation in `WallView.vue` — sonst verdeckt ein ruhender Zettel einen
  // aktiv gezogenen.
  // Ohne `Math.max(0, …)`: `skyline` hat immer mindestens eine Spalte und liegt
  // nie unter `topPadding`; die leere Wand kommt von selbst auf 0 heraus.
  return { notes: placed, height: Math.max(...skyline) }
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
