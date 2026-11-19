import { describe, expect, it } from 'vitest'

import type { Task } from '@/types/Task'

import { projectPhraseStackOf } from './projectPhrases'
import { stampStackOf } from './stampStack'

const task = (overrides: Partial<Task>): Task => ({
  task_id: 't-1',
  household_id: 'h1',
  title: 'Bad putzen',
  effort: 2,
  task_type: 'recurring',
  recurrence_days: 7,
  completed: false,
  last_completed_at: '2026-11-01T10:00:00Z',
  postponed_until: null,
  assigned_to: null,
  assignment_permanent: false,
  parent_task_id: null,
  order_index: 0,
  subtask_points_mode: 'deduct',
  emphasis_level: 0,
  project_saying_index: 0,
  deleted_at: null,
  ...overrides,
})

const words = (t: Task) => stampStackOf(t).map((layer) => layer.text)

describe('stampStackOf', () => {
  it('trägt sauber nur den Grundabdruck — keine Lage für später freigehalten', () => {
    expect(words(task({ emphasis_level: 0 }))).toEqual(['FÄLLIG'])
  })

  it('legt WICHTIG und DRINGEND sichtbar übereinander, der oberste gilt', () => {
    const stack = stampStackOf(task({ emphasis_level: 2 }))
    expect(stack.map((layer) => layer.text)).toEqual(['FÄLLIG', 'WICHTIG', 'DRINGEND'])
    expect(stack.map((layer) => layer.top)).toEqual([false, false, true])
    expect(words(task({ emphasis_level: 1 }))).toEqual(['FÄLLIG', 'WICHTIG'])
  })

  it('Grundabdruck: der Typ schlägt NEU', () => {
    expect(words(task({ last_completed_at: null }))).toEqual(['NEU'])
    expect(words(task({ task_type: 'daily', last_completed_at: null }))).toEqual(['BEDARF'])
  })

  it('am Projekt trägt jede Lage einen Spruch', () => {
    const project = task({ task_type: 'project', emphasis_level: 2, project_saying_index: 13 })
    expect(words(project)).toEqual(projectPhraseStackOf(project))
    expect(words(project)[0]).toBe('ÜBERMORGEN')
  })

  it('ein Abdruck verrutscht nicht, wenn ein weiterer daraufkommt', () => {
    const base = stampStackOf(task({ emphasis_level: 0 }))[0]
    const under = stampStackOf(task({ emphasis_level: 2 }))[0]
    expect({ ...under, top: true }).toEqual(base)
  })

  it('Versatz und Neigung hängen an der Kennung, nicht am Zufall', () => {
    const a = stampStackOf(task({ task_id: 'a', emphasis_level: 2 }))
    expect(stampStackOf(task({ task_id: 'a', emphasis_level: 2 }))).toEqual(a)
    for (const layer of a) {
      expect(Math.abs(layer.dx)).toBeLessThanOrEqual(5.5)
      expect(Math.abs(layer.dy)).toBeLessThanOrEqual(8)
      expect(Math.abs(layer.tilt)).toBeGreaterThanOrEqual(4)
      expect(Math.abs(layer.tilt)).toBeLessThanOrEqual(14)
    }
  })

  it('jede untere Lage lugt hervor: senkrecht mindestens 4 px neben jeder anderen', () => {
    // Die oberste Lage deckt mit ihrem Papier-Halo; was von einer unteren zu
    // sehen ist, steht über oder unter ihr. Ein Drittel der rund 12 px hohen
    // Zeile ist die Untergrenze, ab der sich ein Wort noch erkennen lässt.
    for (let i = 0; i < 500; i++) {
      const stack = stampStackOf(task({ task_id: `aufgabe-${i}`, emphasis_level: 2 }))
      for (const a of stack) {
        for (const b of stack) {
          if (a.level < b.level) expect(Math.abs(a.dy - b.dy)).toBeGreaterThanOrEqual(4)
        }
      }
    }
  })

  describe('loser Zettel', () => {
    it('trägt nur den Grundabdruck ERLEDIGT', () => {
      const stack = stampStackOf(task({ completed: true }), { loose: true })
      expect(stack.map((layer) => [layer.text, layer.level, layer.top])).toEqual([
        ['ERLEDIGT', 0, true],
      ])
    })

    it('zeigt keinen Nachdruck, auch wenn noch einer gespeichert ist', () => {
      expect(
        stampStackOf(task({ completed: true, emphasis_level: 2 }), { loose: true }).map(
          (layer) => layer.text,
        ),
      ).toEqual(['ERLEDIGT'])
    })

    it('liegt an derselben Stelle wie der Grundabdruck des angepinnten Zettels', () => {
      const pinned = stampStackOf(task({}))[0]
      const loose = stampStackOf(task({ completed: true }), { loose: true })[0]
      expect(pinned).toBeDefined()
      expect(loose).toMatchObject({ dx: pinned?.dx, dy: pinned?.dy, tilt: pinned?.tilt })
    })
  })
})
