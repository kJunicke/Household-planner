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
export const MIN_NOTE_WIDTH = 96

export interface WallNoteMetrics {
  id: string
  /** Bereits gesetzte Breite. */
  width: number
  /** Nach dem Setzen der Breite gemessene Höhe. */
  height: number
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

    const dx = jitterOf(note.id, 'x', 5)
    const dy = jitterOf(note.id, 'y', 4) - 2.5
    const x = Math.max(0, Math.min(wallWidth - width, bestColumn * SKYLINE_RESOLUTION + dx))
    const y = Math.max(0, bestTop + dy)

    const gap = gapOf(note.id)
    for (let k = bestColumn; k < bestColumn + span; k++) {
      skyline[k] = y + note.height + gap
    }

    placed.push({ id: note.id, x, y, z: index + 1 })
  })

  return { notes: placed, height: Math.max(0, ...skyline) }
}
