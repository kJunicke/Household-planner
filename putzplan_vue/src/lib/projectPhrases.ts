/**
 * Der Projektspruch — der Grundabdruck eines Projekts (→ CONTEXT.md, „Projektspruch").
 *
 * Ein Projekt kann nicht in Verzug geraten, sein Stempel sagt deshalb nichts über
 * Fälligkeit, sondern einen Spruch aus einer festen Sammlung von hundert. Die Liste ist
 * vollständig aus `.scratch/archive/pinnwand-ausbau/issues/09-nachdruck.md`, Abschnitt
 * „Die Spruchliste für Projekte", übernommen.
 *
 * **Höchstens zehn Zeichen je Spruch.** Der Stempel steht im Fluss der Fußzeile und geht
 * damit in die Zettelbreite und über sie in die Wandhöhe ein. Wer die Liste ergänzt,
 * prüft nur die Zeichenlänge — `PROJECT_PHRASE_MAX_LENGTH` und
 * `findOverlongProjectPhrases()` unten sind dafür da.
 *
 * **Gespeichert, nicht gerechnet.** Der Spruch gehört dem Haushalt: er wird bei der
 * Anlage eines Projekts gezogen und in `tasks.project_saying_index` gespeichert, damit
 * alle Geräte dasselbe Wort sehen und es ein Neuladen übersteht.
 *
 * Diese Datei kann drei Dinge: den gespeicherten Listenplatz **auflösen**
 * (`projectPhraseOf`), den nächsten **ziehen** (`drawProjectPhraseSlot`) und aus dem
 * einen gespeicherten Platz den **ganzen Abdruckstapel** ableiten
 * (`projectPhraseStackOf`). Geschrieben wird hier nichts — das tut
 * `taskStore.cycleEmphasisLevel` beim Abräumen des Stapels (Stufe 2 → 0), und nur dort.
 *
 * **Ein Projekt trägt auf ALLEN DREI Stufen einen Spruch**, seit dem 05.09.2026 (Ticket
 * `04`, Nacharbeit): `WICHTIG` und `DRINGEND` kommen an einem Projekt nicht mehr vor. Die
 * Dringlichkeit liest man dort allein an der **Farbe** der obersten Lage ab
 * (blau → orange → rot), nicht am Wort. Vom Maintainer am Gerät entschieden, nachdem die
 * erste Fassung von `04` die Wörter auch auf Projekte gelegt hatte.
 */

import type { Task } from '@/types/Task'

/** Die harte Grenze: der Stempel geht in die Zettelbreite ein. */
export const PROJECT_PHRASE_MAX_LENGTH = 10

/**
 * Die hundert Sprüche, in der Reihenfolge der Liste in `09-nachdruck.md`.
 *
 * `HEUTE NOCH` fehlt bewusst: `HEUTE` war bis zur Umstellung ein Stempelwort für die
 * berechnete Fälligkeit und ist abgeschafft — als Projektspruch wiederverwendet würde es
 * die eine Bedeutung mit der anderen verwechselbar machen. `SOFORT`, `GLEICH` und
 * `AB HEUTE` bleiben dagegen drin: sie klingen nach Frist, meinen aber einen Vorsatz.
 */
export const PROJECT_PHRASES: readonly string[] = [
  'BAUSTELLE', 'GESPERRT', 'IRGENDWANN', 'BALD MAL', 'JETZT ABER',
  'IN ARBEIT', 'LÄUFT', 'LÄUFT NOCH', 'UNFERTIG', 'HALBFERTIG',
  'VERTAGT', 'VERSCHOBEN', 'MORGEN', 'ÜBERMORGEN', 'EINES TAGS',
  'NOCH NICHT', 'FAST SCHON', '90 PROZENT', '99 PROZENT', 'ANGEFANGEN',
  'BEGONNEN', 'IM GANGE', 'AM WERKELN', 'WERKELT', 'RUHT',
  'RUHT NOCH', 'SCHLUMMERT', 'PAUSIERT', 'AUF EIS', 'EISFACH',
  'STOCKT', 'HAKT', 'HAKT NOCH', 'ZÄH', 'MÜHSAM',
  'LANGWIERIG', 'EPOS', 'SAGA', 'ODYSSEE', 'MARATHON',
  'DAUERLAUF', 'LEBENSWERK', 'HERKULES', 'SISYPHOS', 'UNENDLICH',
  'EWIG', 'EWIGKEIT', 'NIE FERTIG', 'WIRD SCHON', 'KOMMT NOCH',
  'GEDULD', 'ABWARTEN', 'MAL SEHEN', 'VIELLEICHT', 'THEORIE',
  'IDEE', 'PLAN', 'PLAN B', 'ENTWURF', 'SKIZZE',
  'VISION', 'TRAUM', 'WUNSCH', 'WOLLTE JA', 'HÄTTE',
  'WILLE DA', 'MOTIVIERT', 'AUFRAFFEN', 'DRAN', 'BLEIB DRAN',
  'WEITER SO', 'KOPF HOCH', 'SCHAFFST', 'DU PACKST', 'GLEICH',
  'SOFORT', 'HALB DA', 'AB HEUTE', 'NEUSTART', 'ANLAUF 2',
  'RUNDE 2', 'RUNDE 7', 'VERSUCH 3', 'WIEDER DA', 'ZURÜCK',
  'AUFSCHUB', 'AUSSTEHEND', 'OFFEN', 'LOSE ENDEN', 'RESTPOSTEN',
  'ÜBRIG', 'LIEGT NOCH', 'STAUBIG', 'VERGESSEN', 'VERDRÄNGT',
  'IGNORIERT', 'VERTRÖSTET', 'AUSREDE 4', 'IN PLANUNG', 'DEMNÄCHST'
]

/**
 * Prüft die GANZE Liste gegen die Zehn-Zeichen-Grenze und liefert die Verstöße.
 *
 * Bewusst eine Funktion und kein Kommentar „ist geprüft": ein Beispiel beweist nichts,
 * und die Liste ist ausdrücklich zum Ergänzen gedacht. Aufrufbar aus der Konsole des
 * ferngesteuerten Tabs, ohne Test-Framework.
 */
export function findOverlongProjectPhrases(): string[] {
  return PROJECT_PHRASES.filter((phrase) => phrase.length > PROJECT_PHRASE_MAX_LENGTH)
}

/**
 * Alles, was diese Datei von einer Aufgabe braucht.
 *
 * Seit dem Weiterdrehen (Ticket `04`) steht `project_saying_index` **im `Task`-Interface**
 * (`src/types/Task.ts`) — es gibt keinen Cast mehr auf eine undeklarierte Spalte. Der
 * Grund für die Änderung: das Weiterdrehen muss die Spalte auch **schreiben** und im
 * Fehlerfall zurückrollen; ein zweiter Cast an einer zweiten Stelle wäre eine zweite
 * Gelegenheit gewesen, den Spaltennamen still zu vertippen.
 *
 * Bewusst ein `Pick` und nicht `Task` selbst: diese Datei braucht zwei Felder, nicht
 * dreißig. Und bewusst **keine** Index-Signatur (früher
 * `{ task_id: string } & Partial<Record<string, unknown>>`): TypeScript weist einem Typ
 * mit Index-Signatur kein Interface ohne eine solche zu, `projectPhraseOf(props.task)`
 * war damit ein Typfehler — zur Laufzeit unsichtbar, im Build-Gate rot.
 */
type PhraseCarrier = Pick<Task, 'task_id' | 'project_saying_index'>

/**
 * Liest den gespeicherten Listenplatz.
 *
 * Liefert `null`, wenn der Wert **fehlt oder unbrauchbar** ist; der Aufrufer meldet das
 * laut. Die Prüfung bleibt trotz des jetzt deklarierten Feldes eine **Laufzeitprüfung**:
 * die Zeile kommt aus der Datenbank, das Interface ist eine Behauptung über sie und kein
 * Beweis — eine alte zwischengespeicherte Zeile oder ein `select` mit Spaltenliste liefert
 * hier sehr wohl `undefined`.
 *
 * Ein Wert außerhalb 0–99 wird ausdrücklich **nicht** per Modulo umgeklappt: der
 * `CHECK`-Constraint verbietet ihn ohnehin, und ein Umklappen ergäbe ein plausibel
 * aussehendes falsches Wort. Lieber laut falsch als leise plausibel.
 */
function storedPhraseSlot(task: PhraseCarrier): number | null {
  const raw: unknown = task.project_saying_index
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null
  if (raw < 0 || raw >= PROJECT_PHRASES.length) return null
  return raw
}

/**
 * Der gespeicherte Listenplatz einer Aufgabe, oder `null`, wenn er unbrauchbar ist.
 *
 * Für den Schreibweg: `cycleEmphasisLevel` muss wissen, von WELCHEM Platz aus es
 * weiterdreht, damit „nie derselbe zweimal hintereinander" überhaupt prüfbar ist. Es
 * bekommt hier bewusst den **Platz** und nicht den Text — gespeichert wird der Platz, und
 * ein Rückweg vom Wort zur Zahl wäre bei zwei gleichen Wörtern mehrdeutig.
 */
export function projectPhraseSlotOf(task: PhraseCarrier): number | null {
  return storedPhraseSlot(task)
}

/**
 * Zieht den **nächsten** Listenplatz — das Weiterdrehen beim Abräumen des Stapels.
 *
 * Zwei Zusagen, und die zweite ist die teure:
 *
 * 1. **Zufällig aus den übrigen 99.** Gleichverteilt, damit sich ein Haushalt über viele
 *    Durchläufe wirklich durch die Sammlung stempelt und nicht um drei Sprüche kreist.
 * 2. **Nie derselbe zweimal hintereinander.** Ein Abräumen, nach dem dasselbe Wort
 *    dasteht, sieht aus wie ein Fehlschlag beim Speichern — der Nutzer tippt erneut und
 *    hat dann versehentlich wieder gestempelt.
 *
 * Umgesetzt als Versatz `1 … 99` auf den aktuellen Platz, modulo 100, **nicht** als
 * „ziehen und bei Gleichstand neu ziehen": die Schleife hätte keine obere Schranke, und
 * der Versatz ist über die 99 Alternativen exakt gleichverteilt statt nur „fast immer".
 *
 * `Math.random()` ist hier richtig und widerspricht der Regel „Versatz und Neigung eines
 * Abdrucks kommen deterministisch aus der Aufgaben-Kennung" nicht: **gezogen wird das
 * Wort, nicht seine Lage**, und das Ergebnis der Ziehung wird gespeichert. Ein Spruch, der
 * sich beim Neuladen ändert, entstünde erst, wenn jemand das Speichern wegließe.
 *
 * `currentSlot === null` heißt „es gab noch keinen brauchbaren" — dann fällt die zweite
 * Zusage weg (es gibt nichts zu wiederholen) und alle 100 stehen zur Wahl.
 */
export function drawProjectPhraseSlot(currentSlot: number | null): number {
  const count = PROJECT_PHRASES.length
  const from =
    currentSlot !== null && Number.isInteger(currentSlot) && currentSlot >= 0 && currentSlot < count
      ? currentSlot
      : null
  if (from === null) return Math.floor(Math.random() * count)
  const offset = 1 + Math.floor(Math.random() * (count - 1))
  return (from + offset) % count
}

/**
 * Ein Sonderfall wird **einmal je Projekt** gemeldet, nicht einmal je Neuzeichnen.
 *
 * `projectPhraseOf()` hängt an einem `computed` und läuft bei jedem Packlauf der Wand
 * erneut — ungebremst wären das hunderte identische Zeilen je Layoutdurchgang, und die
 * Meldung ginge im Rauschen unter, statt aufzufallen.
 */
const warnedTasks = new Set<string>()
function warnOnce(taskId: string, message: string): void {
  if (warnedTasks.has(taskId)) return
  warnedTasks.add(taskId)
  console.error(`[Projektspruch] ${message} (Aufgabe ${taskId})`)
}

/** FNV-1a, 32 Bit — dieselbe Streuung wie die Unordnung der Wand in `wallLayout.ts`. */
function fnv1a(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

/**
 * Der Spruch eines Projekts.
 *
 * Der Regelweg ist der **gespeicherte** Listenplatz — der Spruch gehört dem Haushalt,
 * nicht dem Gerät, und nur ein gespeicherter Wert lässt sich weiterdrehen
 * (→ `drawProjectPhraseSlot`, geschrieben in `taskStore.cycleEmphasisLevel`).
 *
 * **Der Rückfall ist ein Notausgang, kein zweiter Regelweg.** Er greift nur, wenn die
 * Spalte fehlt, `null` ist oder außerhalb 0–99 liegt — seit die Migration in Produktion
 * ist, kommt das im Normalbetrieb nicht mehr vor. Er bleibt trotzdem stehen, weil ein
 * Projekt ohne Grundabdruck keine Fläche zum Überstempeln hätte (→ Ticket `02`) und ein
 * fehlender Stempel zudem die Breitenmessung in `WallView.vue` verfälschte, die ihn als
 * gesetzt voraussetzt. Eine Lücke wäre also teurer als ein falsches Wort.
 *
 * **Er meldet sich aber.** Das ist der Punkt: der Rückfall ist selbst deterministisch,
 * sähe im Fehlerfall völlig plausibel aus und zeigte allen Geräten dasselbe *falsche*
 * Wort — ein stiller Notausgang, der nie auffällt. Deshalb `console.error` statt
 * schweigen. Aus `Math.random()` kommt der Platz trotzdem nicht: ein Spruch, der sich
 * beim Neuladen ändert, sähe nach einem zweiten, schlimmeren Fehler aus.
 */
export function projectPhraseOf(task: PhraseCarrier): string {
  return PROJECT_PHRASES[effectivePhraseSlot(task)]
}

/**
 * Der Platz, mit dem tatsächlich gearbeitet wird: der gespeicherte, sonst der abgeleitete.
 *
 * Eine eigene Funktion, weil ihn jetzt ZWEI Leser brauchen — der Grundabdruck und der
 * ganze Stapel — und beide denselben bekommen müssen. Stünde der Rückfall zweimal da,
 * könnten Grundabdruck und Stapel eines Projekts im Fehlerfall auseinanderlaufen.
 */
function effectivePhraseSlot(task: PhraseCarrier): number {
  const stored = storedPhraseSlot(task)
  if (stored !== null) return stored

  warnOnce(
    task.task_id,
    'Kein brauchbarer Listenplatz in `tasks.project_saying_index` — der Spruch wird ' +
      'ersatzweise aus der Aufgaben-Kennung abgeleitet. Er ist damit stabil, aber nicht ' +
      'der gespeicherte, und lässt sich nicht weiterdrehen.'
  )
  return fnv1a(task.task_id) % PROJECT_PHRASES.length
}

/**
 * Der **ganze Abdruckstapel** eines Projekts: drei Sprüche, von unten nach oben.
 *
 * An einem Projekt trägt jede Stufe einen Spruch — `WICHTIG` und `DRINGEND` kommen dort
 * nicht vor (siehe Kopf dieser Datei). Die Stufe liest man an der **Farbe**, nicht am
 * Wort; deshalb darf und muss die Farbrampe an der Lage hängen bleiben.
 *
 * **Gespeichert bleibt genau eine Zahl.** Die beiden oberen Plätze werden aus dem
 * gespeicherten Grundplatz **abgeleitet**, nicht zusätzlich gespeichert. Das ist die ganze
 * Sparsamkeit dieser Lösung und sie kostet nichts: der Stapel übersteht ein Neuladen und
 * sieht auf jedem Gerät gleich aus, weil beide Zutaten — gespeicherter Platz und
 * Aufgaben-Kennung — überall dieselben sind. Eine zweite und dritte Spalte hätte eine
 * Migration gekostet, drei Werte, die man beim Abräumen konsistent halten muss, und einen
 * neuen stillen Fehler: zwei Zeilen, in denen zwei der drei Plätze gleich sind.
 *
 * **Warum die drei Plätze garantiert verschieden sind.** Die beiden Versätze liegen in
 * `1 … 99` und sind untereinander verschieden (der zweite wird aus `1 … 98` gezogen und um
 * eins angehoben, sobald er den ersten erreicht — die klassische Auswahl ohne
 * Zurücklegen, ohne Schleife). Drei paarweise verschiedene Versätze aus `0 … 99` ergeben
 * modulo 100 drei paarweise verschiedene Plätze. Es gibt also keinen Stapel, auf dem
 * dasselbe Wort zweimal steht — was wie ein nicht angekommener Tipp aussähe.
 *
 * **Das Abräumen wechselt den ganzen Stapel**, ohne dass es davon wüsste: die oberen
 * beiden hängen am Grundplatz, und der wird beim Übergang 2 → 0 neu gezogen.
 *
 * Der Schlüssel steht beim Hashen VORN (`l1#…`, `l2#…`) — dieselbe Falle wie in
 * `wallLayout.ts`: Schlüssel, die sich nur im letzten Zeichen unterscheiden, liefern bei
 * FNV-1a messbar zusammenhängende Ergebnisse.
 */
export function projectPhraseStackOf(task: PhraseCarrier): [string, string, string] {
  const count = PROJECT_PHRASES.length
  const base = effectivePhraseSlot(task)

  const first = 1 + (fnv1a(`stapel-l1#${task.task_id}#${base}`) % (count - 1))
  const drawn = 1 + (fnv1a(`stapel-l2#${task.task_id}#${base}`) % (count - 2))
  const second = drawn >= first ? drawn + 1 : drawn

  return [
    PROJECT_PHRASES[base],
    PROJECT_PHRASES[(base + first) % count],
    PROJECT_PHRASES[(base + second) % count]
  ]
}
