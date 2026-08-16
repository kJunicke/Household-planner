# Putzplan TODOs

**Status:** 🎉 Live auf GitHub Pages

---

## 🛒 Einkaufsliste-Angleichung + Zentralisierung ✅ (07/2026)

**Umgesetzt.** Einkaufsliste an das Packlisten-Redesign angeglichen + gemeinsame
Bausteine zentralisiert. Details siehe CLAUDE.md (ShoppingView-Abschnitt).

- **Geteilte Bausteine** aus PackingView herausgelöst: `composables/useLongPress`,
  `useGraceWindow`, `useCategoryRail` (Scrollspy-Rail; Gruppierung bleibt store-lokal,
  da Item-Shapes differieren), `components/ListItemRow` (Shell + Trailing-Slot),
  `components/CategoryRail` (Bubble-Redesign), `CategorySearchModal` (Prop `importItems`,
  von packingStore entkoppelt). Packliste darauf umgestellt + regressionsgetestet.
- **Einkauf**: Migration `shopping_items.category`/`quantity` (prod gepusht), Kategorie-
  Gruppierung (nur „Zu kaufen"), globaler Gekauft-Block mit Grace-verzögertem Move, ×N-Label,
  Stern-Highlight (kein Hochsortieren), Top-+Sektion-Add, Long-Press-Edit, Rename/Löschen,
  Namens-Reuse.
- **Voll offline**: Temp-ID-Verkettung (`reconcileTempId`) + `loadItems`-Merge, das
  in-flight-optimistische Items nicht überschreibt.

<details><summary>Ursprünglicher Plan (abgehakt)</summary>

**Ziel:** Die beim Packlisten-Redesign gewonnenen Optimierungen gezielt auf die Einkaufsliste übertragen und die wiederverwertbaren Teile **echt zentralisieren**.

**Ziel:** Die beim Packlisten-Redesign gewonnenen Optimierungen gezielt auf die Einkaufsliste übertragen und die wiederverwertbaren Teile **echt zentralisieren** (Packliste wird auf geteilte Bausteine umgestellt, danach voll neu durchgetestet). Kernnutzen: Kategorien/Aisle-Struktur beim Einkauf, volle Offline-Fähigkeit, eine Quelle der Wahrheit für Rail/Grace/Row/Modals.

> Design durchgegrillt (`/grill-me`, 9 Kern-Entscheidungen + 2 Zusatzanforderungen). Dies ist die verbindliche Spec.

### Strategie
- **Gezielt portieren**, nicht voll vereinheitlichen: Einkaufs-Eigenheiten (Priorität, Kauf-Historie, Offline-Queue) bleiben; Pack-Features die passen kommen dazu.
- **Echt zentralisieren:** Rail + Grace + Kategorie-Gruppierung liegen heute *inline* in `PackingView` → als geteilte Composables/Komponenten herauslösen, beide Views nutzen sie.

### Einkauf bekommt
- **Kategorien** (`category`, nullable): **immer gruppiert** wie Packen, „Unkategorisiert" unten gepinnt. Nur für den „Zu kaufen"-Teil.
- **Globaler Gekauft-Block** bleibt unten mit Kauf-Historie (`times_purchased` / Datum / Wer) — *kein* per-Kategorie-Collapse.
- **Menge** (`quantity`): reines **×N-Label** (kein Stepper, kein Teil-Fortschritt; Einkauf ist binär).
- **Grace + verzögerter Move:** Abgehaktes bleibt ~6 s durchgestrichen **in seiner Kategorie**, wandert *erst nach Ablauf* in den Gekauft-Block. Un-Haken während Grace → bleibt oben.
- **Long-Press-Edit-Modal:** Name · Kategorie · Menge · Löschen. ⭐-Stern bleibt inline (schneller Toggle), 🗑 wandert ins Modal → ruhigere Zeile.
- **Kategorie-Rail** (Scrollspy-Schnellnav), sichtbar ab >1 Kategorie.
- **Kategorie-Rename/Löschen** via `CategoryEditModal` (Item-Count-Warnung).
- **Kategorie-Namens-Reuse** via `CategorySearchModal` im Modus `importItems:false` → nur Name anlegen/wiederverwenden (Autocomplete über Haushalt), **keine** Item-Übernahme (Items anderer Listen könnten abgehakt sein).
- **Voll offline:** alle Item-/Kategorie-Aktionen optimistic + Queue, inkl. *offline anlegen → sofort abhaken/bearbeiten* (temp-ID-Verkettung, beim Sync aufgelöst). Listen-CRUD bleibt online.

### Rail-Redesign (geteilt → wirkt auch beim Packen)
- Höhere/schönere Bubbles, Label = **erste 4 Buchstaben**, eingefärbt nach `categoryColor(name)`.
- Bei vielen Kategorien (zu wenig vertikaler Platz) **adaptiv kompakter** (Fallback auf heutige gestauchte Darstellung).

### Datenmodell (Migration `shopping_items`)
```sql
ALTER TABLE shopping_items ADD COLUMN category text;               -- NULL = Unkategorisiert
ALTER TABLE shopping_items ADD COLUMN quantity int NOT NULL DEFAULT 1;
-- KEIN packed_count (Einkauf ist binär, kein Teil-Fortschritt)
```
- Bestehende Items: `category = NULL` → „Unkategorisiert".
- Constraints: `CHECK (quantity >= 1)`, `CHECK (length(category) <= 100)`.
- Index: `(list_id, category)`.
- RLS: neue Spalten erben bestehende Policies; kein zusätzlicher Policy-Bedarf.
- **Prod-Push:** wird explizit mit dem User abgestimmt (append-only, nie gepushte Migrations editieren).

### Geteilte Bausteine (neu extrahiert)
- `components/CategoryRail.vue` — Rail + Scrollspy + Redesign (bubbles/4-char/adaptiv).
- `components/ListItemRow.vue` — Zeilen-Shell (Long-Press-Gesture, Checkbox, Name, packed-Styling, a11y) mit **Trailing-Slot**: Packen = Stepper, Einkauf = ⭐-Stern + ×N-Label.
- `components/CategoryEditModal.vue` — bereits generisch (category + itemCount + emits), wird geteilt genutzt.
- `components/CategorySearchModal.vue` — mit `importItems`-Prop (Packen `true`, Einkauf `false`).
- `composables/useLongPress.ts`, `composables/useGraceWindow.ts`, `composables/useCategorizedList.ts` (Gruppierung/Reihenfolge).
- `lib/categoryColor.ts` bleibt geteilt.

### Lead-Dev-Defaults (bestätigt)
- **Add-Wege:** Top-Suchleiste bleibt (schnell → „Unkategorisiert") **plus** per-Sektion-Add-Line je Kategorie.
- **Priorität + Kategorien:** ⭐ bleibt reines Highlight, **kein** Hochsortieren innerhalb der Kategorie.
- **Packliste bekommt kein Offline** (bewusst außen vor, YAGNI).

### Bewusst NICHT dabei
- Listen-Notizen für Einkauf; Listen-Kopie für Einkauf (in Q5 nicht gewählt); voll-Vereinheitlichung; Listen-CRUD offline.

### Umsetzung in 4 Phasen

**Phase 0 — Zentralisierung (Extraktion aus PackingView)**
- [x] `useLongPress` aus `PackingItemRow` herauslösen; `PackingItemRow` darauf umstellen
- [x] `useGraceWindow` aus `PackingView` herauslösen
- [x] Scrollspy-Rail-State als `useCategoryRail` extrahiert (Gruppierung blieb store-lokal statt `useCategorizedList` — Item-Shapes differieren)
- [x] `CategoryRail.vue` herausgelöst (+ Bubble-Redesign: 4-char, tinted, adaptiv)
- [x] `ListItemRow.vue` als Shell mit Trailing-Slot; `PackingView` nutzt es (Stepper im Slot)
- [x] `CategorySearchModal` um `importItems`-Prop erweitert + von packingStore entkoppelt
- [x] Regressions-Test Packliste (Chrome MCP)

**Phase 1 — Fundament Einkauf (Migration + Store + Gruppierung)**
- [x] Migration `shopping_items` (category, quantity) + CHECK-Constraints + Index (prod gepusht)
- [x] Types: `ShoppingItem` (category, quantity)
- [x] `shoppingStore`: `itemsByCategory`, `updateItem`, `renameCategory`, `deleteCategory`; Create-Payload erweitert
- [x] `ShoppingView` auf Kategorie-Gruppierung umgebaut, globaler Gekauft-Block bleibt
- [x] `ListItemRow` mit ⭐-Stern + ×N-Slot; Long-Press → Edit-Modal
- [x] Top-Add-Bar (→ Unkategorisiert) + per-Sektion-Add-Line

**Phase 2 — Kategorie-Features + Grace**
- [x] `CategoryRail` in ShoppingView (ab >1 Kategorie)
- [x] `CategoryEditModal` (Rename/Löschen) verdrahtet
- [x] `CategorySearchModal` (`importItems:false`) — Namens-Reuse ohne Item-Import
- [x] Grace mit verzögertem Move

**Phase 3 — Offline-Ausbau + Politur**
- [x] `processMutation` create um category/quantity ergänzt
- [x] Temp-ID-Verkettung (`reconcileTempId`): offline neu angelegte Items sofort abhak-/editierbar
- [x] Alle neuen Aktionen queue-fähig + optimistic; `loadItems`-Merge gegen Clobber
- [x] CLAUDE.md-Doku aktualisiert
- [x] Browser-Test (Chrome MCP): Kategorien, Rail, Grace-Move, Stern, Add-Wege ✓
- [x] Self-Review + PR

</details>

---

## 🎯 Offene Aufgaben

### Pinnwand-Redesign — Reste aus Etappe 1 (Ticket 03, 16.08.2026)

- **`bootstrap.bundle.min.js` aus `main.ts` entfernen** (Aufräum-Etappe).
  Prüfergebnis aus Ticket 03: **entbehrlich**, in dieser Etappe bewusst noch nicht
  entfernt. Belege:
  - `grep -rn "data-bs-" src/` → 0 Treffer.
  - Kein `new bootstrap.*`, kein `import … from 'bootstrap'` außerhalb der zwei
    Zeilen in `src/main.ts`.
  - Die drei fraglichen Dropdown-Stellen sind eigene `.suggestions-dropdown`-Blöcke
    mit `v-if` und scoped CSS, keine Bootstrap-Komponente:
    `ChecklistView.vue:548`, `ShoppingView.vue:502`, `ShoppingView.vue:668`.
  - Modals laufen ohnehin über Teleport + `v-if`.

  Das **CSS** (`bootstrap.min.css`) bleibt vorerst — das alte Aussehen braucht es.

- **Disabled `.btn-primary` ist im klassischen Aussehen Bootstrap-Blau** (`#0d6efd`
  statt `--color-primary`). Ursache: Bootstraps `.btn:disabled` (0,2,0) mit
  `--bs-btn-disabled-bg` schlägt den Override `.btn-primary` (0,1,0) in `base.css`.
  Sichtbar auf jeder Route mit disabled Primärbutton, z. B. „Notiz erstellen" auf
  `/notes` bei leerem Feld. In Ticket 03 nur für das Pinnwand-Aussehen behoben
  (`pinnwand.css`), klassisch bewusst unangetastet gelassen.

- **Badge-Kontur auf gesättigten Füllungen kaum lesbar.** Die Pinnwand-Kontur
  `1.5px rgba(36,31,26,.55)` misst gegen `effort-badge` (`#2B4A8F`) nur **1,93:1**,
  gegen `completed-badge` (`#198754`) 3,60:1 — gegenüber 9,71:1 auf dem hellen
  `overdue-badge`. Zierde, keine Information; deshalb vertagt.
  (`getComputedStyle` meldet zudem 1px statt 1.5px — Rundung auf Gerätepixel bei DPR 1.)

- **Kosmetische Reste außerhalb des Bootstrap-Perimeters im Pinnwand-Aussehen.**
  Komponenteneigene Klassen, laut Spec ausdrücklich Out of Scope („Etappe 1 färbt die
  übrigen Views über die Tokens mit, mehr nicht"), stechen auf Kork aber heraus:
  `.list-chip.active` auf `/listen` (kräftiges Indigo-Pill, r16px), `.cat-count`
  (r999px), `.rail-bubble` (r14px), weiche Schatten an `.category-nav-container`
  (`rgba(0,0,0,.05) 0 2px 8px`) und `.fab` (`rgba(0,0,0,.15) 0 4px 12px`).

### Pinnwand-Redesign — vertagt aus Etappe 2 (Ticket 04, 16.08.2026)

- **Kuratierte Personenfarben-Palette + Migration bestehender `user_color`-Werte.**
  Von der Spec (Etappe 1) vorgesehen, im Lauf bewusst als eigenes Ticket vertagt, weil
  es eine DB-Änderung und die Farbwahl des Nutzers braucht. Befund des QC: die
  Umrandung ist die einzige Person-Information am Zettel, aber `#4A90E2` misst nur
  **3,23** gegen Papier und **2,43** gegen Kork. Zwischenlösung in Ticket 04: der Rand
  ohne Zuständigen tritt zurück (`#CAC4B8`, 1,71/1,28), damit eine Personenfarbe
  wenigstens immer kräftiger ist als die Nicht-Farbe. **Kein Laufzeit-Snapping** — die
  gewählte Farbe muss die angezeigte bleiben.

- **Zielzahl auf kleinen Telefonen.** Gemessen: 390×844 → **17** Zettel ohne Scrollen,
  375×667 → **10** (Spec-Ziel „rund zwölf"). Ursache ist der 0,68-Breitendeckel, der
  auf der schmaleren Wand sechs Titel zweizeilig macht. Bewusster Preis für die
  Nutzerentscheidung „Titel brechen nicht unnötig um".

- **Suchlogik liegt doppelt vor.** `src/lib/taskSearch.ts` (Wand) gegen die
  Inline-Version in `CleaningView.vue` (alter Screen, durfte nicht angefasst werden).
  QC-Beleg: identische Trefferlisten in Inhalt und Reihenfolge für „test", „wischen",
  „e". Auflösen, sobald der alte View wegfällt.

- **Aus den Komponenten nach `pinnwand.css` heben**, sobald der alte View wegfällt:
  `.zettel`, `.zettel--daily`, `.zettel--project`, `.pin`, `.tape`, `.clip`,
  `.points`, `--owner-none` (aus `WallNote.vue`) sowie `.fab-card`/`.fab-btn`/
  `.fab-plus` und die Pinnwand-Fassung des Such-Overlays (aus `WallView.vue`).
  `.wall` selbst bleibt scoped.

### Pinnwand-Redesign — vertagt aus Etappe 3 (Tickets 07 + 08, 17.08.2026)

- **Kein Timer für den Wochenwechsel bei dauerhaft offenem Tab.** Das Wochenfenster
  wird beim Laden, beim Sichtbarwerden des Tabs und bei Realtime-Ereignissen
  nachgezogen — nicht aber von selbst. Ein Tab, der über Mitternacht des
  Wochenwechsels im Vordergrund liegt und **gar keine** Interaktion sieht, zeigt bis
  zum nächsten Auslöser das alte Fenster. Bewusst akzeptiert (zwei Nutzer, mobil).

- **`promoteDueWeekStart()` scheitert still.** Schlägt das Fortschreiben
  Pending → Aktiv dauerhaft fehl (offline, RLS-Änderung), bleibt die Zeile für immer
  im Pending-Zustand, ohne dass es irgendwo sichtbar wird. Unkritisch, weil die
  Leseregel ein fälliges Pending ohnehin anwendet und die Anzeige damit richtig
  bleibt — genau dafür ist sie vom Schreiben entkoppelt.

- **Legende bei drei Mitgliedern.** Auf 375 px ellipsieren die Namen ab **5 Zeichen**
  (gemessen; die Rechnung des Implementierers lag mit ≈6,8 rund 30 % zu optimistisch).
  Punktzahlen und Farben bleiben vollständig. Laut Ticket zulässig — gestaltet wird
  für zwei Personen, drei müssen nur funktionieren. Hebel, falls es stört: „ Pkt" aus
  der Punktzahl streichen (+19 px) oder die Legende auf 10 px setzen.

- **Kein Puffer zwischen `+N`-Marke und Balken.** Gescrollt bleiben **1,16 px**, und
  die 22-px-Kopfzeile trägt die um 3° gedrehte Marke (20,20 px) mit nur 1,8 px Rest.
  Aktuell kollisionsfrei, aber jede Änderung an Schriftgröße, Zeilenhöhe oder Drehung
  von `.status-over` kippt es. Die feste Kopfhöhe muss dann mit angehoben werden.

- **Helligkeitsdeckel des Aufleuchtens ist ein echtes Plateau.** Ab dem 7,6-fachen
  des Wochenziels sieht das Pulsieren bei jedem Stand gleich aus. Bewusst so: der
  Deckel hält die Segmentfarben mit exakt 70 % lesbar, und oberhalb trägt die exakte
  `+N`-Zahl das Ausmaß. Der QC hält 0,30 eher für zu kräftig als für zu schwach.

- **Auf hellen Personenfarben trägt das Aufleuchten schwächer**, als der Mittelwert
  nahelegt: bei knappem Überschuss 7,4 Stufen im Mittel, im Rotkanal aber nur 2,1 —
  es wirkt dort als Sättigungsverschiebung statt als Helligkeitssprung. Löst sich
  vermutlich mit der kuratierten Farbpalette (siehe Etappe 2).

- **Der Balken ist 18 px kürzer als das Papier**, weil rechts dauerhaft ein Streifen
  für die Spritzer reserviert ist — auch unter dem Ziel. Vom QC geprüft: ein genau
  erreichtes Ziel sieht trotzdem voll aus, weil der Streifen außerhalb der Spur liegt.
  Bleibt eine leichte Asymmetrie (20 px links, 30 px rechts bis zur Papierkante).

### Task Management
- **"Meine Aufgaben" View** - Extra Tab für zugewiesene Tasks (Option 1)
  - CategoryNav erweitern um 5. Tab: "Meine Aufgaben"
  - Neuer Filter in TaskList: `filter="assigned-todo"`
  - Store-Computed: `taskStore.assignedTasks` (filtert nach `assigned_to = current_user_id`)
  - Pattern: Standard in Asana "My Tasks", Todoist "Assigned to me"

### Gamification System
- **User Stats** - XP, Level, Streaks pro Haushalt
- **Ranglisten** - Mitglieder nach XP sortiert anzeigen

### Vertagt aus der Grilling-Session 16.08.2026

Durchgegrillt, bewusst **nicht** in derselben Session umgesetzt. Kontext und Begründungen
stehen im Handoff-Dokument der Session.

- **Sticky-Kategoriekopf im Putzen-Tab** — beim Scrollen soll die aktuelle Sektion oben
  angepinnt bleiben. Entschieden: Header bleibt sticky, Kopf klebt direkt darunter →
  braucht `--header-height` per `ResizeObserver`. **Blocker:** hängt am Filterbubbles-Punkt
  darunter, weil `CategoryNav` heute mit `z-index: 850` bei `top: 0` klebt und den Header
  (z-index 100) verdeckt — beides muss zusammen gelöst werden.
- **Kategorie-Rail statt Filterbubbles im Putzen-Tab** — `CategoryRail` + `useCategoryRail`
  wiederverwenden, aber: die Rail *springt*, `CategoryNav` *filtert* exklusiv. Ersatz
  bedeutet Verlust des Filters. Zusätzlich zwei ungelöste Layout-Fragen: Kollision mit dem
  Such-FAB (beide fixed unten rechts) und die deutlich breiteren TaskCards gegenüber
  Listenzeilen. Braucht eigenen Design-Durchgang.
- **„Alles löschen" aus dem Verlauf in die Einstellungen** — als eigene Sektion
  „Gefahrenzone" in der `SettingsSidebar`, Bestätigung durch exaktes Eintippen des
  Haushaltsnamens (GitHub-Muster). Löscht nur `task_completions`, haushaltsweit — die
  Warnung muss sagen, dass auch die Erledigungen der anderen Person verschwinden.
  Die UI wurde bereits aus `HistoryView` entfernt, `taskStore.deleteAllCompletions()`
  bleibt vorerst ohne Aufrufer.
- **Refactoring aller drei Listentypen auf geteilte Bausteine** — Einkauf, Packliste,
  To-do unter einen Hut. Heute nur Packliste + To-do geteilt (`useChecklistStore`,
  `ChecklistView`); Einkauf bleibt außen vor, weil es eine eigene `shopping_categories`-
  Tabelle, Preise, Priorität und Drag-&-Drop hat. Braucht eine eigene Session.
  Überschneidet sich mit Architektur-Kandidat 3.

### Vertagt aus den UX-Etappen 08/2026

Während Etappe 2 aufgefallen, bewusst nicht dort mit umgesetzt — beides betrifft die
Einkaufs-Kopfzeile und hätte den Verdichtungs-Umbau vermischt.

- **Add-Zeilen global ausblenden, sobald irgendwo abgehakt wurde** — heute entscheidet
  `isAddOpen()` in `ShoppingView.vue` pro Kategorie (`purchasedPerCategory.get(key)`), die
  Add-Zeile verschwindet also nur in der Kategorie, in der etwas abgehakt wurde. Gewünscht
  ist: sobald in der Liste *irgendwo* ein Produkt abgehakt ist, verschwinden **alle**
  Add-Zeilen — man ist dann im Laden und nicht mehr am Erfassen. Offene Kanten: (a) eine
  manuell per „+" geöffnete Zeile sollte beim Abhaken vermutlich stehenbleiben, sonst reißt
  es dem Nutzer das Feld mitten im Tippen weg (`forcedAddOpen`); (b) ob die Zeilen
  zurückkommen, wenn das letzte abgehakte Produkt wieder entharkt wird, oder für die
  Sitzung weg bleiben.
- **Kategorie umbenennen inline statt im Modal** — für ein einziges Namensfeld ist
  `CategoryEditModal` zu schwer. Gewünscht: Tap auf den Kategorienamen macht daraus ein
  Eingabefeld direkt in der Kopfzeile. Zu klären: wo das Löschen hinwandert — das Modal
  trägt heute auch die Löschvarianten „nur Kategorie" vs. „mit Produkten" samt
  Sicherheitsabfrage, die gefährliche Aktion braucht ihre Rückfrage weiterhin. Das Modal
  wird von Einkauf **und** Packliste benutzt; beide gemeinsam umstellen, sonst zerfällt die
  gemeinsame Gestensprache aus Etappe 2.

Während Etappe 5 aufgefallen, beides **vorbestehend** und deshalb nicht dort mitgenommen:

- **Das Löschen einer Liste kommt bei anderen Sessions nicht an.** Der Listen-Kanal in
  `createChecklistStore` filtert auf `household_id`; bei DELETE liefert Postgres ohne
  `REPLICA IDENTITY FULL` nur den Primärschlüssel, der Filter greift also ins Leere. Item-
  Löschungen kommen an, weil dieser Kanal keinen Filter hat. Betrifft Packliste und To-do
  gleichermaßen. Zu klären: `REPLICA IDENTITY FULL` auf der Listentabelle oder der Filter
  raus und clientseitig aussortieren.
- **Sichtbares Vokabular sagt noch „Item"** (Modaltitel „Item bearbeiten", Toasts „N Items
  übernommen", Löschabfrage „Kategorie + 2 Items löschen?"). Laut Glossar heißt ein
  einzelnes Element **Eintrag**. Betrifft nach der Extraktion beide Listentypen auf einmal,
  ist aber eine sichtbare Änderung an der funktionierenden Packliste und gehört deshalb in
  eine eigene Etappe. Die Datenspalten (`packed`, `packed_count`) bleiben davon unberührt —
  sie umzubenennen würde ein Feld-Mapping erzwingen und genau die Sonderfälle einführen,
  die die geteilte Schicht vermeiden soll.
- **Letzte Liste nicht löschbar** — die Regel sitzt in `deleteList` *und* am Löschen-Knopf
  in `ChecklistView` (`:can-delete`). Für To-do womöglich unerwünscht. Falls gewünscht:
  `allowDeletingLastList?: boolean` in `ChecklistStoreConfig` **plus** Prop an die Ansicht,
  zusammen, nicht einzeln.

Während Etappe 6 aufgefallen:

- **`runLoadTasks` ersetzt `tasks.value` komplett** mit dem Stand zum SELECT-Zeitpunkt. Ein
  Realtime-Echo für eine **fremde** Zeile, das zwischen SELECT und Zuweisung eintrifft, wird
  dabei überschrieben — der Echo-Schutz greift nicht, weil eine fremde ID nicht „in Flug"
  ist. Zweimal belegt: einmal blieb `last_completed_at` 13 ms daneben stehen und konvergierte
  nicht mehr (folgenlos), einmal zeigte ein Tab eine fremde Aufgabe über 6 s als erledigt.
  Vorbestehend, aber Etappe 6 löst pro Abschluss zusätzliche Reloads aus und vergrößert das
  Zeitfenster. Richtung: Zeilen einzeln mergen statt das Array zu ersetzen, oder das
  Reload-Ergebnis gegen zwischenzeitlich eingetroffene Echos abgleichen.
- **Geschwister-Subtasks lassen sich weiterhin parallel abschließen.** Die Doppel-Tap-Sperre
  greift pro `task_id`; zwei gleichzeitige `complete-task`-Aufrufe für Geschwister desselben
  Parents können unterschiedliche Punkte berechnen, weil der Parent-Wert vom kumulierten
  Subtask-Zustand abhängt. Steht so schon als Fallstrick im Plan zu Etappe 6.
- **Etappen C–F der optimistischen Aktualisierungen** stehen aus (restliche Task-Aktionen,
  Checkliste, Notizen, Offline-Queue als Modul) → `.scratch/ux-etappen-08-2026/optimistic-updates-plan.md`.

### Architektur-Kandidaten (Review 02.08.2026)

Aus dem Architektur-Review: sechs Stellen, an denen dieselbe Regel mehrfach existiert.
Kandidat 1 ist umgesetzt (siehe Changelog), 2–6 stehen offen. Reihenfolge = Empfehlung
des Reviews, Stärke in Klammern.

- **2 — Punkteberechnung als ein Modul** *(Strong)*. Die deduct/bonus-Formel lebt in der
  Edge Function `complete-task`; das Completion-Modal rechnet sie für seine Warnung
  eigenständig nach. Zwei Antworten auf „wie viele Punkte gibt das?" — dieselbe Bauart
  wie Kandidat 1. Achtung: `task_completions` ist Single Source of Truth für Punkte, das
  Modul darf nur *vorhersagen*, nicht schreiben.
- **3 — Kategorisierte Liste als ein Modul** *(Strong)*. `shoppingStore` und `packingStore`
  haben `addCategory`/`categoryImportCandidates` zeichengleich; die beiden Item-Edit-Modals
  unterscheiden sich in 8 von 147 Zeilen. Teilweise entschärft durch die geteilten Bausteine
  aus der Einkaufsliste-Angleichung — vor dem Angehen neu vermessen.
- **4 — CleaningView gibt Regeln ab** *(Strong)*. Suchranking (100/80/60/40) und
  Tab-Zuordnung stecken weiterhin in View-lokalen Funktionen. Die vier Sortierungen sind
  mit Kandidat 1 erledigt. Baut direkt auf `lib/taskSchedule.ts` auf.
- **5 — Offline-Queue als Modul** *(Worth exploring)*. Im Einkaufsstore zwischen die
  Domänenaktionen gefädelt (8 Call-Sites). Folge: die Packliste hat gar kein Offline.
- **6 — Haushalts-Scope & Realtime** *(Speculative)*. 60 direkte `supabase.from()`-Aufrufe,
  ~20× dieselbe Guard-Präambel, 5× dupliziertes Subscribe/Unsubscribe. Größter Umbau,
  schwächste Evidenz — nicht ohne konkreten Anlass anfangen.

### Code Quality
- **`currentHousehold` überlebt externen Logout** - nach einem Sign-out in einem anderen
  Tab bleibt `householdStore.currentHousehold` im Speicher, bis die nächste Navigation den
  Router-Guard auslöst. Fund aus dem Review vom 02.08.2026, damals bewusst nicht mitgefixt.
- ~~**„Als erledigt markieren ohne Punkte" umbenennen**~~ - wird vom Verschieben-Umbau
  (Grilling 16.08.2026) abgelöst: `postponed_until`-Spalte, verschobene Aufgabe verlässt
  „Jetzt dran". Glossar-Eintrag „verschieben" und ADR-0001 müssen dabei nachgezogen werden.
- **`SubtaskManagementModal.vue.backup` prüfen und löschen** - vermutlich tot wie die
  beiden `.backup`-Dateien, die mit Kandidat 1 verschwunden sind.
- **Form Validation** - Input-Validierung für alle Forms
- **Automatisierte Tests einführen** - Aktuell bewusst KEIN Test-Framework; getestet wird
  ausschließlich manuell via Claude-in-Chrome (so in CLAUDE.md festgelegt). Wenn das kippt:
  - **Vitest** für reine Logik ohne DOM — erster Kandidat ist die Verlaufs-Gruppierung
    (`useHistoryGroups`: Tagesgrenzen, Subtask-Faltung, Waisen-Gruppen, gemischte User).
    Diese Randfälle sind manuell nur prüfbar, wenn man die Daten vorher herstellt.
  - **Playwright** für kritische E2E-Flows: Login, Task-Complete, Shopping-Item hinzufügen.
    Test-Accounts aus CLAUDE.md (test@example.com / test2@example.com).
  - Erst dann greifen `/implement` und `/tdd` mit echten Red-Green-Slices statt manueller
    Verifikation.
- **Wischgeste app-weit ausrollen** - `useSwipeAction` entsteht im Verlauf-Redesign
  (`.scratch/verlauf-verdichten/`). Einkaufs- und Packliste nutzen für Zeilenaktionen heute
  noch `useLongPress` → auf Swipe umstellen, damit die App eine Gestensprache hat.

---

## 🔒 Security (Audit 16.02.2026)

### 🔴 HIGH - Sofort handeln
- **`households` SELECT mit `USING (true)`** - Jeder eingeloggte User kann ALLE Haushalte + Invite-Codes lesen
  - Datei: `supabase/migrations/20251026000001_rls_policies.sql:59-62`
  - Fix: SECURITY-DEFINER-Function `find_household_by_invite_code(code)` erstellen, SELECT-Policy auf Membership beschränken
  - Risiko: Macht 32-Bit Invite-Code-Entropie irrelevant (enumerierbar)
- **Soft-Delete + RLS** - `deleted_at` wird in UPDATE/DELETE-Policies nicht gefiltert
  - Datei: `supabase/migrations/20260103202609_soft_delete_tasks.sql`
  - Fix: `WHERE deleted_at IS NULL` in UPDATE-Policies oder Trigger ergänzen
- **Keine Length-Limits → DB-DOS möglich**
  - `NotesView.vue:95-103` Textarea ohne `maxlength`; gleiches für `tasks.title`, `shopping_items.name`
  - Fix: `maxlength` im UI + DB-Constraint `CHECK (length(content) <= 5000)` per Migration
- **Kein Rate-Limiting** - Edge Function + DB-Writes ohne Limits → Stat-Spam, Brute-Force auf Invite-Codes
  - Fix: Supabase Native Rate-Limits konfigurieren
- **npm audit: 18 Vulnerabilities (10 high)** - Vite 7.0-7.3.1, @babel/..., ws
  - Fix: `npm audit fix` (alle Fixes verfügbar, Dev-Server-only Risiken)

### 🟠 MEDIUM
- **Kein `onAuthStateChange`-Listener** - Store kann veralten bei Token-Refresh/Logout aus anderem Tab
  - Fix: `supabase.auth.onAuthStateChange()` in `authStore.initializeAuth()` registrieren
- **Jeder Member kann Haushalt löschen** (im SQL als TODO markiert)
  - Datei: `supabase/migrations/20251026000001_rls_policies.sql:94-101`
  - Fix: `households.owner_id` einführen, DELETE-Policy auf Owner beschränken
- **`task_completions` DELETE erlaubt Stat-Manipulation**
  - Datei: `supabase/migrations/20251026000001_rls_policies.sql:258-270`
  - Fix: DELETE entfernen oder auf neueste Completion (<5 min alt) beschränken
- **CORS `Access-Control-Allow-Origin: '*'`** in Edge Function
  - Datei: `supabase/functions/complete-task/index.ts:14`
  - Fix: Origin auf GitHub-Pages-Domain + localhost whitelisten
- **Schwache Password-Policy** - 6 Zeichen min, kein Strength-Check
  - Datei: `src/views/RegisterView.vue:60-66`
  - Fix: Supabase Dashboard auf min. 10 Zeichen + Komplexität, clientseitige Validierung ergänzen
- **Email-Verification nicht erzwungen** - Dashboard-Setting prüfen ("Confirm email")
- **30+ console.log mit sensitiven Daten** (household_id, Members, Realtime-Payloads)
  - Fix: `esbuild.drop: ['console']` in Production-Build (vite.config.ts)

### 🟢 LOW
- **Password-Reset-Flow fehlt** - User können Passwörter nicht selbst zurücksetzen
  - Fix: `supabase.auth.resetPasswordForEmail()` Flow ergänzen
- **localStorage-Cleanup bei Logout** - shoppingStore cached ohne Cleanup → Shared-Device Leak
  - Fix: `localStorage.removeItem(...)` in `authStore.logout()`
- **SUPABASE_ACCESS_TOKEN in .env** - liegt in Nextcloud-synced Verzeichnis (Backup-Risiko)
  - Fix: In CI/CD-Secret-Manager halten, lokal rotieren wenn jemals exponiert

### ✅ OK / Bereits gut
- Keine `v-html` / `eval` / `innerHTML` → XSS-sauber
- Edge Function `complete-task` authentifiziert via `auth.getUser()` (server-verified)
- Realtime-Channels mit `household_id`-Filter (RLS ist Schutz)
- PWA Service Worker cached nur statische Assets, keine API-Responses
- `.env` ist nicht committed (nur .env.example)
- `SUPABASE_ACCESS_TOKEN` ohne `VITE_`-Prefix → nicht im Client-Bundle

---

## 💡 Backlog (Future Ideas)

- **Achievements** - Badges/Trophäen für besondere Leistungen
- **Push Notifications** - Erinnerungen für überfällige Tasks
- **Task Categories** - Kategorien wie Küche, Bad, Wohnzimmer etc.
- **Task Templates** - Vorgefertigte Task-Sets für neue Haushalte

---

## ✅ Erledigt (Changelog)

- **Fälligkeit als ein Modul** (Architektur-Kandidat 1) - 03.08.2026. Die Überfällig-Regel
  existierte 4× mit drei verschiedenen Antworten auf „nie erledigt". Jetzt: *ob* eine Aufgabe
  dran ist, entscheidet allein `tasks.completed` (DB); *wie dringend* sie ist, berechnet
  `lib/taskSchedule.ts`. Dazu [CONTEXT.md](CONTEXT.md) als Glossar,
  [ADR 0001](docs/adr/0001-completed-ist-zustand-keine-ableitung.md), BUG-PATTERNS #4;
  `TaskList.vue` als tote Kopie gelöscht.
- **Packlisten-Redesign** (Kategorien mit Hash-Farben, Mengen/Zähler entkoppelt von Fertig-Flag, Stepper mit Auto-Fertig, Unkategorisiert-Bucket, Auto-Collapse fertiger Kategorien, Gesamt-Fortschritt, Reise-Notizen, Kategorie-Import & Liste-kopieren, Long-Press-Edit) - 16.07.2026
- **Quick-Aufgaben + vereinter Such-/Erstellen-FAB** - 26.06.2026
- **UX Look & Feel P0–P2 + Folge-Politur** - 06/2026 (Member-Farben, FAB, CTA-Farbregel, Single-Select-Filter, TaskCard-Politur)
- **Verlaufsgrafik (Trend Line Chart) in StatsView** - 16.02.2026
- **Soft Delete für Tasks** (`deleted_at`, Historie bleibt sichtbar) - 04.01.2026
- **CleaningView UX Redesign** (Filter-Bubbles, Kategorie-Header, Überfälligkeits-Gradient, Bootstrap Icons) - 22.12.2025
- **Fix: Deduct-Subtask Overflow Bug** (`Math.max(0, …)` statt 400) - 22.12.2025
- **Haushalt-Notizen Feature** (5. Tab, Realtime-Sync) - 22.12.2025
- **Task-Dringlichkeitsanzeige & Skip-Funktion** - 02.12.2025
- **Bottom Navigation für Mobile UX** (iOS Safe-area, Material Design) - 02.12.2025
- **Vollständige Typography-Vereinheitlichung** (Single Source: base.css) - 30.11.2025
- **Chip-Navigation mit Swipe-Gesten** - 30.11.2025
- **Header Komprimierung + Settings Sidebar** - 30.11.2025
- **Daily Tasks Bonus-only Subtasks** - 30.11.2025
- **Universell Responsive Design ohne Media Queries** - 23.11.2025
- **TaskCard Typography & Spacing Update** - 23.11.2025
- **Mobile Layout Optimierung & Modal Refactoring** (TaskEditModal, TaskCreateModal) - 23.11.2025
- **UI/UX Kompakt-Design Optimierung** - 23.11.2025
- **Shopping-Liste Offline-Modus** (localStorage Cache, Optimistic Updates, Auto-Sync) - 16.11.2025
- **Shopping-Liste Priorisierung** (`is_priority`) - 15.11.2025
- **Projects Feature** (langfristige Tasks, Effort-Logging) - 15.11.2025
- **Loading States & Race Condition Fixes** - 06.11.2025
- **Toast Notification System** (Bootstrap 5 + Pinia) - 06.11.2025
- Subtasks System mit Completion-Modes
- Effort Override mit Begründung
- Stats Dashboard mit Zeit-Filtern
- User Color Customization
- Confetti Animation bei Task-Completion

---

## 📝 Notizen

**Migrations:** Konsolidiert am 26.10.2025 (29 → 4 Migrations)

# Neue Todos von Kilian
Richtwert 1p ~ 10 min auf 1p~5 min setzen 1p -> 2p migration
