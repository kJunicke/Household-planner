import type { Task } from '@/types/Task'

/**
 * Suche über alle Aufgaben — dieselbe Relevanzregel, die der Putzen-Screen im
 * Such-Overlay benutzt, nur als reine Funktion herausgezogen, damit die
 * Pinnwand sie mitbenutzen kann, ohne `CleaningView` anzufassen.
 *
 * `CleaningView` hat die Logik noch inline; sie darf im Zuge dieses Redesigns
 * nicht verändert werden. Fällt der alte View später weg, ist diese Datei die
 * verbleibende Quelle.
 */

export type SearchCategory = 'daily' | 'recurring' | 'project' | 'completed'

export interface TaskSearchResult {
  task: Task
  category: SearchCategory
  categoryLabel: string
  relevance: number
}

function categoryOf(task: Task): { category: SearchCategory; label: string } {
  if (task.completed) return { category: 'completed', label: 'Erledigt' }
  if (task.task_type === 'daily' || task.task_type === 'one-time')
    return { category: 'daily', label: 'Alltag' }
  if (task.task_type === 'recurring') return { category: 'recurring', label: 'Putzen' }
  if (task.task_type === 'project') return { category: 'project', label: 'Projekte' }
  return { category: 'daily', label: 'Alltag' }
}

/**
 * Ergebnisse nach Relevanz, beste zuerst. `null` bei leerer Eingabe — das
 * unterscheidet „nichts gesucht" von „nichts gefunden".
 */
export function searchTasks(tasks: readonly Task[], query: string): TaskSearchResult[] | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return null

  // Unteraufgaben einmal nach Elternteil bündeln — sonst wird die Suche O(n²).
  const subtasksByParent = new Map<string, Task[]>()
  for (const task of tasks) {
    if (task.parent_task_id) {
      const existing = subtasksByParent.get(task.parent_task_id) || []
      existing.push(task)
      subtasksByParent.set(task.parent_task_id, existing)
    }
  }

  const relevanceOf = (task: Task): number => {
    const title = task.title.toLowerCase()
    if (title === needle) return 100
    if (title.startsWith(needle)) return 80
    if (title.includes(needle)) return 60
    const subtasks = subtasksByParent.get(task.task_id) || []
    if (subtasks.some(sub => sub.title.toLowerCase().includes(needle))) return 40
    return 0
  }

  const results: TaskSearchResult[] = []
  for (const task of tasks) {
    if (task.parent_task_id !== null) continue
    const relevance = relevanceOf(task)
    if (relevance === 0) continue
    const { category, label } = categoryOf(task)
    results.push({ task, category, categoryLabel: label, relevance })
  }

  results.sort((a, b) => b.relevance - a.relevance)
  return results
}
