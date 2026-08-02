# CONTEXT

Domänensprache von **Putzplan**. Diese Begriffe werden im Code, in Specs und in Tickets
einheitlich verwendet. Architekturentscheidungen liegen unter [docs/adr/](docs/adr/).

## Glossar

### Kadenz

Der Wiederholungsabstand einer Aufgabe in Tagen (`recurrence_days`). Nur Aufgaben vom Typ
`recurring` mit `recurrence_days > 0` haben eine Kadenz. Tägliche Aufgaben, einmalige
Aufgaben und Projekte haben **keine** Kadenz — für sie gibt es keine Fälligkeit.

Gezählt wird in **Kalendertagen**, nicht in 24-Stunden-Perioden: eine Aufgabe, die gestern
um 23:00 Uhr erledigt wurde, hat heute um 07:00 Uhr einen Tag hinter sich.

### Fälligkeit

Der Zeitpunkt, zu dem eine erledigte Aufgabe nach Ablauf ihrer Kadenz wieder ansteht.
„Fällig in X Tagen" beschreibt den Countdown einer **erledigten** Aufgabe.

### dran

Eine Aufgabe ist **dran**, wenn sie offen ist und getan werden sollte. Ob eine Aufgabe dran
ist, entscheidet allein die Datenbank über `tasks.completed` — geschrieben vom nächtlichen
Cron, von der Edge Function `complete-task` und von der manuellen Aktion „wieder dreckig".

Das Frontend leitet diesen Zustand **nicht** ab, sondern liest ihn
→ [ADR-0001](docs/adr/0001-completed-ist-zustand-keine-ableitung.md).

### überfällig

Eine Aufgabe ist **überfällig**, wenn sie dran ist und ihre Kadenz bereits abgelaufen ist.
Die Zahl der Überfällig-Tage zählt **ab der Kadenz**, nicht ab der letzten Erledigung:

> Kadenz 7, zuletzt vor 10 Tagen erledigt → **3 Tage überfällig**.

Diese Unterscheidung ist der Grund, warum Aufgaben mit langer Kadenz nicht dauerhaft als
stark überfällig gelten.

### noch nie gemacht

Eine wiederkehrende Aufgabe ohne jede Erledigung (`last_completed_at` ist leer). Sie gilt
als **maximal dringend** und steht in jeder Dringlichkeits-Sortierung ganz oben. Sie ist
kein Sonderfall der Überfälligkeit, sondern ein eigener Zustand — eine Tageszahl gibt es
für sie nicht.

### Dringlichkeit

Der Vergleichswert, nach dem offene Aufgaben sortiert werden: je größer, desto dringender.
Er wird zentral aus Kadenz und letzter Erledigung berechnet, damit Reihenfolge und
Farbgebung in allen Ansichten übereinstimmen.

### wieder dreckig

Die manuelle Aktion, mit der ein Haushaltsmitglied eine erledigte Aufgabe wieder auf dran
setzt, obwohl ihre Kadenz noch nicht abgelaufen ist. Ihre Einschätzung hat Vorrang vor dem
Zeitplan; die App setzt diese Entscheidung nicht zurück.

### verschieben

Die manuelle Aktion, die eine dran-Aufgabe wieder als frisch erledigt behandelt, ohne
Punkte zu vergeben. Die Aufgabe bleibt in der Liste, hört aber auf, Überfällig-Tage zu
sammeln.
