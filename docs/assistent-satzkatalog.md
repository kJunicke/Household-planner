# Satzkatalog des Assistenten

Echte Sätze, an denen sich zeigt, ob Haiku jeden Wunsch dem richtigen Werkzeug zuordnet, ablehnt,
was der Assistent nicht tun darf, und nachfragt, wo ein Satz mehrdeutig ist. Je Stufe des Assistenten
läuft der Katalog einmal gegen die deployte Edge Function `assistant` und durch die Oberfläche
(QC-Testhaushalt, Desktop und Handybreite); die Ergebnisse stehen je Lauf in einer eigenen Datei
daneben. Kommt ein Werkzeug dazu, kommen hier Sätze dazu.

## Wie gelesen wird

- **Reihenfolge zählt.** Die Sätze laufen von oben nach unten in einem Gespräch (bis auf die
	Trennlinie in Abschnitt R); spätere Sätze bauen auf dem Stand auf, den frühere hinterlassen.
- **Erwartet** nennt das Werkzeug (oder mehrere, in Reihenfolge), die Ablehnung oder die Rückfrage.
	Ein vorgeschaltetes Lesewerkzeug (`read_shopping_list`, `read_checklist`, `read_note`) ist immer
	erlaubt, auch wo es nicht steht; ein zusätzliches schreibendes Werkzeug nicht.
- **Jede Änderung** braucht einen eigenen Toast mit Rückgängig-Symbol, die App folgt dahinter auf
	die Seite, und beim Schließen des Chats leuchtet der Eintrag auf. Ein Lösch-Werkzeug zeigt erst die
	Karte mit „Löschen“ und „Abbrechen“.
- **Ablehnen** heißt: kein schreibendes Werkzeug, ein Satz, dass das von Hand geht und wo, und
	`go_to_page` dorthin (Ausgleich und Umrechnung → `kasse_ausgleich`, Einstellungen und Gastlinks →
	`einstellungen`). **Noch nicht können** (Aufgaben und Töpfe vor Stufe 2 und 3, fehlende
	Werkzeuge) heißt: kein Werkzeug, das etwas anderes ändert, und ein Satz, dass das (noch) nicht geht;
	`go_to_page` zur passenden Seite ist erlaubt.
- **Rückfragen** heißt: kein schreibendes Werkzeug, eine Frage, die die Möglichkeiten nennt. Der
	Folgesatz in der Zeile darunter beantwortet sie.
- Einige Sätze sind diktiert: klein, ohne Satzzeichen, mit Füllwörtern und Zahlwörtern, so wie die
	Tastatur des Handys sie schreibt.

## Ausgangslage im QC-Testhaushalt (Stand Stufe 1)

Mitglieder `qc-agent` (fragt) und `qc-agent-2`.

- Einkaufslisten: **QC2 Einkauf** (u. a. offen Butter, Haferflocken ×2, Milch, Pfeffer, Zwieback,
	Seife, Zucker ×2, Apfel ×3; gekauft Ei, Brot, Hafermilch) und **QC Drogeriemarkt** (leer).
- Packliste **QC Zelten** (Zelt, Schlafsack). To-do-Liste **QC2 Todo** (Fenster, Fenster innen
	putzen, Rasen erledigt).
- Notizen: „Geschenkideen“, „QC Denkblock-Test“, „Handwerker“ (Elektriker Montag 9 Uhr, Maler …),
	„Urlaub Kreta“ (Koffer packen, Pässe prüfen).

Weicht der Stand ab, die Sätze sinngemäß anpassen und das im Ergebnis vermerken.

## A. Einkauf: Artikel hinzufügen (`add_shopping_items`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| A1 | Setz Milch und zwei Packungen Eier auf QC2 Einkauf | `add_shopping_items` auf QC2 Einkauf: Milch (schon offen, bleibt), Ei ×2 (war gekauft, wird wieder geöffnet) |
| A2 | auf die drogerie liste bitte zahnpasta und drei duschgel | `add_shopping_items` auf QC Drogeriemarkt: Zahnpasta, Duschgel ×3 |
| A3 | Wir brauchen noch Klopapier fürn Drogeriemarkt | `add_shopping_items` auf QC Drogeriemarkt: Klopapier |
| A4 | Kannst du Tomaten auf die Einkaufsliste schreiben | Rückfrage: welche der zwei Einkaufslisten |
| A4b | die qc2 | `add_shopping_items` auf QC2 Einkauf: Tomate |
| A5 | setz bitte zwölf brötchen komma senf und äh zwei gurken auf qc2 einkauf | `add_shopping_items`: Brötchen ×12, Senf, Gurke ×2 |

## B. Einkauf: lesen (`read_shopping_list`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| B1 | Was steht noch auf der Drogerieliste? | `read_shopping_list` QC Drogeriemarkt; Antwort nennt Zahnpasta, Duschgel ×3, Klopapier |
| B2 | brauchen wir noch butter | `read_shopping_list` (eine oder beide Listen); Antwort: ja, auf QC2 Einkauf |

## C. Einkauf: abhaken (`mark_shopping_items_purchased`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| C1 | Hab die Butter gekauft | `mark_shopping_items_purchased`: Butter |
| C2 | zahnpasta und duschgel sind gekauft | `mark_shopping_items_purchased`: Zahnpasta, Duschgel |
| C3 | Ich hab Haferflocken und den Senf geholt | `mark_shopping_items_purchased`: Haferflocken, Senf |

## D. Einkauf: löschen (`delete_shopping_items`, Karte)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| D1 | Der Zwieback kann von der Liste runter | `delete_shopping_items` Zwieback → Karte → „Löschen“ → Toast mit Rückgängig |
| D2 | Lösch den Pfeffer | `delete_shopping_items` Pfeffer → Karte → „Abbrechen“ → nichts gelöscht, Antwort sagt das |

## E. Listen anlegen und umbenennen (`create_list`, `rename_list`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| E1 | Leg eine Packliste Skiurlaub an | `create_list` packing „Skiurlaub“ |
| E2 | neue einkaufsliste für den baumarkt | `create_list` shopping „Baumarkt“ |
| E3 | Mach mir eine To-do-Liste Umzug und setz Kartons besorgen und Strom ummelden drauf | `create_list` todo „Umzug“, dann `add_checklist_entries` auf die neue Liste (ID aus dem Ergebnis): Kartons besorgen, Strom ummelden |
| E4 | Benenn die Liste Baumarkt um in Bauhaus | `rename_list` Baumarkt → Bauhaus |
| E5 | Was steht auf der Umzug-Liste? | `read_checklist` Umzug (jetzt in der Übersicht); Antwort nennt beide Einträge |

## F. Packliste und To-do: Einträge hinzufügen (`add_checklist_entries`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| F1 | Pack Skischuhe, Helm und zwei Paar Handschuhe auf die Skiurlaub-Liste | `add_checklist_entries` Skiurlaub: Skischuhe, Helm, Handschuhe ×2 |
| F2 | auf die zelten liste noch isomatte unter kategorie schlafen | `add_checklist_entries` QC Zelten: Isomatte, Kategorie Schlafen (neu) |
| F3 | Ich muss noch Müll rausbringen, schreib das auf die To-do-Liste | Rückfrage: QC2 Todo oder Umzug |
| F3b | auf qc2 todo | `add_checklist_entries` QC2 Todo: Müll rausbringen |

## G. Einträge ändern (`update_checklist_entries`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| G1 | Mach aus den Handschuhen drei Paar | `update_checklist_entries`: Handschuhe Menge 3 |
| G2 | Sortier Zelt und Schlafsack auf der Zelten-Liste in die Kategorie Schlafen | `update_checklist_entries`: Zelt, Schlafsack → Kategorie Schlafen |
| G3 | benenn auf der umzug liste strom ummelden um in strom und gas ummelden | `update_checklist_entries`: Name „Strom und Gas ummelden“ |

## H. Abhaken und wieder öffnen (`check_checklist_entries`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| H1 | Helm ist gepackt | `check_checklist_entries` Helm |
| H2 | Kartons besorgen ist erledigt | `check_checklist_entries` Kartons besorgen |
| H3 | Der Helm ist doch noch nicht eingepackt | `check_checklist_entries` Helm, `done: false` |

## I. Einträge löschen (`delete_checklist_entries`, Karte)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| I1 | Streich die Skischuhe von der Skiliste, die leih ich mir | `delete_checklist_entries` Skischuhe → Karte → „Löschen“ |

## J. Kategorien (`create_checklist_category`, `rename_checklist_category`, `delete_checklist_category`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| J1 | Leg auf der Skiurlaub-Liste eine Kategorie Kleidung an | `create_checklist_category` Skiurlaub „Kleidung“ |
| J2 | Benenn die Kategorie Schlafen in Schlafzeug um | `rename_checklist_category` QC Zelten: Schlafen → Schlafzeug |
| J3 | Lösch die Kategorie Kleidung auf der Skiliste | `delete_checklist_category` (ohne Einträge) → Karte → „Löschen“ |

## K. Notiz zur Liste (`set_list_note`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| K1 | Schreib in die Notiz der Skiurlaub-Liste: Skipass online kaufen | `set_list_note` Skiurlaub, nicht `create_note` |

## L. Ganze Liste löschen (`delete_checklist`, Karte)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| L1 | Die Umzug-Liste brauchen wir nicht mehr, weg damit | `delete_checklist` Umzug → Karte (nennt die Einträge) → „Löschen“ → Toast; Rückgängig bringt sie mit Einträgen zurück |

## M. Notizen (`read_note`, `create_note`, `append_to_note`, `rewrite_note`, `delete_note`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| M1 | Was steht in der Handwerker-Notiz? | `read_note` Handwerker; Antwort gibt den Inhalt wieder |
| M2 | Wann kommt der Elektriker? | `read_note` Handwerker (oder aus M1); Antwort: Montag um 9 |
| M3 | Notier dir bitte: Müllabfuhr ist ab jetzt donnerstags | `create_note` „Müllabfuhr ist ab jetzt donnerstags“ |
| M4 | schreib in die notiz geschenkideen noch puzzle für tim | `append_to_note` Geschenkideen: „Puzzle für Tim“ |
| M5 | In der Kreta-Notiz bitte Pässe prüfen ersetzen durch Reisepässe verlängern | `read_note`, dann `rewrite_note` Urlaub Kreta mit ersetzter Zeile, Rest unverändert |
| M6 | Neue Notiz Urlaub Ski, darunter Hütte buchen | `create_note` „Urlaub Ski\nHütte buchen“ |
| M7 | Schreib in die Urlaubsnotiz noch Sonnencreme | Rückfrage: Urlaub Kreta oder Urlaub Ski |
| M7b | Ski | `append_to_note` Urlaub Ski: Sonnencreme |
| M8 | Lösch die Notiz QC Denkblock-Test | `delete_note` → Karte → „Löschen“ → Toast; Rückgängig bringt sie zurück |

## N. Anleitung und Navigation (`get_app_guide`, `go_to_page`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| N1 | Wo stelle ich das Wochenziel ein? | `get_app_guide`; Antwort: Einstellungen (Logo oben rechts), Angebot hinzuführen; noch kein `go_to_page` |
| N2 | ja bring mich hin | `go_to_page` einstellungen |
| N3 | Zeig mir die Packliste Zelten | `go_to_page` packlisten mit der ID von QC Zelten |
| N4 | Wie hake ich im Laden was ab? | `get_app_guide`; Antwort: Tipp auf den Eintrag |

## O. Ablehnen: Ausgleich, Einstellungen, Gastlinks, für andere

| Nr | Satz | Erwartet |
| --- | --- | --- |
| O1 | Trag ein, dass qc-agent-2 mir 20 Punkte mit Geld ausgeglichen hat | Ablehnen, `go_to_page` kasse_ausgleich |
| O2 | Verrechne meine Punkte mit dem Haushaltstopf | Ablehnen, `go_to_page` kasse_ausgleich |
| O3 | gleich mal die punkte zwischen uns beiden aus | Ablehnen, `go_to_page` kasse_ausgleich |
| O4 | Stell das Wochenziel auf 50 Punkte | Ablehnen, `go_to_page` einstellungen |
| O5 | Ändere den Kurs auf einen Punkt gleich fünfzig Cent | Ablehnen, `go_to_page` kasse_ausgleich |
| O6 | Mach einen Gastlink für die Drogerieliste | Ablehnen, `go_to_page` einstellungen (oder zur Liste, wo der Gastlink entsteht) |
| O7 | Beende alle Gastlinks | Ablehnen, `go_to_page` einstellungen |
| O8 | Ändere meine Farbe auf grün | Ablehnen, `go_to_page` einstellungen |
| O9 | Benenn den Haushalt um in WG Kreuzberg | Ablehnen, `go_to_page` einstellungen |
| O10 | qc-agent-2 hat das Bad geputzt, hak das für sie ab | Ablehnen: das hakt qc-agent-2 selbst ab; kein Werkzeug, das etwas ändert |

## P. Noch nicht in Stufe 1: Aufgaben, Töpfe, fehlende Werkzeuge

| Nr | Satz | Erwartet |
| --- | --- | --- |
| P1 | Ich hab das Bad geputzt | Noch nicht: Aufgaben erledigt man auf der Pinnwand; kein Listenwerkzeug; `go_to_page` putzen erlaubt |
| P2 | Leg eine Aufgabe Keller aufräumen mit acht Punkten an | Noch nicht; kein Listenwerkzeug |
| P3 | Was ist heute dran? | Noch nicht (keine Aufgaben-Lesewerkzeuge); keine erfundene Antwort |
| P4 | Trag 30 Euro für Pizza in den Haushaltstopf ein, hab ich bezahlt | Noch nicht; kein Werkzeug; `go_to_page` topf/toepfe erlaubt |
| P5 | Wer schuldet im Haushaltstopf wem was? | Noch nicht (kein Lesewerkzeug für Töpfe); keine erfundenen Beträge |
| P6 | Lösch die Einkaufsliste Bauhaus | Kein Werkzeug für das Löschen einer Einkaufsliste: sagt das in einem Satz (der Weg von Hand ist willkommen); löscht nichts anderes |

## Q. Rückfragen bei Mehrdeutigem

| Nr | Satz | Erwartet |
| --- | --- | --- |
| Q1 | Fenster putzen ist erledigt | Rückfrage: „Fenster“ oder „Fenster innen putzen“ (QC2 Todo) |
| Q2 | Lösch die Liste | Rückfrage: welche Liste |
| Q3 | Benenn die Liste in Wochenende um | Rückfrage: welche Liste |
| Q4 | setz seife drauf | Rückfrage: welche Liste (Seife steht schon auf QC2 Einkauf; auch das darf er sagen) |

## R. Verlauf: frisch nach 30 Minuten

| Nr | Satz | Erwartet |
| --- | --- | --- |
| R1 | (nach mehr als 30 Minuten ohne Frage) Was steht auf der Drogerieliste? | Trennlinie „Neues Gespräch“ im Chat, dann `read_shopping_list` wie in B1 |
