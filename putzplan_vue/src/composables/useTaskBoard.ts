import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { Task } from '@/types/Task'
import { scheduleOf, isOverdue } from '@/lib/taskSchedule'

/**
 * Auswahl und Reihenfolge der Aufgaben — die eine Antwort auf „welche Aufgaben sind
 * dran und in welcher Reihenfolge". Putzen-Screen und Pinnwand benutzen dieselbe
 * Quelle, damit beide Ansichten nicht auseinanderlaufen.
 *
 * Ob eine Aufgabe dran ist, entscheidet allein `tasks.completed` aus der Datenbank
 * (→ docs/adr/0001-completed-ist-zustand-keine-ableitung.md). Hier wird nichts
 * abgeleitet, nur gefiltert und sortiert.
 *
 * Der Dringlichkeitswert kommt unverändert aus `scheduleOf()` — es gibt bewusst
 * keine zweite Berechnung.
 *
 * Bewusst NICHT hier: Kategorie-Filter, Suche und alles andere, was zur Bedienung
 * einer bestimmten View gehört. Das Composable kennt nur die Aufgabenliste, die es
 * hereingereicht bekommt, und ist damit ohne View benutzbar.
 */

// Dringendste zuerst. Über den Gleichheits-Zweig, weil `urgency` für nie erledigte
// Aufgaben Infinity ist und Infinity - Infinity = NaN einen Komparator zerstört.
// Gleichstand ergibt 0 — Array.prototype.sort ist stabil, die Eingabereihenfolge
// aus dem Store bleibt damit der Tiebreak.
export const byUrgency = (a: Task, b: Task): number => {
  const ua = scheduleOf(a).urgency
  const ub = scheduleOf(b).urgency
  return ua === ub ? 0 : ub - ua
}

// "Jetzt dran": jede offene wiederkehrende Aufgabe.
// Die Kadenz-Grenze wird hier NICHT ausgewertet. Damit erscheint auch eine manuell
// als "wieder dreckig" markierte Aufgabe hier, obwohl ihr Intervall noch läuft.
export const isPending = (task: Task): boolean =>
  task.task_type === 'recurring' && !task.completed && task.parent_task_id === null

/**
 * Wie viele dieser Aufgaben ihre Kadenz wirklich gerissen haben.
 *
 * Bewusst eine freie Funktion und **keine** fertige Zahl im Rückgabewert von
 * `useTaskBoard`: welche Menge gezählt wird, hängt von der Ansicht ab (der
 * Putzen-Screen zählt nur die durch den Kategorie-Filter sichtbaren Aufgaben). Zwei
 * gleichnamige Zähler auf unterschiedlicher Basis wären eine Falle — so muss jede
 * Ansicht ihre Menge sichtbar benennen.
 */
export const countOverdue = (tasks: readonly Task[]): number =>
  tasks.filter(task => isOverdue(scheduleOf(task))).length

/**
 * Alle Listen sind `readonly`: Konsumenten teilen sich dieselbe Array-Instanz aus dem
 * computed-Cache. Ein `sort()`/`reverse()`/`push()` darauf würde die Reihenfolge in
 * jeder anderen Ansicht still mitverändern — als `readonly` ist so ein Zugriff ein
 * Typfehler statt eines unsichtbaren Fehlverhaltens. Wer eine eigene Reihenfolge
 * braucht, kopiert vorher (`[...liste]`).
 */
export function useTaskBoard(tasks: MaybeRefOrGetter<Task[]>) {
  /** Offene Putzaufgaben, dringendste zuerst. */
  const pendingTasks = computed(
    (): readonly Task[] => toValue(tasks).filter(isPending).sort(byUrgency)
  )

  /** Offene tägliche und einmalige Aufgaben, alphabetisch (stabile Reihenfolge). */
  const dailyTasks = computed((): readonly Task[] =>
    toValue(tasks)
      .filter(
        task =>
          !task.completed &&
          task.parent_task_id === null &&
          (task.task_type === 'daily' || task.task_type === 'one-time')
      )
      .sort((a, b) => a.title.localeCompare(b.title, 'de'))
  )

  /** Offene Projekte — unsortiert, in Store-Reihenfolge. */
  const projectTasks = computed((): readonly Task[] =>
    toValue(tasks).filter(
      task => !task.completed && task.parent_task_id === null && task.task_type === 'project'
    )
  )

  /**
   * Erledigte Aufgaben: erst alles außer Projekten nach nächster Fälligkeit —
   * derselbe Schlüssel wie in "Jetzt dran", absteigende Dringlichkeit ist
   * aufsteigende Restlaufzeit. Aufgaben ohne Kadenz (täglich, einmalig) haben keine
   * Fälligkeit und bleiben hinten. Erledigte Projekte hängen danach, zuletzt
   * erledigte zuerst.
   */
  const completedTasks = computed((): readonly Task[] => {
    const all = toValue(tasks)

    const nonProjects = all
      .filter(task => task.completed && task.parent_task_id === null && task.task_type !== 'project')
      .sort(byUrgency)

    const projects = all
      .filter(task => task.completed && task.parent_task_id === null && task.task_type === 'project')
      .sort((a, b) => {
        if (!a.last_completed_at || !b.last_completed_at) return 0
        return new Date(b.last_completed_at).getTime() - new Date(a.last_completed_at).getTime()
      })

    return [...nonProjects, ...projects]
  })

  /**
   * Offener Rückstand für die Status-Zeile. Daily-Aufgaben sind immer sichtbar und
   * setzen sich täglich zurück → sie zählen hier nicht mit.
   */
  const openTasksCount = computed((): number =>
    toValue(tasks).filter(
      task =>
        !task.completed &&
        task.parent_task_id === null &&
        (task.task_type === 'recurring' || task.task_type === 'one-time')
    ).length
  )

  return {
    pendingTasks,
    dailyTasks,
    projectTasks,
    completedTasks,
    openTasksCount
  }
}
