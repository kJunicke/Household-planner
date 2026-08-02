# ADR-0001 — `completed` ist Zustand, keine Ableitung

Datum: 2026-08-02
Status: akzeptiert

## Kontext

Die Frage „ist diese Aufgabe **dran**?" wurde im Frontend an fünf Stellen unabhängig
beantwortet, jeweils über eigene Datumsmathematik auf `last_completed_at` und der Kadenz.
Dieselbe Regel steht zusätzlich in SQL: `reset_recurring_tasks()` setzt nächtlich
`completed = false`, sobald die Kadenz abgelaufen ist.

Zwei Regeln für dieselbe Frage laufen auseinander. Sichtbar wurde das an drei Stellen:
eine noch nie erledigte Aufgabe galt auf ihrer Karte als maximal dringend, fiel aber aus der
„Jetzt dran"-Sektion; zwischen lokal Mitternacht und dem Cron-Lauf um 03:00 UTC behauptete
die Oberfläche „überfällig", während die Datenbank die Aufgabe noch als erledigt führte; und
im Code stand für genau diesen Fall ein Fallback mit dem Kommentar „Sollte nicht vorkommen".

Naheliegender Aufräumgedanke: den Cron abschaffen und die Fälligkeit vollständig im Frontend
ableiten. Dann gäbe es die Regel nur noch einmal.

## Entscheidung

`tasks.completed` ist **gespeicherter Zustand** und wird nicht abgeleitet.

Die Zuständigkeiten werden getrennt:

| Frage | Wer entscheidet |
|---|---|
| Ist die Aufgabe **dran**? | `tasks.completed` — nur die Datenbank |
| Wie **dringend**, wann wieder **fällig**? | das Modul `taskSchedule` aus Kadenz und letzter Erledigung |

Das Frontend wertet die Kadenz-Grenze `Tage >= recurrence_days` **nicht** aus, um Dranheit
zu bestimmen. Diese Regel führt nur an einer einzigen Stelle zu einer Zustandsänderung: in
`reset_recurring_tasks()`.

## Begründung

Zwei bestehende Verhaltensweisen würden von einer Ableitung zerstört:

- **wieder dreckig.** Wird eine Aufgabe mit Kadenz 7 zwei Tage nach dem Putzen manuell auf
  dran gesetzt, würde ein ableitendes Frontend sie sofort wieder als sauber berechnen — die
  Eingabe des Haushaltsmitglieds wäre wirkungslos. Weil `completed` Zustand ist, gewinnt die
  manuelle Markierung automatisch: das Frontend kann die Flag gar nicht überstimmen.
- **verschieben.** `skipTask` setzt `last_completed_at` auf jetzt und lässt `completed`
  unberührt — die Aufgabe bleibt dran, sammelt aber keine Überfällig-Tage mehr. Bei einer
  Ableitung aus `last_completed_at` würde genau dieselbe Datenlage als „erledigt" gelesen.
  „Verschieben" und „erledigt" wären nicht mehr unterscheidbar.

## Verworfene Alternative

**Cron abschaffen, Übersteuerung in einer eigenen Spalte speichern** — etwa `dirty_since`,
gesetzt beim manuellen Dreckig-Markieren, und eine zweite Spalte oder Konvention für
„verschoben".

Abgelehnt, weil der Gewinn den Preis nicht trägt: die Übersteuerung wäre weiterhin
gespeicherter Zustand, nur verteilt auf mehr Spalten statt einer. Man tauscht eine
Datenbank-Regel gegen eine Migration, zusätzliche Felder und die Pflicht, in jeder Abfrage
zwei Quellen zu verrechnen — und muss die Kadenz-Regel trotzdem irgendwo hinschreiben.

## Konsequenzen

- Die Kadenz-Regel existiert nur noch in SQL. Änderungen daran erfolgen per Migration.
- Die Anzeige kann im Zeitfenster zwischen Mitternacht und dem Cron-Lauf **veraltet** sein
  (eine gerade fällig gewordene Aufgabe erscheint noch als erledigt), aber sie ist nie
  **widersprüchlich**. Das ist der bewusst gewählte Tausch.
- Der nächtliche Cron ist damit betriebsnotwendig, nicht bloß Komfort. Fällt er aus, werden
  Aufgaben nicht mehr dran — das ist kein Darstellungs-, sondern ein Datenproblem.
- Wer diese Konstruktion später „aufräumen" will, indem er die Fälligkeit ins Frontend zieht,
  bricht damit „wieder dreckig" und „verschieben". Dieses ADR ist der Grund, es nicht zu tun.
