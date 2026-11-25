# Satzkatalog Stufe 2: Ergebnisse

Katalog: [assistent-satzkatalog.md](assistent-satzkatalog.md), ganz (Stufe 1 und die Abschnitte S und T).
Je Lauf ein Abschnitt; der neueste ersetzt den vorigen.

## Lauf vom 25.11.2026

Gegen die deployte Edge Function `assistant` (Haiku), durch die Oberfläche des Dev-Servers, als QC 1 im
`QC-Test-Haushalt`. Vor jeder Breite wurde der Haushalt per SQL auf die Ausgangslage des Katalogs
zurückgestellt (Reste von Stufe 1 entfernt, QC-Raster Bad, Küche und Fenster unbewertet, QC Keller
aufräumen weich gelöscht). Erfasst je Satz: Werkzeugaufrufe aus den Antworten der Function, die Toasts
mit Rückgängig-Knopf, der Chattext, das Wochenziel aus dem Store und beim Schließen des Chats die
Einträge mit `assistant-flash`. Rückgängig lief über den Knopf im Toast.

- **Desktop** (1512 px), Version 13, ein Gespräch; die Fehlläufer mit Version 14 in einem neuen
	Gespräch wiederholt.
- **Handybreite** (`html` per injiziertem Stil auf 390 px geklemmt, `transform` hält auch die festen
	Leisten, den Chat und die Toasts darin), Version 14 bis O10, ab dort Version 15, ein Gespräch; dazu
	N und O mit Version 15 in einem frischen Gespräch.
- **R1** (Verlauf nach 30 Minuten) nicht wiederholt, Code unverändert seit Stufe 1.

### Zählung

| | Sätze | Erwartete Reaktion | Falsch zugeordnet |
| --- | --- | --- | --- |
| Desktop, Version 13 | 96 | 91 | 5 (N1, Q1, T2, T5, T9) |
| Desktop, Fehlläufer wiederholt, Version 14 | 8 | 8 | 0 |
| Handybreite, Version 14/15, ein Gespräch (O doppelt) | 108 | 95 | 13 (O1 bis O10 mit Version 14; O6, O8, O9 mit Version 15) |
| Handybreite, N, O und T6b frisch, Version 15 | 14 | 14 | 0 |

- **Keine Erledigung bei einem anderen Mitglied oder ohne Punkte**: alle Erledigungen beider Läufe
	stehen in `task_completions` bei qc-agent mit Punkten (SQL geprüft). T6, O10 und T6b (Quick-Aufgabe
	für qc-agent-2) lehnt er ab.
- **Rückgängig im Toast geprüft:** Anlegen (S2), Zuweisen (S5: wieder niemand zuständig, auch nach
	T5b wieder qc-agent-2), Verschieben (S6: wieder dran), wieder dreckig (S8, beide Breiten: wieder
	erledigt, Wochenziel gleich), Löschen der Aufgabe (S11: derselbe Zettel zurück, Wochenziel bleibt
	die ganze Zeit), Erledigen (T3b: Küche wieder dran und unbewertet, Wochenziel −4), Quick-Aufgabe (T4:
	−6), dazu aus Stufe 1 Zurücksetzen (H4: genau „Rasen“), Kategorie (A6), Notiz, To-do-Liste.
- **Aufleuchten** beim Schließen auf der Pinnwand: neue, zugewiesene, verschobene, erledigte Zettel und
	Zeilen im Erledigt-Streifen, Projekt-Arbeit am Projektzettel.
- **Handybreite angesehen:** Lösch-Karte im Chat, Toast über der Pinnwand, Wand mit zugewiesenem
	Zettel in qc-agent-2s Farbe.

### Korrekturen

| Satz | Was falsch lief | Korrektur | Wiederholt |
| --- | --- | --- | --- |
| N1 | `go_to_page` ohne `get_app_guide`, als Ablehnung behandelt | Systemprompt: eine Frage nach dem Wo ist keine Bitte zu ändern | ✓ |
| Q1 | hakte „Fenster“ ab, ohne nach „Fenster innen putzen“ und QC-Raster Fenster zu fragen | Systemprompt: Gemeldetes auf Listen und Pinnwand suchen, Treffer per Teilwort, nur bei einem handeln | ✓ |
| T2 | erledigte QC-Raster Fenster, ohne nach den Listeneinträgen zu fragen | wie Q1 | ✓ |
| T5 | lehnte ab, weil QC Keller aufräumen qc-agent-2 zugewiesen ist | Systemprompt: zugewiesen heißt zuständig, erledigen darf jeder | ✓, dazu T5b ✓ |
| T9 | erledigte das schon erledigte Bad mit `again`, ungefragt | Werkzeugergebnis und Beschreibung von `again`: erst fragen | ✓ |
| T7b | schrieb „Pinnwand“ (die Antwort auf die Rückfrage) in die Begründung | Beschreibung von `note` | ✓ (Handy) |
| O1 bis O10 | mit Version 14 fragte er „Soll ich dich hinbringen?“ statt hinzuführen: die N1-Korrektur färbte ab | Systemprompt: eine Ablehnung führt sofort hin | Version 15 ✓ |

### Offen

- **Lange Gespräche (!)**: auf Handybreite, nach rund 90 Fragen, ließ er bei O6, O8 und O9 `go_to_page`
	aus (O8, O9: „die Einstellungen sind schon offen“) oder fragte erst. Im frischen Gespräch alle zehn
	richtig. Wie Stufe 1 (O7): ein Fall für das Kürzen des Verlaufs, nicht für Sonnet.
- H2 auf Handybreite: erst `mark_shopping_items_purchased` mit der ID eines To-do-Eintrags (abgewiesen),
	dann richtig `check_checklist_entries`; H2/H3 nannten eigene richtige Schritte falsch (Stufe-1-Befund).
- S3 bot an, die bestehende Aufgabe „zu ändern“; ein Werkzeug zum Bearbeiten von Aufgaben gibt es nicht.
- T9 nennt nicht, wann die Aufgabe erledigt wurde.
- Aufleuchten: der Pfeffer leuchtete nach zurückgenommener Kategorie (A6) trotzdem; auf Desktop blieb
	einmal (nach A4 bis A7) das Aufleuchten ganz aus, auf Handybreite nicht wieder aufgetreten.
- F2, G2 und N3 fragen seit E6 zu Recht nach QC Zelten oder Zelten Sommer; der Katalog erwartet das jetzt.

## Lauf vom 25.11.2026, nach dem Fix-Durchgang

Abschnitte S (mit den neuen S13 bis S15 für `update_task`) und T ganz, dazu N, O, Q und die berührten
A6 und H2; gegen Version 16 der Edge Function, als QC 1 über den Dev-Server, je Breite ein frisches
Gespräch (Seite neu geladen). Ohne SQL-Rückstellung: die Ausgangslage kam von Hand über den Store
(QC Keller aufräumen gelöscht, QC-Raster Fenster und vor T auch QC-Raster Bad wieder dreckig, Küche
wieder ohne Intervall). Bad und Fenster sind seit dem ersten Lauf bewertet (5 und 3), darum erledigt T1
das Bad gleich mit 5 Punkten, statt nach Punkten zu fragen; die unbewertete Küche (T3) deckt das ab.

| | Sätze | Erwartete Reaktion | Falsch zugeordnet |
| --- | --- | --- | --- |
| Desktop (1512 px) | 51 | 50 | 1 (T7b) |
| Handybreite (390 px), nach der T7b-Korrektur | 51 | 47 | 4 (T5, N4, O1, O3) |

- **Neu und bestanden:** `update_task` (S13 Titel und Punkte, Rückgängig: wieder QC Keller aufräumen
	mit 8; S14 Intervall 14, bleibt unbewertet; S15 Projekt abgelehnt), beide Breiten.
- **Aufleuchten:** S11 Rückgängig nach dem Löschen holt QC-Raster Bad zurück, es leuchtet beim
	Schließen auf (Desktop, Chat offen) und sofort (Handy, Chat schon zu). T4 führt in den Verlauf, die
	Quick-Aufgabe leuchtet dort. A6: nach dem Rückgängig des Artikels leuchtet Pfeffer nicht mehr (auf
	dem Handy mit der neuen Kategorie „Scharfes“, weil Gewürze schon bestand).
- **T9** nennt jetzt, wann („heute schon erledigt“), beide Breiten; S1 nennt es auch.
- **S11 und S12:** die Karte sagt „Rückgängig nur, solange keine neue Aufgabe so heißt“.
- **H2** stand schon erledigt; kein falsches Werkzeug mehr, nur `read_checklist`.
- Rückgängig im Toast: S2, S5, S6, S8, S11, S13, T3b (Küche wieder unbewertet, −4), T5b. T4 nicht:
	der Toast war nach dem Bildschirmfoto abgelaufen.

| Satz | Was falsch lief | Korrektur | Wiederholt |
| --- | --- | --- | --- |
| T7b | Notiz „Die Pinnwand war extrem dreckig nach der Party“ | Beschreibung von `note`: ohne Angabe, welche Aufgabe gemeint ist | Handy ✓ |
| T5 | Handy: erledigte QC Keller aufräumen auf „Keller entrümpelt“ ohne Rückfrage (Desktop fragte) | offen | – |
| N4 | Handy: richtige Antwort, aber ohne `get_app_guide` | offen | – |
| O1 | Handy: führte hin, sagte aber nur „Die Seite ist geöffnet“, nicht, dass es von Hand geht | offen | – |
| O3 | Handy: korrigierte ungefragt eine erfundene Bedingung aus O2 | offen | – |

N4, O1 und O3 fielen nach rund 45 Fragen im selben Gespräch, wie die bekannten Ausfälle langer
Gespräche.
