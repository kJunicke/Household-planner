import { describe, expect, it } from 'vitest'

import {
  defaultNoteWidth,
  jitterOf,
  kindOfTaskType,
  packWall,
  planNoteWidths,
  rememberedWallHeight,
  rememberWallHeight,
  rotationOf,
  subtaskColumns,
  type PackedWall,
  type WallNoteMetrics,
  type WallNoteShape,
} from './wallLayout'

// Geprüft wird das dokumentierte Verhalten aus den Kommentaren in wallLayout.ts und
// CONTEXT.md („Zettel", „Aufklappen"), nicht der Rechenweg. Eine Messung ist kein
// Blick (CLAUDE.md): grün heißt hier „Geometrie hält ihre Zusagen", nicht „sieht gut aus".

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

/** Zettelformen wie an der echten Wand: `minimum` ≥ 110 (Griffzeile), meist mehrwortig. */
function randomShapes(rand: () => number, count: number, wallWidth: number): WallNoteShape[] {
  return Array.from({ length: count }, () => {
    const natural = 110 + Math.floor(rand() * (wallWidth * 1.3))
    const singleWord = rand() < 0.1
    const minimum = singleWord ? natural : 110 + Math.floor(rand() * Math.min(80, natural - 110))
    return { id: uuid(rand), natural, minimum }
  })
}

function randomWall(seed: number, count: number, wallWidth: number): WallNoteMetrics[] {
  const rand = mulberry32(seed)
  const shapes = randomShapes(rand, count, wallWidth)
  const widths = planNoteWidths(shapes, wallWidth)
  return shapes.map((s) => ({
    id: s.id,
    width: widths.get(s.id)!,
    height: 60 + Math.floor(rand() * 90),
    group: Math.floor(rand() * 3),
    expanded: rand() < 0.05,
  }))
}

const WALLS = [320, 347, 390, 768]
const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1)

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const EPS = 1e-6

/** Paare, deren gezeichnete Rechtecke sich überdecken. */
function overlaps(notes: readonly WallNoteMetrics[], packed: PackedWall, W: number): string[] {
  const byId = new Map(notes.map((n) => [n.id, n]))
  const boxes = packed.notes.map((p) => {
    const n = byId.get(p.id)!
    return { id: p.id, x: p.x, y: p.y, w: Math.min(n.width, W), h: n.height }
  })
  const found: string[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const xOverlap = a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS
      const yOverlap = a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS
      if (xOverlap && yOverlap) found.push(`${a.id} × ${b.id}`)
    }
  }
  return found
}

/** Zettel einer späteren Gruppe, deren Oberkante über der eines Zettels einer früheren liegt. */
function groupViolations(notes: readonly WallNoteMetrics[], packed: PackedWall): string[] {
  const groupOf = new Map(notes.map((n) => [n.id, n.group]))
  const found: string[] = []
  for (const a of packed.notes) {
    for (const b of packed.notes) {
      if (groupOf.get(a.id)! > groupOf.get(b.id)! && a.y < b.y - EPS)
        found.push(`${a.id} über ${b.id}`)
    }
  }
  return found
}

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

describe('defaultNoteWidth — „Breite folgt dem Titel"', () => {
  const W = 347
  const cap = Math.round(W * 0.45)

  it('ein kurzer Titel behält seine natürliche Breite', () => {
    expect(defaultNoteWidth({ id: 'a', natural: 140, minimum: 110 }, W)).toBe(140)
  })

  it('ein langer mehrwortiger Titel wird bei 45 % der Wand gedeckelt', () => {
    expect(defaultNoteWidth({ id: 'a', natural: 300, minimum: 120 }, W)).toBe(cap)
  })

  it('ein Titel ohne Wortgrenze wird nicht gedeckelt, höchstens auf die Wand', () => {
    expect(defaultNoteWidth({ id: 'a', natural: 250, minimum: 250 }, W)).toBe(250)
    expect(defaultNoteWidth({ id: 'a', natural: 500, minimum: 500 }, W)).toBe(W)
  })

  it('die Fußzeile (minimum) sticht den Deckel, aber nie die Wand', () => {
    expect(defaultNoteWidth({ id: 'a', natural: 300, minimum: 200 }, W)).toBe(200)
    expect(defaultNoteWidth({ id: 'a', natural: 600, minimum: 400 }, W)).toBe(W)
  })
})

describe('planNoteWidths', () => {
  it('jeder Zettel bekommt eine Breite, in Eingabereihenfolge, nie breiter als die Wand', () => {
    for (const W of WALLS) {
      for (const seed of SEEDS) {
        const shapes = randomShapes(mulberry32(seed), 30, W)
        const plan = planNoteWidths(shapes, W)
        expect([...plan.keys()]).toEqual(shapes.map((s) => s.id))
        for (const s of shapes) {
          const w = plan.get(s.id)!
          expect(w).toBeLessThanOrEqual(W)
          expect(w).toBeGreaterThan(0)
        }
      }
    }
  })

  it('schneidet kein Wort ab: nie schmaler als `minimum`, solange das auf die Wand passt', () => {
    for (const W of WALLS) {
      for (const seed of SEEDS) {
        const shapes = randomShapes(mulberry32(seed), 30, W)
        const plan = planNoteWidths(shapes, W)
        for (const s of shapes) {
          expect(plan.get(s.id)!).toBeGreaterThanOrEqual(Math.min(s.minimum, W))
        }
      }
    }
  })

  it('bei 45 % passen zwei lange mehrwortige Zettel nebeneinander', () => {
    for (const W of WALLS) {
      const shapes = [
        { id: 'lang-a', natural: W * 2, minimum: 110 },
        { id: 'lang-b', natural: W * 2, minimum: 110 },
      ]
      const plan = planNoteWidths(shapes, W)
      // Reihenabstand höchstens 16 px (12 ± 4)
      expect(plan.get('lang-a')! + plan.get('lang-b')! + 16).toBeLessThanOrEqual(W)
    }
  })

  it('füllt den Reststreifen einer Reihe, wenn der Titel dort an einer Wortgrenze umbricht', () => {
    const W = 500
    // A: unbrechbar, 300 px → Rest ≈ 500 − 300 − 12 ≈ 188. B will 225 (45 %), passt ab 150.
    const plan = planNoteWidths(
      [
        { id: 'a', natural: 300, minimum: 300 },
        { id: 'b', natural: 400, minimum: 150 },
      ],
      W,
    )
    const b = plan.get('b')!
    expect(b).toBeLessThan(Math.round(W * 0.45))
    expect(b).toBeGreaterThanOrEqual(150)
    expect(300 + b + 8).toBeLessThanOrEqual(W)
  })

  it('verschmälert nicht, wenn dabei ein Wort abgeschnitten würde', () => {
    const W = 500
    const tooWide = planNoteWidths(
      [
        { id: 'a', natural: 300, minimum: 300 },
        { id: 'b', natural: 400, minimum: 200 },
      ],
      W,
    )
    expect(tooWide.get('b')).toBe(defaultNoteWidth({ id: 'b', natural: 400, minimum: 200 }, W))

    const unbreakable = planNoteWidths(
      [
        { id: 'a', natural: 300, minimum: 300 },
        { id: 'b', natural: 220, minimum: 220 },
      ],
      W,
    )
    expect(unbreakable.get('b')).toBe(220)
  })
})

describe('packWall — Invarianten auf Stichproben', () => {
  const cases = WALLS.flatMap((W) => SEEDS.map((seed) => ({ W, seed })))

  it.each(cases)('Wand $W px, Stichprobe $seed: nichts ragt über den Rand', ({ W, seed }) => {
    const notes = randomWall(seed, 40, W)
    const packed = packWall(notes, W)
    const byId = new Map(notes.map((n) => [n.id, n]))
    expect(packed.notes).toHaveLength(notes.length)
    for (const p of packed.notes) {
      const n = byId.get(p.id)!
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x + Math.min(n.width, W)).toBeLessThanOrEqual(W + EPS)
      expect(p.y).toBeGreaterThan(0) // Polster für die Befestigungen über der Oberkante
      expect(p.y + n.height).toBeLessThanOrEqual(packed.height + EPS)
    }
  })

  it.each(cases)(
    'Wand $W px, Stichprobe $seed: kein Zettel überdeckt einen anderen',
    ({ W, seed }) => {
      const notes = randomWall(seed, 40, W)
      expect(overlaps(notes, packWall(notes, W), W)).toEqual([])
    },
  )

  it.each(cases)(
    'Wand $W px, Stichprobe $seed: kein Zettel steht oberhalb des tiefsten der Vorgruppe',
    ({ W, seed }) => {
      const notes = randomWall(seed, 40, W)
      expect(groupViolations(notes, packWall(notes, W))).toEqual([])
    },
  )

  it.each(cases)(
    'Wand $W px, Stichprobe $seed: ein aufgeklappter Zettel mit Vorgabe hält alle Zusagen',
    ({ W, seed }) => {
      // So wie WallView es macht: Zettel antippen, er klappt wandbreit auf und
      // bekommt seine bisherige Oberkante als Vorgabe; alle anderen tragen ihr
      // `previousTop` aus dem Lauf davor.
      const notes = randomWall(seed, 40, W).map((n) => ({ ...n, expanded: false }))
      const before = new Map(packWall(notes, W).notes.map((p) => [p.id, p.y]))
      const target = notes[seed % notes.length]
      const top = before.get(target.id)!
      const after = notes.map((n) =>
        n.id === target.id
          ? { ...n, width: W, height: n.height + 150, expanded: true, previousTop: top }
          : { ...n, previousTop: before.get(n.id) },
      )
      const packed = packWall(after, W, [{ id: target.id, top }])

      expect(overlaps(after, packed, W)).toEqual([])
      expect(groupViolations(after, packed)).toEqual([])
      const pinnedY = packed.notes.find((p) => p.id === target.id)!.y
      for (const p of packed.notes) {
        const n = after.find((m) => m.id === p.id)!
        if (n.id === target.id || n.group !== target.group) continue
        if (n.previousTop! >= top)
          expect(p.y, `${n.id} ist nach oben gerutscht`).toBeGreaterThanOrEqual(pinnedY)
      }
    },
  )

  it.each(cases)(
    'Wand $W px, Stichprobe $seed: Ergebnis hängt nur an der Menge, nie an der Reihenfolge',
    ({ W, seed }) => {
      const notes = randomWall(seed, 40, W)
      const a = packWall(notes, W)
      const b = packWall(shuffled(notes, seed * 31), W)
      const pos = (wall: ReturnType<typeof packWall>) =>
        Object.fromEntries(wall.notes.map((n) => [n.id, [n.x, n.y, n.z]]))
      expect(pos(b)).toEqual(pos(a))
      expect(b.height).toBe(a.height)
    },
  )
})

describe('packWall — Einzelzusagen', () => {
  it('leere Wand: keine Zettel, keine Höhe', () => {
    expect(packWall([], 347)).toEqual({ notes: [], height: 0 })
  })

  it('ein aufgeklappter Zettel über die volle Breite steht ohne Versatz an der linken Kante', () => {
    const packed = packWall([{ id: 'auf', width: 347, height: 300, group: 0, expanded: true }], 347)
    expect(packed.notes[0].x).toBe(0)
  })

  it('ein Zettel breiter als die Wand wird auf x = 0 geklemmt', () => {
    const packed = packWall([{ id: 'riesig', width: 900, height: 80, group: 1 }], 347)
    expect(packed.notes[0].x).toBe(0)
  })

  it('Stapelreihenfolge: links liegt über rechts, bei gleichem x oben über unten', () => {
    const notes = randomWall(3, 40, 390)
    const packed = packWall(notes, 390)
    const zs = packed.notes.map((n) => n.z)
    expect(new Set(zs).size).toBe(zs.length)
    for (const a of packed.notes) {
      for (const b of packed.notes) {
        if (a.x < b.x || (a.x === b.x && a.y < b.y)) expect(a.z).toBeGreaterThan(b.z)
      }
    }
  })
})

describe('packWall — Vorgaben (aufgeklappter Zettel bleibt liegen)', () => {
  const W = 347

  const scene = () => {
    const rand = mulberry32(42)
    const above = Array.from({ length: 4 }, (_, i) => ({
      id: `oben-${i}-${uuid(rand)}`,
      width: 150,
      height: 50,
      group: 0,
      previousTop: 10,
    }))
    const below = Array.from({ length: 6 }, (_, i) => ({
      id: `unten-${i}-${uuid(rand)}`,
      width: 150,
      height: 70,
      group: 0,
      previousTop: 400,
    }))
    const pinned = { id: 'auf', width: W, height: 220, group: 0, expanded: true }
    return { above, below, pinned }
  }

  it('steht genau auf der Vorgabe, wenn nichts im Weg ist', () => {
    const { above, below, pinned } = scene()
    const packed = packWall([...below, pinned, ...above], W, [{ id: 'auf', top: 300 }])
    expect(packed.notes.find((n) => n.id === 'auf')!.y).toBe(300)
  })

  it('wer vorher darunter lag, bleibt darunter', () => {
    const { above, below, pinned } = scene()
    const packed = packWall([...below, pinned, ...above], W, [{ id: 'auf', top: 300 }])
    const pin = packed.notes.find((n) => n.id === 'auf')!
    for (const note of below) {
      const y = packed.notes.find((n) => n.id === note.id)!.y
      expect(y).toBeGreaterThanOrEqual(pin.y + pinned.height)
    }
  })

  it('wer vorher darüber lag und ganz darüber passt, bleibt darüber', () => {
    const { above, below, pinned } = scene()
    const packed = packWall([...below, pinned, ...above], W, [{ id: 'auf', top: 300 }])
    for (const note of above) {
      const y = packed.notes.find((n) => n.id === note.id)!.y
      expect(y + note.height).toBeLessThanOrEqual(300)
    }
  })

  it('„überlappt nicht" gewinnt gegen „bleibt liegen": die Vorgabe rutscht unter die Vorgruppe', () => {
    const tall = { id: 'hoch', width: 150, height: 400, group: 0 }
    const pinned = { id: 'auf', width: W, height: 200, group: 1, expanded: true }
    const packed = packWall([tall, pinned], W, [{ id: 'auf', top: 50 }])
    const t = packed.notes.find((n) => n.id === 'hoch')!
    const p = packed.notes.find((n) => n.id === 'auf')!
    expect(p.y).toBeGreaterThanOrEqual(t.y + tall.height - EPS)
  })

  it('zwei unvereinbare Vorgaben: die zuletzt angetippte gewinnt, die frühere rutscht darunter', () => {
    const first = { id: 'erst', width: W, height: 150, group: 0, expanded: true }
    const last = { id: 'zuletzt', width: W, height: 150, group: 0, expanded: true }
    const packed = packWall([first, last], W, [
      { id: 'erst', top: 100 },
      { id: 'zuletzt', top: 120 },
    ])
    const f = packed.notes.find((n) => n.id === 'erst')!
    const l = packed.notes.find((n) => n.id === 'zuletzt')!
    expect(l.y).toBe(120)
    expect(f.y).toBeGreaterThanOrEqual(l.y + last.height)
  })

  it('eine Vorgabe für einen Zettel, der nicht an der Wand hängt, ist folgenlos', () => {
    const notes = randomWall(5, 20, W)
    expect(packWall(notes, W, [{ id: 'gibt-es-nicht', top: 100 }])).toEqual(packWall(notes, W))
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
