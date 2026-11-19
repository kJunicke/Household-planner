/**
 * Der Abdruckstapel eines Zettels (→ CONTEXT.md „Stempel", „Überstempeln").
 *
 * Reine Funktion: welche Abdrücke auf dem Papier liegen, mit welchem Wort, und wie
 * jeder einzelne verrutscht und geneigt ist. Wie das aussieht und wo man tippt,
 * steht in `WallNote.vue`.
 *
 * **Nur was gestempelt ist, liegt auf dem Papier.** Bis ADR-0007 standen alle drei
 * Lagen immer im DOM, die noch nicht gestempelten unsichtbar, damit der Stapel
 * seine Breite von Anfang an reservierte (ADR-0003). Seit der Abdruck in Stift und
 * Papierrand ragen darf, trägt er keine Breite mehr — und braucht keine
 * Platzhalter.
 */
import type { Task } from '@/types/Task'
import { projectPhraseStackOf } from './projectPhrases'
import { jitterOf } from './wallLayout'

type StampCarrier = Pick<
  Task,
  'task_id' | 'task_type' | 'last_completed_at' | 'emphasis_level' | 'project_saying_index'
>

/**
 * Der **Grundabdruck** — der berechnete unterste Abdruck (→ CONTEXT.md „Stempel").
 * **Jeder Zettel trägt einen.**
 *
 *   tägliche Aufgabe            → BEDARF   (sie wird nicht fällig, sie fällt an)
 *   Projekt                     → Projektspruch (nicht hier: `stampStackOf` nimmt am Projekt den
 *                                 ganzen Spruchstapel aus `projectPhraseStackOf`)
 *   noch nie erledigt           → NEU
 *   sonst                       → FÄLLIG
 *   loser Zettel (Suche)        → ERLEDIGT (nicht hier: `stampStackOf` mit `loose`)
 *
 * **Der Typ schlägt NEU, und die Reihenfolge dieser Prüfungen ist die ganze
 * Regel.** Tägliche Aufgaben und Projekte werden nie abgeschlossen und stünden
 * bei umgekehrter Reihenfolge DAUERHAFT auf NEU — ein stiller Fehler: der
 * Stempel sähe plausibel aus, er stünde nur nie wieder um.
 *
 * Keine Dringlichkeitsstufe, keine Tageszahl, kein „HEUTE": auf der Wand sind
 * alle fälligen Aufgaben gleich dringend, der Stempel **ordnet nicht**
 * (→ ADR-0002).
 */
function baseLabelOf(task: StampCarrier): string {
  // ERST der Typ, DANN der Erledigungs-Status. Nicht umstellen, siehe oben.
  if (task.task_type === 'daily') return 'BEDARF'
  return task.last_completed_at ? 'FÄLLIG' : 'NEU'
}

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
 */
const STAMP_OFFSET = 5.5

/**
 * Nach links oder rechts geneigt — deterministisch aus der Aufgaben-Kennung.
 * **Das Vorzeichen hängt an der LAGE, nicht am Zettel:** jeder Abdruck ist ein
 * eigener Handgriff; kippen alle drei gleich, sieht der Stapel gedruckt aus
 * statt gestempelt.
 */
const tiltSignOf = (id: string, index: number) =>
  jitterOf(id, `stamp-dir${index}`, 1) < 0 ? -1 : 1

/** Ein Abdruck auf dem Papier, von unten (Grundabdruck) nach oben. */
export interface StampLayer {
  /**
   * Stufe: 0 Grundabdruck, 1 und 2 die überstempelten Lagen. Am Projekt stehen
   * auf 1 und 2 Projektsprüche statt `WICHTIG`/`DRINGEND` — deshalb heißt das
   * Feld nach der Stufe, nicht nach dem Wort.
   */
  level: 0 | 1 | 2
  text: string
  /** Die zurzeit oberste, gültige Lage. */
  top: boolean
  /** Versatz in px und Neigung in Grad dieser Lage. */
  dx: number
  dy: number
  tilt: number
}

/**
 * Die Abdrücke, die auf dem Papier liegen, von unten nach oben: der Grundabdruck
 * und darüber so viele Lagen, wie `emphasis_level` sagt.
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
export function stampStackOf(task: StampCarrier, options: { loose?: boolean } = {}): StampLayer[] {
  // An einem Projekt trägt jede Stufe einen Spruch (→ CONTEXT.md „Projektspruch");
  // die Dringlichkeit steht allein in der Farbe der obersten Lage — die Rampe
  // darf deshalb nie ans Wort gebunden werden. Alle drei kommen aus dem EINEN
  // gespeicherten Listenplatz (`projectPhraseStackOf`); hier wird nichts gezogen.
  //
  // Ein **loser Zettel** (erledigter Treffer der Suche) trägt nur ERLEDIGT, vor
  // jedem Typ: so sieht man, woher er kommt. Überstempeln gibt es an ihm nicht
  // (→ CONTEXT.md „Stempel"), also auch keinen Nachdruck — selbst wenn noch
  // einer gespeichert ist. Versatz und Neigung sind die des Grundabdrucks.
  const texts = options.loose
    ? ['ERLEDIGT']
    : task.task_type === 'project'
      ? projectPhraseStackOf(task)
      : [baseLabelOf(task), 'WICHTIG', 'DRINGEND']
  const level = options.loose ? 0 : task.emphasis_level
  const id = task.task_id

  return texts.slice(0, level + 1).map((text, index) => ({
    level: index as 0 | 1 | 2,
    text,
    top: index === level,
    dx: jitterOf(id, `stamp-dx${index}`, STAMP_OFFSET),
    dy: jitterOf(id, `stamp-dy${index}`, STAMP_OFFSET),
    tilt:
      tiltSignOf(id, index) * (STAMP_TILT + jitterOf(id, `stamp-rot${index}`, STAMP_TILT_JITTER)),
  }))
}
