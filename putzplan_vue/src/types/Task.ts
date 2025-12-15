export interface Task {
  task_id: string
  household_id: string
  title: string
  effort: 1 | 2 | 3 | 4 | 5 // effort a cleaning activity usually takes.
  //measured only with values 1-5

  // Task Type - categorizes task behavior
  // 'recurring': Traditional time-based tasks (recurrence_days > 0)
  // 'daily': General daily tasks without recurrence logic (always visible)
  // 'one-time': One-time tasks (recurrence_days = 0)
  // 'project': Long-term projects with continuous work tracking (no recurrence)
  task_type: 'recurring' | 'daily' | 'one-time' | 'project'

  // Entweder nicht wiederholend ODER wiederholend mit Tagen
  // Task wiederholt sich nicht wenn recurrence_days = 0
  recurrence_days: number
  completed: boolean
  last_completed_at: string | null // ISO timestamp, auto-updated via DB trigger from task_completions
                                   // For projects: Timestamp when project was marked as completed

  // Task Assignment
  assigned_to: string | null // user_id of assigned household member (optional)
  assignment_permanent: boolean // Whether assignment persists after completion

  // Subtasks - Self-Referencing FK
  parent_task_id: string | null // NULL = parent task, UUID = subtask
  order_index: number // Sorting order for subtasks within parent

  // Subtask Points Mode - Only relevant for SUBTASKS (parent_task_id IS NOT NULL)
  // Determines how THIS INDIVIDUAL subtask effort affects points calculation when completed
  subtask_points_mode: 'checklist' | 'deduct' | 'bonus'
  // 'checklist': This subtask counts 0 points (only for tracking completion)
  // 'deduct': This subtask effort is deducted from parent effort when completed
  // 'bonus': This subtask gives full effort points in addition to parent
  }

export interface TaskCompletion {
  completion_id: string
  task_id: string
  user_id: string
  completed_at: string // ISO timestamp from Supabase
  effort_override: number // ALWAYS set: Final effort value at completion (0-5) - Single Source of Truth for historical points
  completion_note: string | null // Optional user note (can explain effort adjustment or just document extra work)
}