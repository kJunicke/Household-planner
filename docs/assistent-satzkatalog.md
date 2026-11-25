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
- Gastlinks auf **QC2 Einkauf** und **QC2 Todo**.
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

## A′. Einkauf: Artikel ändern (`update_shopping_items`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| A6 | Sortier den Pfeffer in die Kategorie Gewürze | `update_shopping_items` Pfeffer → Kategorie Gewürze (neu): Toast für Kategorie und Artikel; Rückgängig des Artikels setzt ihn zurück |
| A7 | benenn die seife um in flüssigseife | `update_shopping_items` Seife → „Flüssigseife“ |

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
| C3 | Ich hab Haferflocken und den Senf geholt | `mark_shopping_items_purchased`: Haferflocken, Senf; Rückgängig der Haferflocken: offen, Kaufzähler wie vorher |
| C4 | qc-agent-2 hat die Milch gekauft | `mark_shopping_items_purchased`: Milch (Artikel bringen keine Punkte, kein Ablehnen) |

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
| E6 | Mach eine Kopie der Zelten-Liste und nenn sie Zelten Sommer | `copy_checklist` QC Zelten → „Zelten Sommer“ |

## F. Packliste und To-do: Einträge hinzufügen (`add_checklist_entries`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| F1 | Pack Skischuhe, Helm und zwei Paar Handschuhe auf die Skiurlaub-Liste | `add_checklist_entries` Skiurlaub: Skischuhe, Helm, Handschuhe ×2 |
| F2 | auf die zelten liste noch isomatte unter kategorie schlafen | Rückfrage: QC Zelten oder Zelten Sommer (die Kopie aus E6 passt auch) |
| F2b | qc zelten | `add_checklist_entries` QC Zelten: Isomatte, Kategorie Schlafen (neu) |
| F3 | Ich muss noch Müll rausbringen, schreib das auf die To-do-Liste | Rückfrage: QC2 Todo oder Umzug |
| F3b | auf qc2 todo | `add_checklist_entries` QC2 Todo: Müll rausbringen |

## G. Einträge ändern (`update_checklist_entries`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| G1 | Mach aus den Handschuhen drei Paar | `update_checklist_entries`: Handschuhe Menge 3 |
| G2 | Sortier Zelt und Schlafsack auf der Zelten-Liste in die Kategorie Schlafen | `update_checklist_entries`: Zelt, Schlafsack → Kategorie Schlafen; oder Rückfrage QC Zelten / Zelten Sommer, mit Antwort „qc zelten“ dasselbe |
| G3 | benenn auf der umzug liste strom ummelden um in strom und gas ummelden | `update_checklist_entries`: Name „Strom und Gas ummelden“ |

## H. Abhaken und wieder öffnen (`check_checklist_entries`)

| Nr | Satz | Erwartet |
| --- | --- | --- |
| H1 | Helm ist gepackt | `check_checklist_entries` Helm |
| H2 | Kartons besorgen ist erledigt | `check_checklist_entries` Kartons besorgen |
| H3 | Der Helm ist doch noch nicht eingepackt | `check_checklist_entries` Helm, `done: false` |
| H4 | Setz die QC2 Todo Liste zurück, alles wieder offen | `reset_checklist` QC2 Todo; Rückgängig hakt genau „Rasen“ wieder ab |

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
| L2 | Lösch die To-do-Liste QC2 Todo | `delete_checklist` QC2 Todo → Karte nennt, dass ihr Gastlink endet und mit Rückgängig nicht zurückkommt → „Abbrechen“ |

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
| N3 | Zeig mir die Packliste Zelten | Rückfrage QC Zelten / Zelten Sommer; mit „QC Zelten“ `go_to_page` packlisten mit der ID von QC Zelten |
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

## P. Noch nicht in Stufe 1: Aufgaben, Töpfe; Einkaufsliste löschen

| Nr | Satz | Erwartet |
| --- | --- | --- |
| P1 | Ich hab das Bad geputzt | Seit Stufe 2 möglich → T1 |
| P2 | Leg eine Aufgabe Keller aufräumen mit acht Punkten an | Seit Stufe 2 möglich → S2 |
| P3 | Was ist heute dran? | Seit Stufe 2 möglich → S1 |
| P4 | Trag 30 Euro für Pizza in den Haushaltstopf ein, hab ich bezahlt | Noch nicht; kein Werkzeug; `go_to_page` topf/toepfe erlaubt |
| P5 | Wer schuldet im Haushaltstopf wem was? | Noch nicht (kein Lesewerkzeug für Töpfe); keine erfundenen Beträge |
| P6 | Lösch die Einkaufsliste Bauhaus | `delete_shopping_list` Bauhaus → Karte (nennt die Artikel) → „Löschen“ → Toast; Rückgängig bringt sie zurück |

## Q. Rückfragen bei Mehrdeutigem

| Nr | Satz | Erwartet |
| --- | --- | --- |
| Q1 | Fenster putzen ist erledigt | Rückfrage: „Fenster“, „Fenster innen putzen“ (QC2 Todo) und seit Stufe 2 auch QC-Raster Fenster (Pinnwand); nichts abgehakt |
| Q2 | Lösch die Liste | Rückfrage: welche Liste |
| Q3 | Benenn die Liste in Wochenende um | Rückfrage: welche Liste |
| Q4 | setz seife drauf | Rückfrage: welche Liste (Seife steht schon auf QC2 Einkauf; auch das darf er sagen) |

## R. Verlauf: frisch nach 30 Minuten

| Nr | Satz | Erwartet |
| --- | --- | --- |
| R1 | (nach mehr als 30 Minuten ohne Frage) Was steht auf der Drogerieliste? | Trennlinie „Neues Gespräch“ im Chat, dann `read_shopping_list` wie in B1 |

## S. Aufgaben anlegen, bearbeiten, zuweisen, verschieben, wieder dreckig, löschen und lesen

Aufgaben stehen nicht in der Übersicht: vor jedem schreibenden Werkzeug ist `read_tasks` erlaubt.
Jede Änderung führt die App auf die Pinnwand; beim Schließen des Chats leuchten Zettel und Zeilen im
Erledigt-Streifen auf. Ausgangslage: die Zettel „QC-Raster …“ und „QC-Test …“ des QC-Testhaushalts;
„QC-Raster Bad“ erledigt.

| Nr | Satz | Erwartet |
| --- | --- | --- |
| S1 | Was ist gerade dran? | `read_tasks`; Antwort nennt die Aufgaben, die dran sind, nicht die erledigten |
| S2 | Leg eine Aufgabe QC Keller aufräumen an, einmalig, acht Punkte | `create_task` one-time, 8 Punkte; Toast, neuer Zettel; Rückgängig nimmt ihn wieder ab |
| S3 | leg noch eine aufgabe qc keller aufräumen an mit fünf punkten einmalig | Duplikat: nichts angelegt, Antwort nennt die bestehende Aufgabe; anbieten, ihre Punkte mit `update_task` zu ändern, darf er |
| S4 | Leg eine Aufgabe QC Fenster innen putzen an | Rückfrage nach Punkten (und Typ), kein `create_task` ohne Punkte |
| S5 | qc-agent-2 soll den Keller machen | `assign_task` QC Keller aufräumen → qc-agent-2; Befestigung in seiner Farbe; Rückgängig: wieder niemand |
| S6 | Verschieb QC-Test Sieben auf Freitag | `postpone_task` until = kommender Freitag; Zeile „→ TT.MM.“ im Erledigt-Streifen; Rückgängig: wieder dran |
| S7 | verschieb qc-test projekt um zwei tage | Ablehnen: Projekte lassen sich nicht verschieben; kein Werkzeug, das etwas ändert |
| S8 | QC-Raster Bad ist wieder dreckig | `mark_task_dirty`; Zettel zurück an der Wand, Punkte bleiben; Rückgängig: wieder erledigt |
| S9 | Wer hat zuletzt QC-Raster Bad geputzt? | `read_task_history` (mit task_id); Antwort: wer und wann, nichts erfunden |
| S10 | Wie steht das Wochenziel? | `read_weekly_goal`; Antwort: Ziel, Punkte der Woche, Anteile ohne Rangliste |
| S11 | Lösch die Aufgabe QC-Raster Bad | `delete_task` → Karte („ihre Erledigungen bleiben im Verlauf“, „Rückgängig nur, solange keine neue Aufgabe so heißt“) → „Löschen“ → Toast, die App auf der Pinnwand; Rückgängig hängt denselben Zettel wieder hin, er leuchtet beim Schließen auf; die Punkte im Wochenziel bleiben die ganze Zeit |
| S12 | Lösch die Aufgabe QC Keller aufräumen | `delete_task` → Karte ohne Verlaufshinweis → „Abbrechen“ → nichts gelöscht |
| S13 | Benenn QC Keller aufräumen um in QC Keller ausmisten und mach zehn Punkte draus | `update_task` Titel „QC Keller ausmisten“, 10 Punkte; Toast, der Zettel leuchtet auf; Rückgängig: wieder QC Keller aufräumen mit 8 Punkten |
| S14 | qc-raster küche soll alle vierzehn tage dran sein | `update_task` QC-Raster Küche, recurrence_days 14 (bleibt unbewertet) |
| S15 | Mach aus QC-Test Projekt eine einmalige Aufgabe | Ablehnen: ein Projekt bleibt Projekt (wie im Bearbeiten-Fenster); nichts geändert |

## T. Aufgaben erledigen und Quick-Aufgaben (`complete_task`, `log_quick_task`)

Im QC-Testhaushalt sind alle Aufgaben unbewertet (Stand 25.11.2026): **QC-Raster Bad**, **QC-Raster
Küche**, **QC-Raster Fenster**, **QC-Test Projekt** (mit „Am Projekt arbeiten“) u. a. Rückgängig ist
Zurückkleben: die Erledigung verschwindet aus der Historie, die Punkte aus dem Wochenziel, und eine
dabei zum ersten Mal bewertete Aufgabe ist wieder unbewertet.

| Nr | Satz | Erwartet |
| --- | --- | --- |
| T1 | Ich hab das Bad geputzt | `read_tasks`, `complete_task` weist ab (unbewertet) → Rückfrage nach den Punkten; nichts erledigt |
| T1b | 5 Punkte | `complete_task` QC-Raster Bad mit points 5: Toast „erledigt: QC-Raster Bad (+5 P, ab jetzt Standard)“, Wochenziel +5 |
| T2 | Hab auch das Fenster geputzt, waren 3 Punkte | Rückfrage: QC-Raster Fenster (Pinnwand) oder „Fenster“ / „Fenster innen putzen“ (QC2 Todo) |
| T2b | die auf der Pinnwand | `complete_task` QC-Raster Fenster mit points 3 |
| T3 | Küche ist geputzt | Rückfrage nach den Punkten (unbewertet) |
| T3b | 4 | `complete_task` QC-Raster Küche mit points 4; dann Rückgängig im Toast: Küche wieder an der Wand und unbewertet, Wochenziel −4 |
| T4 | ich hab gerade den dachboden aufgeräumt sechs punkte | `log_quick_task` „Dachboden aufräumen“ mit 6 Punkten (keine passende Aufgabe); die App wechselt in den Verlauf, beim Schließen leuchtet der Eintrag dort auf; Rückgängig nimmt die 6 Punkte wieder raus |
| T5 | Ich hab den Keller entrümpelt | Rückfrage nach den Punkten für eine Quick-Aufgabe, oder ob QC Keller aufräumen (aus S2, qc-agent-2 zugewiesen) gemeint ist; nie ablehnen, weil sie einem anderen zugewiesen ist |
| T5b | nein, ich hab QC Keller aufräumen gemacht, die von qc-agent-2 | `complete_task` QC Keller aufräumen für den, der fragt (+8 P): zuweisen heißt zuständig, erledigen darf jeder; Rückgängig: wieder an der Wand, qc-agent-2 wieder zuständig, Wochenziel −8 |
| T6b | trag qc-agent-2 eine Quick-Aufgabe Auto waschen mit 5 Punkten ein | Ablehnen: auch keine Quick-Aufgabe für ein anderes Mitglied; kein Werkzeug, das etwas ändert |
| T6 | qc-agent-2 hat die Küche geputzt, 4 Punkte | Ablehnen: das hakt qc-agent-2 selbst ab; kein Werkzeug, das etwas ändert |
| T7 | Fenster nochmal geputzt, diesmal 6 Punkte | Rückfrage nach der Begründung (Abweichung: sonst 3); nichts erledigt. Fragt er dazu nach Pinnwand oder Liste, ist das auch richtig |
| T7b | die Pinnwand, war extrem dreckig nach der Party | `complete_task` QC-Raster Fenster mit points 6, note mit der Begründung, again (schon erledigt): Toast „+6 P statt 3“ |
| T8 | Ich hab zwei Stunden am QC-Test Projekt gearbeitet | Rückfrage nach den Punkten; mit Antwort `complete_task` am Projekt: Toast „Projekt-Arbeit: QC-Test Projekt (+… P)“, das Projekt bleibt offen |
| T9 | Bad ist geputzt | QC-Raster Bad ist schon erledigt: Hinweis darauf, wann, und Frage, ob er es seitdem noch einmal geputzt hat; kein `complete_task` mit `again` von sich aus |

## U. Töpfe anlegen, abschließen, wieder öffnen und löschen (`create_pot`, `close_pot`, `reopen_pot`, `delete_pot`)

Ausgangslage: der Haushaltstopf (qc-agent-2 hat 3,00 € gut) und **QC-Test Urlaub** (4 Ausgaben,
2 Rückzahlungen, Gastlink). Jede Änderung führt die App in den Topf; beim Schließen des Chats leuchtet
sein Titel auf. Anlegen nimmt Rückgängig nur zurück, solange der Topf leer und ohne Gastlink ist;
Abschließen und Wieder öffnen ganz, Wieder öffnen mit dem alten Abschlussdatum. Löschen kann er nur
einen leeren Topf (ohne Ausgaben, Rückzahlungen und Gastlink): Rückgängig legt ihn mit Namen,
Teilnehmern und Abschlussdatum neu an. Einen Topf mit Inhalt löscht er nicht, weil sich das nicht
zurücknehmen ließe; er führt in den Topf, wo man ihn von Hand löscht.

| Nr | Satz | Erwartet |
| --- | --- | --- |
| U1 | Mach einen Topf für den Skiurlaub | `create_pot` „Skiurlaub“ mit allen Mitgliedern; Toast, die App im neuen Topf; Rückgängig: der Topf ist wieder weg |
| U2 | Mach einen Topf für den Skiurlaub mit mir und meinem Kumpel Tom | `create_pot` nur mit dem, der fragt (Tom ist kein Mitglied), und ein Satz: Gäste kommen über den Gastlink, den man im Topf von Hand anlegt; kein Gastlink, kein Teilnehmer Tom |
| U3 | Schließ den Skiurlaub-Topf ab | `close_pot`; „Abgeschlossen am …“ im Topf; Rückgängig: wieder offen |
| U4 | Mach den Skiurlaub wieder auf | `reopen_pot`; Rückgängig: wieder abgeschlossen, mit dem alten Datum |
| U5 | Schließ den Haushaltstopf ab | Ablehnen: den Haushaltstopf schließt niemand, auch nicht von Hand; kein Werkzeug, kein Hinführen „zum Abschließen von Hand“ |
| U6 | Lösch den Haushaltstopf | Ablehnen wie U5; keine Karte |
| U7 | Lösch den Topf QC-Test Urlaub | `delete_pot` weist ab (4 Ausgaben, 2 Rückzahlungen, Gastlink): keine Karte, die App im Topf, ein Satz, dass man ihn dort von Hand löscht |
| U8 | Lösch den Skiurlaub-Topf | `delete_pot` → Karte „Topf „Skiurlaub“ (leer)“ → „Löschen“ → Toast; Rückgängig: der Topf ist mit seinen Teilnehmern wieder da (neue Kennung) |
| U8b | Lösch den Skiurlaub-Topf | wie U8, dann „Abbrechen“ → nichts gelöscht |
| U9 | Gleich im Skiurlaub die Schulden mit dem Haushaltstopf aus | Ablehnen wie O2: kein Ausgleich, `go_to_page` kasse_ausgleich |
