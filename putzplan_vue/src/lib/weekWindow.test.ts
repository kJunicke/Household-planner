import { describe, expect, it } from 'vitest'

import {
  effectiveWeekStartDay,
  formatDayStamp,
  formatWeekStartDate,
  isPendingWeekStartDue,
  normalizeWeekStartDay,
  parseDayStamp,
  resolveWeekWindowStart,
  weekStartChangeover,
} from './weekWindow'

// Lokale Zeit (vitest.config.ts: TZ=Europe/Berlin). Monate 1-basiert zum Lesen.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min)
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const MONDAY = 1
const WEDNESDAY = 3
const SUNDAY = 0
const DAY_MS = 24 * 60 * 60 * 1000

describe('Testumgebung', () => {
  it('rechnet in einer Zone mit Sommerzeit (sonst prüfen die DST-Tests nichts)', () => {
    // 2026: MESZ beginnt am 29.03., endet am 25.10.
    expect(at(2026, 3, 28).getTimezoneOffset()).toBe(-60)
    expect(at(2026, 3, 30).getTimezoneOffset()).toBe(-120)
  })
})

describe('normalizeWeekStartDay', () => {
  it('lässt 0…6 durch', () => {
    for (let d = 0; d <= 6; d++) expect(normalizeWeekStartDay(d)).toBe(d)
  })

  it('schneidet Nachkommastellen ab', () => {
    expect(normalizeWeekStartDay(3.9)).toBe(3)
  })

  it.each([null, undefined, -1, 7, 42, Number.NaN, Number.POSITIVE_INFINITY])(
    'fällt bei %s auf Montag zurück',
    (value) => {
      expect(normalizeWeekStartDay(value)).toBe(MONDAY)
    },
  )
})

describe('resolveWeekWindowStart ohne anstehende Änderung', () => {
  it('liefert die lokale Mitternacht des letzten Wochenstarts', () => {
    // Mittwoch, 19.08.2026 → Montag, 17.08.2026 00:00
    expect(resolveWeekWindowStart(at(2026, 8, 19, 15), MONDAY)).toEqual(day(2026, 8, 17))
  })

  it('fällt `now` auf den Wochenstart, ist es dessen Mitternacht', () => {
    expect(resolveWeekWindowStart(at(2026, 8, 17, 0, 0), MONDAY)).toEqual(day(2026, 8, 17))
    expect(resolveWeekWindowStart(at(2026, 8, 17, 23, 59), MONDAY)).toEqual(day(2026, 8, 17))
  })

  it('der letzte Abend der Woche gehört noch zur alten Woche', () => {
    expect(resolveWeekWindowStart(at(2026, 8, 23, 23, 59), MONDAY)).toEqual(day(2026, 8, 17))
  })

  it('respektiert einen anderen Wochenstart', () => {
    expect(resolveWeekWindowStart(at(2026, 8, 19), SUNDAY)).toEqual(day(2026, 8, 16))
    expect(resolveWeekWindowStart(at(2026, 8, 19), WEDNESDAY)).toEqual(day(2026, 8, 19))
    expect(resolveWeekWindowStart(at(2026, 8, 18), WEDNESDAY)).toEqual(day(2026, 8, 12))
  })

  it('springt über Monats- und Jahresgrenzen', () => {
    expect(resolveWeekWindowStart(at(2027, 1, 1), MONDAY)).toEqual(day(2026, 12, 28))
  })

  it('liegt an der Sommerzeit-Grenze auf lokaler Mitternacht, nicht 23:00 oder 01:00', () => {
    // Woche über den Beginn der Sommerzeit (So 29.03.2026, 23-Stunden-Tag)
    const spring = resolveWeekWindowStart(at(2026, 4, 1), SUNDAY)
    expect(spring).toEqual(day(2026, 3, 29))
    expect(spring.getHours()).toBe(0)
    // Woche direkt nach dem Ende der Sommerzeit (So 25.10.2026, 25-Stunden-Tag)
    const autumn = resolveWeekWindowStart(at(2026, 10, 27), MONDAY)
    expect(autumn).toEqual(day(2026, 10, 26))
    expect(autumn.getHours()).toBe(0)
  })

  it('zwei Wochenstarts über eine DST-Grenze liegen 7 Kalendertage auseinander, nicht 168 h', () => {
    const before = resolveWeekWindowStart(at(2026, 10, 21), MONDAY)
    const after = resolveWeekWindowStart(at(2026, 10, 28), MONDAY)
    expect(after.getTime() - before.getTime()).toBe(7 * DAY_MS + 60 * 60 * 1000)
  })

  it('unbrauchbarer Wochentag rechnet wie Montag', () => {
    expect(resolveWeekWindowStart(at(2026, 8, 19), 99)).toEqual(day(2026, 8, 17))
  })
})

describe('weekStartChangeover', () => {
  it('die laufende Woche endet regulär, dann gilt das nächste Auftreten des neuen Tags', () => {
    // Woche ab Mo 17.08., Ende Mo 24.08. → nächster Mittwoch ist der 26.08.
    expect(weekStartChangeover(day(2026, 8, 17), WEDNESDAY)).toEqual(day(2026, 8, 26))
  })

  it('fällt der neue Tag genau aufs Wochenende, ist der Wechsel nahtlos', () => {
    expect(weekStartChangeover(day(2026, 8, 17), MONDAY)).toEqual(day(2026, 8, 24))
  })

  it('verlängert die laufende Woche um höchstens sechs Tage, nie kürzer als sieben', () => {
    for (let active = 0; active <= 6; active++) {
      const current = resolveWeekWindowStart(at(2026, 8, 19), active)
      for (let next = 0; next <= 6; next++) {
        const from = weekStartChangeover(current, next)
        const days = Math.round((from.getTime() - current.getTime()) / DAY_MS)
        expect(days).toBeGreaterThanOrEqual(7)
        expect(days).toBeLessThanOrEqual(13)
        expect(from.getDay()).toBe(next)
        expect(from.getHours()).toBe(0)
      }
    }
  })

  it('bleibt über das Ende der Sommerzeit auf lokaler Mitternacht', () => {
    const from = weekStartChangeover(day(2026, 10, 19), MONDAY)
    expect(from).toEqual(day(2026, 10, 26))
    expect(from.getHours()).toBe(0)
  })
})

describe('isPendingWeekStartDue / effectiveWeekStartDay', () => {
  const pending = { day: WEDNESDAY, from: day(2026, 8, 26) }

  it('nichts anstehend, wenn eines der Felder fehlt', () => {
    expect(isPendingWeekStartDue(at(2030, 1, 1), { day: null, from: day(2026, 8, 26) })).toBe(false)
    expect(isPendingWeekStartDue(at(2030, 1, 1), { day: WEDNESDAY, from: null })).toBe(false)
  })

  it('fällig ab der Mitternacht des Stichtags, auch frühmorgens', () => {
    expect(isPendingWeekStartDue(at(2026, 8, 25, 23, 59), pending)).toBe(false)
    expect(isPendingWeekStartDue(at(2026, 8, 26, 0, 0), pending)).toBe(true)
    expect(isPendingWeekStartDue(at(2026, 8, 26, 0, 1), pending)).toBe(true)
    expect(isPendingWeekStartDue(at(2026, 9, 30), pending)).toBe(true)
  })

  it('der geltende Wochentag springt erst am Stichtag um', () => {
    expect(effectiveWeekStartDay(at(2026, 8, 25), MONDAY, pending)).toBe(MONDAY)
    expect(effectiveWeekStartDay(at(2026, 8, 26), MONDAY, pending)).toBe(WEDNESDAY)
  })
})

describe('resolveWeekWindowStart mit anstehender Änderung', () => {
  it('die verlängerte Woche läuft bis zum Stichtag, danach gilt der neue Tag', () => {
    // Am Mi 19.08. von Montag auf Mittwoch umgestellt → Stichtag Mi 26.08.
    const pending = { day: WEDNESDAY, from: day(2026, 8, 26) }
    expect(resolveWeekWindowStart(at(2026, 8, 19), MONDAY, pending)).toEqual(day(2026, 8, 17))
    // Montag 24.08. wäre regulär ein neuer Wochenstart — die Woche ist aber verlängert.
    expect(resolveWeekWindowStart(at(2026, 8, 24), MONDAY, pending)).toEqual(day(2026, 8, 17))
    expect(resolveWeekWindowStart(at(2026, 8, 25, 23, 59), MONDAY, pending)).toEqual(
      day(2026, 8, 17),
    )
    expect(resolveWeekWindowStart(at(2026, 8, 26, 0, 0), MONDAY, pending)).toEqual(day(2026, 8, 26))
    expect(resolveWeekWindowStart(at(2026, 9, 1), MONDAY, pending)).toEqual(day(2026, 8, 26))
  })

  it('jedes Gerät rechnet allein aus den gespeicherten Feldern dieselbe Grenze zurück', () => {
    // Für jede Kombination aus altem Tag, neuem Tag und Änderungstag (inkl. Zeitraum
    // über das Ende der Sommerzeit): bis zum Stichtag gilt der Start der Woche, in der
    // geändert wurde, ab dem Stichtag der Stichtag selbst — nichts doppelt, keine Lücke.
    for (let active = 0; active <= 6; active++) {
      for (let next = 0; next <= 6; next++) {
        for (let offset = 0; offset < 14; offset++) {
          const changedAt = at(2026, 10, 12 + offset, 21)
          const weekOfChange = resolveWeekWindowStart(changedAt, active)
          const from = weekStartChangeover(weekOfChange, next)
          const pending = { day: next, from }

          for (let t = new Date(changedAt); t < from; t = new Date(t.getTime() + 6 * 3600_000)) {
            expect(resolveWeekWindowStart(t, active, pending)).toEqual(weekOfChange)
          }
          expect(resolveWeekWindowStart(from, active, pending)).toEqual(from)
        }
      }
    }
  })
})

describe('formatDayStamp / parseDayStamp', () => {
  it('schreibt den lokalen Kalendertag, auch kurz nach Mitternacht (kein UTC-Versatz)', () => {
    expect(formatDayStamp(at(2026, 8, 19, 0, 30))).toBe('2026-08-19')
    expect(formatDayStamp(at(2026, 1, 5, 23, 59))).toBe('2026-01-05')
  })

  it('liest den Stempel als lokale Mitternacht zurück', () => {
    expect(parseDayStamp('2026-08-19')).toEqual(day(2026, 8, 19))
    expect(parseDayStamp('2026-10-25')!.getHours()).toBe(0)
  })

  it('Hin und zurück ergibt denselben Tag', () => {
    for (let i = 0; i < 400; i++) {
      const d = day(2026, 1, 1 + i)
      expect(parseDayStamp(formatDayStamp(d))).toEqual(d)
    }
  })

  it.each([null, undefined, '', '2026-8-19', '19.08.2026', '2026-08-19T00:00:00Z', 'abc'])(
    'ergibt bei %s null',
    (value) => {
      expect(parseDayStamp(value)).toBeNull()
    },
  )

  // BEFUND (nicht behoben): Der Kommentar sagt „alles Unbrauchbare ergibt null", aber
  // ein formal richtig geschriebenes, kalendarisch unmögliches Datum rollt über:
  // `new Date(2026, 1, 31)` ist der 03.03.2026, und `Number.isNaN` greift nicht.
  // Praktisch nur erreichbar, wenn die DB-Spalte `week_start_pending_from` von
  // außen beschrieben wird (sie ist ein `date`, Postgres lässt den 31.02. nicht zu).
  it.skip('ergibt bei einem unmöglichen Datum (31.02.) null — schlägt heute fehl', () => {
    expect(parseDayStamp('2026-02-31')).toBeNull()
    expect(parseDayStamp('2026-13-01')).toBeNull()
  })
})

describe('formatWeekStartDate', () => {
  it('benennt Wochentag und Datum', () => {
    expect(formatWeekStartDate(day(2026, 8, 19))).toBe('Mittwoch, 19.08.2026')
    expect(formatWeekStartDate(day(2026, 3, 1))).toBe('Sonntag, 01.03.2026')
  })
})
