/**
 * Geometrie der Pinnwand (Pinnwand-Redesign, Etappe 2 / Ticket 02).
 *
 * Reine Funktionen: kein Vue, kein DOM, keine Seiteneffekte. Die Höhe eines
 * Zettels kann hier nicht berechnet werden — sie hängt am Textumbruch und wird
 * von der Wand gemessen und hier hereingereicht.
 *
 * **Alles Unordentliche ist deterministisch.** Rotation, Versatz und Abstand
 * kommen aus einem FNV-1a-Hash über die `task_id` — nie aus
 * `Math.random()` und nie aus der Position in der Liste. Eine Neigung, die sich
 * beim Neuladen oder beim Umsortieren ändert, sieht aus wie ein Fehler. Weil die
 * `task_id` die einzige Eingabe ist, liegt derselbe Zettel nach jedem Neuladen
 * exakt gleich schief, und ein Zettel, der von Platz 7 auf Platz 2 wandert,
 * nimmt seine Neigung mit.
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
 * Untergrenze der Zettelbreite, damit ein Zettel mit sehr kurzem Titel
 * („Müll") nicht zum Schnipsel wird und der Bearbeiten-Knopf seinen Platz
 * behält.
 *
 * **Bleibt vorerst stehen.** Die Spec (Ticket 02) begründet den ersatzlosen
 * Wegfall damit, dass die Griffzeile aus dem Karten-Redesign (Bearbeiten-Stift
 * und Eselsohr, je 44 px nebeneinander) die Untergrenze inzwischen selbst
 * setzt — dieses Redesign ist auf diesem Branch aber (noch) nicht gelandet,
 * es existiert nur auf `proto/kartengroesse`. Ohne die Griffzeile würde ein
 * ersatzloser Wegfall hier echten Schaden anrichten: ein Zettel mit kurzem
 * Titel würde zum Schnipsel. Nachzuholen, sobald das Karten-Redesign landet.
 */
export const MIN_NOTE_WIDTH = 96

/**
 * Obergrenze für Zettel mit **mehrwortigen** Titeln, als Anteil der Wandbreite.
 * Kurze Titel erreichen sie nie und bleiben einzeilig; lange brechen an einer
 * Wortgrenze um, statt eine ganze Reihe für sich zu beanspruchen.
 *
 * Fest bei **45 %**, unabhängig vom Bestand: bei 45 % passen immer zwei Zettel
 * nebeneinander, die Entartung zur einspaltigen Liste kann nicht mehr
 * auftreten. Ein adaptiver Deckel (abhängig davon, was sonst an der Wand
 * hängt) wurde ausdrücklich verworfen — sonst würde das Anlegen einer Aufgabe
 * unbeteiligte Zettel umbrechen lassen. Vorher 68 %.
 *
 * Ein Titel ohne Wortgrenze ist ausgenommen — er kann nicht umbrechen, ein
 * Deckel würde ihn nur abschneiden. Ein solcher Zettel bekommt stattdessen
 * so viel Breite, wie er braucht, höchstens die ganze Wand (`defaultNoteWidth`
 * fällt dann auf `shape.natural` zurück, nur gegen `wallWidth` geklemmt).
 * Verhalten unverändert gegenüber dem Stand vor diesem Ticket — nur der
 * Deckelwert selbst ist gesunken.
 */
export const MAX_WIDTH_RATIO = 0.45

/**
 * Waagerechter Abstand, den der Reihenplaner (`planNoteWidths`) zwischen einem
 * Zettel und seinem rechten Nachbarn reserviert — Basiswert.
 *
 * Der x-Versatz aus `jitterOf` beträgt ±5 px **je Zettel**; zwei benachbarte
 * Zettel können also um bis zu 10 px aufeinander zulaufen. 12 px lassen dann
 * noch 2 px Luft. Die Zahl ist gerechnet, nicht gemessen.
 *
 * Um diesen Basiswert streut `rowGapOf` — siehe dort.
 */
const ROW_GAP_BASE = 12

/** Streubreite von `rowGapOf` um `ROW_GAP_BASE`, in Pixeln. */
const ROW_GAP_JITTER = 4

/**
 * Waagerechter Abstand zwischen einem Zettel und seinem rechten Nachbarn im
 * Reihenmodell, deterministisch aus der Aufgaben-Kennung des LINKEN Zettels.
 *
 * **Neu:** vorher war der Abstand mit `PAIR_GAP` für jedes Paar exakt
 * gleich — 8…16 px, Mitte weiter bei den ursprünglich hergeleiteten 12 px.
 * Eigener Hash-Schlüssel (`hgap`), damit die Streuung nicht denselben Wert
 * trifft wie die Neigung (`rotationOf`, ungeschlüsselter Hash) oder der
 * x-/y-Versatz (`jitterOf` mit den Schlüsseln `x`/`y`) — sie muss von der
 * Drehung unabhängig sein.
 */
export function rowGapOf(taskId: string): number {
  return ROW_GAP_BASE + jitterOf(taskId, 'hgap', ROW_GAP_JITTER)
}

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
  /**
   * Gruppe des Zettels, aufsteigend: 0 = fällig, 1 = täglich, 2 = Projekt.
   * Steuert sowohl die freie Packreihenfolge als auch die weiche Untergrenze
   * zwischen den Gruppen — siehe `packWall`.
   */
  group: number
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
   *
   * `.title` hat zwar `overflow: hidden` (Ellipse, `WallNote.vue`), aber das
   * senkt seinen Beitrag zur `min-content`-BREITE nicht auf 0: die
   * CSS-Regel zur automatischen Mindestgröße bei nicht-sichtbarem Overflow
   * gilt nur für die Flex-HAUPTachse, und `.zettel` steht auf
   * `flex-direction: column` — die Hauptachse ist die Höhe, nicht die
   * Breite. Gemessen an echten Zetteln: `minimum` reicht von 73 bis 380 px
   * über 26 verschiedene Werte, stets `min-content` des Titels plus eine
   * für den Zetteltyp feste Fußzeilen-Zutat — es IST das längste Wort.
   */
  minimum: number
}

/** Ein Titel ohne Wortgrenze misst bei `min-content` so viel wie einzeilig. */
const wraps = (shape: WallNoteShape) => shape.minimum < shape.natural

/**
 * Die Breite nach der Voreinstellung „Breite folgt dem Titel", ohne den zweiten
 * Packlauf: die natürliche Breite, für **mehrwortige** Titel gedeckelt.
 *
 * Die natürliche Breite selbst bestimmt der **Titel**, nicht eine Formel: die
 * Wand misst ihn einzeilig im Browser (`width: max-content` bei
 * `white-space: nowrap`) und übernimmt das Ergebnis. Eine Zeichenzahl-Schätzung
 * stünde hier nur im Weg — sie hinge an Schriftart und Schriftschnitt und läge
 * bei Umlauten und Großbuchstaben regelmäßig daneben.
 *
 * Kurze Titel erreichen den Deckel nie und bleiben einzeilig; ein langer,
 * mehrwortiger Titel bricht lieber an einer Wortgrenze um, als 45 % der Wand
 * zu beanspruchen. Ein einzelnes langes Wort ist ausgenommen — es kann nicht
 * umbrechen, ein Deckel würde es nur abschneiden; es bekommt so viel Breite,
 * wie es braucht, höchstens die ganze Wand (`wraps(shape)` ist dann `false`,
 * der Rückgabewert fällt auf `shape.natural` zurück und wird nur noch gegen
 * `wallWidth` geklemmt). Gemessen an einem 347-px-Wand-Beispiel mit
 * 156-px-Deckel: ein 44 Zeichen langes unbrechbares Wort landete bei 341 px,
 * ein noch längeres bei der vollen Wandbreite. Verhalten unverändert
 * gegenüber dem Stand vor diesem Ticket, nur der Deckelwert ist gesunken; ob
 * die Ausnahme bleiben soll, ist eine offene Spec-Frage.
 *
 * Auch die Rückfallbreite des zweiten Laufs: was er verwirft, landet wieder
 * hier. Nie schmaler als `MIN_NOTE_WIDTH` (siehe dort).
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
 * Wänden aber Reststreifen: ein Zettel misst 140 px auf einer 347-px-Wand,
 * daneben bleiben 195 px, und dort passt nur hinein, wessen Titel zufällig
 * darunter liegt. Bleibt keiner übrig, verkommt die Wand zur einspaltigen
 * Liste.
 *
 * Ein Eingriff: **Streifen füllen** — passt der nächste Zettel nicht mit
 * seiner natürlichen Breite in den Rest der Reihe, wohl aber an einer
 * Wortgrenze, bekommt er die Breite des Streifens. Er greift nur, wenn der
 * Zettel dabei kein Wort abschneidet (`minimum`).
 *
 * **Die Paar-Erzwingung entfällt ersatzlos.** Sie existierte nur, weil beim
 * vorigen Deckel von 68 % zwei Zettel selten nebeneinander passten und der
 * Packer danach stur der Reihe nach arbeitete. Beide Gründe sind mit dem
 * 45-%-Deckel und der freien Skyline (`packWall`) weg — bei 45 % passen immer
 * zwei Zettel, und was hier nicht nebeneinandersteht, findet die Skyline
 * ohnehin frei einen Platz.
 *
 * **`MIN_NOTE_WIDTH` bleibt vorerst als Untergrenze bestehen** (siehe dort) —
 * die Spec sieht ihren ersatzlosen Wegfall vor, das setzt aber die Griffzeile
 * des Karten-Redesigns voraus, die auf diesem Branch noch nicht gelandet ist.
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
 * Die Reihenfolge der Eingabe wird **nie** verändert — sie steuert nur, welche
 * Zettel im Reihenmodell als Nachbarn gelten. Welcher Zettel auf der Wand am
 * Ende WO steht, entscheidet danach ausschließlich `packWall`.
 */
export function planNoteWidths(
  shapes: readonly WallNoteShape[],
  wallWidth: number
): Map<string, number> {
  const defaultOf = (s: WallNoteShape) => defaultNoteWidth(s, wallWidth)
  /**
   * Untergrenze dieses Zettels: schmaler schneidet ab oder unterschreitet
   * `MIN_NOTE_WIDTH`. Bewusst **nicht** auf die Wandbreite geklemmt — ein
   * einzelnes Wort, das breiter als die Wand ist, schließt sich dadurch von
   * jeder Verschmälerung selbst aus.
   */
  const floorOf = (s: WallNoteShape) => Math.max(MIN_NOTE_WIDTH, s.minimum)
  /** Passt der Zettel in `width`, ohne ein Wort zu zerschneiden? */
  const fitsShrunk = (s: WallNoteShape, width: number) => wraps(s) && width >= floorOf(s)

  const plan = new Map<string, number>()

  let index = 0
  while (index < shapes.length) {
    // Erster Zettel der Reihe.
    const first = shapes[index]
    const width = defaultOf(first)
    plan.set(first.id, width)
    let rest = wallWidth - width - rowGapOf(first.id)
    index++

    // Weitere Zettel derselben Reihe.
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
 * Skyline-Packing: **frei innerhalb dreier Gruppen** (0 = fällig, 1 = täglich,
 * 2 = Projekt, aus `WallNoteMetrics.group`).
 *
 * Innerhalb einer Gruppe wählt der Packer selbst, welcher der noch
 * verbliebenen Zettel als Nächstes kommt — nicht die Eingabereihenfolge: bei
 * jedem Schritt wird für jeden übrigen Zettel der Gruppe die niedrigste
 * mögliche Oberkante gesucht, und der Zettel mit der insgesamt niedrigsten
 * Oberkante gewinnt den Platz. Das ist „freies Packen" im Sinn des Tickets —
 * die dringendste Aufgabe steht deshalb NICHT mehr zwingend oben; auf der Wand
 * gelten ohnehin alle fälligen Aufgaben als gleich dringend (→ CONTEXT.md,
 * „Dringlichkeit").
 *
 * **Der Tiebreak bei exaktem Gleichstand ist ein Hash der Aufgaben-Kennung
 * (`fnv1a`), NICHT die Position im Pool.** Bei nie erledigten Aufgaben ist
 * Gleichstand der Normalfall (`urgency = Infinity` für alle), und Poolposition
 * spiegelt die Eingabereihenfolge — also mittelbar die Store-Reihenfolge der
 * Aufgaben. Ein QC-Befund belegte das: eine einzige verschobene Aufgabe im
 * Store, sonst nichts geändert, bewegte 47 von 47 Zetteln. Mit dem
 * Hash-Tiebreak hängt das Ergebnis nur noch von der Menge der Zettel ab
 * (Kennung, Breite, Höhe, Gruppe) — nie von ihrer Reihenfolge.
 *
 * **Weiche Gruppengrenze.** Zwischen zwei Gruppen gilt eine Untergrenze
 * (`floor`): kein Zettel der neuen Gruppe darf mit seiner sichtbaren Oberkante
 * SCHON VOR diesem Wert landen — sonst stünde er sichtbar oberhalb des
 * letzten Zettels der Vorgruppe, z. B. ein Projekt über einer fälligen
 * Aufgabe. `floor` wird nach jeder Gruppe auf das Maximum von `y` — die
 * tatsächlich GEZEICHNETE Oberkante, NACH dem y-Versatz — über ALLE Zettel
 * dieser Gruppe angehoben.
 *
 * Das ist bewusst nicht (mehr) „nur der zuletzt platzierte Zettel": zwar ist
 * die Folge der gewählten `bestTop`-Werte innerhalb einer Gruppe nachweislich
 * monoton, aber `bestTop` ist die GEPLANTE Oberkante vor dem y-Versatz
 * (`dy`, bis zu +1,5 px). Der Sprung von geplant zu gezeichnet bricht die
 * Monotonie: in Messungen war in rund 8 % der Gruppen nicht der zuletzt
 * platzierte Zettel der tiefste. Die Grenze muss deshalb aus derselben Größe
 * gebildet werden, die am Ende sichtbar ist — `y`, nicht `bestTop` — und über
 * das Maximum der ganzen Gruppe, nicht über die Platzierungsreihenfolge.
 *
 * Innerhalb einer Gruppe gilt dieselbe `floor` für alle Zettel unverändert;
 * sie steigt erst beim Wechsel zur nächsten Gruppe. Genau das erlaubt einer
 * Gruppe, in den Reststreifen der vorigen hineinzulaufen (freie Spalten AUF
 * Höhe von `floor`), ohne je darüber zu landen.
 *
 * Die Untergrenze wird sowohl beim Suchen der Spalte als auch am fertigen
 * y-Wert erzwungen (`Math.max(floor, …)`) — Letzteres, damit auch der
 * y-Versatz (`jitterOf`) die Garantie nicht durch einen negativen Ausschlag
 * unterlaufen kann.
 *
 * **Waagerechte Luft zum rechten Nachbarn** (`rowGapOf`, ein paar Pixel
 * Streuung, deterministisch, unabhängig von der Drehung): nach dem Setzen
 * eines Zettels bleiben die Spalten unmittelbar rechts von ihm bis zu diesem
 * Abstand auf derselben Höhe blockiert. Ein Zettel, der sich direkt daneben
 * (nicht darunter) einreihen will, muss diese Spalten meiden und rückt damit
 * um den reservierten Abstand ab. Ohne das reserviert nur `planNoteWidths`
 * die Luft — auf der Skyline selbst, wo tatsächlich positioniert wird, war
 * der gemessene Abstand vorher 0.
 *
 * Grund für absolute Positionierung statt Grid: ein Zettel muss später
 * aufklappen und höher werden können, **ohne** dass seine Nachbarn mitwachsen.
 *
 * Positionen werden auf `[0, wallWidth − Breite]` geklemmt — kein Zettel ragt
 * über den Rand, auch nicht durch den Versatz.
 *
 * **Keine linke Einrückung.** Die Spec sieht hier eine deterministische
 * Einrückung an der linken Wandkante vor (26 px → 12 px). Der Mechanismus
 * dafür existiert nur auf dem Prototyp-Branch `proto/kartengroesse`
 * (`indentOf`/`LEFT_INDENT_MAX`), zusammen mit dem dort ebenfalls noch nicht
 * gelandeten Karten-Redesign. Ihn hier isoliert nachzubauen hieße, eine
 * Zahl zu senken, die es auf diesem Branch noch nicht gibt — deshalb bewusst
 * ausgelassen, nicht vergessen.
 */
export function packWall(notes: readonly WallNoteMetrics[], wallWidth: number): PackedWall {
  const columns = Math.max(1, Math.ceil(wallWidth / SKYLINE_RESOLUTION))
  const skyline = new Array<number>(columns).fill(0)
  const placed: PackedNote[] = []

  // Gruppen in Eingabereihenfolge sammeln, dann nach Gruppennummer aufsteigend
  // abarbeiten (fällig → täglich → Projekt). Die Wand reicht die Zettel zwar
  // bereits so sortiert herein, aber das ist keine Zusage dieser Funktion.
  const byGroup = new Map<number, WallNoteMetrics[]>()
  for (const note of notes) {
    const bucket = byGroup.get(note.group)
    if (bucket) bucket.push(note)
    else byGroup.set(note.group, [note])
  }
  const groupKeys = [...byGroup.keys()].sort((a, b) => a - b)

  let z = 0
  /** Weiche Untergrenze für die aktuell gepackte Gruppe, siehe Funktionskommentar. */
  let floor = 0

  for (const groupKey of groupKeys) {
    const pool = [...byGroup.get(groupKey)!]
    let groupFloor = floor

    while (pool.length > 0) {
      // Freies Packen: für jeden verbliebenen Zettel dieser Gruppe zuerst die
      // beste EIGENE Spalte suchen. Gewählt wird danach der Zettel mit der
      // insgesamt niedrigsten Oberkante — bei exaktem Gleichstand entscheidet
      // ein Hash der Aufgaben-Kennung, nicht die Position im Pool (siehe
      // Funktionskommentar, „Der Tiebreak…").
      let bestIndex = -1
      let bestColumn = 0
      let bestTop = Infinity
      let bestHash = 0

      for (let i = 0; i < pool.length; i++) {
        const note = pool[i]
        const width = Math.min(note.width, wallWidth)
        const span = Math.min(columns, Math.max(1, Math.ceil(width / SKYLINE_RESOLUTION)))

        let noteTop = Infinity
        let noteColumn = 0
        for (let start = 0; start + span <= columns; start++) {
          let top = floor
          for (let k = start; k < start + span; k++) {
            if (skyline[k] > top) top = skyline[k]
          }
          if (top < noteTop - 0.001) {
            noteTop = top
            noteColumn = start
          }
        }
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

      const note = pool.splice(bestIndex, 1)[0]
      const width = Math.min(note.width, wallWidth)
      const span = Math.min(columns, Math.max(1, Math.ceil(width / SKYLINE_RESOLUTION)))

      const dx = note.expanded ? 0 : jitterOf(note.id, 'x', 5)
      const dy = note.expanded ? 0 : jitterOf(note.id, 'y', 4) - 2.5

      const x = Math.max(0, Math.min(wallWidth - width, bestColumn * SKYLINE_RESOLUTION + dx))
      // Auf `floor` geklemmt: der y-Versatz darf einen Zettel etwas anheben,
      // aber niemals über die Untergrenze der Gruppe hinaus — sonst könnte der
      // Jitter allein die Gruppengrenze unterlaufen.
      const y = Math.max(floor, bestTop + dy)

      const vGap = note.expanded ? EXPANDED_GAP : gapOf(note.id)
      const bottom = y + note.height + vGap
      for (let k = bestColumn; k < bestColumn + span; k++) {
        skyline[k] = bottom
      }

      // Waagerechte Luft zum rechten Nachbarn reservieren (siehe
      // Funktionskommentar): die Spalten direkt rechts vom Zettel bleiben bis
      // zu `rowGapOf(note.id)` px auf derselben Höhe blockiert.
      if (!note.expanded) {
        const marginColumns = Math.ceil(rowGapOf(note.id) / SKYLINE_RESOLUTION)
        const marginEnd = Math.min(columns, bestColumn + span + marginColumns)
        for (let k = bestColumn + span; k < marginEnd; k++) {
          if (skyline[k] < bottom) skyline[k] = bottom
        }
      }

      z++
      placed.push({ id: note.id, x, y, z })
      // `y`, nicht `bestTop` — siehe Funktionskommentar, „Weiche
      // Gruppengrenze". Über die ganze Gruppe maximiert, nicht nur über den
      // zuletzt platzierten Zettel.
      groupFloor = Math.max(groupFloor, y)
    }

    floor = groupFloor
  }

  return { notes: placed, height: Math.max(0, ...skyline) }
}
