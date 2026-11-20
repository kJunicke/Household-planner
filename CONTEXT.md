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
  - Tägliche Aufgaben: **BEDARF** — sie werden nicht fällig, sie fallen an. Projekte: ein **Projektspruch**. Beide sagen nichts über Dringlichkeit — sie geraten nie in Verzug.
  - **ERLEDIGT** auf **losen Zetteln** in der **Suche** — so sieht man, woher der Zettel kommt. Lose Zettel lassen sich nicht überstempeln, erst wieder angepinnt.
  - **Der Typ schlägt NEU:** eine nagelneue tägliche Aufgabe zeigt BEDARF, ein nagelneues Projekt seinen Spruch. Sonst stünde auf beiden dauerhaft NEU, weil beide nie abgeschlossen werden.
  - Darüber legt der Haushalt von Hand nach → **Überstempeln**.
- **Der Stempel ordnet nicht.** Auf der Wand sind alle fälligen Aufgaben gleich dringend; innerhalb einer Gruppe entscheidet der Platz. Eine DRINGEND-Aufgabe darf unter einer ungestempelten hängen → [ADR-0002](docs/adr/0002-stempel-ordnet-nicht.md).
- In **Listen** ordnet derselbe berechnete Vergleichswert sehr wohl — dort gibt es keine Stempel, die Reihenfolge ist die Aussage.

### Projektspruch
- Der Grundabdruck eines **Projekts**: ein Wort aus einer festen Sammlung von hundert, das nichts über Verzug sagt — ein Projekt kann nicht in Verzug geraten.
- Wird bei der Anlage eines Projekts **zufällig gezogen** und gehört dann diesem Projekt; er bleibt stehen, während der Stapel darüber wächst.
- **An einem Projekt trägt jede Stufe einen Spruch** — `WICHTIG` und `DRINGEND` kommen dort nicht vor. Wie dringend ein Projekt ist, liest man allein an der **Farbe** der obersten Lage ab (blau → orange → rot), nicht am Wort. Vom Maintainer am 05.09.2026 am Gerät entschieden; die Gegenposition steht in [ADR-0002](docs/adr/0002-stempel-ordnet-nicht.md) samt Nachtrag.
- Gespeichert ist **ein** Listenplatz je Projekt. Die beiden oberen Sprüche werden daraus abgeleitet, nicht zusätzlich gespeichert; alle drei sind garantiert verschieden.
- Beim **Abräumen** des Stapels wird ein neuer Grundplatz gezogen, nie derselbe zweimal hintereinander — und weil die oberen beiden an ihm hängen, wechselt der **ganze** Stapel. So arbeitet sich ein Haushalt nach und nach durch die Sammlung.
- Er gehört dem Haushalt, nicht dem Gerät: alle sehen dasselbe Wort, und nach dem Neuladen steht es noch da.

### Überstempeln
- Von Hand gesetzte Aussage eines Haushaltsmitglieds: „diesmal ist es wichtig" — so handelt der Haushalt untereinander aus, was zuerst zählt.
- Tipp auf den Stempel legt den nächsten Abdruck obenauf: **WICHTIG** → **DRINGEND** → wieder sauber (nur noch Grundabdruck).
- **Am Projekt sind es drei Projektsprüche statt WICHTIG und DRINGEND** (→ *Projektspruch*). Die Stufe ist dieselbe, nur das Wort ist ein anderes — und die Farbe ist dort der einzige Hinweis auf sie.
- **Träger sind Zettel und Projekte — Zettelchen nicht.** Was zuerst zählt, handelt der Haushalt über ganze Aufgaben aus, nicht über einzelne Häkchen einer Checkliste.
- Vorherige Abdrücke bleiben sichtbar liegen — der **Abdruckstapel**. Der oberste gilt und ist am besten lesbar; die Stapelhöhe ist selbst eine Aussage. Man sieht einem Zettel an, ob einmal oder mehrfach nachgedrückt wurde, ohne ein Wort zu lesen. Ein einmal gesetzter Abdruck **verrutscht nicht mehr**, wenn ein weiterer daraufkommt.
- Beim Stempeln bewegt sich nichts: der Zettel ist so breit wie seine Spalte, der Stapel ändert daran nichts; er darf dafür in Stift und Papierrand ragen → [ADR-0007](docs/adr/0007-raster-statt-freiem-packen.md) (löst die Platzreservierung aus [ADR-0003](docs/adr/0003-der-stapel-haelt-seinen-platz-frei.md) ab).
- Gilt für **einen Durchlauf**: mit dem Erledigen fällt es weg (sonst wäre nach Wochen alles dringend).
- **Zurückgesetzt wird beim Erledigen, sonst nie** — auch bei **täglichen** Aufgaben. Ein nächtliches Zurücksetzen gibt es nicht. Der bewusst gezahlte Preis: wer eine tägliche Aufgabe morgens auf DRINGEND stempelt und sie mittags abhakt, verliert den Stapel sofort, obwohl der Tag noch läuft.
- **Projekte verlieren ihn gar nicht** — sie werden nie fertig, ihr Stapel bleibt stehen. Räumt jemand den Stapel von Hand ab, wechselt ihr **Projektspruch**.
- **Der Verfall folgt dem eigenen `task_type`, nicht dem Elternknoten.**
- Getragen von `tasks.emphasis_level`: **0** nur Grundabdruck, **1** WICHTIG, **2** DRINGEND (am Projekt: **1** und **2** tragen ebenfalls Sprüche, die Zahl bedeutet dasselbe). Die Verfallsregel steht im Code an **zwei** Stellen — Edge Function `complete-task` und optimistischer Pfad im Store. Beide verweisen hierher; wer eine ändert, ändert beide.
- Der **Grundabdruck** verfällt nicht — er wird berechnet und kommt von selbst wieder.
- Der Abdruck ist nur das Wort, ohne Kasten. Er darf in den Stift und über den Papierrand ragen; Tipps nimmt aber nur der eigene Stempelbereich an — Stift und Eselsohr behalten ihre Fläche.
- **Der Stempel ist zugleich Bedienelement und Anzeige.** Ein Tipp stempelt, Gedrückthalten öffnet weiterhin den **Kranz** — der Zettel bleibt auf ganzer Fläche Griff, gerade unten, wo der Daumen liegt.

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
- Ein aufgeklappter Zettel **teilt die Spalten** an seiner Stelle: was vor ihm hängt, bleibt, wo es ist; was nach ihm kommt, setzt sich unter ihm fort.
- Zuklappen stellt den vorigen Zustand wieder her.

### Befestigung
- Was einen **Zettel** an der Wand hält. Die Sorte hängt am Aufgabentyp: **Reißzwecke** (wiederkehrend, einmalig), **Klebestreifen** (täglich), **doppelte Büroklammer** (Projekt).
- Die Befestigung ist der **einzige Träger der Zuweisung**: Farbe der zuständigen Person, sonst neutral. Kein Rahmen, keine zweite Farbstelle — ein Zeichen, eine Aussage.
- Die Aussage gehört der Rolle, nicht der Form: **jede** Sorte trägt die Zuweisungsfarbe, sonst hätte ein Zettel je nach Typ verschieden viel zu sagen.

### wieder dreckig
- Manuelle Aktion: setzt eine erledigte Aufgabe wieder auf dran, obwohl die Kadenz noch läuft.
- Die Einschätzung des Haushalts hat Vorrang vor dem Zeitplan; die App setzt sie nicht zurück.
- Zwei Zugänge: der Knopf in der Erledigt-Liste und die Nadelstelle eines **losen Zettels** in der **Suche** — die Nadel, weil der Zettel damit zurück an die Wand kommt.

### Hauptaufgabe
- Aufgabe ohne Elternaufgabe (`parent_task_id` leer) — das, was als Zettel an der Wand hängt. Gegenbegriff: Unteraufgabe (Zettelchen).

### Duplikat
- Zwei nicht gelöschte **Hauptaufgaben** eines Haushalts mit demselben Titel. Gleich heißt: Leerraum am Rand egal, Leerraum innen zu einem Leerzeichen zusammengezogen, Groß-/Kleinschreibung egal.
- Gibt es nicht: der Haushalt soll eine Aufgabe wiederfinden und erledigen, statt sie ein zweites Mal anzulegen. Anlegen und Umbenennen weisen ein Duplikat ab, die Datenbank hält es mit einem eindeutigen Index fest.
- Unteraufgaben dürfen sich wiederholen („Am Projekt arbeiten" steht an jedem Projekt); gelöschte Aufgaben und damit alle **Quick-Aufgaben** zählen nicht.

### Suche
- Filtert die Pinnwand selbst: findet Hauptaufgaben über ihren Titel und die ihrer Unteraufgaben; wer nicht passt, verschwindet, die Spalten rücken auf.
- Ein **Treffer** ist ein voller Zettel mit allen Gesten der Wand — Abreißen, Kranz, Punktwahl, Zuweisen, Stempeln.
- Erledigte Treffer folgen nach den angepinnten als **lose Zettel**: ohne **Befestigung**, leicht verblasst. Ein Tipp an die Stelle der fehlenden Nadel ist **wieder dreckig** und pinnt sie an; Abreißen erledigt sie noch einmal.
- Passt der Suchbegriff genau auf eine bestehende Aufgabe (→ *Duplikat*), wird „Aufgabe erstellen" nicht angeboten.

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

### Quick-Aufgabe
- Etwas Erledigtes, das nicht an der Wand hing, nachträglich mit Titel und Punkten verbuchen — ohne Zettel.
- Zählt wie jede Erledigung: Punkte ins Wochenziel, Eintrag in der Historie.
- Technisch eine einmalige Aufgabe, die schon erledigt **und** gelöscht angelegt wird (`completed`, `deleted_at`), plus eine Erledigung mit `is_quick`. Deshalb nie als Zettel und nie unter **Erledigt**.

### Punkte
- Maß für die **Leistung** einer Erledigung: Zeit **und** Anstrengung zusammen, nicht reine Zeit. Eine kurze, eklige Aufgabe darf mehr zählen als eine lange, leichte.
- Anker: 1 Punkt ≈ 5 Minuten leichter Arbeit — der kleinste Wert, den eine Aufgabe haben kann. Nach oben **keine feste Grenze**.
- Die Skala eicht der Haushalt selbst über **Richtwerte** mit Beispielaufgaben, nicht über eine Formel: was wie viel wert ist, legt er gemeinsam fest und kann es jederzeit ändern.

### Umrechnung
- Kurs Punkte → Geld für die **Bilanz**: 1 Punkt Differenz ≈ 1 € als Startwert; der Haushalt kann ihn ändern.
- Die App schlägt damit bei einem **Ausgleich** in Geld den Betrag vor.
- Hergeleitet aus ~20 €/h und 12 Punkten/h (≈ 1,67 €/Punkt); halbiert, weil wer eine geteilte Aufgabe übernimmt, die Hälfte davon ohnehin selbst schuldet; aufgerundet zur Merkeinheit.
- Wann und womit ausgeglichen wird, entscheidet der Haushalt selbst.

### Standardpunkte
- Die **Punkte**, mit denen eine bestimmte Aufgabe bei jeder Erledigung zählt. Fehlen sie, ist die Aufgabe **unbewertet**.
- Nicht an einen **Richtwert** gebunden: ändert sich die Richtwert-Liste, behält jede Aufgabe ihre Standardpunkte.

### Richtwert
- Eine Punktzahl auf der Liste des Haushalts, mit Beispielaufgaben, die so viel wert sind. Die Liste ist die gemeinsame Eichung der Skala.
- Gepflegt vom Haushalt in der App; beliebige Werte, beliebig viele Beispiele je Wert.

### Schnelloption
- Ein **Richtwert**, der als Knopf in jeder Punktwahl erscheint. Daneben gibt es immer ein freies Feld für jede andere Zahl.
- Deaktivieren nimmt nur den Knopf weg — Richtwert und Beispiele bleiben.

### Abweichung
- Eine Erledigung, die mit anderen Punkten zählt als den **Standardpunkten** der Aufgabe („war viel dreckiger als sonst").
- Braucht **immer eine Begründung**. Die Standardpunkte ändern sich dadurch nicht.

### unbewertet
- Aufgabe ohne **Standardpunkte** — Zustand **jeder** Aufgabe nach dem Wechsel auf die neue Punkteskala, auch Projekte und Unteraufgaben → [ADR-0005](docs/adr/0005-skalenwechsel-per-stichtag-ohne-umrechnung.md).
- Lässt sich nicht erledigen, ohne erst bewertet zu werden: jeder Weg zum Erledigen (Abreißen, Kranz, Suche) öffnet zuerst die Punktwahl. Abbrechen erledigt nichts; der Zettel bleibt hängen.
- Der gewählte Wert werden die **Standardpunkte** der Aufgabe und gilt für alle künftigen Erledigungen — gefragt wird einmal je Aufgabe.

### Bilanz
- Offene Punktdifferenz zwischen zwei Haushaltsmitgliedern über die **ganze** Historie, minus alle **Ausgleiche** zwischen ihnen. Kein Zeitraum, kein Monatsschnitt.
- Gezählt wird die rohe Differenz, nicht der Anteil über der fairen Hälfte — deshalb ist die **Umrechnung** je Punkt halbiert.

### Ausgleich
- Eingetragene Gegenleistung, die die **Bilanz** um eine Punktzahl verringert: Geld, Aktivität, Überraschung oder Sonstiges.
- Wann ausgeglichen wird, legt die App nicht fest.
- Vorausgefüllt ist die ganze offene **Bilanz**; Teilausgleiche sind erlaubt.
- In Geld: die App schlägt den Betrag nach der **Umrechnung** vor; der Haushalt darf sich auf mehr oder weniger einigen. Punkte und gezahlter Betrag sind dann **unabhängig** — die Punkte gleichen die Bilanz aus, der Betrag hält fest, was tatsächlich floss, auch wenn sich der Kurs später ändert. Ein Kommentar ist möglich.
- In der Bilanz-Übersicht steht kein Geld — Euro erscheint erst, wenn ausgeglichen wird.
- **Verrechnen mit dem Haushaltstopf** ist eine Art des Ausgleichs: wer in der Bilanz hinten liegt, aber im **Haushaltstopf** Geld gut hat, gleicht Punkte gegen dieses Guthaben aus. Es entstehen zugleich ein Ausgleich (Punkte) und eine **Rückzahlung** im Haushaltstopf (Euro nach der **Umrechnung**, vor dem Speichern änderbar). Beide Salden bleiben getrennt und in ihrer eigenen Einheit.
- Töpfe für einen Anlass haben mit der Bilanz nichts zu tun.

### Topf
- Ein Kreis von Teilnehmern, die untereinander Ausgaben festhalten; jede Ausgabe gehört zu genau einem Topf, jeder Topf hat seinen eigenen Saldo.
- Der **Haushaltstopf** ist immer da und hat genau die Haushaltsmitglieder als Teilnehmer — nie Gäste.
- Daneben beliebig viele Töpfe für einen Anlass (Urlaub, Feier), in die auch Gäste kommen dürfen.
- Anteile gelten je Teilnehmer, nicht als „mein Teil, dein Teil“.
- Ein Topf für einen Anlass lässt sich **abschließen**: danach schreibgeschützt, unter „Abgeschlossen“ einsortiert; sein **Gastlink** zeigt nur noch den Endstand. Löschen geht zusätzlich. Der Haushaltstopf wird nie abgeschlossen.
- Gerechnet wird nur in Euro; wer in fremder Währung zahlt, rechnet vor dem Eintragen selbst um.
- Gäste tragen sich beim ersten Öffnen selbst als Teilnehmer ein oder wählen ihren Namen. Ein Name, den es im Topf schon gibt (Groß-/Kleinschreibung egal), wird abgewiesen.
- **Das Sagen haben die Haushaltsmitglieder**, nie Gäste — das einzige Recht, das ohne Anmeldung wirklich etwas sichert.
- Sonst darf jeder Teilnehmer jede Ausgabe und Rückzahlung bearbeiten und löschen; jeder Eintrag zeigt, wer ihn zuletzt geändert hat.

### Kasse
- Der Bereich der App für Statistik, **Ausgleich** und **Töpfe** — vormals „Übersicht“.

### Ausgabe
- Ein Betrag, den ein Teilnehmer eines **Topfs** bezahlt hat, mit Datum, Beschreibung und **Aufteilung**.

### Aufteilung
- Wer an einer **Ausgabe** wie viel trägt.
- Schnell: gleich auf eine ausgewählte Teilmenge oder gleich auf die **ganze Gruppe**.
- Erweitert: Verhältnisse, Prozente oder genaue Beträge je Person.

### ganze Gruppe
- Aufteilung, die nicht an die heutigen Teilnehmer gebunden ist, sondern an den Topf: tritt jemand bei, trägt er an solchen Ausgaben mit.
- Das geschieht nicht still — ein Haushaltsmitglied bestätigt es erst (Gäste können das nicht, → *Topf*).
- Bestätigt wird nur für die Ausgaben von vor dem Beitritt; was danach auf die ganze Gruppe eingetragen wird, trägt der Neue sofort mit.
- Eine Ablehnung ist endgültig: der Neue trägt die früheren Ausgaben nie, die Meldung kommt nicht wieder.

### Rückzahlung
- Geld, das ein Teilnehmer einem anderen im selben **Topf** überwiesen hat; senkt den Saldo zwischen beiden. Keine **Ausgabe**, steht aber in derselben Liste.
- Der Topf schlägt vor, wer wem wie viel überweist, mit möglichst wenigen Überweisungen; ein Tipp auf einen Vorschlag trägt die Rückzahlung vorausgefüllt ein.

### Gastlink
- Link, der **genau eine** Liste oder **genau einen** Topf für Menschen außerhalb des Haushalts öffnet. Wer zwei Dinge teilen will, verschickt zwei Links.
- Wer den Link hat, darf mitarbeiten — keine Anmeldung, kein Konto. Der Link selbst ist der Schlüssel.
- Ein Haushaltsmitglied kann ihn **erneuern** (der alte ist sofort tot) oder die Freigabe **beenden**. Ein Ablaufdatum gibt es nicht.

### Gast
- Mensch ohne Haushaltsmitgliedschaft, der über einen **Gastlink** mitarbeitet.
- Sagt selbst, wer er ist: der Browser merkt es sich; hat er es vergessen, wählt man sich beim Öffnen des Links neu aus. **Vertrauensbasis** — niemand prüft, ob die Wahl stimmt.
- Sieht nur, was sein Link öffnet, nie etwas anderes vom Haushalt.
- Gefragt, wer er ist, wird er nur in einem **Topf** — dort hängt Geld an einer Person. Auf einer Liste hakt er ab und trägt ein, ohne Namen.
- Arbeitet nur mit Netz; eine Offline-Warteschlange gibt es für Gäste nicht (sie hat keinen **Besitzer**).

### Wochenziel
- Punktzahl, die der Haushalt sich gemeinsam für eine Woche vornimmt; gehört dem Haushalt, jedes Mitglied darf sie ändern.
- Gemessen gegen die Summe aller Erledigungen der laufenden Woche: **ein** Balken für alle, ein Farbsegment je Mitglied.
- Ausdrücklich **keine Rangliste** — die Farbanteile beantworten „wer hat was gemacht", nie „wer liegt vorn".
- Keine Historie, immer nur die laufende Woche:
  - geänderte Zielzahl gilt sofort,
  - geänderter Wochenstart erst ab nächster Woche — sonst verschwänden gesammelte Punkte scheinbar.

### Zettel
- Eine einzelne Aufgabe auf der Pinnwand: ein Stück Papier an der Wand.
- Das Papier trägt den Typ: wiederkehrend, täglich, einmalig und Projekt sehen unterschiedlich aus.
- Immer **genau eine** Aufgabe; hat ein **Eselsohr** und lässt sich **abreißen**.

### langer Zettel
- Papier, auf dem eine **Liste** steht (Einkauf, Packliste, To-do) — nicht die Liste selbst, sondern ihre Hülle: Kante, Linien, Kopfzeile.
- Trägt **viele** Einträge, hat kein Eselsohr, wird nicht abgerissen.
- Gegenbegriff zum **Zettel**: Aufgabe an der Wand vs. Liste auf einem Screen — gleiche Papier-Optik, weder Inhalt noch Gesten geteilt.

### Kategorie (Listen)
- Dauerhaftes Objekt je Liste — eigene Zeile in `shopping_categories`, `packing_categories` oder `todo_categories` (PK `category_id`), nicht bloß ein Textfeld am Eintrag.
- Kopplung zu Einträgen/Produkten läuft über den **Namen**, nicht über eine Fremdschlüsselspalte: getrimmt, groß-/kleinschreibungsunabhängig verglichen (`normalizeCategoryName`), `lower(name)` ist je Liste eindeutig (DB-Index). Namensgleichheit **ist** Zugehörigkeit → [ADR-0004](docs/adr/0004-kategorien-als-entitaet-kopplung-ueber-namen.md).
- `NULL` bedeutet „**Unkategorisiert**" — keine eigene Zeile, kein Name.
- Sektionen einer Liste ordnen sich nach Zustand: Rang 0 **aktiv** (mindestens ein offener Eintrag) → Rang 1 **vollständig** (nur erledigte) → Rang 2 **leer**. Innerhalb eines Rangs steht „Unkategorisiert" **zuletzt**.
- Kategorie-Mutationen (anlegen, umbenennen, löschen, Einträge umhängen) laufen über dieselbe Offline-Warteschlange wie Einträge. Kollidiert beim Sync ein Name mit einer bereits bestehenden Zeile (zwei Geräte legen offline denselben Namen an, oder eine Umbenennung trifft eine vorhandene Kategorie), **verschmelzen** beide zu einer Zeile statt eines Fehlers.
- Gilt gleichermaßen für Einkauf, Packliste und To-do — dieselbe Tabellenform, derselbe Vergleicher (`compareCategoryGroups`), unterschiedlich nur die Wortwahl der Oberfläche.

### Besitzer (Warteschlange)
- Konto **und** Haushalt, denen eine ungesendete Offline-Änderung gehört (`queueOwner`).
- Gesendet wird nur, solange genau dieser Besitzer angemeldet ist; sonst wartet sie auf dem Gerät. Wer abmeldet, verliert nichts — derselbe Besitzer reicht sie beim nächsten Anmelden nach.
- Sonst landete die Änderung mit der `household_id` des Nachfolgers in dessen Haushalt.

### Altbestand (Warteschlange)
- Ungesendete Offline-Änderungen ohne **Besitzer** — gespeichert, bevor Warteschlangen an Konto und Haushalt gebunden waren.
- Übernommen wird er nur von einem Haushalt, dem jede darin genannte Liste gehört; sonst bleibt er unangetastet liegen.

### Neuabgleich
- Nach einem Durchlauf der Warteschlange den Stand einer Liste neu vom Server holen — wenn sie leer ist oder etwas verworfen wurde.
- Zeilen mit noch wartender Änderung behalten ihren lokalen Stand; eine verworfene Änderung verschwindet dabei aus der Anzeige.
- Ein Neuabgleich stößt selbst keinen Durchlauf an: der eben fertige hat alles versucht.

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
- Verfällt **nicht** von selbst: verschwindet erst beim Verlassen der Pinnwand oder beim Neuladen.
- Es hängt immer nur **einer** — ein neuer Abriss ersetzt den vorigen, der ältere ist damit endgültig.

### Zurückkleben
- Tipp auf den Fetzen macht die Erledigung rückgängig: Aufgabe zurück an die Wand, Punkte raus aus dem Wochenziel.
- Die Erledigung wird aus der Historie **gelöscht** statt gegengebucht — sie hat nicht stattgefunden.
- Nicht zu verwechseln mit **wieder dreckig** im Erledigt-Streifen: das setzt erneut auf „dran", **behält** aber die Punkte.
