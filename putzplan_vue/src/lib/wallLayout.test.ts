import { describe, expect, it } from 'vitest'

import {
  jitterOf,
  kindOfTaskType,
  layoutWall,
  rememberedWallHeight,
  rememberWallHeight,
  rotationOf,
  subtaskColumns,
  wallGrid,
  type PlacedNote,
  type WallGroup,
  type WallLayout,
  type WallNoteInput,
} from './wallLayout'

// Geprüft wird das Verhalten an der Schnittstelle (Zettel, Wandbreite,
// aufgeklappte Zettel → Spalten und Positionen), nicht der Rechenweg. Eine
// Messung ist kein Blick (CLAUDE.md): grün heißt „Geometrie hält ihre Zusagen",
// nicht „sieht gut aus".

/** Kleiner deterministischer Zufall, damit die Stichproben reproduzierbar bleiben. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const uuid = (rand: () => number) =>
  Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16)).join('')

/**
 * Nutzbare Wandbreiten der Prüfgeräte: Fensterbreite − 16 (Seitenpolster) − 4
 * (Wandrahmen) − 24 (`EDGE` beidseitig), siehe `WallView.vue`.
 */
const PHONE_WALLS = { 320: 276, 360: 316, 390: 346, 412: 368 }

describe('wallGrid — Spalten', () => {
  it.each(Object.entries(PHONE_WALLS))('Handy %s px: zwei Spalten', (_, wall) => {
    expect(wallGrid(wall).columns).toBe(2)
  })

  it('Tablet und Desktop bekommen mehr Spalten, rund 160 px je Spalte', () => {
    expect(wallGrid(724).columns).toBe(4) // 768 px
    expect(wallGrid(980).columns).toBe(6) // 1024 px
    expect(wallGrid(1236).columns).toBe(7) // 1280 px
  })

  it('Spalten und Zwischenräume füllen die Wand genau', () => {
    for (const wall of [276, 316, 346, 368, 500, 724, 1236]) {
      const { columns, columnWidth, columnGap } = wallGrid(wall)
      expect(columns * columnWidth + (columns - 1) * columnGap).toBeCloseTo(wall, 6)
    }
  })
})

/** Die Legereihenfolge der Gruppen laut Spec: fällig → täglich → Projekt → lose. */
const GROUP_RANK: Record<WallGroup, number> = { due: 0, daily: 1, project: 2, loose: 3 }
const GROUPS = Object.keys(GROUP_RANK) as WallGroup[]

function randomNotes(seed: number, count: number): WallNoteInput[] {
  const rand = mulberry32(seed)
  return Array.from({ length: count }, () => ({
    id: uuid(rand),
    group: GROUPS[Math.floor(rand() * GROUPS.length)]!,
    height: 60 + Math.floor(rand() * 120),
  }))
}

const WALLS = [276, 316, 346, 368, 724]
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1)
const CASES = WALLS.flatMap((wall) => SEEDS.map((seed) => ({ wall, seed })))
const EPS = 1e-6

/** Paare, deren (ungedrehte) Rechtecke sich überdecken. */
function overlaps(notes: readonly WallNoteInput[], layout: WallLayout): string[] {
  const heightOf = new Map(notes.map((n) => [n.id, n.height]))
  const boxes = layout.notes.map((p) => ({ ...p, height: heightOf.get(p.id)! }))
  const found: string[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const xOverlap = a.x < b.x + b.width - EPS && b.x < a.x + a.width - EPS
      const yOverlap = a.y < b.y + b.height - EPS && b.y < a.y + a.height - EPS
      if (xOverlap && yOverlap) found.push(`${a.id} × ${b.id}`)
    }
  }
  return found
}

describe('layoutWall — Raster', () => {
  it('leere Wand: keine Zettel, keine Höhe', () => {
    expect(layoutWall([], 316)).toMatchObject({ notes: [], height: 0 })
  })

  it.each(CASES)(
    'Wand $wall px, Stichprobe $seed: jeder Zettel in Spaltenbreite, nichts ragt über den Rand',
    ({ wall, seed }) => {
      const notes = randomNotes(seed, 40)
      const layout = layoutWall(notes, wall)
      const heightOf = new Map(notes.map((n) => [n.id, n.height]))
      expect(layout.notes).toHaveLength(notes.length)
      for (const p of layout.notes) {
        expect(p.width).toBeCloseTo(wallGrid(wall).columnWidth, 6)
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x + p.width).toBeLessThanOrEqual(wall + EPS)
        expect(p.y).toBeGreaterThan(0) // Polster für die Befestigungen über der Oberkante
        expect(p.y + heightOf.get(p.id)!).toBeLessThanOrEqual(layout.height + EPS)
      }
    },
  )

  it.each(CASES)(
    'Wand $wall px, Stichprobe $seed: kein Zettel überdeckt einen anderen',
    ({ wall, seed }) => {
      const notes = randomNotes(seed, 40)
      expect(overlaps(notes, layoutWall(notes, wall))).toEqual([])
    },
  )

  it.each(CASES)(
    'Wand $wall px, Stichprobe $seed: jeder Zettel kommt in die gerade kürzeste Spalte',
    ({ wall, seed }) => {
      const notes = randomNotes(seed, 40)
      const layout = layoutWall(notes, wall)
      const heightOf = new Map(notes.map((n) => [n.id, n.height]))
      const { columns } = wallGrid(wall)
      // Nachspielen in Legereihenfolge (= Reihenfolge der Ausgabe): beim Legen
      // war die Spalte des Zettels die mit der niedrigsten Unterkante.
      const bottoms = new Array<number>(columns).fill(0)
      for (const p of layout.notes) {
        expect(p.column).not.toBeNull()
        const column = p.column!
        expect(bottoms[column]).toBe(Math.min(...bottoms))
        bottoms[column] = p.y + heightOf.get(p.id)!
      }
    },
  )
})

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Platz eines Zettels ohne Stapelwert `z` — der hängt an allen Zetteln. */
const places = (notes: readonly PlacedNote[]) =>
  notes.map(({ id, column, x, y, width, dx, dy, rotation }) => ({
    id,
    column,
    x,
    y,
    width,
    dx,
    dy,
    rotation,
  }))

const positions = (layout: WallLayout) =>
  Object.fromEntries(layout.notes.map((n) => [n.id, [n.x, n.y, n.z]]))

describe('layoutWall — Reihenfolge', () => {
  it.each(CASES)(
    'Wand $wall px, Stichprobe $seed: Ergebnis hängt an der Menge, nie an der Eingabereihenfolge',
    ({ wall, seed }) => {
      const notes = randomNotes(seed, 40)
      const a = layoutWall(notes, wall)
      const b = layoutWall(shuffled(notes, seed * 31), wall)
      expect(positions(b)).toEqual(positions(a))
      expect(b.height).toBe(a.height)
    },
  )

  it.each(CASES)(
    'Wand $wall px, Stichprobe $seed: fällig → täglich → Projekt → lose, auch innerhalb jeder Spalte',
    ({ wall, seed }) => {
      const notes = randomNotes(seed, 40)
      const groupOf = new Map(notes.map((n) => [n.id, GROUP_RANK[n.group]]))
      const layout = layoutWall(notes, wall)
      const laid = layout.notes.map((p) => groupOf.get(p.id)!)
      expect(laid).toEqual([...laid].sort((a, b) => a - b))
      for (let column = 0; column < layout.columns; column++) {
        const down = layout.notes
          .filter((p) => p.column === column)
          .sort((a, b) => a.y - b.y)
          .map((p) => groupOf.get(p.id)!)
        expect(down).toEqual([...down].sort((a, b) => a - b))
      }
    },
  )

  it('Stapel: links liegt über rechts, in derselben Spalte oben über unten', () => {
    const layout = layoutWall(randomNotes(3, 40), 346)
    const zs = layout.notes.map((n) => n.z)
    expect(new Set(zs).size).toBe(zs.length)
    for (const a of layout.notes) {
      for (const b of layout.notes) {
        if (a.column !== null && b.column !== null && a.column < b.column)
          expect(a.z).toBeGreaterThan(b.z)
        if (a.column === b.column && a.y < b.y) expect(a.z).toBeGreaterThan(b.z)
      }
    }
  })
})

describe('layoutWall — Versatz und Neigung hängen an der Aufgabe', () => {
  it.each(SEEDS)(
    'Stichprobe %i: ein Zettel kommt dazu oder geht — die anderen behalten Versatz und Neigung',
    (seed) => {
      const notes = randomNotes(seed, 30)
      const offsets = (layout: WallLayout) =>
        new Map(layout.notes.map((n) => [n.id, [n.dx, n.dy, n.rotation]]))
      const before = offsets(layoutWall(notes, 316))
      const added = offsets(layoutWall([...notes, ...randomNotes(seed + 1000, 1)], 316))
      const removed = offsets(layoutWall(notes.slice(1), 316))
      for (const note of notes.slice(1)) {
        expect(added.get(note.id)).toEqual(before.get(note.id))
        expect(removed.get(note.id)).toEqual(before.get(note.id))
      }
    },
  )

  it('Versatz und Neigung sind nicht für alle Zettel gleich', () => {
    const layout = layoutWall(randomNotes(4, 30), 316)
    expect(new Set(layout.notes.map((n) => n.dx)).size).toBeGreaterThan(10)
    expect(new Set(layout.notes.map((n) => n.dy)).size).toBeGreaterThan(5)
    expect(new Set(layout.notes.map((n) => n.rotation)).size).toBeGreaterThan(10)
  })
})

describe('layoutWall — Aufklappen teilt die Spalten', () => {
  const wall = 316

  /** Der aufgeklappte Zettel ist höher als vorher: seine Zettelchen stehen im DOM. */
  const expand = (notes: WallNoteInput[], id: string) =>
    notes.map((n) => (n.id === id ? { ...n, height: n.height + 160 } : n))

  it.each(SEEDS)(
    'Stichprobe %i: was davor liegt, bleibt; der Zettel liegt wandbreit darunter; der Rest darunter',
    (seed) => {
      const notes = randomNotes(seed, 30)
      const closed = layoutWall(notes, wall)
      const target = closed.notes[10 + (seed % 15)].id
      const open = layoutWall(expand(notes, target), wall, new Set([target]))
      const heightOf = new Map(expand(notes, target).map((n) => [n.id, n.height]))

      const index = open.notes.findIndex((n) => n.id === target)
      expect(closed.notes.findIndex((n) => n.id === target)).toBe(index)
      expect(places(open.notes.slice(0, index))).toEqual(places(closed.notes.slice(0, index)))

      const pinned = open.notes[index]
      expect(pinned).toMatchObject({ x: 0, width: wall, column: null })
      for (const before of open.notes.slice(0, index))
        expect(before.y + heightOf.get(before.id)!).toBeLessThanOrEqual(pinned.y)
      for (const after of open.notes.slice(index + 1))
        expect(after.y).toBeGreaterThanOrEqual(pinned.y + heightOf.get(target)!)
      expect(overlaps(expand(notes, target), open)).toEqual([])
    },
  )

  it.each(SEEDS)('Stichprobe %i: Zuklappen stellt den vorigen Zustand her', (seed) => {
    const notes = randomNotes(seed, 30)
    const target = notes[seed].id
    layoutWall(expand(notes, target), wall, new Set([target]))
    expect(layoutWall(notes, wall)).toEqual(layoutWall(notes, wall, new Set()))
  })

  it('zwei aufgeklappte Zettel teilen je an ihrer Stelle', () => {
    const notes = randomNotes(21, 30)
    const closed = layoutWall(notes, wall)
    const [first, second] = [closed.notes[8].id, closed.notes[20].id]
    const grown = expand(expand(notes, first), second)
    const open = layoutWall(grown, wall, new Set([first, second]))
    const heightOf = new Map(grown.map((n) => [n.id, n.height]))
    const a = open.notes.find((n) => n.id === first)!
    const b = open.notes.find((n) => n.id === second)!
    expect(places(open.notes.slice(0, 8))).toEqual(places(closed.notes.slice(0, 8)))
    expect(b.y).toBeGreaterThanOrEqual(a.y + heightOf.get(first)!)
    expect(overlaps(grown, open)).toEqual([])
  })

  it('ein aufgeklappter Zettel ganz oben ragt mit seinen Befestigungen nicht über den Kork', () => {
    // Projekt (Klammern an den Kanten): wandbreit ist der Hebel der Neigung am größten.
    const project = { id: 'projekt-ganz-oben', group: 'project' as const, height: 300 }
    const narrow = layoutWall([project], wall)
    const wide = layoutWall([project], wall, new Set([project.id]))
    expect(wide.notes[0].y).toBeGreaterThanOrEqual(narrow.notes[0].y - narrow.notes[0].dy)
    expect(wide.notes[0].y).toBeGreaterThan(0)
  })
})

describe('layoutWall — oberes Polster der losen Zettel', () => {
  /** Polster über der obersten Reihe: Oberkante des ersten Zettels ohne seine Luft. */
  const topPadding = (group: WallGroup, id: string) => {
    const [first] = layoutWall([{ id, group, height: 80 }], 316).notes
    return first!.y - first!.dy
  }

  it('hält die Nadelstelle auf dem Kork: sie ragt 6 px über die Papierkante', () => {
    const rand = mulberry32(21)
    for (let i = 0; i < 200; i++) expect(topPadding('loose', uuid(rand))).toBeGreaterThanOrEqual(6)
  })

  it('polstert nach der eigenen Nadelstelle, nicht nach der höchsten Befestigung', () => {
    // Früher bekam ein loser Zettel als unbekannte Gruppe das Polster aller
    // Befestigungen; Klammern und Klebestreifen stehen weiter über als die
    // Nadelstelle.
    const rand = mulberry32(22)
    for (let i = 0; i < 200; i++) {
      const id = uuid(rand)
      expect(topPadding('loose', id)).toBeLessThan(topPadding('unknown', id))
    }
  })
})

describe('Unordnung ist deterministisch', () => {
  it('Neigung liegt in −3…+3 Grad und hängt nur an der Kennung', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 2000; i++) {
      const id = uuid(rand)
      const r = rotationOf(id)
      expect(r).toBeGreaterThanOrEqual(-3)
      expect(r).toBeLessThanOrEqual(3)
      expect(rotationOf(id)).toBe(r)
    }
  })

  it('Versatz bleibt in ±range, und die Achsen sind getrennt', () => {
    const rand = mulberry32(8)
    let sameAxes = 0
    for (let i = 0; i < 2000; i++) {
      const id = uuid(rand)
      const x = jitterOf(id, 'x', 5)
      const y = jitterOf(id, 'y', 5)
      expect(Math.abs(x)).toBeLessThanOrEqual(5)
      expect(Math.abs(y)).toBeLessThanOrEqual(5)
      if (x === y) sameAxes++
    }
    expect(sameAxes).toBeLessThan(20)
  })

  it('Schlüssel, die sich nur in der letzten Ziffer unterscheiden, sind unkorreliert', () => {
    // Regression zum Befund vom 05.09.2026: mit der Kennung VORN korrelierten
    // `stamp-dx0`/`stamp-dx2` mit +0,68. Gefordert ist „nahe 0".
    const rand = mulberry32(9)
    const a: number[] = []
    const b: number[] = []
    for (let i = 0; i < 20000; i++) {
      const id = uuid(rand)
      a.push(jitterOf(id, 'stamp-dx0', 6))
      b.push(jitterOf(id, 'stamp-dx2', 6))
    }
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
    const ma = mean(a)
    const mb = mean(b)
    let cov = 0
    let va = 0
    let vb = 0
    for (let i = 0; i < a.length; i++) {
      cov += (a[i] - ma) * (b[i] - mb)
      va += (a[i] - ma) ** 2
      vb += (b[i] - mb) ** 2
    }
    expect(Math.abs(cov / Math.sqrt(va * vb))).toBeLessThan(0.05)
  })
})

describe('kindOfTaskType', () => {
  it('Projekt und täglich haben eigenes Papier, alles andere ist „offen"', () => {
    expect(kindOfTaskType('project')).toBe('project')
    expect(kindOfTaskType('daily')).toBe('daily')
    expect(kindOfTaskType('recurring')).toBe('open')
    expect(kindOfTaskType('one-time')).toBe('open')
  })
})

describe('subtaskColumns', () => {
  it('zwei Spalten sind der Regelfall, drei nur bei durchweg kurzen Titeln (≤ 12 Zeichen)', () => {
    expect(subtaskColumns([])).toBe(2)
    expect(subtaskColumns(['Regale', 'Boden', 'Lampen'])).toBe(3)
    expect(subtaskColumns(['Regale', '123456789012'])).toBe(3)
    expect(subtaskColumns(['Regale', '1234567890123'])).toBe(2)
  })
})

describe('rememberWallHeight', () => {
  it('merkt sich die letzte echte Höhe und ignoriert 0', () => {
    rememberWallHeight(812)
    rememberWallHeight(0)
    rememberWallHeight(-5)
    expect(rememberedWallHeight()).toBe(812)
    rememberWallHeight(640)
    expect(rememberedWallHeight()).toBe(640)
  })
})
