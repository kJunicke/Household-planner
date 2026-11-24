# Satzkatalog Stufe 1: Ergebnisse

Katalog: [assistent-satzkatalog.md](assistent-satzkatalog.md). Je Lauf ein Abschnitt; der neueste ersetzt
den vorigen.

## Lauf vom 24.11.2026, nach dem Korrekturdurchgang

Gegen die deployte Edge Function `assistant` (Haiku), durch die Oberfläche des Dev-Servers, als QC 1 im
`QC-Test-Haushalt`. Vor jedem Durchgang wurde der Haushalt auf die Ausgangslage des Katalogs
zurückgestellt (Reste des ersten Laufs entfernt). Erfasst je Satz: Werkzeugaufrufe aus den Antworten
der Function, die Toasts mit Rückgängig-Knopf aus dem Toast-Store, der Chattext und nach jeder
Änderung beim Schließen des Chats die Zeilen mit `assistant-flash`. Rückgängig lief über die Aktion
des Toasts.

- **Desktop** (1512 px), Function Version 6; Fehlläufer danach mit Version 7 und 8 wiederholt. Nach
	C4 hing die Bildschirmaufnahme des Tabs; der Lauf ging in einem neuen Tab weiter, mit neuem
	Gespräch.
- **Handybreite** (`body` per injiziertem Stil auf 390 px geklemmt, Höhe = Fenster), Version 8,
	H1 bis H4 mit Version 9 wiederholt.
- **R1** (Verlauf nach 30 Minuten) nicht wiederholt: die Uhr dafür lässt sich im Tab nicht vorstellen,
	und der Code ist seit dem ersten Lauf unverändert (dort ✓).

### Zählung

| | Sätze | Erwartete Reaktion | Falsch zugeordnet | Antwort mit falscher Aussage |
| --- | --- | --- | --- | --- |
| Desktop, Version 6 | 73 | 69 | 4 (J2, M3, O4, Q1) | 5 (B2, F1, H3, H4, J3) |
| Desktop, die 9 wiederholt, Version 7/8 | 9 | 9 | 0 | 0 |
| Handybreite, Version 8/9 | 73 | 73 | 0 | 5 (H3, H4, O7, P2, Q2) |

- **Jede Änderung hatte einen eigenen Toast mit Rückgängig**, auf beiden Breiten; keine zweite
	Meldung des Stores daneben (neue Liste, Kopie, neue Kategorie im Einkauf, Zurücksetzen).
- **Aufleuchten:** jede Änderung, jetzt auch gekaufte Artikel (C1 bis C4) und Einträge in einer
	eingeklappten Kategorie (die Kategorie klappt auf, Screenshot gesehen). Zurückgenommenes leuchtet
	nicht.
- **Rückgängig geprüft:** wieder geöffnetes Ei (Kaufzähler 4 bleibt 4, Datum gleich, auch in der
	Datenbank), abgehakte Haferflocken (Zähler und Datum wie vorher), kleinere Menge bei gepackten
	Handschuhen (3/3 → 1/1 → 3/3), Zurücksetzen von QC2 Todo (genau „Rasen“ wieder abgehakt), Kopie,
	umbenannter Artikel, gelöschter Eintrag, gelöschte To-do-Liste, gelöschte Einkaufsliste mit
	Artikeln (dieselben IDs, Kaufzähler), gelöschte Notiz.
- **Karten:** L2 nennt den Gastlink von QC2 Todo („endet und kommt mit Rückgängig nicht zurück“),
	abgebrochen. Eine Notiz von QC 2, von QC 1 gelöscht: die Karte sagt, dass sie unter seinem Namen
	zurückkäme; nach Rückgängig steht sie so da.
- **Einstellungen:** öffnen sich hinter dem Chat (der Chat bleibt oben, Screenshot gesehen) und
	schließen sich, sobald der Assistent auf eine andere Seite führt.

### Korrekturen und Wiederholung

| Satz | Was falsch lief | Korrektur | Wiederholt |
| --- | --- | --- | --- |
| J2 | Einträge erst in eine neue Kategorie verschoben, dann umbenannt | Beschreibungen `update_checklist_entries` und `rename_checklist_category` | `rename_checklist_category` allein ✓ |
| M3 | „Notier dir …“: Rückfrage statt neuer Notiz | Beschreibung `create_note` | `create_note` ✓ |
| Q1 | „Fenster putzen ist erledigt“ als Aufgabe der Pinnwand abgelehnt | Systemprompt: erst To-do- und Packlisten lesen | liest, fragt Fenster oder Fenster innen putzen ✓ |
| O4 | kein `go_to_page`, behauptete, die Einstellungen seien offen | Systemprompt: offene Seite nie annehmen, jedes Mal hinführen | `go_to_page` einstellungen ✓ |
| B2, F1 | erwähnte ungefragt Zurückgenommenes | Systemprompt: nur für dich, nicht erwähnen | ✓ |
| J3 | erfand Einträge, die aus der leeren Kategorie gefallen seien | Ergebnis sagt „Sie war leer“ | ✓ |
| H3, H4 | nannte eine richtige ID „geraten“ | Systemprompt: auch frühere Ergebnisse, Verlauf ist gekürzt | in kurzem Gespräch ✓, in langem noch (!) |
| alle | wechselte zu „Sie“ | Systemprompt: „du“ | ✓ |

### Offen

- **Haiku korrigiert sich in langen Gesprächen falsch** (H3, Q2 auf Handybreite, ab etwa 30 Fragen):
	es nennt eigene richtige Schritte geraten oder erfunden. Die Werkzeugaufrufe stimmen dabei. Der
	Verlauf wird auf 24 Nachrichten gekürzt; die Ergebnisse, aus denen eine ID stammte, fallen heraus.
	Kein Fall von Falschzuordnung, also kein Anlass für Sonnet (D16), aber Kandidat für die Frage, wie
	der Verlauf gekürzt wird.
- P2 „das kannst du noch nicht“ (statt „ich“); O7 lässt `go_to_page` aus, weil die Einstellungen
	tatsächlich offen sind.
- Rückgängig ohne Netz scheitert weiter bei allem, was direkt schreibt (Pack- und To-do-Listen,
	Notizen, gelöschte Listen); der Toast sagt jetzt „Rückgängig ging nicht, keine Verbindung. Es
	bleibt: …“.
