# Views & Routes

Detailverhalten der einzelnen Views. Nur lesen, wenn du an der jeweiligen View arbeitest.

## `/` — HomeView (Weiche)

`/` rendert seit dem Pinnwand-Redesign eine Weiche: je nach Aussehen-Einstellung
(`designStore`, pro Gerät in `localStorage`) entweder den klassischen `CleaningView`
oder die `WallView`. Die Umschaltung wirkt sofort ohne Neuladen; beide Ansichten
arbeiten auf denselben Stores und derselben Edge Function.

Kein `keep-alive` — die weichende Ansicht meldet ihre Realtime-Subscription ab.

### Klassisch: CleaningView

Task-Liste, gefiltert über Kategorie-Chips (Alltag / Putzen / Projekte / Erledigt).

- **Filter-Chips**: Single-Select-Toggle. Ein Chip filtert exklusiv auf eine Kategorie;
  erneuter Klick (oder das ✕-Badge am aktiven Chip) hebt den Filter auf → alle sichtbar.
  Auswahl persistiert in `localStorage` (`putzplan_active_category`).
- **Vereinter FAB**: EIN Button (Lupe + kleines +-Badge) öffnet das Such-Overlay (suchen UND erstellen).
- **Cross-Tab Search**: Intelligente Suche über alle Kategorien mit Relevanz-Sortierung.
  Bei Eingabe erscheinen zwei Aktionen: **Aufgabe erstellen** (TaskCreateModal, Titel vorbefüllt)
  und **Quick-Aufgabe abschließen** (QuickTaskModal).
- **Quick-Aufgaben**: einmalig, sofort abgeschlossen + sofort soft-deleted → erscheinen NUR in der
  Historie (mit „Quick"-Badge), nicht in der Aufgabenliste. Punkte zählen in Stats/Ausgleich.
  Insert direkt via `taskStore.createQuickTask()` (keine Edge Function, RLS erlaubt Client-Insert).
- **„Jetzt dran"**: enthält **jede** offene wiederkehrende Aufgabe, nicht nur überfällige —
  ob eine Aufgabe dran ist, entscheidet allein `tasks.completed`
  ([ADR 0001](adr/0001-completed-ist-zustand-keine-ableitung.md)). Eine manuell als „wieder
  dreckig" markierte Aufgabe steht also auch dann hier, wenn ihre Kadenz noch läuft.
  Sortiert nach `urgency` aus `lib/taskSchedule.ts`, dringendste oben; nie erledigte zuerst.
  Sichtbar nur, solange die Kategorie „Putzen" im Filter steht. Warnfarbe und Warndreieck
  am Kopf erscheinen nur, wenn mindestens eine Aufgabe wirklich überfällig ist.
- **Keine eigene Putzaufgaben-Gruppe**: „Jetzt dran" ersetzt sie vollständig, eine zweite
  Gruppe wäre zwangsläufig leer. Gruppiert werden nur noch Alltag, Projekte und Erledigt.
- **Status-Zeile**: „Offen" zählt recurring + one-time, „N überfällig" nur gerissene Kadenzen
  und nie erledigte Aufgaben — deshalb ist diese Zahl kleiner als die Zahl am Sektionskopf.
- **Erledigt-Tab**: wiederkehrende Aufgaben nach nächster Fälligkeit, danach Aufgaben ohne
  Kadenz, ganz hinten abgeschlossene Projekte nach Abschlussdatum.

Auswahl und Sortierung liegen im gemeinsamen Composable `useTaskBoard.ts`, damit
klassischer Screen und Pinnwand dieselbe Antwort auf „welche Aufgaben sind dran und in
welcher Reihenfolge" geben. Die zurückgegebenen Listen sind `readonly` — wer sortieren
will, kopiert mit `[...liste]`, sonst zerstört ein `.sort()` den computed-Cache beider
Ansichten.

### Pinnwand: WallView

Offene Aufgaben hängen als Papierzettel an einer Korkwand, absolut positioniert per
Skyline-Packing (`lib/wallLayout.ts`).

- **Reihenfolge**: offene Aufgaben → tägliche → Projekte, ohne Überschriften. Der Typ ist
  am Papier und an der Befestigung erkennbar (weiß + Reißzwecke / gelb + Klebeband /
  Packpapier + Büroklammer). Keine Raumkategorien, keine Chipleiste.
- **Neigung, Versatz und Abstand** kommen deterministisch aus der `task_id` (FNV-1a-Hash).
  Eine Neigung, die sich pro Render ändert, wirkt wie ein Fehler.
- **Zettelbreite wird gemessen, nicht gerechnet**: der Zettel wird kurz ungedreht auf
  `max-content` gestellt und vermessen. Ungedreht, weil ein geneigter Zettel sich zu breit
  misst; mit Aufschlag nach oben, weil ein fehlendes halbes Pixel den Titel umbrechen
  lässt. Einzelne Wörter brechen nie um — lange **mehrwortige** Titel brechen an
  Wortgrenzen um (Deckel 68 % der Wandbreite). Diese Breite „Breite folgt dem Titel"
  bleibt die Voreinstellung. Ein zweiter Packlauf greift danach dort ein, wo die Wand
  sonst schlechter aussähe: er füllt die Reststreifen einer Reihe und darf zwei Zettel
  auf je knapp die halbe Wandbreite ziehen, damit sie **nebeneinander** stehen statt
  untereinander — zwei Zettel nebeneinander ist das Bild, das die Wand tragen soll, eine
  Kette einzeiliger Zettel der Zustand, den es zu vermeiden gilt. Verschmälert wird nur,
  wenn beide Zettel danach tatsächlich nebeneinander unterkommen — es gibt keinen
  grundlos schmalen Einzelzettel. Untergrenze ist die gemessene `min-content`-Breite je
  Zettel, deshalb kann strukturell kein einzelnes Wort umbrechen und kein Titel neu
  abgeschnitten werden; ein Titel ohne Umbruchstelle wird vom zweiten Lauf gar nicht erst
  angefasst. Ein Zettel darf durch die Verschmälerung höchstens eine Titelzeile zulegen
  (gemessen gegen die bereits gedeckelte Voreinstellung), sonst fällt er auf seine
  Voreinstellung zurück — und weil die Breite eines Paares eine gemeinsame Entscheidung
  ist, fällt die andere Hälfte dann mit, statt mit einer Breite stehenzubleiben, die nur
  galt, solange der Partner schmal blieb. Gemessen bei 23 Aufgaben und 375 px: leere
  Fläche 33,96 % → 27,01 %, Wandhöhe 1042 → 942 px, Reihen mit nur einem Zettel 13 → 9 —
  der Löwenanteil davon kommt aus dem Füllen der Reststreifen, nicht aus dem
  Paar-Erzwingen, das nur 2 von 23 Zetteln verschmälert.
- **Person** = farbige Umrandung aus `household_members.user_color`, kein Name, keine
  Initialen, kein Badge. Ohne Zuständigen tritt der Rand bewusst zurück, damit eine
  Personenfarbe immer kräftiger wirkt als die Nicht-Farbe.
- **Am Zettel sichtbar**: Titel, Punktwert, bei Rückstand eine rote Dauer („2 Tage",
  „nie") und genau **ein** Knopf (Bearbeiten, öffnet das bestehende Modal).
- **Statusleiste** oben, klebend: **ein** Balken über die volle Breite für den ganzen
  Haushalt gegen das **Wochenziel**, ein Farbsegment je Mitglied, die Legende mit Name und
  Punktzahl mittig in der Kopfzeile. Keine Rangliste, keine Platzierung; ein Mitglied ohne
  Punkte erscheint mit Segmentbreite 0 und einer 0. Die wöchentliche Rangliste im Header
  ist auf dieser Ansicht ausgeblendet, in `/stats` bleibt sie.
  - **Über dem Ziel** leuchtet der gefüllte Balken langsam auf und ab (voller Zyklus nie
    unter 3 s), und flache Linien spritzen aus der rechten Kante. Die **Helligkeit** trägt
    das Ausmaß, nicht das Tempo — schneller hieße aufdringlicher. Der Helligkeitsdeckel ab
    dem 7,6-fachen Ziel ist gewollt: er hält die Segmentfarben mit 70 % lesbar, das
    sichtbare Signal trägt dort nur noch die Tatsache „wir sind drüber", den genauen
    Faktor die `+N`-Zahl.
  - **Die Höhe ist über alle Punktstände exakt gleich** (60 px offen, 53 px kompakt).
    Alles Druckabhängige ist absolut positioniert und trägt nichts zur Layouthöhe bei —
    sonst spränge die Wand bei jedem Erledigen. Ihre Höhe reserviert die Wand über
    `--wall-status-height`, damit kein Zettel dauerhaft unter der Leiste bleibt.
  - Verworfen wurden auf dem Weg dorthin: umlaufende Bahnen (Flexbox staucht jede Summe
    über 100 % lautlos zurück), ein tropfendes Leck (machte die Leiste höher) und ein
    wanderndes Streifenmuster (zu schnell, zu ablenkend).
- **Wochenziel und Wochenstart** ändert jedes Mitglied in der Settings-Sidebar, nie inline
  in der Leiste. Vor dem Speichern benennt eine Bestätigung die Folgen: das Ziel gilt
  sofort, der neue Wochenstart erst ab einem genannten Datum, und die laufende Woche ist
  dadurch einmalig länger (→ [data-model.md](data-model.md)).
- **Unteraufgaben**: ein Zettel mit Unteraufgaben klappt beim Antippen auf; die
  Unteraufgaben hängen als kleine Zettelchen daran und werden an einem Griff abgerissen.
  Ein Zettel ohne Unteraufgaben reagiert auf Antippen gar nicht. Der angetippte Zettel
  bleibt stehen — er wird weder animiert noch verschoben. Antippen ist eine Aussage über
  genau diesen Zettel; rutschte er dabei weg, läse sich das als Fehltipp. Die
  Anheft-Bewegung gilt den *anderen* Zetteln. Zettel oberhalb bewegen sich nie, das folgt
  schon aus der Reihenfolge des Packens. Aufgeklappt nimmt der Zettel die volle
  Wandbreite und belegt eine Reihe allein. In der Fußzeile steht der Fortschritt (etwa
  „3 / 7"), auch am zugeklappten Zettel. An einer täglichen Aufgabe gibt es weder
  Fortschritt noch Durchstreichen — dort sind nur Bonus-Unteraufgaben erlaubt, und die
  sind wiederholbare Belohnungen, kein „noch vier übrig". Statt eines bleibenden Zeichens
  quittiert das Zettelchen kurz und kehrt zurück. Bekannte Randbedingung: klappt man den
  letzten Zettel ganz unten auf der Seite zu, springt der Inhalt um rund 85 px. Das
  Dokument schrumpft, während die Seite bereits am Anschlag steht — es bleibt kein
  Bildlaufweg für die Korrektur. Überall sonst hält die Position auf einen halben Pixel.
- **Abreißen**: Eine Aufgabe wird erledigt, indem man ihren Zettel am **Eselsohr** in der
  unteren rechten Ecke nach unten zieht. Ab einem Zugweg von 56 px reißt er ab. Ein
  kürzerer Zug, ein waagerechter Zug und ein Zug nach oben setzen den Zettel zurück, ohne
  etwas zu erledigen — und der nachlaufende Klick wird geschluckt, weil er an einem
  Zettelchen sonst eine ungewollte Erledigung wäre.
  - Der **Punktwert fliegt** danach in die Statusleiste und quittiert dort seine Ankunft.
    Die Zahl in der Fußzeile ist dieselbe, die fliegt: der Aufwand abzüglich bereits
    erledigter Abzugs-Unteraufgaben. Eine Zahl am Zettel ist ein Versprechen.
  - **Ein Abriss quittiert immer**, auch wenn es null Punkte gibt (weil die
    Unteraufgaben den Aufwand schon aufgezehrt haben). Dann fliegt „erledigt" statt einer
    Zahl — dieselbe Bahn, nur leiser. Kein Zettel verschwindet stumm.
- **Fetzen**: Nach dem Abreißen hängt unter der Wand ein **Fetzen** mit Titel und
  Punktwert. Ein Tipp darauf klebt den Zettel zurück: er kehrt an die Wand zurück, die
  Punkte verschwinden aus dem Wochenziel, die Zeile aus dem Erledigt-Streifen.
  - **Rückgängig heißt hier: die Erledigung wird gelöscht, nicht gegengebucht.** Sie hat
    nicht stattgefunden — eine Gegenbuchung stünde als erfundenes zweites Ereignis in
    Verlauf und Statistik. Gelöscht wird ausschließlich die eigene jüngste Erledigung
    dieser Aufgabe; fremde bleiben unangetastet.
  - Zurück kommt der **ganze Zustand**, nicht nur „erledigt": auch der Zeitpunkt der
    letzten Erledigung (er ist der Anker der Kadenz — bliebe er stehen, verschöbe sich
    die nächste Fälligkeit um ein volles Intervall), die Zuständigkeit und der Zustand
    der Unteraufgaben.
  - **Der Fetzen verfällt nicht.** Er verschwindet erst beim Verlassen der Pinnwand, beim
    Umschalten des Aussehens oder beim Neuladen — also nie in einem Moment, den der
    Nutzer nicht selbst herbeigeführt hat. Ein früherer Entwurf mit Zeitfenster ließ die
    Erledigt-Liste beim Verfallen springen, sodass ein aufliegender Finger die falsche
    Zeile traf.
  - Es hängt immer nur **ein** Fetzen, der jüngste. Ein neuer Abriss ersetzt den
    vorigen.
  - Nicht zu verwechseln mit **„wieder dreckig"** im Erledigt-Streifen: das setzt die
    Aufgabe erneut auf „dran", behält aber die Punkte.
  - **Preis der Geste:** auf dem Eselsohr scrollt die Seite nicht (rund 1500 px² je
    Zettel). Andernfalls würde der Browser beim Zug nach unten selbst zu scrollen beginnen
    und die Geste abbrechen, bevor sie erkannt ist. Überall sonst auf dem Zettel scrollt es
    normal, und während des Scrollens plus einer kurzen Nachlaufzeit löst gar keine Geste
    aus.
- **Long-Press mit vier Richtungen**: Halten auf einem Zettel blendet vier Richtungen um
  ihn herum ein: oben verschieben, unten erledigen, links zuweisen, rechts Aufwand
  anpassen. Ziehen in eine Richtung und Loslassen führt sie aus; zurück zur Mitte
  widerruft. Genau in der Diagonalen wird nichts gewählt.
  - Die **Belegung ist bei jedem Aufgabentyp dieselbe** — auch dort, wo eine Richtung
    selten sinnvoll ist. Eine Bedienart, deren Belegung je nach Typ wechselt, muss bei
    jedem Griff neu gelernt werden.
  - Damit liegen **vier Bedienarten auf demselben Zettel**. Sie grenzen sich über drei
    verschiedene Achsen ab: gegen das Antippen (aufklappen) über die Zeit, gegen das
    Abreißen am Eselsohr über den Ort, gegen den Bildlauf über die Bewegung. Im Zweifel
    gewinnt immer die andere — ein abgebrochener Long-Press klappt den Zettel weiterhin
    auf.
  - **Der Long-Press kostet keine Bildlauffläche.** Der Bildlauf wird erst abbestellt,
    wenn die Geste ausgelöst hat; bis dahin gehört die Zettelfläche ganz dem Scrollen.
    Anders als beim Eselsohr, wo ein gesperrter Fleck der Preis der Geste ist.
  - Die **Beschriftungen werden vermessen, nicht geschätzt**: der Kranz wird am
    Fensterrand so weit hereingeschoben, wie es die tatsächliche Textbreite verlangt, je
    Seite getrennt. Eine Übersetzung oder ein längeres Wort verschiebt damit nichts.
  - **Aufgeklappt hat ein Zettel kein Eselsohr** — seine untere rechte Ecke ist zugleich
    die des letzten Zettelchens, und ein Zug dort hätte die ganze Aufgabe statt der
    Unteraufgabe erledigt.
- **Erledigt-Streifen** unter der Wand — erledigte Aufgaben verschwinden nicht, sie sinken
  nach unten. Je Aufgabe eine ruhige Zeile von 36 px: Personenfarbe als Punkt,
  durchgestrichener Titel, Zeitstempel, und ein Knopf, der sie wieder auf „dran" setzt. Die
  Wand selbst bleibt dadurch frei von allem, was schon getan ist.
  - Der Zeitstempel zeigt heute die Uhrzeit, älter das Datum — eine Uhrzeit ohne Datum an
    einer zwei Wochen alten Aufgabe wäre irreführend.
  - Die Personenfarbe kennt nur die **laufende Woche**; ältere Erledigungen fallen auf
    `tasks.last_completed_at` zurück und bleiben farblos. Farblos heißt „unbekannt", und
    das stimmt. Am Wochenanfang ist die Liste deshalb überwiegend grau.
  - **Verschobene** Aufgaben landen in derselben Liste, tragen aber keinen Durchstreich und
    keinen farbigen Punkt — der Punkt beantwortet „wer hat das gemacht", und bei einer
    verschobenen Aufgabe hat es niemand gemacht. Sie zeigen stattdessen, worauf verschoben
    wurde.
  - Der Knopf ist bewusst nur so hoch wie die Zeile, statt der sonst üblichen 48 px. Dafür
    ist die Trefferfläche an den Inhaltsbereich der Zeile gebunden statt an eine eigene
    Zahl: ein Knopf, der seine Zeile um einen halben Pixel überragt, betätigt den der
    **nächsten** Zeile — und setzt damit die falsche Aufgabe wieder auf dran.
- **FAB**: ein Bedienelement für Suchen und Neuanlegen (Lupe mit Plus-Abzeichen), wie im
  klassischen Screen. Der Header trägt dafür weder Lupe noch Plus. Die Wand reserviert
  unten Platz für ihn, damit er keine Erledigt-Zeile und keinen Zettel verdeckt.

## `/history` — HistoryView

Chronologischer Verlauf aller Completions.

## `/stats` — StatsView

Gamification-Statistiken (Balken-/Tortendiagramm + Verlaufsgrafik mit Wochen-/Monatsansicht).

## `/shopping` — ListsView

Zwei Subtabs: **Einkauf** (ShoppingView) & **Packlisten** (PackingView).

### ShoppingView

Einkaufsliste mit dauerhaften Kategorien (Umbau 08/2026):

- **Kategorien** sind eigene Zeilen in `shopping_categories` (je Liste, Name eindeutig
  groß-/kleinschreibungsunabhängig). Die Verknüpfung läuft weiter über den **Namen** in
  `shopping_items.category` (nullable = „Unkategorisiert"), nicht über einen Fremdschlüssel —
  jede schreibende Stelle muss deshalb getrimmt und case-insensitiv vergleichen
  (`normalizeCategoryName`). Eine Kategorie bleibt bestehen, bis sie gelöscht wird, auch leer.
- **Sortierung der Sektionen** (`compareCategoryGroups`): gefüllte benannte Kategorien nach
  `sort_order` → gefülltes „Unkategorisiert" → leere benannte → leeres „Unkategorisiert".
  Die Ansicht sortiert **nach** dem Einblenden der Grace-Produkte erneut, damit eine Sektion
  erst nach Ablauf des Rückgängig-Fensters nach unten wandert.
- **Sektionen kompakt**: Kopfzeile ~34 px (Anzahl als Badge). Die Add-Zeile ist sichtbar,
  solange in der Kategorie nichts gekauft wurde, danach eingeklappt und über das Plus im Kopf
  zurückholbar. Leere Kategorien starten eingeklappt.
- **Menge** (`shopping_items.quantity`, >=1): reines ×N-Label (kein Stepper — Kauf ist ein
  einzelner Fertig-Flip).
- **Gekauft**: globaler Block unten mit Kauf-Historie (`times_purchased`, letzter Kauf/Käufer),
  NICHT per Kategorie gruppiert. Grace (~6 s, `useGraceWindow`): frisch Gekauftes bleibt
  durchgestrichen in seiner Kategorie, wandert erst nach Ablauf in den Gekauft-Block.
- **Priorität**: ⭐ inline als reines Highlight (kein Hochsortieren). Sortierung nach Name.
- **Obere Leiste**, einzeilig bis 360 px: Produktfeld (Autocomplete) · ×N · Kategorie-Combobox ·
  Hinzufügen · Kategorie anlegen. Die Zielkategorie wird beim Tippen aus der Kaufhistorie
  vorbelegt (`suggestCategoryFor`: erst aktuelle Liste, dann die übrigen) und überschreibt
  eine Wahl von Hand nie. Beim Listenwechsel wird die Leiste zurückgesetzt.
- **Kategorie-Combobox** (`components/CategoryCombobox.vue`, auch im Artikel- und im
  Anlegen-Modal): Vorschläge aus allen Listen des Haushalts (eigene zuerst, fremde mit
  Herkunft), darunter beschriftete Trennlinie und „«Eingabe» neu anlegen" — die Liste ist nie
  leer. Ein unbekannter Name wird beim Speichern angelegt (Toast „Kategorie ‚X' angelegt"); ein
  Treffer aus einer fremden Liste übernimmt nur den Namen, nie deren Produkte.
- **Kategorie anlegen**: `ShoppingCategoryCreateModal` — Name plus Ankreuzliste aller Produkte
  der Liste (mit ihrer bisherigen Zugehörigkeit, gekaufte eingeschlossen); Anlegen und
  Umhängen laufen als ein Store-Aufruf.
- **Löschen** über `CategoryEditModal` (Prop `variants`): bei nicht leerer Kategorie beide
  Wege mit konkreter Zahl („nur Kategorie" → Produkte nach Unkategorisiert / „mit Produkten"),
  leere Kategorie ohne Rückfrage. Umbenennen fasst auch gekaufte Produkte an.
- **Ziehen** (`composables/useCategoryDrag.ts`, SortableJS direkt, `forceFallback`): Halten mit
  Bewegungsschwelle verschiebt ein Produkt zwischen Kategorien, auch in „Unkategorisiert" und
  in leere eingeklappte Sektionen (schmale Ablagefläche). Der Drop wird im DOM zurückgerollt,
  geschrieben wird nur die Zielkategorie; innerhalb der Kategorie bleibt es alphabetisch.
  Kein Ziehen in oder aus dem Gekauft-Block. Bearbeiten läuft über den Stift in der Zeile.
- **Voll offline**: optimistische Updates + Mutation-Queue (`shopping_mutation_queue`), auch
  für Kategorie-Mutationen; eine Verletzung der Namens-Eindeutigkeit beim Sync gilt als Erfolg
  (Verschmelzen). Offline angelegte Items sind sofort abhak-/editierbar — nach dem Create-Sync
  werden ihre Folge-Mutationen per Temp-ID-Verkettung (`reconcileTempId`) umgehängt.
  `loadItems` merged Server-Rows ohne in-flight-optimistische Items zu überschreiben.
- Store: `useShoppingStore` — Getter `itemsByCategory`, `currentListCategories`,
  `categorySuggestions`; Actions `createItem(name, category, quantity)`, `updateItem`,
  `createCategory(name, itemIds?)`, `renameCategory`, `deleteCategory(name, { withItems })`,
  `suggestCategoryFor`, `togglePriority`, `markPurchased`/`markUnpurchased`. Eigener
  Realtime-Kanal für `shopping_categories`.

**Geteilte Bausteine** (auch von PackingView genutzt): `components/ListItemRow.vue`
(Zeilen-Shell + Trailing-Slot), `components/CategoryRail.vue` (Rail mit Bubble-Redesign:
höher, farbig, 4-Buchstaben-Label, ab >8 Kategorien dichter), `components/CategoryEditModal.vue`,
`components/CategorySearchModal.vue` (Prop `importItems`, nur noch Packliste),
`composables/useLongPress.ts`, `composables/useGraceWindow.ts`, `composables/useCategoryRail.ts`.

### PackingView

Nach Kategorien gruppierte Packlisten (Redesign 07/2026):

- **Kategorien**: frei definierbare Textlabels pro Liste (keine Kategorie-Tabelle), Farbe
  deterministisch aus Namens-Hash (`lib/categoryColor.ts`, feste 12er-Palette). „Unkategorisiert"
  (`category = null`) ist immer vorhanden, muted, unten angepinnt. Fertige Kategorien sinken
  nach unten + klappen zu; offene manuell zuklappbar (Session-State, kein DB-Feld).
- **Entkoppeltes Modell**: `packed` (Fertig-Flag) ist unabhängig von `packed_count` (0..`quantity`).
  Körper-Tap togglet nur `packed`; Stepper `[–] X/N [＋]` (nur qty>1) ändert `packed_count`
  (Voll → auto-fertig, drunter → wieder offen). Long-Press / Rechtsklick öffnet Edit-Modal.
- **Add-Zeile pro Sektion** klappt ein, sobald in der Sektion etwas gepackt ist
  (`packedCount > 0`), „+ hinzufügen" öffnet wieder (`forcedAddOpen`-Set).
- **Wiederverwendung**: „+ Kategorie"-Schnellsuche (`CategorySearchModal`) verschmilzt Neu-Erstellen
  + Import distinct (Kategorie × Quell-Liste) über den Haushalt; Import überspringt Namens-Dubletten.
  „Neue Liste" kann leer oder als Kopie einer bestehenden Liste (`copyList`) erstellt werden.
- **Reise-Notizen** (`packing_lists.notes`, Freitext, einklappbar oben).
- Store: `usePackingStore` — Getter `itemsByCategory`, `overallProgress`; Actions `togglePacked`,
  `incrementPacked`/`decrementPacked`, `updateItem`, `addItem(name, category)`, `importCategory`,
  `copyList`, `updateNotes`. Optimistische Updates mit Revert.

## Weitere Routes

- `/notes` — **NotesView** — Haushalt-Notizen (alle Mitglieder können erstellen/bearbeiten/löschen)
- `/login` — LoginView
- `/register` — RegisterView
- `/household-setup` — HouseholdSetupView
