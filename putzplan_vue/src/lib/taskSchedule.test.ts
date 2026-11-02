import { describe, expect, it } from 'vitest'

import type { Task } from '@/types/Task'

import {
  canPostpone,
  earliestPostponeDate,
  formatPostponeDate,
  postponeTargetDate,
  scheduleOf,
} from './taskSchedule'

// Lokale Zeit (vitest.config.ts: TZ=Europe/Berlin). Monate 1-basiert zum Lesen.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min)

const task = (overrides: Partial<Task> = {}): Task => ({
  task_id: 't1',
  household_id: 'h1',
  title: 'Bad putzen',
  effort: 3,
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

const TODAY = at(2026, 8, 19, 9)
const daysAgo = (n: number, hour = 12) => at(2026, 8, 19 - n, hour).toISOString()

describe('scheduleOf — Kadenz', () => {
  it('Kadenz 7, vor 10 Tagen erledigt, dran → 3 Tage überfällig', () => {
    const s = scheduleOf(task({ last_completed_at: daysAgo(10) }), TODAY)
    expect(s.status).toBe('overdue')
    expect(s.daysOverdue).toBe(3)
  })

  it('genau am Kadenztag ist sie überfällig mit 0 Tagen', () => {
    const s = scheduleOf(task({ last_completed_at: daysAgo(7) }), TODAY)
    expect(s.status).toBe('overdue')
    expect(s.daysOverdue).toBe(0)
  })

  it('dran, aber Kadenz noch nicht abgelaufen → pending, nicht überfällig', () => {
    const s = scheduleOf(task({ last_completed_at: daysAgo(6) }), TODAY)
    expect(s.status).toBe('pending')
    expect(s.daysUntilDue).toBe(1)
  })

  it('noch nie gemacht ist ein eigener Zustand: maximal dringend, ohne Tageszahl', () => {
    const s = scheduleOf(task(), TODAY)
    expect(s.status).toBe('never-done')
    expect(s.daysOverdue).toBeNull()
    expect(s.daysUntilDue).toBeNull()
    expect(s.urgency).toBe(Infinity)
  })

  it('erledigt zählt den Countdown — und wird nie aus der Kadenz „dran" (ADR-0001)', () => {
    const fresh = scheduleOf(task({ completed: true, last_completed_at: daysAgo(2) }), TODAY)
    expect(fresh.status).toBe('upcoming')
    expect(fresh.daysUntilDue).toBe(5)

    const stale = scheduleOf(task({ completed: true, last_completed_at: daysAgo(30) }), TODAY)
    expect(stale.status).toBe('upcoming')
  })

  it('zählt Kalendertage, nicht 24-h-Perioden: gestern 23:00 ist heute 07:00 ein Tag her', () => {
    const s = scheduleOf(
      task({ recurrence_days: 1, last_completed_at: at(2026, 8, 18, 23).toISOString() }),
      at(2026, 8, 19, 7),
    )
    expect(s.daysOverdue).toBe(0)
  })

  it('zählt über die Sommerzeit-Umstellung hinweg richtig', () => {
    // Sa 28.03. 23:30 → Mo 30.03. 00:30 sind zwei Kalendertage, obwohl nur 24 h vergangen sind
    const s = scheduleOf(
      task({ recurrence_days: 1, last_completed_at: at(2026, 3, 28, 23, 30).toISOString() }),
      at(2026, 3, 30, 0, 30),
    )
    expect(s.daysOverdue).toBe(1)
  })

  it.each(['daily', 'one-time', 'project'] as const)('%s hat keine Kadenz', (taskType) => {
    const s = scheduleOf(task({ task_type: taskType, last_completed_at: daysAgo(30) }), TODAY)
    expect(s.status).toBe('not-scheduled')
    expect(s.urgency).toBe(-Infinity)
  })

  it('wiederkehrend mit 0 Tagen hat ebenfalls keine Kadenz', () => {
    expect(scheduleOf(task({ recurrence_days: 0 }), TODAY).status).toBe('not-scheduled')
  })

  it('Dringlichkeit ordnet: nie gemacht > länger überfällig > kürzer > pending > erledigt > ohne Kadenz', () => {
    const ordered = [
      task(),
      task({ last_completed_at: daysAgo(20) }),
      task({ last_completed_at: daysAgo(8) }),
      task({ last_completed_at: daysAgo(3) }),
      task({ completed: true, last_completed_at: daysAgo(1) }),
      task({ task_type: 'daily' }),
    ].map((t) => scheduleOf(t, TODAY).urgency)
    expect([...ordered].sort((a, b) => b - a)).toEqual(ordered)
    expect(new Set(ordered).size).toBe(ordered.length)
  })
})

describe('scheduleOf — verschoben', () => {
  it('verschoben schlägt die Kadenz und rechnet bis zum Zieldatum', () => {
    const s = scheduleOf(
      task({ completed: true, last_completed_at: daysAgo(30), postponed_until: '2026-08-24' }),
      TODAY,
    )
    expect(s.status).toBe('postponed')
    expect(s.daysUntilDue).toBe(5)
    expect(s.daysOverdue).toBeNull()
    expect(s.postponedUntil).toBe('2026-08-24')
  })

  it('gilt auch für einmalige Aufgaben ohne Kadenz', () => {
    const s = scheduleOf(task({ task_type: 'one-time', postponed_until: '2026-08-21' }), TODAY)
    expect(s.status).toBe('postponed')
  })

  it('sortiert unten: späterer Termin = weniger dringend', () => {
    const soon = scheduleOf(task({ postponed_until: '2026-08-21' }), TODAY)
    const later = scheduleOf(task({ postponed_until: '2026-09-21' }), TODAY)
    expect(soon.urgency).toBeGreaterThan(later.urgency)
    expect(soon.urgency).toBeLessThan(0)
  })

  it('liest das Zieldatum als lokalen Tag, auch spät abends in MESZ', () => {
    const s = scheduleOf(task({ postponed_until: '2026-08-24' }), at(2026, 8, 23, 23, 30))
    expect(s.daysUntilDue).toBe(1)
  })

  it('schneidet einen Zeitanteil ab', () => {
    const s = scheduleOf(task({ postponed_until: '2026-08-24T00:00:00+00:00' }), TODAY)
    expect(s.postponedUntil).toBe('2026-08-24')
  })
})

describe('postponeTargetDate', () => {
  it('Intervall = Kadenz der Aufgabe', () => {
    expect(postponeTargetDate(task(), 'interval', {}, TODAY)).toBe('2026-08-26')
  })

  it('Intervall gibt es ohne Kadenz nicht', () => {
    expect(postponeTargetDate(task({ task_type: 'one-time' }), 'interval', {}, TODAY)).toBeNull()
    expect(postponeTargetDate(task({ recurrence_days: 0 }), 'interval', {}, TODAY)).toBeNull()
  })

  it('freie Tageszahl, ausdrücklich auch unterhalb der Kadenz, ohne Obergrenze', () => {
    expect(postponeTargetDate(task(), 'days', { customDays: 1 }, TODAY)).toBe('2026-08-20')
    expect(postponeTargetDate(task(), 'days', { customDays: 2 }, TODAY)).toBe('2026-08-21')
    expect(postponeTargetDate(task(), 'days', { customDays: 400 }, TODAY)).toBe('2027-09-23')
  })

  it.each([0, -1, 1.5, Number.NaN, null, undefined])('Tageszahl %s ist unbrauchbar', (n) => {
    expect(postponeTargetDate(task(), 'days', { customDays: n }, TODAY)).toBeNull()
  })

  it('rechnet in lokalen Kalendertagen über Monatsende und Sommerzeit-Ende', () => {
    expect(postponeTargetDate(task(), 'days', { customDays: 3 }, at(2026, 8, 30, 0, 30))).toBe(
      '2026-09-02',
    )
    expect(postponeTargetDate(task(), 'days', { customDays: 2 }, at(2026, 10, 24, 23, 30))).toBe(
      '2026-10-26',
    )
  })

  it('freies Datum: nur echte Zukunft', () => {
    expect(postponeTargetDate(task(), 'custom', { customDate: '2026-08-20' }, TODAY)).toBe(
      '2026-08-20',
    )
    expect(postponeTargetDate(task(), 'custom', { customDate: '2026-08-19' }, TODAY)).toBeNull()
    expect(postponeTargetDate(task(), 'custom', { customDate: '2026-08-01' }, TODAY)).toBeNull()
    expect(postponeTargetDate(task(), 'custom', { customDate: '' }, TODAY)).toBeNull()
    expect(postponeTargetDate(task(), 'custom', {}, TODAY)).toBeNull()
  })
})

describe('earliestPostponeDate / formatPostponeDate / canPostpone', () => {
  it('frühestens morgen, auch über den Jahreswechsel', () => {
    expect(earliestPostponeDate(TODAY)).toBe('2026-08-20')
    expect(earliestPostponeDate(at(2026, 12, 31, 23, 59))).toBe('2027-01-01')
  })

  it('schreibt das Datum mit Wochentag', () => {
    expect(formatPostponeDate('2026-08-24')).toBe('Montag, 24.08.')
  })

  it('verschiebbar sind nur wiederkehrende und einmalige Aufgaben', () => {
    expect(canPostpone(task({ task_type: 'recurring' }))).toBe(true)
    expect(canPostpone(task({ task_type: 'one-time' }))).toBe(true)
    expect(canPostpone(task({ task_type: 'daily' }))).toBe(false)
    expect(canPostpone(task({ task_type: 'project' }))).toBe(false)
  })
})
