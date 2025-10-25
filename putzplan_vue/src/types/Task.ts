export interface Task {
  task_id: string
  household_id: string
  title: string
  effort: 1 | 2 | 3 | 4 | 5 // effort a cleaning activity usually takes.
  //measured only with values 1-5

  // Entweder nicht wiederholend ODER wiederholend mit Tagen
  // Task wiederholt sich nicht wenn recurrence_days = 0
  recurrence_days: number
  completed: boolean
  last_completed_at: string | null // ISO timestamp, auto-updated via DB trigger from task_completions
  }

export interface TaskCompletion {
  completion_id: string
  task_id: string
  user_id: string
  completed_at: string // ISO timestamp from Supabase
  effort_override: number | null // Optional override (1-5) when task was more/less effort than usual
  override_reason: string | null // Required explanation when effort_override is set
}