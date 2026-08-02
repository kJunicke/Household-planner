import type { Task } from '@/types/Task'

// Zeitplan einer Aufgabe: wie dringend ist sie, und wann wird sie wieder fällig?
//
// Bewusst NICHT beantwortet: ob eine Aufgabe dran ist. Das entscheidet allein
// `tasks.completed` in der Datenbank — siehe docs/adr/0001-completed-ist-zustand-keine-ableitung.md.
// Deshalb wird die Kadenz-Grenze hier gelesen, aber nie zu einer Zustandsaussage gemacht.
//
// Reine Funktion: kein Vue, kein Pinia, kein Supabase, keine Seiteneffekte.

// Vokabular wie in CONTEXT.md: "dran" heißt offen und zu tun, "Fälligkeit" ist der
// Countdown einer erledigten Aufgabe. Deshalb 'pending' für dran und 'upcoming' für
// den laufenden Countdown — nicht umgekehrt.
export type TaskScheduleStatus =
  | 'never-done' // dran, noch nie erledigt
  | 'overdue' // dran, Kadenz überschritten
  | 'pending' // dran, Kadenz noch nicht abgelaufen (manuell dreckig)
  | 'upcoming' // erledigt, Countdown läuft
  | 'not-scheduled' // daily / one-time / project — keine Kadenz

export type TaskSchedule = {
  status: TaskScheduleStatus
  daysOverdue: number | null // Tage ÜBER die Kadenz hinaus; null wenn keine Tageszahl existiert
  daysUntilDue: number | null // null wenn keine Kadenz oder nie erledigt
  urgency: number // Sortierschlüssel, größer = dringender
}

// Überfällig im Sinne der Anzeige: die Kadenz ist gerissen oder es gab sie nie.
// Steht hier, damit Karte und Status-Zeile dieselbe Menge meinen.
export function isOverdue(schedule: TaskSchedule): boolean {
  return schedule.status === 'overdue' || schedule.status === 'never-done'
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

// Kalendertage, nicht 24h-Perioden: gestern 23:00 erledigt ist heute 07:00 ein Tag her.
// Konsistent mit der Cron-Logik in reset_recurring_tasks(), die auf DATE() vergleicht.
function calendarDaysBetween(from: Date, to: Date): number {
  const fromDay = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const toDay = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.floor((toDay - fromDay) / MS_PER_DAY)
}

export function scheduleOf(task: Task, today: Date = new Date()): TaskSchedule {
  const hasCadence = task.task_type === 'recurring' && task.recurrence_days > 0

  // Ohne Kadenz gibt es keine Fälligkeit — und in einer Dringlichkeits-Sortierung
  // landen diese Aufgaben immer am Ende.
  if (!hasCadence) {
    return { status: 'not-scheduled', daysOverdue: null, daysUntilDue: null, urgency: -Infinity }
  }

  // Noch nie gemacht ist kein Sonderfall der Überfälligkeit, sondern ein eigener
  // Zustand: maximal dringend, ohne Tageszahl. `urgency` bleibt eine Zahl, weil es
  // ein Sortierschlüssel ist — die Anzeige fragt den Status, nicht den Zahlenwert.
  if (!task.last_completed_at) {
    return { status: 'never-done', daysOverdue: null, daysUntilDue: null, urgency: Infinity }
  }

  const daysPassed = calendarDaysBetween(new Date(task.last_completed_at), today)
  // Überfällig wird ab der Kadenz gezählt, nicht ab der letzten Erledigung.
  const daysOverdue = daysPassed - task.recurrence_days

  const status: TaskScheduleStatus = task.completed
    ? 'upcoming'
    : daysOverdue >= 0
      ? 'overdue'
      : 'pending'

  return { status, daysOverdue, daysUntilDue: -daysOverdue, urgency: daysOverdue }
}
