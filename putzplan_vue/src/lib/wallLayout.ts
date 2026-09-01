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
 * Deckel würde ihn nur abschneiden. Ein solcher Zettel bekommt stattdessen so
 * viel Breite, wie er braucht, höchstens die ganze Wand. Bewusste Entscheidung
 * von vor diesem Ticket, unverändert übernommen — nur der Deckelwert selbst
 * ist gesunken (68 % → 45 %). In der Praxis betrifft das seltene, sehr lange
 * Komposita; ein alltägliches wie „Dunstabzugshaubenfilter" (23 Zeichen)
 * bleibt deutlich unter der vollen Wandbreite.
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

/**
 * Zusätzliche Einrückung für einen Zettel an der LINKEN Wandkante, in Pixeln
 * (Karten-Redesign, Ticket 00a). Die Skyline setzt jeden Zettel, der links
 * Platz findet, exakt auf x = 0 — dadurch stehen fast alle Zettel auf einer
 * perfekten Linie untereinander. So pinnt kein Mensch: der Versatz aus
 * `jitterOf` (±5 px) fällt dagegen nicht ins Gewicht, um die Linie zu brechen.
 *
 * **0…12 px.** Der Handoff (`HANDOFF-kartengroesse.md`, Punkt 8) hatte 0…26 px
 * erprobt; Ticket 02 hat den Wert vorab auf 12 px gesenkt, deshalb wird hier
 * gleich der niedrigere Wert eingebaut.
 */
const LEFT_INDENT_MAX = 12

/** Einrückung dieses Zettels: 0…`LEFT_INDENT_MAX`, deterministisch aus der `task_id`. */
export function indentOf(taskId: string): number {
  return fnv1a(`${taskId}#indent`) % (LEFT_INDENT_MAX + 1)
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
  /**
   * Die Oberkante, an der dieser Zettel im **vorigen** Lauf tatsächlich stand,
   * sofern bekannt (Ticket 13). Wird ausschließlich gebraucht, solange ein
   * anderer Zettel eine Vorgabe hat (`WallPin`): wer vorher auf gleicher Höhe
   * oder darunter lag, darf danach nicht darüber stehen. Ohne Vorgabe im Lauf
   * bleibt der Wert unbenutzt — das freie Packen kennt keine Vergangenheit.
   *
   * Fehlt der Wert (neuer Zettel), gilt der Zettel als unbelastet und darf
   * überall hin.
   */
  previousTop?: number
}

/**
 * Vorgabe für genau einen Zettel: er steht bei `top` und nimmt am Wettbewerb um
 * die niedrigste Oberkante nicht teil (Ticket 13 — „der aufgeklappte Zettel
 * bleibt liegen").
 *
 * Die Reihenfolge des Feldes ist die **Antipp-Reihenfolge**: der letzte Eintrag
 * ist der zuletzt angetippte Zettel. Lassen sich zwei Vorgaben arithmetisch
 * nicht gleichzeitig einhalten, gewinnt der spätere Eintrag; der frühere rutscht
 * unter ihn (siehe `resolvePins`).
 */
export interface WallPin {
  id: string
  /** Gewünschte Oberkante in Wandkoordinaten. */
  top: number
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
 * `wallWidth` geklemmt). Bewusste Entscheidung von vor diesem Ticket,
 * unverändert übernommen — nur der Deckelwert ist gesunken.
 *
 * Zum Maßstab: an einem 347-px-Wand-Beispiel mit 156-px-Deckel landete ein
 * 42–43 Zeichen langes, eigens dafür erdachtes Scherzwort bei 341 px bzw. der
 * vollen Wandbreite. Alltägliche Komposita sind kürzer — „Dunstabzugshaubenfilter"
 * (23 Zeichen) landet bei grob der halben Wandbreite. Der Fall ist real, aber
 * schmaler, als das Extrembeispiel vermuten lässt.
 *
 * Auch die Rückfallbreite des zweiten Laufs: was er verwirft, landet wieder
 * hier.
 *
 * **Keine eigene Untergrenzen-Konstante mehr.** Bis Ticket 11 gab es
 * zusätzlich `MIN_NOTE_WIDTH` (96 px) als Auffangnetz. QC-Beleg: kleinster
 * `shape.minimum`-Wert im ganzen Bestand war 110 — `MIN_NOTE_WIDTH` griff
 * nirgends mehr, entfernt. Kein Zufall des Bestands, sondern strukturell:
 * `shape.minimum` enthält immer die volle Fußzeile, und darin reserviert
 * allein die Griffzeile (Karten-Redesign, Ticket 00a) `padding-right: 88px`
 * für Bearbeiten-Stift und Eselsohr (je 44 px, `WallNote.vue`, `.foot`) —
 * dazu kommen 18 px waagerechte Zettel-Chrome (`chromeWidth`) und 4 px
 * `MEASURE_SAFETY` (beide `WallView.vue`). 88 + 18 + 4 = **110**, exakt der
 * Wert der schmalsten gemessenen Zettel — die mit leerer sichtbarer
 * Fußzeile, ohne Punkte-Sticker, Stempel oder Unteraufgaben-Zeichen; jeder
 * Zettel mit Fußzeileninhalt liegt darüber. Wer die Griffe verkleinert oder
 * `padding-right` senkt, senkt damit auch diese Untergrenze — ohne diesen
 * Kommentar fiele das niemandem auf, und ein kurzer Titel würde wieder zum
 * Schnipsel.
 */
export function defaultNoteWidth(shape: WallNoteShape, wallWidth: number): number {
  const cap = Math.min(wallWidth, Math.round(wallWidth * MAX_WIDTH_RATIO))
  const wanted = shape.natural > cap && wraps(shape) ? cap : shape.natural
  // `shape.minimum` sticht den 45-%-Deckel: eine Fußzeile mit Punkte-Sticker,
  // Unteraufgaben-Zeichen und Dringlichkeits-Stempel kann breiter sein als
  // 45 % der Wand, und `wanted` darf dann nicht darunter fallen — sonst läuft
  // die Fußzeile über den Zettelrand und die Griffzeile (Stift, Eselsohr)
  // hinaus. Die Wandklemmung (`Math.min(wallWidth, …)`) bleibt trotzdem außen:
  // ein unbrechbarer Titel, dessen `minimum` selbst die Wand übersteigt, darf
  // weiterhin über den Deckel hinausgezogen werden, aber nie über die Wand
  // hinaus (siehe Funktionskommentar oben, „Ein einzelnes langes Wort").
  return Math.min(wallWidth, Math.max(wanted, shape.minimum))
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
 * **`MIN_NOTE_WIDTH` ist entfallen** (Ticket 11 QC-Beleg): die Griffzeile des
 * Karten-Redesigns setzt die Untergrenze jetzt strukturell selbst, über
 * `shape.minimum` — Herleitung der 110 px bei `defaultNoteWidth`.
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
   * Passt der Zettel in `width`, ohne ein Wort zu zerschneiden? Die
   * Untergrenze ist `s.minimum` selbst (früher zusätzlich gegen
   * `MIN_NOTE_WIDTH` geklemmt, seit Ticket 11 entfallen — siehe
   * `defaultNoteWidth`). Bewusst **nicht** auf die Wandbreite geklemmt — ein
   * einzelnes Wort, das breiter als die Wand ist, schließt sich dadurch von
   * jeder Verschmälerung selbst aus.
   */
  const fitsShrunk = (s: WallNoteShape, width: number) => wraps(s) && width >= s.minimum

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
  /**
   * Stapelreihenfolge (Ticket 11). **Nicht** die Packreihenfolge — die folgt
   * der Skyline und weiß nichts von links und rechts. Kleineres `x` gewinnt:
   * der linke Zettel liegt über dem rechten, sein Eselsohr (untere rechte
   * Ecke, Karten-Redesign Ticket 00a) bleibt frei statt vom rechten Nachbarn
   * verdeckt. Bei gleichem `x` gewinnt kleineres `y` — aus derselben
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
 * **Unsichtbar, aber nicht folgenlos.** Bei universellem `box-sizing:
 * border-box` (`src/assets/base.css`) belegt der Rahmen Platz INNERHALB der
 * Breite, die `WallView` setzt. Der umschließende Block einer absolut
 * positionierten Befestigung ist die **Padding-Box** von `.zettel`, der Packer
 * positioniert aber gegen die **Border-Box** (`el.style.top = note.y`). Jede
 * Befestigung sitzt damit 2 px tiefer und 2 px weiter innen, als ihr eigenes
 * CSS vermuten lässt — wer diesen Rahmen ändert, verschiebt alle drei
 * Befestigungen und damit das obere Polster der Wand.
 */
const ZETTEL_BORDER = 2

/**
 * Wo eine Befestigung waagerecht auf dem Zettel sitzt. Entscheidend für den
 * Überstand, weil der geneigte Zettel alles, was nicht in seiner Mitte sitzt,
 * mit anhebt oder absenkt (→ `overhangOf`).
 *
 * - `center` — `left: 50%` plus negatives `margin-left` in halber Breite.
 * - `left` / `right` — `inset` ist der Abstand von der jeweiligen Kante der
 *   **Padding-Box** bis zur **Mitte** der Befestigung.
 */
type FastenerAnchor = 'center' | 'left' | 'right'

/**
 * Die **Befestigungen** (→ CONTEXT.md) als Geometrie, abgeschrieben aus den
 * CSS-Regeln in `WallNote.vue`.
 *
 * **Warum das hier steht.** Jede Befestigung sitzt konstruktiv über der
 * Oberkante ihres Zettels (negatives `top`). Steht ein Zettel in der obersten
 * Reihe, ragt sie damit über die Oberkante der WAND — der Befund aus Ticket 04.
 * Die Wand muss oben Platz reservieren, und wie viel, ist keine freie Setzung
 * des Layouts, sondern eine Ablesung aus dem Stylesheet.
 *
 * **Es ist eine Zeile je Befestigung, nicht je Sorte.** Die beiden Hälften der
 * doppelten Büroklammer stehen getrennt: sie sind verschieden gedreht (`-7deg`
 * / `+6deg`) und sitzen an verschiedenen KANTEN. Genau diese Kantenlage
 * entscheidet, welche von beiden der geneigte Zettel nach oben fährt, und sie
 * ließe sich mit einer gemeinsamen Zeile gar nicht ausdrücken.
 *
 * **Die Regel lautet „so hoch wie die höchste Befestigung", nicht „11".**
 * Deshalb steht hier die Geometrie und nicht das Ergebnis: wer eine vierte
 * Befestigungssorte baut, trägt sie hier ein und bekommt das Polster geschenkt.
 * Wer eine bestehende verschiebt, dreht oder umhängt, ändert diese Zeile mit.
 *
 * **Der Wermutstropfen: es ist eine Kopie.** Eine echte einzige Quelle — eine
 * CSS-Custom-Property, an der `WallNote.vue` und diese Rechnung gemeinsam
 * hängen — ist nicht herstellbar: der Packer rechnet in Zahlen, lange bevor ein
 * Zettel im DOM steht, und die Werte am Element abzumessen hieße, sie in genau
 * dem Moment zu brauchen, in dem es sie noch nicht gibt. Getragen wird die
 * Kopplung deshalb durch Kommentare an BEIDEN Enden: die CSS-Regeln in
 * `WallNote.vue` (`.zettel`, `.pin`, `.tape`, `.clip`) verweisen hierher.
 *
 * **Nicht enthalten:** `.pw-tape` aus `pinnwand.css` (62 × 20 px, `top: -10px`)
 * hätte den größten Überstand von allen, ist aber **toter Code** — die Klasse
 * kommt in keinem Markup vor, nur die gleichnamige CSS-Variable wird benutzt.
 * Sollte sie je in Gebrauch kommen, gehört sie in diese Tabelle.
 *
 * **Ebenfalls nicht enthalten: Schlagschatten** (alle werfen nach unten) und
 * die zusätzlichen Neigungen der Griff-Zustände (`.zettel--tearing` u. a., bis
 * +9 deg).
 *
 * Letztere sind nicht bloß „kurz", sie sind **geometrisch ausgeschlossen**: die
 * Zusatzneigung tritt ausschließlich zusammen mit einer Abwärtsbewegung auf
 * (`translate(pull·0.1, pull) rotate(rotation + min(9, pull·0.09))` in
 * `noteStyle`, immer mit `pull > 0`). Je Pixel `pull` wächst der Überstand um
 * höchstens rund 0,24 px, während der Zettel um volle 1,0 px nach UNTEN
 * wandert — Verhältnis rund 4 : 1 zugunsten von unten. Ein gegriffener Zettel
 * ragt damit in keinem Moment weiter über den Kork als im Ruhezustand. Für ihn
 * zu polstern wäre nicht nur teuer, es wäre gegenstandslos.
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
  { css: '.pin', group: 0, anchor: 'center', inset: 0, top: -7, width: 14, height: 14, rotation: 0 },
  /** Klebestreifen — tägliche Aufgaben. Der breiteste, deshalb der drehempfindlichste. */
  {
    css: '.tape',
    group: 1,
    anchor: 'center',
    inset: 0,
    top: -9,
    width: 46,
    height: 16,
    rotation: -4
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
    rotation: -7
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
    rotation: 6
  }
]

/**
 * Die Befestigungen, die ein Zettel dieser Gruppe tragen KANN.
 *
 * `WallView` füllt die Gruppen aus `pendingTasks` / `dailyTasks` /
 * `projectTasks`; welche Befestigung ein Zettel wirklich zeichnet, entscheidet
 * `WallNote.vue` dagegen über `kindOfTaskType` (`open` / `daily` / `project`).
 *
 * **Das deckt sich NICHT überall Eins zu Eins, und zwar bei Gruppe 1.**
 * `dailyTasks` ist `daily` **und** `one-time` (`useTaskBoard.ts`), aus
 * `one-time` macht `kindOfTaskType` aber ein `'open'` — ein einmaliger Zettel
 * liegt also in Gruppe 1 und trägt trotzdem eine **Reißzwecke**. Diese Funktion
 * gibt ihm hier `.tape`.
 *
 * **Die Abweichung fällt auf die sichere Seite.** `.tape` überstehet weiter als
 * `.pin` (bei 160 px: 9,7 gegen 5,4), das Polster wird für einen solchen Zettel
 * also ÜBERschätzt, nie unterschätzt. Wer die Zuordnung eines Tages
 * begradigt, gewinnt hier ein paar Pixel; nötig ist es nicht.
 *
 * Eine **unbekannte** Gruppe bekommt aus demselben Grund **alle**
 * Befestigungen, nicht keine — sichtbarer Kork ist ein Schönheitsfehler, eine
 * überstehende Befestigung ist der gemeldete Bug. Damit dieser Zweig überhaupt
 * erreichbar ist, meldet `WallView` einen Zettel ohne Gruppenzuordnung als
 * `-1` und nicht als `0`; ein `?? 0` dort führte ihn still zur KNAPPSTEN Sorte
 * und machte dieses Netz wirkungslos.
 */
const fastenersOfGroup = (group: number): typeof FASTENERS => {
  const own = FASTENERS.filter(f => f.group === group)
  return own.length > 0 ? own : FASTENERS
}

const RAD = Math.PI / 180

/**
 * Wie weit eine Befestigung über die Oberkante ihres Zettels hinausragt —
 * in Abhängigkeit von **Zettelbreite** und **Zettelneigung**.
 *
 * **Der Überstand ist keine Konstante.** Drei Dinge wirken zusammen:
 *
 * 1. **Der Zettelrahmen** verschiebt den Ursprung: `top` ist gegen die
 *    Padding-Box gemessen, positioniert wird gegen die Border-Box
 *    (→ `ZETTEL_BORDER`). Das SENKT den Überstand um 2 px.
 * 2. **Die eigene Drehung** der Befestigung. Gedreht wird um die Mitte
 *    (`transform-origin` steht nirgends, also der Vorgabewert `50% 50%`), die
 *    Mitte bleibt liegen und die halbe Höhe der umschließenden Kiste wächst auf
 *    `(b·sin α + h·cos α) / 2`. Das HEBT den Überstand.
 * 3. **Die Neigung des Zettels** (`rotationOf`, −3…+3 deg, in `noteStyle` als
 *    Inline-`transform`, ebenfalls um die Mitte). Sie wirkt doppelt: die
 *    Drehungen **komponieren** (ein Klebestreifen steht faktisch −7…−1 deg), und
 *    eine Befestigung, die NICHT in der Zettelmitte sitzt, fährt mit hoch, wenn
 *    der Zettel sich zu ihr hin neigt. Der Hebel ist der Abstand zur Zettelmitte
 *    — also **breitenabhängig**: auf einem wandbreiten aufgeklappten Projekt
 *    hebt eine Klammer an der Kante um mehrere Pixel, auf einem 160-px-Zettel
 *    kaum.
 *
 * Punkt 3 ist der Grund, warum ein Skalar das nicht tragen kann: der Überstand
 * eines 320-px-Zettels ist ein anderer als der eines 160-px-Zettels, bei
 * identischem CSS.
 *
 * **Bewusst weggelassen:** die Zettelneigung senkt die Oberkante in der
 * Zettelmitte zusätzlich um `(H/2)·(1 − cos θ)`. Bei 3 deg sind das rund
 * **0,05 px** an einem gewöhnlichen 80-px-Zettel und rund **0,34 px** an einem
 * hohen aufgeklappten Projekt (H ≈ 500) — die Spanne wächst mit der
 * Zettelhöhe. Der Term braucht genau diese Höhe und macht das Ergebnis nur
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
  tiltDeg: number
): number => {
  const tilt = tiltDeg * RAD
  const total = (tiltDeg + fastener.rotation) * RAD
  // Halbe Höhe der umschließenden Kiste der GEDREHTEN Befestigung.
  const halfExtent =
    (fastener.width * Math.abs(Math.sin(total)) +
      fastener.height * Math.abs(Math.cos(total))) /
    2
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
 * Kork hinausragt (Ticket 04) — aufgerundet auf ganze Pixel.
 *
 * **Gerechnet wird über die Zettel, die wirklich gepackt werden**, nicht über
 * eine Tabellenzeile und nicht über einen Worst Case der Wandbreite. Jeder
 * Zettel bringt beide Eingangsgrößen mit: seine gemessene Breite steht in
 * `WallNoteMetrics`, seine Neigung ist `rotationOf(id)` — **deterministisch aus
 * der Kennung**, dieselbe Funktion, die `WallNote.vue` für sein `transform`
 * benutzt. Es wird also nichts geschätzt und kein ungünstigster Winkel
 * angenommen: der Überstand jedes einzelnen Zettels ist exakt bekannt.
 *
 * **Das Maximum über ALLE Zettel, nicht über die oberste Reihe.** Die oberste
 * Reihe steht erst fest, wenn gepackt ist — das Polster muss aber vorher
 * feststehen, sonst müsste zweimal gepackt werden, und beim zweiten Lauf
 * verschöbe das geänderte Polster womöglich wieder, wer oben steht. Diese
 * Rückkopplung ist es nicht wert.
 *
 * **Der Preis, benannt:** steht der Zettel mit dem größten Überstand NICHT in
 * der obersten Reihe, bleibt oben etwas leerer Kork stehen. Der Betrag ist die
 * Differenz zweier Überstände, nicht der Überstand selbst — im Alltag (Mobil,
 * Zettel um 160 px, gemischte Sorten) liegen alle Zettel zwischen rund 5 und
 * 10 px, es geht also um **wenige Pixel**.
 *
 * **Der Preis hat aber auch eine Bewegung, und die gab es vorher nicht.** Für
 * `.pin` und `.tape` ist der Hebelarm null, ihr Überstand hängt also gar nicht
 * an der Breite — bei **Projekten** hängt er daran. Wer ein Projekt aufklappt
 * (rund 144 px → volle Wandbreite), treibt `.clip--l` von rund 9,2 auf rund
 * 13,8 px und damit das Polster von **10 auf 14 px**. Die ganze Wand rutscht in
 * dem Moment 4–5 px nach unten, und das liegt über der FLIP-Schwelle von
 * 0,6 px: **alle** Zettel fliegen die Animation mit, nicht nur die, die dem
 * aufgeklappten ausweichen. Zuklappen bewegt sie ebenso zurück, und ebenso das
 * Abreißen des letzten Projekts.
 *
 * Wahrscheinlich unauffällig, weil es genau im Aufklapp-Moment passiert, in dem
 * sich ohnehin die halbe Wand bewegt — aber es ist eine neue Bewegung, und wer
 * sie beim Testen sieht, soll sie hier wiederfinden statt sie für einen Fehler
 * zu halten. Sie ist der Preis dafür, dass die Abnahme in JEDER Konstellation
 * hält: ein zu knappes Polster verfehlt sie, ein Polster, das dem breitesten
 * Fall dauerhaft folgt (also nie schrumpft), kostete stattdessen dauerhaft
 * 4–5 px Kork.
 *
 * Ohne Zettel ist das Polster **0**: keine Befestigung, kein Platzbedarf. Die
 * leere Wand bleibt damit 0 px hoch und trägt keinen Streifen Kork, den niemand
 * bestellt hat (den sich `rememberWallHeight` in `WallView.vue` sonst als
 * Mindesthöhe des Platzhalters merkte).
 *
 * Es kommt oben Platz **hinzu**, es wird nichts umgerechnet: die Abstände der
 * Zettel untereinander sind unberührt, die Wand wächst um genau diesen Betrag
 * nach oben. Die Unterkante bleibt bewusst ohne Polster (Ticket 04).
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
 * Die Untergrenze −6,5 ist NICHT −range/2: `jitterOf(id, key, 4)` liefert
 * −4 … +4, davon 2,5 abgezogen ergibt −6,5 … +1,5 (im Bestand gemessen
 * −6,41 … 1,49). Der Kommentar nannte hier bis zur QC von Ticket 13 fälschlich
 * −2,5; `WallNoteMetrics.expanded` nennt −6,5 seit jeher korrekt. Die Konstante
 * selbst stimmte — sie zählt nur die obere Grenze.
 *
 * Gebraucht wird die Zahl nur beim Packen oberhalb einer Vorgabe: dort wird
 * gegen die GEPLANTE Oberkante geprüft, gezeichnet wird aber die verschobene.
 * Ohne diesen Zuschlag dürfte ein Zettel bis auf 1,5 px in den vorgegebenen
 * Zettel hineinragen. Wer `jitterOf`-Bereich oder Mitte ändert, muss diese Zahl
 * mitziehen — sie ist eine Ableitung, keine Setzung.
 */
const JITTER_DOWN_MAX = 1.5

/**
 * Vorgaben in tatsächliche Oberkanten übersetzen (Ticket 13).
 *
 * Jede Vorgabe beansprucht ein Fenster [top, top + Höhe + `EXPANDED_GAP`].
 * Überschneiden sich zwei Fenster, **gewinnt der zuletzt angetippte** — deshalb
 * wird das Feld von hinten nach vorn abgearbeitet: wer zuerst drankommt, hat die
 * höhere Priorität und behält seine Oberkante; wer später kommt und anstößt,
 * rutscht unter das störende Fenster.
 *
 * Der typische Fall: erst wird ein unterer Zettel aufgeklappt (Vorgabe A), dann
 * ein Zettel darüber (Vorgabe B). B wächst nach unten in A hinein. B ist der
 * zuletzt angetippte, also bleibt B liegen und A rutscht auf B's Unterkante.
 * Umgekehrt (erst oben, dann unten) entsteht gar kein Konflikt, weil die zweite
 * Vorgabe erst NACH dem Aufklappen der ersten gemerkt wird.
 *
 * Die Schleife terminiert: jeder Ausweichschritt setzt `top` auf die Unterkante
 * eines vergebenen Fensters, danach kann genau dieses Fenster nicht mehr stören
 * — höchstens so viele Schritte wie vergebene Fenster.
 *
 * Zettel ohne bekannte Höhe (Vorgabe für einen Zettel, der gar nicht mehr an der
 * Wand hängt) fallen heraus; der Aufrufer soll solche Vorgaben gar nicht erst
 * schicken, aber diese Funktion baut darauf nicht.
 */
function resolvePins(
  pins: readonly WallPin[],
  heightOf: (id: string) => number | undefined
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
        window => top < window.bottom - 0.001 && top + height + EXPANDED_GAP > window.top + 0.001
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
 * Innerhalb einer Gruppe wählt der Packer selbst, welcher der noch
 * verbliebenen Zettel als Nächstes kommt — nicht die Eingabereihenfolge: bei
 * jedem Schritt wird für jeden übrigen Zettel der Gruppe die niedrigste
 * mögliche Oberkante gesucht, und der Zettel mit der insgesamt niedrigsten
 * Oberkante gewinnt den Platz. Das ist „freies Packen" im Sinn des Tickets —
 * die dringendste Aufgabe steht deshalb NICHT mehr zwingend oben; auf der Wand
 * gelten ohnehin alle fälligen Aufgaben als gleich dringend (→ CONTEXT.md,
 * „Stempel").
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
 * **Linke Einrückung** (`indentOf`, Karten-Redesign Ticket 00a): nur wenn ein
 * Zettel tatsächlich in der linken Spalte landet (`bestColumn === 0`) und
 * nicht aufgeklappt ist, kommt zum x-Jitter zusätzlich 0…12 px hinzu. Ein
 * Zettel, der irgendwo MITTEN in einer Reihe steht, bekommt keine Einrückung
 * — dort würde sie ein Loch in die Reihe reißen, statt nur die Kante
 * aufzulockern.
 *
 * **Vorgaben (`pins`, Ticket 13).** Ein aufgeklappter Zettel soll liegen
 * bleiben, wo er lag — die anderen weichen ihm aus, statt dass er sich einen
 * neuen Platz sucht. Diese Funktion ist zustandslos und kennt kein „vorher",
 * deshalb reicht die Wand die gemerkte Oberkante als Vorgabe herein. Für einen
 * vorgegebenen Zettel gilt:
 *
 * - Seine Oberkante ist gesetzt (`max(floor, …)`), er nimmt am Wettbewerb um
 *   die niedrigste Oberkante nicht teil und bekommt **keinen** y-Versatz —
 *   ein Versatz wäre eine Bewegung, und genau die soll ausbleiben.
 * - Die **weiche Gruppengrenze gilt weiter**: die Vorgabe wird nach unten gegen
 *   `floor` geklemmt, sonst stünde ein Projekt über einer fälligen Aufgabe.
 * - **Sie wird zusätzlich gegen die Unterkanten ihrer eigenen Spalten
 *   geklemmt** (`contentLine`). `floor` ist das Maximum der OBERKANTEN der
 *   Vorgruppe; ein hoher Zettel der Vorgruppe reicht weit darunter hinab und
 *   wäre für die Vorgabe sonst unsichtbar. Lassen sich „bleibt liegen" und
 *   „überlappt nicht" nicht zugleich einhalten, gewinnt „überlappt nicht" — die
 *   Vorgabe rutscht nach unten. Wo nichts im Weg ist, bleibt sie auf den Pixel
 *   liegen; geklemmt wird gegen echte Unterkanten, nicht gegen die Skyline mit
 *   ihrem Zierabstand.
 * - Er wirkt als **Sperrlinie**: nach seiner Platzierung liegt die Skyline in
 *   seinen eigenen Spalten auf seiner Unterkante und in allen übrigen mindestens
 *   auf seiner Oberkante. Kein danach gesetzter Zettel kann ihn überholen.
 * - **Wer vorher unter (oder neben) ihm lag, bleibt unter ihm.** Oberhalb der
 *   Vorgabe dürfen nur Zettel packen, deren `previousTop` echt kleiner ist als
 *   die Vorgabe, und auch die nur, wenn sie GANZ darüber passen. Ohne diese
 *   Bedingung würde der frei packende Rest in die Lücke rutschen, die der
 *   vorgegebene Zettel als schmaler Zettel hinterlassen hat — ein Zettel von
 *   unten stünde plötzlich oben.
 * - Waagerecht landet er an der linken Wandkante (Spalte 0, keine Einrückung).
 *   Für den einzigen Anwendungsfall — den aufgeklappten Zettel über die volle
 *   Wandbreite — ist das die einzig mögliche Stelle.
 */
export function packWall(
  notes: readonly WallNoteMetrics[],
  wallWidth: number,
  pins: readonly WallPin[] = []
): PackedWall {
  const columns = Math.max(1, Math.ceil(wallWidth / SKYLINE_RESOLUTION))
  /**
   * Das obere Polster für die überstehenden Befestigungen (Ticket 04).
   *
   * Aus den Zetteln gerechnet, die gleich gepackt werden — Breite und Neigung
   * gehen beide ein, siehe `topPaddingFor`. Einmal vorab, weil der Wert die
   * ganze Rechnung trägt und sich währenddessen nicht ändern darf.
   */
  const topPadding = topPaddingFor(notes)
  // Die Skyline startet NICHT bei 0, sondern beim Polster für die
  // Befestigungen (→ `topPadding`). Damit rechnet der ganze Packer von
  // Anfang an in Wandkoordinaten MIT Polster: `height` bringt es mit, die
  // Vorgaben (`pins`) und `previousTop` — beide stammen aus einem früheren
  // Packergebnis — liegen im selben Bezugssystem, und niemand muss irgendwo
  // etwas hinein- oder herausrechnen. Ein Versatz erst am Ausgang hätte genau
  // diese Umrechnung am Eingang nach sich gezogen, mit einer Drift je Lauf,
  // sobald man sie vergisst.
  const skyline = new Array<number>(columns).fill(topPadding)
  /**
   * Die UNTERKANTEN des bereits Gesetzten, je Spalte — ohne den Abstand, den
   * `skyline` zusätzlich führt (`gapOf` bzw. `EXPANDED_GAP`).
   *
   * Gebraucht wird sie ausschließlich, um eine Vorgabe nach unten zu klemmen
   * (Ticket 13, QC-Befund 1). Gegen `skyline` zu klemmen wäre falsch: deren
   * Abstand ist Zierde, kein Inhalt, und die Vorgabe würde um bis zu 15 px
   * wandern, obwohl gar nichts überlappt. „Bleibt liegen" gilt weiter, solange
   * nichts im Weg ist — nachgegeben wird nur gegen echte Überdeckung.
   */
  const contentLine = new Array<number>(columns).fill(0)
  const placed: PackedNote[] = []
  /**
   * Die fertigen Rechtecke des bereits Gesetzten — dieselbe Reihenfolge wie
   * `placed`, nur mit Breite und Höhe dazu.
   *
   * Gebraucht für die **senkrechte Klemmung** in `place`: sie klemmt gegen die
   * echten Rechtecke, nicht gegen `contentLine`. `contentLine` ist auf
   * `SKYLINE_RESOLUTION` gerundet und meldet deshalb Berührung, wo in Wahrheit
   * eine Lücke ist — jeder so verschobene Zettel kostet Wandhöhe, ohne dass er
   * irgendetwas verdecken würde. Auf einer durch den Rand ohnehin schmaleren
   * Wand ist das nicht zu verschenken.
   *
   * Ein paralleles Feld statt zusätzlicher Felder in `PackedNote`: die
   * Schnittstelle nach außen bleibt unverändert, Breite und Höhe sind
   * Rechenzwischenstand und keine Zusage an den Aufrufer.
   */
  const placedBoxes: Array<{ x: number; width: number; y: number; height: number }> = []

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

  const heights = new Map<string, number>(notes.map(note => [note.id, note.height]))
  /** Vorgegebene Oberkanten, Konflikte bereits aufgelöst (siehe `resolvePins`). */
  const pinnedTops = resolvePins(pins, id => heights.get(id))

  /**
   * Weiche Untergrenze für die aktuell gepackte Gruppe, siehe Funktionskommentar.
   *
   * Startet auf dem Polster für die Befestigungen (→ `topPadding`), nicht
   * auf 0. Die angehobene Skyline allein reicht dafür NICHT: `y` ist
   * `max(floor, contentMax, top + dy)`, und der y-Versatz `dy` zieht bis zu
   * 6,5 px nach oben — der oberste Zettel würde sich das Polster wieder
   * abziehen und seine Befestigung stünde erneut über dem Kork. `floor` ist
   * genau die Klemme, die das schon für die Gruppengrenze verhindert; die
   * Oberkante der Wand ist derselbe Fall.
   *
   * Die Abstände der Zettel untereinander bleiben davon unberührt: schon vorher
   * konnte der oberste Zettel seinen Aufwärtsversatz nicht nutzen (`max(0, …)`),
   * das Bild ist also um genau das Polster verschoben, sonst identisch.
   */
  let floor = topPadding

  /**
   * Der waagerechte Versatz je Zettel, einmal gerechnet.
   *
   * `drawnBox` läuft im Suchlauf **je Kandidatenspalte** — ohne diesen Merker
   * liefe `fnv1a` über jede Kennung einige hunderttausend Mal statt einmal.
   * Der Merker ändert nichts am Ergebnis: beide Werte hängen ausschließlich an
   * der Kennung.
   *
   * `indent` steht hier ohne die Bedingung `column === 0` — die kennt nur
   * `drawnBox`, weil erst dort die Spalte feststeht.
   */
  const offsetCache = new Map<string, { jitter: number; indent: number }>()
  const offsetsOf = (note: WallNoteMetrics, pinned: boolean) => {
    // Ein aufgeklappter oder vorgegebener Zettel bekommt keinen Versatz.
    //
    // **`pinned` schaltet seit Ticket 14 auch den x-Jitter ab**, nicht mehr nur
    // die Einrückung. Vorher bekam eine Vorgabe, die nicht zugleich aufgeklappt
    // war, sehr wohl x-Jitter. Das war folgenlos, solange die Sperrlinie über
    // die feste Spalte lief; seit sie über die GEZEICHNETE Position läuft,
    // stünde sie um den Versatz daneben. Der einzige heutige Aufrufer setzt
    // Vorgaben immer aufgeklappt und wandbreit — die Lücke war latent, nicht
    // erreichbar. Sie ist jetzt zu.
    if (note.expanded || pinned) return { jitter: 0, indent: 0 }
    const hit = offsetCache.get(note.id)
    if (hit) return hit
    const fresh = { jitter: jitterOf(note.id, 'x', 5), indent: indentOf(note.id) }
    offsetCache.set(note.id, fresh)
    return fresh
  }

  /**
   * **Die einzige Stelle, die weiß, wo ein Zettel tatsächlich gezeichnet wird.**
   *
   * Vor Ticket 14 stand der Versatz (`jitterOf` + `indentOf`) erst in `place` —
   * gesucht und reserviert wurde über `bestColumn … bestColumn + span`,
   * gezeichnet aber bei `bestColumn × SKYLINE_RESOLUTION + dx`. Die
   * Reservierung kannte `dx` nicht: ein nach rechts versetzter Zettel ragte in
   * Spalten, die niemand für ihn zurückgelegt hatte.
   *
   * **Deshalb liefert dieser Helfer die Spalten und wird VOR der Spaltensuche
   * gerufen, nicht danach.** „Erst suchen, dann breiter reservieren" wäre zu
   * wenig: ein Zettel mit negativem `dx` ragt nach **links** in eine Spalte,
   * deren Skyline höher liegen kann als die gefundene Oberkante — er würde in
   * seinen linken Nachbarn gezeichnet, obwohl rechts alles sauber reserviert
   * ist. Die Suche muss den fertigen Kasten bewerten, nicht den geplanten.
   *
   * Keine Zirkularität, obwohl `indentOf` an der linken Spalte hängt: die
   * Spalte kommt als Parameter herein, der Helfer entscheidet sie nicht.
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
      Math.max(colStart + 1, Math.ceil((x + width) / SKYLINE_RESOLUTION))
    )
    return { x, width, colStart, colEnd }
  }

  for (const groupKey of groupKeys) {
    const members = byGroup.get(groupKey)!
    const pool = members.filter(note => !pinnedTops.has(note.id))
    // Vorgaben dieser Gruppe von oben nach unten abarbeiten. Bei exakt gleicher
    // Oberkante entscheidet der Hash, nicht die Eingabereihenfolge — dieselbe
    // Begründung wie beim Tiebreak des freien Packens.
    const pinnedHere = members
      .filter(note => pinnedTops.has(note.id))
      .sort(
        (a, b) => pinnedTops.get(a.id)! - pinnedTops.get(b.id)! || fnv1a(a.id) - fnv1a(b.id)
      )
    let groupFloor = floor

    /**
     * Setzt einen Zettel, zieht die Skyline nach und merkt die Untergrenze.
     * `pinned` schaltet den y-Versatz ab (der vorgegebene Zettel soll exakt
     * liegen bleiben) und macht ihn zur Sperrlinie über die ganze Wandbreite.
     */
    const place = (note: WallNoteMetrics, column: number, top: number, pinned: boolean) => {
      // Dieselbe Rechnung wie im Suchlauf (`packFree`) — beide fragen
      // `drawnBox`. Weicht die eine von der anderen ab, reserviert der Packer
      // wieder woanders, als er zeichnet; genau das war der Fehler vor
      // Ticket 14.
      const { x, width, colStart, colEnd } = drawnBox(note, column, pinned)
      const dy = note.expanded || pinned ? 0 : jitterOf(note.id, 'y', 4) - 2.5

      // Eine Vorgabe wird zusätzlich gegen die UNTERKANTEN ihrer eigenen
      // Spalten geklemmt (Ticket 13, QC-Befund 1).
      //
      // `floor` allein trägt das nicht: die weiche Gruppengrenze ist das
      // Maximum der OBERKANTEN der Vorgruppe (so gewollt, siehe
      // Funktionskommentar). Ein hoher Zettel der Vorgruppe, der weit unter
      // seine eigene Oberkante hinabreicht, ist für `floor` damit unsichtbar —
      // eine Vorgabe auf dessen Höhe landete mitten in ihm. Belegt am
      // Minimalfall: ein 400 px hoher Zettel in Gruppe 0, eine wandbreite
      // Vorgabe mit `top = 0` in Gruppe 1 → 180 × 50 px Überlapp.
      //
      // Die Richtung ist vom Ticket entschieden: lassen sich „bleibt liegen"
      // und „überlappt nicht" nicht gleichzeitig einhalten, gewinnt „überlappt
      // nicht" — dieselbe Begründung, mit der schon `floor` die Vorgabe nach
      // unten klemmt. Ein Zettel, der einen anderen verdeckt, ist schlimmer als
      // einer, der ein Stück gewandert ist.
      //
      // Innerhalb der EIGENEN Gruppe ist die Klemmung wirkungslos: `packFree`
      // hat vor der Vorgabe nur gesetzt, was GANZ über ihr passt
      // (`noteTop + height + JITTER_DOWN_MAX <= limitTop`), also liegt
      // `contentLine` dort ohnehin nicht tiefer. Sie greift genau dort, wo der
      // Fehler saß: an der Gruppengrenze.
      let clamped = top
      if (pinned) {
        // Über die GEZEICHNETEN Spalten, nicht über `column … column + span`.
        // Zöge man diese Schleife bei der Umstellung auf `drawnBox` nicht mit,
        // klemmte die Vorgabe gegen fremde Spalten — exakt der QC-Befund aus
        // Ticket 13 (199 Fälle, 28,9 px Überdeckung, zu klein gemeldete
        // Wandhöhe). Heute ist eine Vorgabe stets wandbreit und beginnt bei
        // Spalte 0, beide Bereiche wären also gleich; das ist eine Eigenschaft
        // des einzigen Aufrufers, keine dieser Funktion.
        for (let k = colStart; k < colEnd; k++) {
          if (contentLine[k] > clamped) clamped = contentLine[k]
        }
      }

      // **Senkrechte Klemmung gegen die echten Rechtecke** (Ticket 14).
      //
      // `dy` liegt in [−6,5; +1,5], der Abstand darunter (`gapOf`) bei 2…15 px
      // — der tatsächliche Abstand `gapOf + dy` konnte damit bis auf −4,5 px
      // fallen, gemessen wurden −3,80 px. Der Zettel wird deshalb nach unten
      // gegen die Unterkante jedes bereits gesetzten Zettels geklemmt, mit dem
      // er sich waagerecht überschneidet. Ergebnis: **0 px Überlapp per
      // Konstruktion**, und der Versatz bleibt überall dort stehen, wo er
      // nichts anrichtet — kein Eingriff an `jitterOf`, keine verschobene Mitte.
      //
      // **Bewusst nicht gegen `contentLine`.** Die ist auf
      // `SKYLINE_RESOLUTION` gerundet und schöbe Zettel nach unten, die sich
      // gar nicht berühren; das zahlte sich in Wandhöhe (Zusage aus Ticket 02).
      //
      // Warum das reicht, damit am Ende KEIN Paar überlappt: jeder Zettel wird
      // beim Setzen gegen alles Vorherige geklemmt, und die Klemmung schiebt
      // ihn nur nach unten. Jedes Paar wird also genau einmal geprüft — beim
      // Setzen des späteren der beiden.
      //
      // Die Klemmung kann `y` nur ANHEBEN, nie senken: die Skyline führt über
      // denselben Spalten bereits `Unterkante + Abstand`, `top` liegt also
      // ohnehin nicht darunter. Sie greift genau dann, wenn `dy` negativ ist.
      let contentMax = 0
      for (const box of placedBoxes) {
        if (box.x >= x + width || x >= box.x + box.width) continue
        const bottom = box.y + box.height
        if (bottom > contentMax) contentMax = bottom
      }

      // Auf `floor` geklemmt: der y-Versatz darf einen Zettel etwas anheben,
      // aber niemals über die Untergrenze der Gruppe hinaus — sonst könnte der
      // Jitter allein die Gruppengrenze unterlaufen. Für einen vorgegebenen
      // Zettel ist das dieselbe Klemmung, nur ohne Versatz.
      const y = Math.max(floor, contentMax, clamped + dy)

      const vGap = note.expanded ? EXPANDED_GAP : gapOf(note.id)
      const bottom = y + note.height + vGap
      // **Nie senken.** Beim freien Packen ist die Zuweisung unschädlich, weil
      // `top` dort aus genau diesen Spalten stammt und `bottom` deshalb nicht
      // darunterfallen kann. Bei einer Vorgabe kommt `top` von außen: eine
      // Zuweisung senkte die Skyline und löschte damit die Kollision, die die
      // Sperrlinie unten gerade festhalten soll — sie steht in den eigenen
      // Spalten auf `bottom` und fände den Wert bereits überschrieben vor
      // (Ticket 13, QC-Befund 1; die zu klein gemeldete `height` kam daher).
      //
      // **Voraussetzung** dafür, dass die Zuweisung beim freien Packen
      // unschädlich bleibt: `note.height + vGap` muss größer sein als der
      // maximale Aufwärtsschub des y-Versatzes. Sonst dürfte `bottom` unter die
      // Skyline fallen, und was vorher gesenkt wurde, bliebe jetzt stehen. Der
      // kleinste Zettel im Bestand misst 71 px, `height + vGap` also mindestens
      // 73 — Faktor 11. Wer Zettel unter ~10 px zulässt (oder `display:none`
      // misst), muss hier nachdenken.
      //
      // Der Aufwärtsschub war bis Ticket 13 mit 6,5 px beziffert (der volle
      // Ausschlag von `dy`) und mit „freies Packen bleibt bitidentisch, 0 von
      // 5000 Wänden" belegt. **Beides gilt nicht mehr.** Die senkrechte
      // Klemmung oben verkleinert den Aufwärtsschub — sie kann ihn nie
      // vergrößern —, die Voraussetzung ist also weiter erfüllt, aber sie steht
      // jetzt auf einer kleineren Zahl als 6,5. Und jedes `y` ändert sich durch
      // die Klemmung: der alte Bit-Identitäts-Beleg ist hinfällig und durch den
      // Vorgabe-Fuzz aus Ticket 14 ersetzt.
      const face = y + note.height
      for (let k = colStart; k < colEnd; k++) {
        if (skyline[k] < bottom) skyline[k] = bottom
        if (contentLine[k] < face) contentLine[k] = face
      }

      if (pinned) {
        // Sperrlinie: in den eigenen Spalten steht die Skyline auf der
        // Unterkante, in allen übrigen mindestens auf der Oberkante. Damit kann
        // kein später gesetzter Zettel seitlich an ihm vorbei nach oben.
        // Auch hier die GEZEICHNETEN Spalten — dieselbe Falle wie bei der
        // `contentLine`-Klemmung oben: mit `column … column + span` stünde die
        // Sperrlinie um den Versatz neben dem Zettel, den sie festhalten soll.
        for (let k = 0; k < columns; k++) {
          const barrier = k >= colStart && k < colEnd ? bottom : y
          if (skyline[k] < barrier) skyline[k] = barrier
        }
      } else if (!note.expanded) {
        // Waagerechte Luft zum rechten Nachbarn reservieren (siehe
        // Funktionskommentar): die Spalten direkt rechts vom Zettel bleiben bis
        // zu `rowGapOf(note.id)` px auf derselben Höhe blockiert. Rechts vom
        // GEZEICHNETEN Kasten, nicht rechts von der geplanten Spalte.
        //
        // **Ab der exakten rechten Kante gerechnet, nicht ab `colEnd`**
        // (Ticket 14a-2). `colEnd + ceil(rowGap / SKYLINE_RESOLUTION)` rundet
        // zweimal auf: einmal die Kante des Zettels, einmal den Abstand — bis zu
        // ~7 px, die niemand bestellt hat. Bis Ticket 14 holte der Nachbar sie
        // über negativen x-Versatz zurück; seit die Reservierung die gezeichnete
        // Position kennt, kann er das nicht mehr, und der Aufschlag stand
        // ungefiltert im Bild (gemessen: 63,8 % der Nachbarpaare über dem Ziel
        // von 8…16 px, Median 17,61 px). Eine Rundung bleibt zwangsläufig — die
        // Skyline kennt nur ganze Spalten.
        const marginEnd = Math.min(
          columns,
          Math.ceil((x + width + rowGapOf(note.id)) / SKYLINE_RESOLUTION)
        )
        for (let k = colEnd; k < marginEnd; k++) {
          if (skyline[k] < bottom) skyline[k] = bottom
        }
      }

      // `z` ist hier nur ein Platzhalter — die Stapelreihenfolge wird NICHT
      // aus der Packreihenfolge übernommen, sondern erst unten aus der
      // fertigen Position vergeben (siehe „Stapelreihenfolge" nach der
      // Schleife und `PackedNote.z`).
      placed.push({ id: note.id, x, y, z: 0 })
      placedBoxes.push({ x, width, y, height: note.height })
      // `y`, nicht die geplante Oberkante — siehe Funktionskommentar, „Weiche
      // Gruppengrenze". Über die ganze Gruppe maximiert, nicht nur über den
      // zuletzt platzierten Zettel.
      groupFloor = Math.max(groupFloor, y)
    }

    /**
     * Freies Packen aus `pool`, bis nichts mehr passt.
     *
     * `limitTop` ist die Oberkante der nächsten Vorgabe: nur was GANZ darüber
     * passt und vorher auch schon darüber lag, kommt hier zum Zug. Ohne Vorgabe
     * steht dort `Infinity`, dann ist die Bedingung wirkungslos und es packt wie
     * vor Ticket 13.
     *
     * **„Passt darüber" wird je SPALTE geprüft, nicht je Zettel, und notfalls
     * ohne Zierabstand** (Ticket 16): vorher wurde erst die niedrigste Spalte
     * gewählt und der ganze Zettel verworfen, wenn genau die nicht passte —
     * ein Zettel, der vorher über der Vorgabe lag, fiel dadurch komplett unter
     * sie, obwohl in einer anderen Spalte rechnerisch Platz war. Details an
     * `noteTier` in der Schleife.
     */
    const packFree = (limitTop: number) => {
      const limited = limitTop !== Infinity
      for (;;) {
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
          // Wer vorher auf gleicher Höhe oder tiefer lag als die Vorgabe, darf
          // nicht darüber. Ein Zettel ohne bekannte Vorgeschichte (neu an der
          // Wand) darf.
          if (limited && (note.previousTop ?? -Infinity) >= limitTop - 0.001) continue

          let noteTop = Infinity
          let noteColumn = 0
          // **Spaltenwahl vor einer Sperrlinie (Ticket 16).** Bewertet wird
          // die Nähe der erreichbaren Oberkante zur ALTEN (`previousTop`),
          // nicht die niedrigste Oberkante — und nur unter den Spalten, in
          // denen der Zettel GANZ über die Sperrlinie passt. Ohne
          // Vorgeschichte (neuer Zettel) zählt wie bisher die niedrigste
          // Oberkante; ohne Sperrlinie (`limited` falsch) ändert sich nichts.
          //
          // Die WELCHER-Zettel-zuerst-Wahl (unten, „Der Tiebreak…") bleibt
          // dagegen gierig nach niedrigster Oberkante. Eine Platzierung in der
          // Reihenfolge der alten Oberkanten wurde erprobt und verworfen: sie
          // bewegte in der Harness MEHR Zettel über der Vorgabe (2,4 statt
          // 0,9 je Aufklappen) — ohne x-Vorgeschichte driften die Zettel
          // seitlich, und die alte Anordnung entsteht doch nicht.
          const prevTarget = limited ? note.previousTop : undefined
          let noteScore = Infinity
          /**
           * Stufe der gefundenen Spalte (Ticket 16): 0 = passt samt Zierabstand
           * (Skyline), 1 = passt nur ohne ihn (`contentLine`). Die Skyline
           * führt unter jedem Zettel `gapOf` (2…15 px) Zierde; eine Lücke, in
           * die der Zettel rechnerisch hineinpasst, nimmt ihn damit oft nicht
           * mehr auf, und er fiele komplett unter die Sperrlinie. Die zweite
           * Stufe sucht deshalb gegen die echten Unterkanten: lieber ohne
           * Zierabstand über der Sperrlinie als ganz darunter. Überlappfrei
           * bleibt beides — `place` klemmt ohnehin gegen die echten Rechtecke
           * (`placedBoxes`), und die Marge für den y-Versatz
           * (`JITTER_DOWN_MAX`) wird auch in Stufe 1 verlangt, damit die
           * Sperrlinie selbst nicht nachrutscht.
           */
          let noteTier = 2
          // **Über ALLE Startspalten, nicht mehr `start + span <= columns`**
          // (Ticket 16). Die alte Grenze stand mit der Begründung da, was
          // darüber hinausginge, klemmte `drawnBox` ohnehin auf dieselbe
          // rechte Kante — das stimmt nur für nichtnegativen x-Versatz: bei
          // negativem `dx` liegt die gezeichnete Position um bis zu 5 px LINKS
          // der Startspalte, und die letzten Startspalten vor der Wandkante
          // ergeben dann noch ungeklemmte, NEUE Kandidatenpositionen. Belegt
          // an einer Harness-Wand: eine 94 px hohe Lücke an der rechten Kante
          // blieb unerreichbar, weil die einzige passende Startspalte hinter
          // der alten Grenze lag, und der Zettel fiel unter die Sperrlinie.
          // Hinter der Klemmung entstehen jetzt Duplikate derselben rechten
          // Kante — die kosten nur Rechenzeit, keine neuen Positionen. Der
          // Helfer `spanOf` ist damit entfallen; die Sperrlinie einer Vorgabe
          // rechnet seit Ticket 14 ohnehin mit `colStart … colEnd` aus
          // `drawnBox`.
          for (let start = 0; start < columns; start++) {
            // Bewertet wird der Kasten, in dem der Zettel am Ende TATSÄCHLICH
            // steht (`drawnBox`), nicht `start … start + span`. Das ist der
            // Kern von Ticket 14: der Versatz muss vor der Wahl bekannt sein,
            // sonst wird woanders reserviert als gezeichnet.
            const box = drawnBox(note, start, false)
            let top = floor
            for (let k = box.colStart; k < box.colEnd; k++) {
              if (skyline[k] > top) top = skyline[k]
            }
            // Vor einer Sperrlinie zählen nur Spalten, in denen der Zettel
            // GANZ über sie passt — samt der Strecke, die der y-Versatz ihn
            // noch nach unten schieben kann (geprüft wird die geplante
            // Oberkante, gezeichnet die verschobene). Der Ausschluss steht
            // seit Ticket 16 HIER statt nach der Spaltenwahl: vorher wurde
            // erst die niedrigste Spalte gewählt und dann der ganze Zettel
            // verworfen, wenn genau diese nicht passte — obwohl eine andere,
            // etwas tiefere Spalte noch über der Sperrlinie frei war.
            let tier = 0
            if (limited && top + note.height + JITTER_DOWN_MAX > limitTop) {
              // Stufe 1 (Ticket 16, siehe `noteTier`): passt der Zettel ohne
              // den Zierabstand der Skyline — gegen die echten Unterkanten
              // (`contentLine`) — noch ganz über die Sperrlinie?
              let face = floor
              for (let k = box.colStart; k < box.colEnd; k++) {
                if (contentLine[k] > face) face = contentLine[k]
              }
              if (face + note.height + JITTER_DOWN_MAX > limitTop) continue
              tier = 1
              top = face
            }
            // Bewertung: vor einer Sperrlinie die Nähe zur ALTEN Oberkante
            // (Ticket 16 — die alte Anordnung reproduzieren, statt sie neu zu
            // würfeln), sonst und ohne Vorgeschichte die niedrigste Oberkante.
            // Eine Spalte mit Zierabstand (Stufe 0) sticht jede ohne (Stufe 1).
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

  // Stapelreihenfolge (Ticket 11) — siehe `PackedNote.z`: kleineres `x`
  // gewinnt, bei Gleichstand kleineres `y`, bei erneutem Gleichstand ein Hash
  // der Aufgaben-Kennung statt der Position im Feld (dieselbe Begründung wie
  // beim Tiebreak weiter oben, „Der Tiebreak…" — eine verschobene Aufgabe im
  // Store-Feld darf den Stapel nicht ändern).
  //
  // Sortiert wird eine KOPIE (`sortedAsc`); mutiert werden die `z`-Felder der
  // ORIGINAL-Objekte in `placed` — deren Reihenfolge im Array bleibt die
  // Packreihenfolge, das ist unbeobachtbar, weil kein Aufrufer sich auf die
  // Array-Reihenfolge verlässt (jeder Konsument liest `note.z`).
  //
  // `sortedAsc[0]` hat das kleinste `x` (bzw. `y`) und muss das HÖCHSTE `z`
  // bekommen — deshalb rückwärts durchgezählt (`length − index`), nicht
  // `index + 1`.
  const sortedAsc = [...placed].sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x
    if (a.y !== b.y) return a.y - b.y
    return fnv1a(a.id) - fnv1a(b.id)
  })
  sortedAsc.forEach((note, index) => {
    note.z = sortedAsc.length - index
  })

  // Obergrenze, benannt statt gehofft: `z` reicht höchstens von 1 bis
  // `placed.length`. Bei realistischen Haushaltsgrößen bleibt das um
  // Größenordnungen unter den `z-index`-Werten, die `WallNote.vue` per
  // `!important` für den gezogenen (800) bzw. lang gedrückten (810) Zettel
  // reserviert — dorthin darf dieser Wert nicht reichen, sonst könnte ein
  // ruhender Zettel einen aktiv gezogenen verdecken. `WallView.vue` nutzt
  // zusätzlich 600…(600+n) für die Fluganimation, ebenfalls oberhalb dieses
  // Bereichs.
  // Ohne `Math.max(0, …)`: `skyline` hat immer mindestens eine Spalte
  // (`columns` ist auf 1 geklemmt) und liegt nie unter ihrem Startwert
  // `topPadding` — der eine 0 wäre unerreichbar und läse sich wie ein Schutz,
  // den es nicht gibt. Die leere Wand kommt von selbst auf 0 heraus: ohne
  // Zettel ist `topPadding` 0 und die Skyline unberührt.
  return { notes: placed, height: Math.max(...skyline) }
}

/**
 * Die zuletzt gepackte Wandhöhe — **modulweit**, nicht je Ansicht (Ticket 02).
 *
 * `WallView` läuft bewusst ohne `keep-alive` und wird bei jedem Reiterwechsel
 * neu montiert. Der Platzhalter vor dem ersten Packlauf braucht aber eine
 * Mindesthöhe, sonst springt die Seite in dem Moment, in dem die Zettel
 * erscheinen — und eine geschätzte Konstante ist immer nur für genau eine
 * Wandhöhe richtig, in die eine Richtung wächst die Seite, in die andere
 * schrumpft sie.
 *
 * Beim Reiterwechsel sind es dieselben Aufgaben und damit fast dieselbe Höhe.
 * Ein Wert, der die Ansicht überlebt, trifft sie also nahezu exakt, statt zu
 * raten. Der Zustand ist bewusst schlicht: er ist nur eine Gedächtnisstütze für
 * die Darstellung, nichts hängt fachlich daran, und ein falscher Wert kostet
 * höchstens den Sprung, den es ohne ihn ohnehin gäbe.
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
