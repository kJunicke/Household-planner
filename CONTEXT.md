# CONTEXT

Domänensprache von **Putzplan** — einheitlich in Code, Specs und Tickets.
Architekturentscheidungen: [docs/adr/](docs/adr/).

## Glossar

### Fälligkeit
- Zeitpunkt, zu dem eine erledigte Aufgabe nach Ablauf ihrer Kadenz wieder ansteht.
- „Fällig in X Tagen" = Countdown einer **erledigten** Aufgabe.

### dran
- Offen und zu tun.
- Einzige Quelle: `tasks.completed` in der DB — geschrieben vom nächtlichen Cron, von der Edge Function `complete-task` und von **wieder dreckig**.
- Das Frontend liest den Zustand, es leitet ihn nicht ab → [ADR-0001](docs/adr/0001-completed-ist-zustand-keine-ableitung.md).

### überfällig
- Dran **und** Kadenz abgelaufen.
- Überfällig-Tage zählen **ab der Kadenz**, nicht ab der letzten Erledigung.
  - Kadenz 7, zuletzt vor 10 Tagen erledigt → **3 Tage überfällig**.
- Deshalb gelten lange Kadenzen nicht dauerhaft als stark überfällig.

### noch nie gemacht
- Wiederkehrende Aufgabe ohne jede Erledigung (`last_completed_at` leer).
- **Maximal dringend**, steht in jeder geordneten Liste ganz oben.
- Eigener Zustand, kein Sonderfall der Überfälligkeit — keine Tageszahl.
- Auf der Pinnwand: Grundabdruck **NEU** → **Stempel**.

### Stempel
- Gummistempel in der Fußzeile eines **Zettels**; **jeder Zettel trägt einen**.
- Einzige Stelle auf der Pinnwand, die den Stand einer Aufgabe zeigt.
- Unterster Abdruck ist **berechnet** aus Kadenz und letzter Erledigung:
  - **NEU**, solange nie erledigt, sonst **FÄLLIG**.
  - Tägliche Aufgaben: **ROUTINE**. Projekte: eigener Spruch. Beide sagen nichts über Dringlichkeit — sie geraten nie in Verzug.
  - Darüber legt der Haushalt von Hand nach → **Überstempeln**.
- **Der Stempel ordnet nicht.** Auf der Wand sind alle fälligen Aufgaben gleich dringend; innerhalb einer Gruppe entscheidet der Platz. Eine DRINGEND-Aufgabe darf unter einer ungestempelten hängen → [ADR-0002](docs/adr/0002-stempel-ordnet-nicht.md).
- In **Listen** ordnet derselbe berechnete Vergleichswert sehr wohl — dort gibt es keine Stempel, die Reihenfolge ist die Aussage.

### Überstempeln
- Von Hand gesetzte Aussage eines Haushaltsmitglieds: „diesmal ist es wichtig" — so handelt der Haushalt untereinander aus, was zuerst zählt.
- Tipp auf den Stempel legt den nächsten Abdruck obenauf: **WICHTIG** → **DRINGEND** → wieder sauber (nur noch Grundabdruck).
- **Träger sind Zettel und Projekte — Zettelchen nicht.** Was zuerst zählt, handelt der Haushalt über ganze Aufgaben aus, nicht über einzelne Häkchen einer Checkliste.
- Vorherige Abdrücke bleiben sichtbar liegen; der oberste gilt, die Stapelhöhe ist selbst eine Aussage.
- Gilt für **einen Durchlauf**: mit dem Erledigen fällt es weg (sonst wäre nach Wochen alles dringend).
- **Der Verfall folgt dem eigenen `task_type`, nicht dem Elternknoten:** wiederkehrende Aufgaben verlieren den Nachdruck beim **Erledigen**; **tägliche** erst **nächtlich** im Cron, weil sie nie erledigt werden und der Stempel sonst mitten am Tag durch den nächsten Handgriff verschwände; **Projekte gar nicht** — sie werden nie fertig, ihr Nachdruck bleibt stehen.
- Getragen von `tasks.emphasis_level`: **0** nur Grundabdruck, **1** WICHTIG, **2** DRINGEND. Die Verfallsregel steht im Code an **drei** Stellen — nächtlicher Cron, Edge Function `complete-task`, optimistischer Pfad im Store. Alle drei verweisen hierher; wer eine ändert, ändert alle drei.
- Der **Grundabdruck** verfällt nicht — er wird berechnet und kommt von selbst wieder.
- **Noch nicht bedienbar:** die Spalte, der Cron und `taskStore.cycleEmphasisLevel` stehen, aber kein Component ruft sie auf — heute lässt sich nichts stempeln → `.scratch/ueberstempeln-bedienung/`.

### Kranz
- Vier beschriftete Richtungen, die beim Gedrückthalten eines **Zettels** erscheinen; sie erklären, was das Ziehen in die jeweilige Richtung tut.
- Stehen an den **Bildschirmrändern**, nicht um den Zettel — sonst verdeckt der Daumen die Hälfte.
- Erklärt die Geste, ersetzt sie nicht: gezogen wird mit demselben Finger; Loslassen ohne erreichte Richtung tut nichts.
- **Projekte haben keinen Kranz** — bei ihnen führt nur eine Richtung zu etwas.
- **Am Eselsohr erscheint kein Kranz** — das **Abreißen** ist eine eigene Geste mit eigenem Ziel, keine Richtungswahl.
- Zu vermeiden: *Kreideränder*, *Randbeschriftung*.

### Greifen
- Gedrückthalten eines **Zettels**, bis er in der Hand liegt und sich ziehen lässt; das Telefon bestätigt es spürbar.
- Ab der Bestätigung gehört der Zeiger dem Zettel: der ganze Zettel ist Griff, nichts darauf nimmt ihn wieder weg.
- Das **Eselsohr** ist ausgenommen — es greift sofort und ohne Kranz, weil es nur ein Ziel hat.

### Aufklappen
- Tipp auf einen Zettel mit Unteraufgaben: zeigt seine Zettelchen, nimmt die volle Wandbreite ein.
- Ein aufgeklappter Zettel **bleibt liegen, wo er hängt**; Zettel im Weg rutschen unter ihn.
- Zuklappen stellt den vorigen Zustand wieder her.

### Befestigung
- Was einen **Zettel** an der Wand hält. Die Sorte hängt am Aufgabentyp: **Reißzwecke** (wiederkehrend, einmalig), **Klebestreifen** (täglich), **doppelte Büroklammer** (Projekt).
- Die Befestigung ist der **einzige Träger der Zuweisung**: Farbe der zuständigen Person, sonst neutral. Kein Rahmen, keine zweite Farbstelle — ein Zeichen, eine Aussage.
- Die Aussage gehört der Rolle, nicht der Form: **jede** Sorte trägt die Zuweisungsfarbe, sonst hätte ein Zettel je nach Typ verschieden viel zu sagen.

### wieder dreckig
- Manuelle Aktion: setzt eine erledigte Aufgabe wieder auf dran, obwohl die Kadenz noch läuft.
- Die Einschätzung des Haushalts hat Vorrang vor dem Zeitplan; die App setzt sie nicht zurück.

### verschieben
- Manuelle Aktion: räumt eine Aufgabe bis zu einem Termin aus dem Weg, **ohne** Erledigung — keine Punkte, kein Verlaufseintrag, letzte Erledigung unangetastet; das Intervall läuft im gewohnten Rhythmus weiter.
- Termin auf drei Wegen:
  - nach dem Intervall der Aufgabe (Vorauswahl, sofern eine Kadenz existiert),
  - eigene Anzahl Tage — ausdrücklich auch weniger als das Intervall,
  - frei gewähltes Datum.
  - Frühestens morgen.
- Die Aufgabe verlässt „Jetzt dran" und erscheint unter **Erledigt** mit „verschoben auf …" statt einer Fälligkeit. Am gewählten Tag holt der nächtliche Cron sie zurück.
- Technisch: `completed` wird gesetzt (bleibt alleinige Antwort auf „ist die Aufgabe dran"), das **Verschiebe-Datum** liegt in einer eigenen Spalte — nur Weckruf für den Cron, keine zweite Dranheits-Quelle. „Wieder dreckig" leert sie.
- Nicht verfügbar bei täglichen Aufgaben (setzen sich nächtlich selbst zurück) und Projekten (durchgehend bearbeitbar, sammeln keine Überfällig-Tage).

### Wochenziel
- Punktzahl, die der Haushalt sich gemeinsam für eine Woche vornimmt; gehört dem Haushalt, jedes Mitglied darf sie ändern.
- Gemessen gegen die Summe aller Erledigungen der laufenden Woche: **ein** Balken für alle, ein Farbsegment je Mitglied.
- Ausdrücklich **keine Rangliste** — die Farbanteile beantworten „wer hat was gemacht", nie „wer liegt vorn".
- Keine Historie, immer nur die laufende Woche:
  - geänderte Zielzahl gilt sofort,
  - geänderter Wochenstart erst ab nächster Woche — sonst verschwänden gesammelte Punkte scheinbar.

### Zettel
- Eine einzelne Aufgabe im Pinnwand-Aussehen: ein Stück Papier an der Wand.
- Das Papier trägt den Typ: wiederkehrend, täglich, einmalig und Projekt sehen unterschiedlich aus.
- Immer **genau eine** Aufgabe; hat ein **Eselsohr** und lässt sich **abreißen**.

### langer Zettel
- Papier, auf dem eine **Liste** steht (Einkauf, Packliste, To-do) — nicht die Liste selbst, sondern ihre Hülle: Kante, Linien, Kopfzeile.
- Trägt **viele** Einträge, hat kein Eselsohr, wird nicht abgerissen.
- Gegenbegriff zum **Zettel**: Aufgabe an der Wand vs. Liste auf einem Screen — gleiche Papier-Optik, weder Inhalt noch Gesten geteilt.

### Abreißen
- Geste zum Erledigen: den Zettel am **Eselsohr** greifen und nach unten ziehen.
- Fachlich dasselbe wie jede Erledigung — Punkte über die Edge Function `complete-task`, die Aufgabe verlässt „Jetzt dran".
- Ein **Griff, kein Urteil**: unmittelbar zurücknehmbar, solange der **Fetzen** hängt. Anders als **wieder dreckig**, das eine Aussage über den Zustand der Wohnung ist statt Korrektur eines Fehlgriffs.

### Eselsohr
- Angeknickte Ecke unten rechts an jedem Zettel — der Griff zum **Abreißen**.
- Einzige Stelle, an der die Geste beginnen darf; gesperrt, solange die Wand scrollt.
- Kein **Greifen**: kein Warten, kein Kranz. Zu vermeiden: *Quick Complete*, *Schnellerledigung*.

### Fetzen
- Papierrest, der nach dem Abreißen unter der Wand hängen bleibt; trägt Titel und Punkte der Aufgabe.
- Solange er hängt, ist die Erledigung widerrufbar → **Zurückkleben**.
- Verfällt **nicht** von selbst: verschwindet erst beim Verlassen der Pinnwand, beim Umschalten des Aussehens oder beim Neuladen.
- Es hängt immer nur **einer** — ein neuer Abriss ersetzt den vorigen, der ältere ist damit endgültig.

### Zurückkleben
- Tipp auf den Fetzen macht die Erledigung rückgängig: Aufgabe zurück an die Wand, Punkte raus aus dem Wochenziel.
- Die Erledigung wird aus der Historie **gelöscht** statt gegengebucht — sie hat nicht stattgefunden.
- Nicht zu verwechseln mit **wieder dreckig** im Erledigt-Streifen: das setzt erneut auf „dran", **behält** aber die Punkte.
