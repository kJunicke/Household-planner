# Satzkatalog Stufe 1: Ergebnisse

Lauf vom 24.11.2026 gegen die deployte Edge Function `assistant` (Haiku, `claude-haiku-5-5`), durch die
Oberfläche des Dev-Servers, angemeldet als QC 1 im `QC-Test-Haushalt`. Katalog:
[assistent-satzkatalog.md](assistent-satzkatalog.md).

## Wie gelaufen

- **Desktop** (1512 px): der ganze Katalog in einem Gespräch, Function Version 3 (Systemprompt vor
	diesem Lauf).
- **Handybreite** (390 × 844, `body` per injiziertem Stil geklemmt; der Chat und die Toasts liegen
	darin): 30 Sätze, Function Version 4 und 5 (nach den Korrekturen unten). Darunter jeder Satz, der
	auf dem Desktop falsch lief, sinngemäß wiederholt, dazu je Bereich Toasts, Löschkarte (bestätigt und
	abgebrochen), Aufleuchten und Rückgängig.
- **Erfasst** je Satz: die Werkzeugaufrufe aus den Antworten der Function (mitgeschnitten im Tab), die
	Toasts samt Rückgängig-Knopf (aus dem Toast-Store), der Chattext, und nach jeder Änderung beim
	Schließen des Chats, welche Zeilen `row-flash` bzw. `note-flash` tragen. Rückgängig wurde über den
	Knopf im Toast getippt, nicht über den Store.
- Abweichung von der Ausgangslage: keine; Butter, Pfeffer usw. standen wie beschrieben.

## Zählung

| | Sätze | Erwartete Reaktion | Falsch zugeordnet | Antwort mit falscher Aussage |
| --- | --- | --- | --- | --- |
| Desktop, Version 3 | 67, dazu R1 (Version 5) | 61, R1 ✓ | 6 | 10 |
| Handybreite, Version 4 und 5 | 30 | 30 | 0 | 3 (nur Version 4, keine in Version 5) |

- **Jede Änderung hatte einen eigenen Toast mit Rückgängig-Symbol** (Desktop und Handy).
- **Aufleuchten:** jede Änderung außer abgehakten Einkaufsartikeln (siehe Befunde).
- **Rückgängig getippt und geprüft:** Einkaufsartikel hinzufügen, Eintrag einer Packliste löschen
	(zweimal), ganze To-do-Liste löschen (kommt mit beiden Einträgen zurück), Notiz löschen. Ein
	zurückgenommener Eintrag leuchtet nicht.

## Ergebnisse je Satz (Desktop, Version 3)

✓ = erwartete Reaktion, ✗ = falsch zugeordnet, (!) = Reaktion richtig, Antwort sagt etwas Falsches.

| Nr | Werkzeug / Reaktion | Toast, Rückgängig, Aufleuchten | |
| --- | --- | --- | --- |
| A1 | `add_shopping_items` Milch (stand schon drauf), Ei ×2 | Toast „2× Ei“; leuchtet | ✓ |
| A2 | `add_shopping_items` Drogeriemarkt: Zahnpasta, Duschgel ×3 | 2 Toasts; App folgt zur Liste | ✓ |
| A3 | `add_shopping_items` Klopapier | Toast mit Rückgängig (Screenshot gesehen) | ✓ |
| A4 | Rückfrage: QC2 Einkauf oder QC Drogeriemarkt | – | ✓ |
| A4b | `add_shopping_items` Tomate → QC2 Einkauf | Toast | ✓ |
| A5 | `add_shopping_items` Brötchen ×12, Senf, Gurke ×2 | 3 Toasts; Brötchen, Ei, Gurke, Senf leuchten | ✓ |
| B1 | `read_shopping_list` Drogeriemarkt, nennt alle drei | – | ✓ |
| B2 | Rückfrage, auf welche Liste Butter soll (als Hinzufügen gelesen) | – | ✗ |
| C1 | `read_shopping_list`, `mark_shopping_items_purchased` Butter | Toast; leuchtet **nicht** | ✓ |
| C2 | `mark_shopping_items_purchased` Zahnpasta, Duschgel | 2 Toasts; leuchten **nicht** | ✓ |
| C3 | `mark_shopping_items_purchased` Haferflocken, Senf | 2 Toasts | ✓ |
| D1 | `delete_shopping_items` → Karte → Löschen | Toast „gelöscht: Zwieback“ | ✓ |
| D2 | `delete_shopping_items` → Karte → Abbrechen; Antwort: steht weiter drauf | kein Toast | ✓ |
| E1 | `create_list` packliste „Skiurlaub“ | Toast; App folgt zu Packlisten | ✓ |
| E2 | `create_list` einkauf „Baumarkt“ | Toast | ✓ |
| E3 | `create_list` todo „Umzug“, dann `add_checklist_entries` mit der neuen ID | 3 Toasts; Chip und beide Einträge leuchten | ✓ |
| E4 | `rename_list` Baumarkt → Bauhaus | Toast; Chip leuchtet | ✓ |
| E5 | `read_checklist` Umzug (neue Liste in der Übersicht gefunden) | – | ✓ |
| F1 | `add_checklist_entries` Skischuhe, Helm, Handschuhe ×2 | 3 Toasts; leuchten | ✓ |
| F2 | `add_checklist_entries` Isomatte, Kategorie Schlafen (neu) | Toasts für Kategorie und Eintrag; beide leuchten | ✓ |
| F3 | Rückfrage: QC2 Todo oder Umzug | – | ✓ |
| F3b | `add_checklist_entries` Müll rausbringen → QC2 Todo | Toast; leuchtet | ✓ |
| G1 | `read_checklist`, `update_checklist_entries` Handschuhe ×3 | Toast; leuchtet | ✓ |
| G2 | `update_checklist_entries` Zelt, Schlafsack → Schlafen | 2 Toasts; leuchten | ✓ |
| G3 | `update_checklist_entries` „Strom und Gas ummelden“ | Toast; leuchtet | ✓ |
| H1 | `check_checklist_entries` Helm | Toast; zugeklappter Block „1 gepackt“ leuchtet | ✓ |
| H2 | `check_checklist_entries` Kartons besorgen | Toast; „1 erledigt“ leuchtet | ✓ |
| H3 | `check_checklist_entries` Helm `done: false` | Toast; leuchtet | (!) behauptet, die ID sei geraten gewesen |
| I1 | `delete_checklist_entries` → Karte → Löschen | Toast; Rückgängig getippt: Skischuhe wieder da | ✓ |
| J1 | `create_checklist_category` Kleidung | Toast; leuchtet | (!) sagt, die Skischuhe blieben gelöscht, weil das Löschen zurückgenommen sei |
| J2 | nur `read_checklist` Skiurlaub: „keine Kategorie Schlafen“ (sie steht auf QC Zelten) | – | ✗ |
| J3 | `delete_checklist_category` → Karte → Löschen | Toast | (!) erfindet drei Einträge, die in der leeren Kategorie gewesen seien |
| K1 | `read_checklist`, `set_list_note` Skiurlaub (nicht `create_note`) | Toast; Chip leuchtet | ✓ |
| L1 | `delete_checklist` → Karte „To-do-Liste „Umzug“ mit 2 Einträgen“ → Löschen | Toast; Rückgängig getippt: Liste mit beiden Einträgen zurück | ✓ |
| M1 | `read_note` Handwerker | – | (!) kommentiert ungefragt die zurückgenommene Liste |
| M2 | keine Werkzeuge (aus M1): Montag um 9 | – | ✓ |
| M3 | `create_note` „Müllabfuhr …“ | Toast; App folgt zu Notizen; leuchtet | ✓ |
| M4 | `append_to_note` Geschenkideen | Toast; leuchtet | (!) behauptet, M3 habe eine bestehende Notiz überschrieben |
| M5 | `read_note`, `rewrite_note` Kreta, Rest unverändert | Toast; leuchtet | (!) wiederholt die Überschreib-Behauptung |
| M6 | `create_note` „Urlaub Ski\nHütte buchen“ | Toast; leuchtet | ✓ |
| M7 | Rückfrage: Urlaub Ski oder Urlaub Kreta | – | (!) behauptet, auch „Urlaub Ski“ überschrieben zu haben |
| M7b | `append_to_note` Urlaub Ski: Sonnencreme | Toast; leuchtet | ✓ |
| M8 | `delete_note` → Karte → Löschen | Toast; Rückgängig getippt: Notiz wieder da, leuchtet nicht | ✓ |
| N1 | `get_app_guide`; Einstellungen, Angebot hinzuführen | – | (!) `**Einstellungen**` steht roh im Chat; ungefragter Kommentar |
| N2 | `go_to_page` einstellungen | Einstellungen öffnen sich neben dem Chat | ✓ |
| N3 | `read_checklist` statt hinführen | – | ✗ |
| N4 | aus der Anleitung in N1: Tipp auf den Eintrag | – | ✓ |
| O1 | `go_to_page` kasse_ausgleich, erklärt „Neu“ | – | ✓ |
| O2 | `go_to_page` kasse_ausgleich, erklärt Art „Topf“ | – | ✓ |
| O3 | `go_to_page` kasse_ausgleich, „Ausgleichen“ | – | ✓ |
| O4 | `go_to_page` einstellungen | – | (!) kommentiert ungefragt frühere Antworten |
| O5 | `go_to_page` kasse_ausgleich, Kurs | – | ✓ |
| O6 | `go_to_page` einkauf Drogeriemarkt: Gastlink entsteht bei der Liste | – | ✓ |
| O7 | `go_to_page` einstellungen, „Freigabe beenden“ | – | ✓ |
| O8 | kein Werkzeug (Einstellungen schon offen), „Profil“ | – | ✓ |
| O9 | `go_to_page` einstellungen | – | ✓ |
| O10 | `go_to_page` putzen und Rat, die Aufgabe für qc-agent-2 selbst abzureißen | – | ✗ |
| P1 | kein Werkzeug: auf der Pinnwand selbst abhaken | – | (!) ungefragter Kommentar zu früheren Antworten |
| P2 | `go_to_page` putzen, „selbst anlegen“ | – | ✓ |
| P3 | kein Werkzeug: kein Zugriff auf Aufgaben | – | ✓ |
| P4 | `go_to_page` kasse_ausgleich: „dort trägst du die 30 Euro ein“ (gehört in den Topf) | – | ✗ |
| P5 | kein Werkzeug, aber verweist auf Kasse · Ausgleich statt auf den Topf | – | ✗ |
| P6 | kein Werkzeug: ganze Einkaufsliste kann er nicht löschen | – | ✓ |
| Q1 | `read_checklist` beide To-do-Listen, Rückfrage „Fenster“ oder „Fenster innen putzen“ | – | ✓ |
| Q2 | Rückfrage: welche Liste | – | ✓ |
| Q3 | Rückfrage: welche Liste | – | ✓ |
| Q4 | Rückfrage: welche Einkaufsliste | – | ✓ |
| R1 | nach 31 Minuten ohne Frage (21:48 → 22:19 UTC, Handybreite): Trennlinie „Neues Gespräch“, dann `read_shopping_list` Drogeriemarkt | Trennlinie volle Breite, lesbar (Screenshot gesehen) | ✓ |

## Korrekturen und Wiederholung

| Was | Wo | Wiederholt (Handybreite) |
| --- | --- | --- |
| Stand-Fragen („brauchen wir noch Butter“) lesen nach, auf allen passenden Listen, und tragen nichts ein | Systemprompt | B2: `read_shopping_list` auf allen drei Einkaufslisten, „steht als gekauft, nicht offen; soll ich sie wieder draufsetzen?“ ✓ |
| Eintrag oder Kategorie nicht auf der gelesenen Liste → die übrigen Listen derselben Art lesen, bei mehreren nachfragen | Systemprompt | J2 zweimal: liest alle Packlisten, `rename_checklist_category` auf QC Zelten ✓ |
| „zeig mir die Liste …“, „öffne …“ heißt hinführen | Beschreibung `go_to_page` | N3: `go_to_page` packlisten mit der ID von Skiurlaub ✓ |
| Für andere erledigen: nie, auch nicht dazu raten; „das hakt X selbst ab“ | Systemprompt | O10: kein Werkzeug, „das hakt qc-agent-2 selbst ab“ ✓ |
| Aufgaben und Töpfe „noch nicht“, mit Ziel: Aufgaben → putzen, Töpfe → topf/toepfe; eine Ausgabe gehört in den Topf | Systemprompt, Beschreibung `go_to_page` | P4: `go_to_page` topf Haushaltstopf ✓; P5: verweist auf den Topf ✓; P1: `go_to_page` putzen ✓ |
| Eine neue Notiz sagt im Ergebnis, dass sie ab der nächsten Frage als diese Notiz in der Übersicht steht (wie eine neue Liste schon) | `create_note`, mit Test | Notiz anlegen, dann ergänzen: keine Überschreib-Behauptung mehr ✓ |
| Die Übersicht wird vor jeder Frage neu erfasst; Selbstangelegtes darin ist kein Zeichen, dass es schon da war | Systemprompt (Version 5; die Fassung in Version 4 reichte nicht: „Wochenende“ galt eine Frage später als „schon vorhanden“) | neue To-do-Liste, dann drei Folgefragen: keine falsche Korrektur mehr ✓ |
| „(Inzwischen von mir zurückgenommen: …)“ heißt: der Stand davor gilt wieder; nur erwähnen, wenn die Frage es betrifft | Systemprompt | Löschen, Rückgängig, nächste Frage ohne Kommentar; Nachfrage „steht Hecke schneiden noch drauf?“ → „ja, wieder“ ✓ |
| Frühere Antworten nicht kommentieren; nichts behaupten, was kein Werkzeugergebnis zeigt; kein Markdown | Systemprompt | N1 ohne `**`, ohne Kommentar ✓ |

Function `assistant`: Version 4 (erste Korrektur), Version 5 (Übersicht schärfer gefasst).

## Handybreite (390 × 844)

- Toasts stehen oben über dem Chat, voll lesbar, Rückgängig-Knopf 48 × 48 px; mehrere stapeln sich
	(Screenshots gesehen). Zwei „Einkaufsliste synchronisiert“-Toasts stehen mit im Stapel.
- Chat, Antworten, Aktionszeilen und Löschkarte passen in die Breite, nichts ragt über den Rand
	(gemessen). Die Karte misst 328 px, „Abbrechen“ und „Löschen“ je 147 × 48 px.
- Hinter dem Chat folgt die App zur Liste, zur Notizenseite und zum Topf; beim Schließen leuchten neue
	Listen-Chips, Einträge, Kategorien und Notizen (Screenshots gesehen).
- Neue Liste und Einträge darauf in einer Frage, dann Folgefragen zur neuen Liste: richtige ID, ab
	Version 5 ohne falsche Selbstkorrektur.

## Befunde (nicht über Beschreibung oder Prompt behebbar)

1. **Abgehakte Einkaufsartikel leuchten nicht auf.** Der Block „Gekauft“ in `ShoppingView.vue` bindet
	`row-flash` nicht, anders als die erledigten Einträge der Pack- und To-do-Listen. Gesehen bei C1, C2
	und auf Handybreite („Shampoo“). Verletzt „jede Änderung hat … Aufleuchten“.
2. **Einstellungen bleiben über der Seite liegen.** Bringt der Assistent die App zu `einstellungen` und
	danach zu einer anderen Seite (`putzen`), bleibt die Einstellungs-Schublade offen; auf Handybreite
	deckt sie nach dem Schließen des Chats die ganze Pinnwand ab, auf dem Desktop steht sie rechts daneben. Gehört zu „Einstellungen vom
	Assistenten geöffnet liegen über dem Chat“.
3. **Die Übersicht in der Systemnachricht verleitet Haiku.** Weil sie je Frage neu im Systemprompt
	steht, hielt Haiku zweimal Selbstangelegtes für „schon vorhanden“. Die Prompt-Zeile in Version 5
	hält es im Test, die Ursache (Übersicht in der neuesten Nachricht statt im Systemprompt) bleibt
	offen; siehe „Assistent liest nach statt aus altem Verlauf zu antworten“.
4. **Haiku plaudert.** Ungefragte Kommentare zu früheren Antworten, falsche Selbstkorrekturen und ein
	erfundener Inhalt (J3) kamen auf dem Desktop zehnmal vor, in Version 4 noch dreimal, in Version 5 nicht
	mehr. Falsch zugeordnet hat er nach den Korrekturen keinen Satz; kein Anlass für Sonnet (D16), aber
	beim nächsten Lauf wieder darauf achten.
5. **Screenshots hängen bei offener Löschkarte.** Solange eine Karte offen ist, läuft die
	Bildschirmaufnahme der Chrome-Erweiterung in einen Timeout (dreimal, Desktop und Handy); JavaScript
	im Tab läuft weiter, nach dem Knopf geht die Aufnahme wieder. Die Karte wurde daher gemessen statt
	fotografiert. Ob das an der App liegt, ist offen.
6. **Eine Codeänderung im Dev-Server löscht den Chatverlauf** (Hot Reload montiert den Chat neu). Nur
	beim Entwickeln; für den 30-Minuten-Test musste die Uhr neu starten.
