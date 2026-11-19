import { describe, expect, it } from 'vitest'

import type { Task } from '@/types/Task'

import { estimateParentPoints } from './taskPoints'

const sub = (overrides: Partial<Task>): Task => ({
  task_id: 's',
  household_id: 'h1',
  title: 'Teil',
  effort: 1,
  task_type: 'recurring',
  recurrence_days: 0,
  completed: false,
  last_completed_at: null,
  postponed_until: null,
  assigned_to: null,
  assignment_permanent: false,
  parent_task_id: 'p',
  order_index: 0,
  subtask_points_mode: 'deduct',
  emphasis_level: 0,
  project_saying_index: 0,
  deleted_at: null,
  ...overrides,
})

describe('estimateParentPoints', () => {
  it('ohne Unteraufgaben zählt der volle Aufwand', () => {
    expect(estimateParentPoints(4, [])).toBe(4)
  })

  it('zieht nur erledigte deduct-Unteraufgaben ab', () => {
    const subtasks = [
      sub({ effort: 1, completed: true }),
      sub({ effort: 2, completed: false }),
      sub({ effort: 2, completed: true, subtask_points_mode: 'bonus' }),
      sub({ effort: 2, completed: true, subtask_points_mode: 'checklist' }),
    ]
    expect(estimateParentPoints(4, subtasks)).toBe(3)
  })

  it('fällt nie unter null', () => {
    expect(estimateParentPoints(2, [sub({ effort: 3, completed: true })])).toBe(0)
  })
})
