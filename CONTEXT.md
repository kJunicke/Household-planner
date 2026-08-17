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

Die manuelle Aktion, die eine Aufgabe bis zu einem gewählten Termin aus dem Weg räumt,
**ohne** dass jemand sie erledigt hat: keine Punkte, kein Verlaufseintrag, und der
Zeitpunkt der letzten Erledigung bleibt unangetastet — das Intervall läuft danach im
gewohnten Rhythmus weiter.

Der Termin wird auf drei Wegen bestimmt: nach dem Intervall der Aufgabe (Vorauswahl,
sofern eine Kadenz existiert), über eine selbst eingegebene Anzahl Tage — ausdrücklich
auch weniger als das Intervall — oder über ein frei gewähltes Datum. Frühestens morgen.

Die Aufgabe verlässt „Jetzt dran" und erscheint unter **Erledigt**, dort aber mit dem
Kennzeichen „verschoben auf …" statt einer Fälligkeit. Am gewählten Tag holt der
nächtliche Cron sie von selbst zurück.

Technisch: `completed` wird gesetzt (damit bleibt es die alleinige Antwort auf „ist die
Aufgabe dran") und das **Verschiebe-Datum** in einer eigenen Spalte hinterlegt. Diese
Spalte ist keine zweite Dranheits-Quelle, sondern nur der Weckruf für den Cron.
„Wieder dreckig" leert sie.

Nicht verfügbar bei täglichen Aufgaben (setzen sich nächtlich selbst zurück) und
Projekten (durchgehend bearbeitbar, sammeln keine Überfällig-Tage).

### Wochenziel

Die Punktzahl, die der Haushalt sich für eine Woche gemeinsam vornimmt. Sie gehört dem
Haushalt, nicht einer Person, und jedes Mitglied darf sie ändern.

Gemessen wird sie gegen die Summe aller Erledigungen der laufenden Woche — **ein** Balken
für alle, aufgeteilt in ein Farbsegment je Mitglied. Das ist ausdrücklich **keine
Rangliste**: die Farbanteile beantworten „wer hat was gemacht", nie „wer liegt vorn".

Es gibt keine Historie: sichtbar ist immer nur die laufende Woche. Eine geänderte Zielzahl
gilt deshalb sofort, ein geänderter Wochenstart dagegen erst ab der nächsten Woche — sonst
verschwänden bereits gesammelte Punkte scheinbar.

### Abreißen

Die Geste, mit der eine Aufgabe erledigt wird: den Zettel am **Eselsohr** greifen und nach
unten ziehen. Fachlich passiert dasselbe wie bei jeder Erledigung — die Punkte werden über
die Edge Function `complete-task` verbucht, die Aufgabe verlässt „Jetzt dran".

Abreißen ist ein **Griff, kein Urteil**: es lässt sich unmittelbar danach zurücknehmen,
solange der Fetzen sichtbar ist. Das unterscheidet es von **wieder dreckig**, das eine
inhaltliche Aussage über den Zustand der Wohnung ist und keine Korrektur eines Fehlgriffs.

### Eselsohr

Die angeknickte Ecke unten rechts an jedem Zettel — der Griff zum **Abreißen**. Es ist die
einzige Stelle, an der die Geste beginnen darf, und es ist gesperrt, solange die Wand
scrollt.

### Fetzen

Der Papierrest, der nach dem Abreißen einer Aufgabe unter der Wand hängen bleibt. Er trägt
den Titel der Aufgabe und die Punkte, die sie eingebracht hat. Solange er hängt, ist die
Erledigung widerrufbar. Er verfällt **nicht** von selbst: er verschwindet erst, wenn man die
Pinnwand verlässt, das Aussehen umschaltet oder neu lädt. Es hängt immer nur **einer** — ein
neuer Abriss ersetzt den vorigen, und der ältere ist damit endgültig.

### Zurückkleben

Der Tipp auf den Fetzen. Er macht die Erledigung rückgängig: die Aufgabe kehrt an die Wand
zurück, die Punkte verschwinden aus dem Wochenziel, und die Erledigung wird aus der Historie
**gelöscht** statt gegengebucht (sie hat nicht stattgefunden). Nicht zu verwechseln mit
„wieder dreckig" im Erledigt-Streifen — das setzt die Aufgabe erneut auf „dran", **behält**
aber die Punkte.
