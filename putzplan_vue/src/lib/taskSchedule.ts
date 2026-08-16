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
  | 'postponed' // verschoben: nicht dran bis zum Zieldatum, ohne Erledigung
  | 'not-scheduled' // daily / one-time / project — keine Kadenz

export type TaskSchedule = {
  status: TaskScheduleStatus
  daysOverdue: number | null // Tage ÜBER die Kadenz hinaus; null wenn keine Tageszahl existiert
  daysUntilDue: number | null // null wenn keine Kadenz oder nie erledigt
  urgency: number // Sortierschlüssel, größer = dringender
  postponedUntil: string | null // ISO-Datum (YYYY-MM-DD), nur im Zustand 'postponed'
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

// Kalendertag als YYYY-MM-DD in lokaler Zeit. Nicht toISOString(): das rechnet
// nach UTC um und verschiebt in MEZ/MESZ das Datum um einen Tag.
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

// Ein reines Datum (YYYY-MM-DD) als lokaler Tagesbeginn. new Date('2026-08-24')
// wäre UTC-Mitternacht und damit in MESZ der Vortag.
function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function scheduleOf(task: Task, today: Date = new Date()): TaskSchedule {
  // Verschoben zuerst — und ausdrücklich vor der Kadenz-Prüfung, damit auch eine
  // einmalige Aufgabe diesen Zustand bekommt. Ohne diesen Zweig meldete das Modul
  // 'upcoming' und rechnete eine Fälligkeit aus dem ALTEN Erledigungszeitpunkt aus,
  // der beim Verschieben bewusst unangetastet bleibt — also eine falsche Zahl.
  //
  // Das ist keine zweite Quelle für "dran": ob die Aufgabe dran ist, sagt weiterhin
  // allein `completed`. Verschoben heißt immer completed = true.
  if (task.postponed_until) {
    const daysUntilDue = calendarDaysBetween(today, parseIsoDate(task.postponed_until))
    return {
      status: 'postponed',
      daysOverdue: null,
      daysUntilDue,
      // Wie eine erledigte Aufgabe: negativ, also unten in der Dringlichkeit,
      // und innerhalb der Erledigt-Sektion nach nächstem Termin sortiert.
      urgency: -daysUntilDue,
      postponedUntil: task.postponed_until.slice(0, 10)
    }
  }

  const hasCadence = task.task_type === 'recurring' && task.recurrence_days > 0

  // Ohne Kadenz gibt es keine Fälligkeit — und in einer Dringlichkeits-Sortierung
  // landen diese Aufgaben immer am Ende.
  if (!hasCadence) {
    return {
      status: 'not-scheduled',
      daysOverdue: null,
      daysUntilDue: null,
      urgency: -Infinity,
      postponedUntil: null
    }
  }

  // Noch nie gemacht ist kein Sonderfall der Überfälligkeit, sondern ein eigener
  // Zustand: maximal dringend, ohne Tageszahl. `urgency` bleibt eine Zahl, weil es
  // ein Sortierschlüssel ist — die Anzeige fragt den Status, nicht den Zahlenwert.
  if (!task.last_completed_at) {
    return {
      status: 'never-done',
      daysOverdue: null,
      daysUntilDue: null,
      urgency: Infinity,
      postponedUntil: null
    }
  }

  const daysPassed = calendarDaysBetween(new Date(task.last_completed_at), today)
  // Überfällig wird ab der Kadenz gezählt, nicht ab der letzten Erledigung.
  const daysOverdue = daysPassed - task.recurrence_days

  const status: TaskScheduleStatus = task.completed
    ? 'upcoming'
    : daysOverdue >= 0
      ? 'overdue'
      : 'pending'

  return {
    status,
    daysOverdue,
    daysUntilDue: -daysOverdue,
    urgency: daysOverdue,
    postponedUntil: null
  }
}

// --- Verschieben ------------------------------------------------------------
// Zieldatum-Berechnung, reine Funktion. Liegt hier, weil das dieselbe Kalender-
// arithmetik ist wie die Fälligkeit — und weil sie so ohne Vue, Pinia und
// Datenbank prüfbar bleibt.

export type PostponeOption = 'interval' | 'plus-1' | 'plus-3' | 'plus-7' | 'custom'

// Zieldatum als YYYY-MM-DD, oder null wenn die Option für diese Aufgabe nicht
// existiert (Intervall ohne Kadenz) bzw. das freie Datum unbrauchbar ist.
export function postponeTargetDate(
  task: Task,
  option: PostponeOption,
  customDate: string | null = null,
  today: Date = new Date()
): string | null {
  if (option === 'custom') {
    if (!customDate) return null
    // Nur Zukunft: heute und früher sind keine Verschiebung.
    return calendarDaysBetween(today, parseIsoDate(customDate)) > 0 ? customDate.slice(0, 10) : null
  }

  const days =
    option === 'interval'
      ? task.task_type === 'recurring' && task.recurrence_days > 0
        ? task.recurrence_days
        : null
      : option === 'plus-1'
        ? 1
        : option === 'plus-3'
          ? 3
          : 7

  if (days === null) return null

  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
  return toIsoDate(target)
}

// Kleinstes gültiges Datum für den freien Wähler: morgen.
export function earliestPostponeDate(today: Date = new Date()): string {
  return toIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))
}

// "Montag, 24.08." — für Rückmeldung und Karten-Kennzeichen, damit beide
// dasselbe Datum gleich schreiben.
export function formatPostponeDate(isoDate: string): string {
  return parseIsoDate(isoDate).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit'
  })
}

// Verschieben ergibt nur dort Sinn, wo eine Aufgabe überhaupt drängelt:
// tägliche Aufgaben setzen sich nächtlich selbst zurück, Projekte sind
// durchgehend bearbeitbar und sammeln keine Überfällig-Tage.
export function canPostpone(task: Task): boolean {
  return task.task_type === 'recurring' || task.task_type === 'one-time'
}
