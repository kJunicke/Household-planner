export interface Task {
     task_id: string 
     household_id: string
     title: string
     effort: 1 | 2 | 3 | 4 | 5 // effort a cleaning activity usually takes.
     //measured only with values 1-5

     // Entweder nicht wiederholend ODER wiederholend mit Tagen
    recurrence_days: number
    completed: boolean
  }

export interface TaskCompletion {
  completion_id: string
  task_id: string
  user_id: string
  completed_at: string // ISO timestamp from Supabase
}