import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { EnrichedCompletion, TaskCompletion } from '@/types/Task'
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

/** Alle Completions eines Kalendertages. */
export interface HistoryDayGroup {
  key: string
  label: string
  items: HistoryEntry[]
  /** Beteiligte des Tages, absteigend nach Punkten — Tagesüberblick und Farblegende in einem. */
  people: HistoryDayPerson[]
}

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

export function useHistoryGroups(
  completions: MaybeRefOrGetter<(TaskCompletion | EnrichedCompletion)[]>,
  members: MaybeRefOrGetter<HouseholdMember[]>,
  referenceDate: MaybeRefOrGetter<Date>
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

  const dayGroups = computed((): HistoryDayGroup[] => {
    const now = toValue(referenceDate)
    const groups: HistoryDayGroup[] = []
    let current: HistoryDayGroup | null = null

    for (const entry of entries.value) {
      const date = new Date(entry.completed_at)
      const key = dayKey(date)
      if (!current || current.key !== key) {
        current = { key, label: dayLabel(date, now), items: [], people: [] }
        groups.push(current)
      }
      current.items.push(entry)
    }

    for (const group of groups) {
      group.people = summarizePeople(group.items)
    }

    return groups
  })

  return { entries, dayGroups }
}
