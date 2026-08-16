import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { EnrichedCompletion, Task, TaskCompletion } from '@/types/Task'
import type { HouseholdMember } from '@/types/households'

/**
 * Anzeigestruktur des Verlaufs: aus rohen Completions und Household-Mitgliedern
 * werden angereicherte Einträge, nach Kalendertag gruppiert und absteigend
 * sortiert. Die View rendert nur noch das Ergebnis — sie trifft selbst keine
 * Gruppierungs-, Label- oder Sortierentscheidungen mehr.
 *
 * Der Bezugszeitpunkt für „Heute"/„Gestern" wird hereingereicht statt intern aus
 * der Systemuhr gelesen, damit die Tagesgrenzen prüfbar bleiben.
 */

/** Eine Completion mit aufgelöstem Anzeigenamen und Farbe der Person. */
export interface HistoryEntry extends EnrichedCompletion {
  household_members: {
    display_name: string
    user_color: string
  }
  /** Punkte des Eintrags — immer aus `effort_override`. */
  points: number
}

/** Eine an einem Tag beteiligte Person mit ihrer Tagesausbeute. */
export interface HistoryDayPerson {
  user_id: string
  display_name: string
  user_color: string
  points: number
}

/** Eine Completion, die für sich allein steht. */
export interface HistorySingleRow {
  kind: 'entry'
  id: string
  sortTime: number
  entry: HistoryEntry
}

/**
 * Alle Subtask-Completions eines Parent-Tasks an einem Kalendertag, zu einer Zeile
 * gefaltet. Entsteht immer — auch bei genau einem Subtask und auch dann, wenn der
 * Parent an diesem Tag gar nicht abgeschlossen wurde (z.B. Bonus-Subtasks an einem
 * Daily-Task). Die Completion des Parents selbst ist kein Kind der Gruppe.
 */
export interface HistoryFoldRow {
  kind: 'group'
  id: string
  sortTime: number
  parentTitle: string
  children: HistoryEntry[]
  points: number
  people: HistoryDayPerson[]
}

export type HistoryRow = HistorySingleRow | HistoryFoldRow

/** Alle Completions eines Kalendertages. */
export interface HistoryDayGroup {
  key: string
  label: string
  rows: HistoryRow[]
  /** Beteiligte des Tages, absteigend nach Punkten — Tagesüberblick und Farblegende in einem. */
  people: HistoryDayPerson[]
}

/**
 * Durchsuchte Felder eines Eintrags: Aufgabentitel, Anzeigename der Person,
 * Erledigungs-Notiz und — bei Subtask-Completions — der Titel des Parents. Der
 * eigene Titel kommt aus der angereicherten Completion, nicht aus der Task-Tabelle,
 * deshalb bleiben Erledigungen gelöschter Aufgaben (Soft Delete) auffindbar.
 *
 * Der Parent-Titel muss mitgesucht werden, weil die Liste Subtask-Completions unter
 * genau dieser Überschrift faltet: gesucht wird der Text, den die App anzeigt. Da
 * alle Kinder einer Faltgruppe denselben Parent haben, überlebt die Gruppe den
 * Filter vollständig und wird nicht zur leeren Hülle.
 */
const matchesTerm = (entry: HistoryEntry, needle: string, parentTitle?: string): boolean =>
  [entry.tasks?.title, entry.household_members.display_name, entry.completion_note, parentTitle]
    .some(field => field?.toLowerCase().includes(needle))

const FALLBACK_NAME = 'Unbekannt'
const FALLBACK_COLOR = '#6c757d'
const FALLBACK_TITLE = 'Unbekannte Aufgabe'

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const dayLabel = (date: Date, now: Date): string => {
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, now)) return 'Heute'
  if (isSameDay(date, yesterday)) return 'Gestern'
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

// Tagessummen je Person — zählt jede Completion des Tages, auch die zu gelöschten Tasks.
const summarizePeople = (items: HistoryEntry[]): HistoryDayPerson[] => {
  const byUser = new Map<string, HistoryDayPerson>()

  for (const item of items) {
    const existing = byUser.get(item.user_id)
    if (existing) {
      existing.points += item.points
      continue
    }
    byUser.set(item.user_id, {
      user_id: item.user_id,
      display_name: item.household_members.display_name,
      user_color: item.household_members.user_color,
      points: item.points
    })
  }

  return [...byUser.values()].sort(
    (a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name, 'de')
  )
}

/**
 * Faltet die Subtask-Completions eines Tages zu Gruppen und lässt alles andere als
 * Einzelzeile stehen. Für Completions gelöschter Tasks ist die Parent-Beziehung
 * nicht mehr auflösbar — sie bleiben bewusst Einzelzeilen.
 */
const foldRows = (items: HistoryEntry[], tasks: Task[]): HistoryRow[] => {
  const byTaskId = new Map(tasks.map(task => [task.task_id, task]))
  const singles: HistoryRow[] = []
  const folds = new Map<string, HistoryFoldRow>()

  for (const entry of items) {
    const task = entry.isDeleted ? undefined : byTaskId.get(entry.task_id)
    const parentId = task?.parent_task_id
    const time = new Date(entry.completed_at).getTime()

    if (!parentId) {
      singles.push({ kind: 'entry', id: entry.completion_id, sortTime: time, entry })
      continue
    }

    const existing = folds.get(parentId)
    if (existing) {
      existing.children.push(entry)
      existing.points += entry.points
      existing.sortTime = Math.max(existing.sortTime, time)
      continue
    }

    folds.set(parentId, {
      kind: 'group',
      id: `${parentId}-${entry.completion_id}`,
      sortTime: time,
      parentTitle: byTaskId.get(parentId)?.title || FALLBACK_TITLE,
      children: [entry],
      points: entry.points,
      people: []
    })
  }

  for (const fold of folds.values()) {
    fold.children.sort(
      (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    )
    fold.people = summarizePeople(fold.children)
  }

  return [...singles, ...folds.values()].sort((a, b) => b.sortTime - a.sortTime)
}

export function useHistoryGroups(
  completions: MaybeRefOrGetter<(TaskCompletion | EnrichedCompletion)[]>,
  members: MaybeRefOrGetter<HouseholdMember[]>,
  referenceDate: MaybeRefOrGetter<Date>,
  tasks: MaybeRefOrGetter<Task[]>,
  /** Live-Suchbegriff; leer bedeutet „nicht filtern". */
  searchTerm: MaybeRefOrGetter<string> = ''
) {
  // Completions aus Realtime sind evtl. nicht angereichert — daher überall Fallbacks.
  const entries = computed((): HistoryEntry[] => {
    const memberList = toValue(members)

    return toValue(completions)
      .map(completion => {
        const enriched = completion as EnrichedCompletion
        const member = memberList.find(m => m.user_id === completion.user_id)

        return {
          ...enriched,
          isDeleted: enriched.isDeleted ?? false,
          isQuick: enriched.isQuick ?? false,
          tasks: enriched.tasks ?? { title: FALLBACK_TITLE },
          household_members: {
            display_name:
              enriched.household_members?.display_name || member?.display_name || FALLBACK_NAME,
            user_color: member?.user_color || FALLBACK_COLOR
          },
          points: completion.effort_override
        }
      })
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
  })

  /** Normalisierter Suchbegriff — leer, wenn nicht gefiltert wird. */
  const normalizedTerm = computed(() => toValue(searchTerm).trim().toLowerCase())

  /** Wahr, solange ein Suchbegriff aktiv ist — trennt „nichts gefunden" von „noch nichts da". */
  const isFiltering = computed(() => normalizedTerm.value.length > 0)

  // Gefiltert wird vor der Gruppierung: die Gruppierung selbst bleibt unverändert,
  // Tage ohne Treffer entstehen dadurch gar nicht erst.
  const matchingEntries = computed((): HistoryEntry[] => {
    const needle = normalizedTerm.value
    if (!needle) return entries.value

    // Parent-Titel je Task — dieselbe Auflösung, die `foldRows` für die Überschrift
    // der Faltgruppe benutzt, damit Sichtbares und Durchsuchbares übereinstimmen.
    const byTaskId = new Map(toValue(tasks).map(task => [task.task_id, task]))
    const parentTitleOf = (entry: HistoryEntry): string | undefined => {
      if (entry.isDeleted) return undefined
      const parentId = byTaskId.get(entry.task_id)?.parent_task_id
      return parentId ? byTaskId.get(parentId)?.title : undefined
    }

    return entries.value.filter(entry => matchesTerm(entry, needle, parentTitleOf(entry)))
  })

  const dayGroups = computed((): HistoryDayGroup[] => {
    const now = toValue(referenceDate)
    const taskList = toValue(tasks)
    const days: { key: string; label: string; items: HistoryEntry[] }[] = []
    let current: { key: string; label: string; items: HistoryEntry[] } | null = null

    for (const entry of matchingEntries.value) {
      const date = new Date(entry.completed_at)
      const key = dayKey(date)
      if (!current || current.key !== key) {
        current = { key, label: dayLabel(date, now), items: [] }
        days.push(current)
      }
      current.items.push(entry)
    }

    // Die Tagessummen zählen alle Completions, die der Tag hier tatsächlich enthält —
    // auch die, die anschließend in eine Faltgruppe wandern. Bei aktivem Filter sind
    // das die Treffer des Tages, passend zu den Zeilen darunter.
    return days.map(day => ({
      key: day.key,
      label: day.label,
      rows: foldRows(day.items, taskList),
      people: summarizePeople(day.items)
    }))
  })

  return { entries, dayGroups, isFiltering }
}
