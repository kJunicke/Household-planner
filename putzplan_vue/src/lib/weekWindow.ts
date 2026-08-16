/**
 * Die **laufende Woche** — die einzige Zeitscheibe, gegen die das Wochenziel
 * gemessen wird.
 *
 * Bewusst eine feste Woche ab dem eingestellten Wochenstart, keine rollenden
 * sieben Tage: eine rollende Fensterung ließe Punkte still am hinteren Rand
 * herausfallen, während vorne neue dazukommen — der Balken sänke, ohne dass
 * jemand etwas getan hätte.
 *
 * **Zeitzone:** gerechnet wird in der lokalen Zeit des Geräts. Der Wochenstart
 * ist der lokale Mitternachtsbeginn des gewählten Wochentags; verglichen wird
 * anschließend über ISO-Zeitstempel, also absolut. Für einen Haushalt, dessen
 * Mitglieder in derselben Zeitzone leben, ist das exakt; säßen zwei Mitglieder
 * in unterschiedlichen Zonen, sähen sie den Wochenwechsel um die Differenz
 * versetzt. Das ist hier bewusst in Kauf genommen — eine Haushalts-Zeitzone
 * gibt es im Datenmodell nicht.
 */

/** Wochenstart als JS-Wochentag: 0 = Sonntag … 6 = Samstag. */
export const DEFAULT_WEEK_START_DAY = 1 // Montag

/** Ersatz-Wochenziel, solange der Haushalt keins gesetzt hat (oder die Spalte fehlt). */
export const DEFAULT_WEEKLY_GOAL_POINTS = 30

/** Auf 0..6 normalisieren; alles Unbrauchbare fällt auf Montag zurück. */
export const normalizeWeekStartDay = (value: number | null | undefined): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_WEEK_START_DAY
    const day = Math.trunc(value)
    if (day < 0 || day > 6) return DEFAULT_WEEK_START_DAY
    return day
}

/**
 * Lokale Mitternacht des letzten `weekStartDay`, der nicht in der Zukunft liegt.
 * Fällt `now` selbst auf den Wochenstart, ist es dessen Mitternacht.
 */
export const startOfWeek = (now: Date, weekStartDay: number): Date => {
    const day = normalizeWeekStartDay(weekStartDay)
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diff = (start.getDay() - day + 7) % 7
    start.setDate(start.getDate() - diff)
    return start
}

/** Wochentagsnamen in JS-Reihenfolge (0 = Sonntag). */
export const WEEK_DAY_LABELS = [
    'Sonntag',
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag'
] as const

const addDays = (date: Date, days: number): Date => {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
}

/** Erstes Auftreten von `weekStartDay` am oder nach `from` (lokale Mitternacht). */
const firstOccurrenceOnOrAfter = (from: Date, weekStartDay: number): Date => {
    const day = normalizeWeekStartDay(weekStartDay)
    const base = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    const diff = (day - base.getDay() + 7) % 7
    return addDays(base, diff)
}

/**
 * Der Tag, ab dem ein **geänderter** Wochenstart tatsächlich greift.
 *
 * Nicht sofort: die laufende Woche (`currentWeekStart`) läuft erst regulär zu
 * Ende (`+ 7 Tage`), und ab da gilt das nächste Auftreten des neuen Wochentags.
 * Fällt dieser genau auf das Wochenende, ist der Wechsel nahtlos; sonst hängt
 * die laufende Woche einmalig um bis zu sechs Tage über.
 *
 * Bewusst **verlängert** statt eine kurze Stummelwoche einzuschieben: eine
 * verlängerte Woche zählt nichts doppelt und verliert nichts — beim Stummel
 * wäre der Balken zweimal kurz hintereinander gesprungen.
 *
 * Das Ergebnis wird **einmal beim Speichern** ausgerechnet und am Haushalt
 * abgelegt (`week_start_pending_from`). Es ist damit für alle Mitglieder und
 * alle Geräte dieselbe Zahl — genau das, was ein gemeinsamer Balken braucht.
 */
export const weekStartChangeover = (currentWeekStart: Date, newWeekStartDay: number): Date =>
    firstOccurrenceOnOrAfter(addDays(currentWeekStart, 7), newWeekStartDay)

/**
 * Die anstehende Wochenstart-Änderung eines Haushalts, so wie sie in der
 * Datenbank steht. `null` in einem der beiden Felder heißt: nichts anstehend.
 */
export interface PendingWeekStart {
    day: number | null
    from: Date | null
}

/** Ist die anstehende Änderung heute fällig (oder überfällig)? */
export const isPendingWeekStartDue = (now: Date, pending: PendingWeekStart): boolean => {
    if (pending.day === null || !pending.from) return false
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return today >= pending.from
}

/**
 * Der Wochentag, der **gerade gilt** — inklusive einer fälligen, aber noch
 * nicht fortgeschriebenen Änderung. Reine Funktion: jeder Client kommt aus
 * denselben Feldern zum selben Ergebnis, unabhängig davon, wer das Pending
 * schon nach Aktiv geschoben hat.
 */
export const effectiveWeekStartDay = (
    now: Date,
    activeWeekStartDay: number,
    pending: PendingWeekStart
): number =>
    isPendingWeekStartDue(now, pending)
        ? normalizeWeekStartDay(pending.day)
        : normalizeWeekStartDay(activeWeekStartDay)

/**
 * Start der laufenden Woche — die einzige Zeitgrenze, gegen die gemessen wird.
 *
 * Steht eine Änderung **noch aus**, liegt die Grenze dort, wo die Woche
 * begonnen hat, in der die Änderung vorgenommen wurde. Dieser Wochenstart ist
 * aus `pending.from` zurückrechenbar und braucht deshalb keinen gerätelokalen
 * Anker: `pending.from` ist per Konstruktion das erste Auftreten des neuen Tags
 * am oder nach dem Ende jener Woche, liegt also im Intervall
 * `[wochenEnde, wochenEnde + 7)`. Damit ist
 * `startOfWeek(pending.from, aktiverTag) − 7 Tage` genau jener Wochenstart.
 */
export const resolveWeekWindowStart = (
    now: Date,
    activeWeekStartDay: number,
    pending: PendingWeekStart = { day: null, from: null }
): Date => {
    if (isPendingWeekStartDue(now, pending)) {
        return startOfWeek(now, normalizeWeekStartDay(pending.day))
    }

    const active = normalizeWeekStartDay(activeWeekStartDay)

    if (pending.day !== null && pending.from) {
        const extendedStart = addDays(startOfWeek(pending.from, active), -7)
        // Die verlängerte Woche gilt nur, wenn wir uns wirklich in ihr befinden.
        if (now >= extendedStart) return extendedStart
    }

    return startOfWeek(now, active)
}

/** Datum als `YYYY-MM-DD` in **lokaler** Zeit (nicht ISO/UTC — sonst Tagesversatz). */
export const formatDayStamp = (date: Date): string => {
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
}

/** Umkehrung von `formatDayStamp`; alles Unbrauchbare ergibt `null`. */
export const parseDayStamp = (value: string | null | undefined): Date | null => {
    if (!value) return null
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return null
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return Number.isNaN(date.getTime()) ? null : date
}

/** „Mittwoch, 19.08.2026" — für die Bestätigung, die den Folgetermin benennt. */
export const formatWeekStartDate = (date: Date): string =>
    `${WEEK_DAY_LABELS[date.getDay()]}, ${formatGermanDate(date)}`

/** „19.08.2026" */
export const formatGermanDate = (date: Date): string => {
    const day = `${date.getDate()}`.padStart(2, '0')
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    return `${day}.${month}.${date.getFullYear()}`
}
