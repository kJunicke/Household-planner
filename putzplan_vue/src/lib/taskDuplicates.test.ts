import { describe, expect, it } from 'vitest'

import type { Task } from '@/types/Task'

import { findDuplicateTask, normalizeTaskTitle } from './taskDuplicates'

let nextId = 0
const task = (title: string, overrides: Partial<Task> = {}): Task => ({
  task_id: `t${nextId++}`,
  household_id: 'h1',
  title,
  effort: 2,
  task_type: 'recurring',
  recurrence_days: 7,
  completed: false,
  last_completed_at: null,
  postponed_until: null,
  assigned_to: null,
  assignment_permanent: false,
  parent_task_id: null,
  order_index: 0,
  subtask_points_mode: 'bonus',
  emphasis_level: 0,
  project_saying_index: 0,
  deleted_at: null,
  ...overrides,
})

describe('normalizeTaskTitle', () => {
  it('trimmt, zieht Leerraum zusammen und ignoriert Groß-/Kleinschreibung', () => {
    expect(normalizeTaskTitle('  Bad   PUTZEN \t')).toBe('bad putzen')
    expect(normalizeTaskTitle('Bad putzen\t')).toBe(normalizeTaskTitle('Bad putzen'))
  })

  it('macht A–Z und Ä, Ö, Ü klein, sonst nichts — wie die Tabelle im Index', () => {
    expect(normalizeTaskTitle('ÄPFEL Über')).toBe('äpfel über')
    expect(normalizeTaskTitle('Éclair İ')).toBe('Éclair İ')
  })

  it('lässt geschützte Leerzeichen stehen — wie der Index in Postgres', () => {
    expect(normalizeTaskTitle('Bad putzen')).toBe('bad putzen')
  })
})

describe('findDuplicateTask', () => {
  it('findet eine Aufgabe mit gleichem Titel trotz anderer Schreibweise', () => {
    const bad = task('Bad putzen')
    expect(findDuplicateTask([task('Küche'), bad], ' bad  Putzen')).toBe(bad)
  })

  it('findet erledigte Aufgaben ebenfalls — auch sie wären ein Duplikat', () => {
    const bad = task('Bad putzen', { completed: true })
    expect(findDuplicateTask([bad], 'Bad putzen')).toBe(bad)
  })

  it('ignoriert Unteraufgaben und gelöschte Aufgaben', () => {
    const tasks = [
      task('Am Projekt arbeiten', { parent_task_id: 'p1' }),
      task('Fenster', { deleted_at: '2026-11-01T00:00:00Z' }),
    ]
    expect(findDuplicateTask(tasks, 'Am Projekt arbeiten')).toBeUndefined()
    expect(findDuplicateTask(tasks, 'Fenster')).toBeUndefined()
  })

  it('nimmt beim Umbenennen die Aufgabe selbst aus', () => {
    const bad = task('Bad putzen')
    expect(findDuplicateTask([bad], 'BAD putzen', bad.task_id)).toBeUndefined()
  })

  it('leerer Titel ist kein Duplikat', () => {
    expect(findDuplicateTask([task('')], '   ')).toBeUndefined()
  })
})
