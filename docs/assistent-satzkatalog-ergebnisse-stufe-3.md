# Satzkatalog Stufe 3: Ergebnisse

Katalog: [assistent-satzkatalog.md](assistent-satzkatalog.md), ganz (Stufe 1 und 2, dazu U und V mit
den neuen V18 bis V23). Je Lauf ein Abschnitt; der neueste ersetzt den vorigen.

## Lauf vom 25.11.2026

Gegen die deployte Edge Function `assistant` (Haiku), durch die Oberfläche des Dev-Servers, als QC 1 im
`QC-Test-Haushalt`. Je Abschnittsgruppe ein frisches Gespräch (Seite neu geladen): A–D, E–L, M–Q, S, T,
U, V. Erfasst je Satz: Werkzeugaufrufe aus den Antworten der Function, Toasts mit Rückgängig-Knopf, der
Chattext; Beträge und Aufteilungen aus dem Topf-Store, den die Topfansicht zeigt, dazu Bildschirmfotos
der Topfansicht. Rückgängig lief über den Knopf im Toast.

- **Ausgangslage über den Store hergestellt** (SQL war nicht verfügbar): Reste der Stufen 1 und 2 und
	des Baus gelöscht (Packlisten Skiurlaub und Zelten Sommer, To-do Umzug, Einkaufsliste Bauhaus, Notizen
	Urlaub Ski und Müllabfuhr, Aufgabe QC Keller aufräumen, leerer Topf Skiurlaub, drei Ausgaben aus dem
	Bau in QC-Test Urlaub), QC-Raster Fenster vor T wieder dreckig. Was sonst schon stand (Seife schon
	umbenannt, Zwieback weg, Butter gekauft, Kreta-Notiz schon geändert), beantwortete er richtig mit
	„steht schon so da“; D1 lief mit der Tomate statt dem Zwieback.
- **Desktop** (1512 px): Version 22, die Nachläufe ab V11 mit Version 24.
- **Handybreite** (`html` per injiziertem Stil auf 390 px geklemmt): Version 24 bis O4, ab O5 Version
	25.
- **Kein Ausgleich entstanden:** `settlements` des Haushalts vor und nach beiden Läufen 2, keine neue
	Rückzahlung mit Ausgleich.

### Zählung

| | Sätze | Erwartete Reaktion | Falsch |
| --- | --- | --- | --- |
| Desktop | 149 | 145 | 4 (H2, O3, U9, V11) |
| Handybreite | 154 | 148 | 6 (O2, T5, V10 zweimal, V11 zweimal) |

- **Beträge und Aufteilungen:** alle wie gesagt, auf beiden Breiten, im Store und in der Topfansicht
	geprüft: 34 € gleich auf sechs (5,67 € viermal, 5,66 € zweimal), 12,50 € auf zwei, 900 € ganze Gruppe
	(150 € je), 30 € 2:1 (20/10), 30 € im Haushaltstopf auf beide, 23,50 € in Worten (3,92 € viermal,
	3,91 € zweimal), „zwölf fünfzig“ von qc-agent-2 bezahlt, 75/25 Prozent (30/10), feste Beträge 8/10,
	50 Cent für einen allein. 12,345 € fragt er nach. Rückzahlungen 5 €, 4 €, „zwanzig euro“ genau.
- **Rückgängig im Toast:** Pizza nach dem Eintragen wieder heraus (beide Breiten), Pizza 36 € → 34 €,
	gelöschte Pizza mit derselben ID zurück, Rückzahlung 4 € → 5 €, Topf anlegen (weg), abschließen
	(offen), wieder öffnen (abgeschlossen, mit dem alten Zeitstempel), leeren Topf löschen (zurück mit
	Teilnehmer und Abschlussdatum, neue ID); dazu aus Stufe 1 und 2 A6, D1, L1, M8, P6, S2, S5, S6, S11,
	S13, T3b, T4.
- **Abgelehnt wie erwartet:** Haushaltstopf abschließen und löschen (ohne Werkzeug, ohne Hinführen),
	Topf mit Inhalt löschen (U7: in den Topf, „von Hand“), Verrechnen (V15, V23, U9), Eintrag in den
	abgeschlossenen Skiurlaub (V16), Gast Tom als Teilnehmer (U2: nur Mitglieder, Satz zum Gastlink).
- **Aufleuchten** beim Schließen des Chats: alle neuen Ausgaben im Topf, Zettel an der Pinnwand
	(Bildschirmfotos beider Breiten).

### Korrekturen

| Satz | Was falsch lief | Korrektur | Wiederholt |
| --- | --- | --- | --- |
| V11 | buchte „Ich hab qc-agent-2 5 € gegeben“ nach mehreren Urlaubstopf-Sätzen ohne Rückfrage in QC-Test Urlaub | Systemprompt (Version 24): ohne genannten Topf gilt jeder Satz für sich | Desktop ✓ einmal; Handy ✗ zweimal (offen) |
| U9, O2 | führte zum Ausgleich, sagte aber nur „die Seite ist geöffnet“, nicht, dass er es nicht macht | Systemprompt (Version 25): „Die Seite ist geöffnet“ allein reicht nicht | O1–O3, U9 frisch ✓ |

### Offen

- **V11 im Gespräch (!):** frisch fragt er nach dem Topf (beide Breiten), nach Sätzen zum Urlaubstopf
	bucht er auf dem Handy auch mit Version 25 dorthin (2 von 3). Eine Zeile in der Beschreibung von
	`pot_id` half im Versuch nicht und ist zurückgenommen. Entweder erwartet der Katalog dort die
	Fortsetzung des Gesprächs, oder es braucht einen anderen Weg als Wortlaut.
- **`max_tokens` (!):** H2 (Desktop) und V10 (Handy, zweimal) brachen mit „Ich habe hier abgebrochen —
	die Antwort wurde zu lang“ ab; T5 (Handy) verlor in einer Runde den Rest. Haiku denkt vor der Antwort,
	und 1024 Token reichen für eine lange Liste (V10: rund 25 Ausgaben) samt Denken nicht.
- **Falsche Aussagen über den Stand, ohne falsches Werkzeug:** nach dem Rückgängig hielt er Zurückgenommenes
	für noch da (U4: „ein zweiter Topf Skiurlaub“; T6: „die Küche ist schon auf deinen Namen verbucht“) und
	entschuldigte sich für richtige Schritte (T6b: QC Keller aufräumen „war mein Fehler“; H2/H3, I1 auf
	beiden Breiten: wiederholte Selbstkorrekturen zur ID des Helms). V9 sprach ungefragt die
	zurückgenommene Pizza-Änderung an.
- **U8b (Desktop):** nach dem Rückgängig des Topf-Löschens hat der Topf eine neue ID; der Verlauf kennt
	nur die alte, und er schrieb, er wisse nicht, ob frühere Schritte den richtigen Topf trafen. Der
	Hinweis „Inzwischen von mir zurückgenommen“ nennt die neue ID nicht.
- **T5 (Handy):** fragte richtig nach, sagte aber, QC Keller aufräumen könne „nur qc-agent-2 selbst
	abhaken“ (zugewiesen heißt nur zuständig); wie Stufe 2 auf dem Handy.
- **O3 (Desktop):** kein `go_to_page`, „die Seite ist schon offen“ (sie war es, nach O2); von einer
	anderen Seite aus richtig.
- Mit Version 24 schrieb er in einem Gespräch Markdown (`**QC-Test Urlaub**`), das der Chat roh zeigt.
- Ein `add_expense` trug ein erfundenes Feld `pot_id_placeholder`; das Werkzeug überging es.
