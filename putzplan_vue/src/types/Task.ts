export interface Task {
     id: number
     title: string
     effort: 1 | 2 | 3 | 4 | 5 // effort a cleaning activity usually takes.
     //measured only with values 1-5
     completed:boolean

     // Entweder nicht wiederholend ODER wiederholend mit Tagen
    recurrence:
      | { type: 'once' }
      | { type: 'recurring', days: number }
  }