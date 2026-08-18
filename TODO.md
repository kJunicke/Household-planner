# Putzplan TODOs

**Status:** 🎉 Live auf GitHub Pages

Aufbau: **Aktiv** (als Nächstes) · **Backlog** (irgendwann) · **Bekannte Randfälle**
(geprüft, bewusst akzeptiert — keine Aufgabe) · **Security** · **Changelog**.

---

## 🔥 Aktiv

### Punkte-Skala
- **1p ≈ 10 min → 1p ≈ 5 min** umstellen. Braucht Migration (bestehende Werte 1p → 2p)
  und Nachziehen aller Punkte-Texte/Defaults.

### Aufräumen (klein, jederzeit)
- **`bootstrap.bundle.min.js` aus `main.ts` entfernen** — JS ist nachweislich entbehrlich
  (0 Treffer `data-bs-`, kein `new bootstrap.*`; Dropdowns sind eigene
  `.suggestions-dropdown`-Blöcke, Modals laufen über Teleport). `bootstrap.min.css` bleibt,
  solange das klassische Aussehen existiert.
- **`SubtaskManagementModal.vue.backup` prüfen und löschen.**
- **Disabled `.btn-primary` ist im klassischen Aussehen Bootstrap-Blau** (`#0d6efd`).
  Ursache: `.btn:disabled` (0,2,0) schlägt den Override `.btn-primary` (0,1,0) in `base.css`.
  Im Pinnwand-Aussehen bereits behoben.

### Listen — vorbestehend, aus der 07/05-Abnahme belegt
- **`.reset-inline-btn` ist 27×32 px**, das Projekt verlangt 48. In **beiden** Aussehen
  identisch, also keine Folge von Ticket 07. Braucht eine `::after`-Erweiterung wie die
  übrigen kleinen Knöpfe.
- **Klassisches `.add-confirm:disabled` ist praktisch unsichtbar**: `rgb(79,70,229)` mit
  `opacity: 0.4`, weißes Plus darauf ≈ **1,9:1**. Der bereits notierte `.btn-primary`-Fall
  weiter oben beschreibt Bootstrap-Blau `#0d6efd` — `.add-confirm` ist ein davon getrennter
  Fall und dort nicht erfasst. Im Pinnwand-Aussehen bereits richtig gelöst.
- **„Leere Kategorien nach unten" wirkt in den Listentypen verschieden.** Im Einkauf steht
  die leere Kategorie **hinter** `Unkategorisiert`, in Packlisten und To-do **davor**
  (gemessen: Bad, Kueche, Schlafzimmer, Wohnzimmer, *leer*, *vollständig*, Unkategorisiert).
  Ob das Absicht ist, klärt die Spec nicht.

### Überstempeln (`emphasis_level`) — Randfälle aus der 09a-Abnahme
- **Tägliche Unteraufgaben unter einem Projekt verlieren ihr Überstempeln nächtlich.**
  `Am Projekt arbeiten` trägt `task_type = 'daily'`, der Elternknoten ist ein Projekt;
  Step 4 von `reset_recurring_tasks()` greift nach `task_type`, nicht nach dem Elternknoten.
  Die Spec sagt für Projekte „Nachdruck bleibt". Folgenlos, solange 09b nur Elternzettel
  stempelt — **vor** einem Stempel an Unteraufgaben zu klären.
- **Der Checklisten-Zweig der Edge Function setzt `emphasis_level` nicht zurück.**
  Früher Return bei `parent_task_id !== null && subtask_points_mode === 'checklist' &&
  effortOverride === undefined`: schreibt nur `completed` und `last_completed_at`, liefert
  auch kein `warning`-Feld. Betrifft nur Unteraufgaben — dieselbe Bedingung wie oben.
- **`docs/data-model.md` kennt `emphasis_level` nicht.** Beschrieben ist die Spalte nur im
  Glossar (`CONTEXT.md`) und in den Migrationskommentaren.

### Pinnwand-Ausbau — die fünf offenen Tickets

> Der Ausbau ist am 18.08.2026 nach `main` gemergt (`d8f0aa7`). Abgenommen sind
> Karten-Redesign, Wand-Anordnung, Erledigt-Streifen, gedämpfte Kategorien, langer
> Zettel, Nachdruck-Datenmodell, Zuweisungsfarbe, Stapelreihenfolge und Titelbreite.
> **Diese fünf hier sind nicht gebaut.** Die ausführlichen Tickets liegen unter
> `.scratch/pinnwand-ausbau/issues/` — und das ist **gitignored**, hängt also an
> dieser Platte. Was hier steht, ist die haltbare Fassung.

- **Richtungskranz einbauen (00b).** Lang drücken zeigt heute noch den alten
  Chip-Kranz um die Karte. Gebaut werden soll das Vollbild-Overlay mit
  Beschriftungen an den vier **Bildschirmrändern**: Randnebel + Pfeil, dunkelgrüner
  Schleier, blass (0,3) in Ruhe und voll deckend (1,0) bei anliegender Richtung,
  Pfeil kurz an der Karte und frei zum Finger drehend, in der Diagonale leuchtet
  **nichts**. Beschriftung fett mit dunkler Kontur, ausdrücklich **keine**
  Kreideschrift (getestet, wegen Lesbarkeit verworfen).
  **Der Entwurf ist vom Nutzer abgenommen** („Sieht super aus") und vollständig in
  [HANDOFF-ziehgeste.md](HANDOFF-ziehgeste.md) beschrieben — offen ist nur der
  Umbau von `WallDirectionMenu.vue`. Beim Einbau zu entscheiden: `COMMIT_DISTANCE`
  (48 px, der ursprüngliche Grund ist mit den Randbeschriftungen entfallen) und die
  Schleier-Deckkraft (0,82 schluckt die Zettel, ~0,6 wäre besser).
  Der Prototyp liegt auf `proto/kartengroesse` als `PrototypeKranzView.vue` unter
  `/proto-kranz` — **Wegwerfcode, kommt nicht mit**, und die Voreinstellung dort
  ist `aether`, nicht die abgenommene Fassung `tafel` (`?v=tafel` anhängen).
  **Nicht bauen:** der im Handoff genannte „zufällige Randabstand 8–34 px" ist
  eine dritte, nie ins Layout übernommene Größe — das Anliegen ist mit Ticket 02
  bereits gelöst (`indentOf`, 12 px, deterministisch aus der `task_id`).
  Blockiert Projekte (03).
- **Aufklappen springt (13).** Ein aufgeklappter Zettel soll liegen bleiben und
  die blockierenden Zettel unter sich schieben; heute springt er selbst durch die
  Wand. Ursache im Code: er bekommt die volle Wandbreite und wird von `packWall`
  komplett neu platziert — das ist heute **so gewollt** und wird über den
  Scroll-Anker aufgefangen, statt verhindert. Dieses Ticket dreht die
  Entscheidung um. Erster Schritt ist eine Messung, ob der Scroll-Anker
  überhaupt noch greift; „mittlerweile kaputt" deutet auf eine Regression aus
  02, 11 oder 12.
- **Zettel breiter streuen, Überlapp begrenzen (14).** Die Zettel überlappen
  „fast immer", der Abstand nach rechts ist zu gering, und rechts bleibt oft
  Platz übrig. Gewünscht: mehr Streuung in der Waagerechten **und** eine
  Obergrenze für den Überlapp. Heutige Größen: `rowGapOf` 8…16 px Luft nach
  rechts, `jitterOf` ±5 px Versatz, `indentOf` 0…12 px nur links.
  **Nicht die Neigung deckeln** — die überlappenden Ecken sind ausdrücklich
  gewollt („durch z. B. Drehung der Karten passiert das ja manchmal, das sieht
  ganz gut aus"). Der Deckel gehört auf die Layout-Rechtecke. Die Ursache liegt
  woanders: `packWall` reserviert die Spalten ab `bestColumn`, gezeichnet wird
  aber bei `bestColumn × 4 + dx` — die Reservierung kennt den Versatz nicht.
  Dazu zieht `dy` (−6,5…+1,5 px) einen Zettel nach oben, während `gapOf` nur
  2…15 px Abstand lässt: bis zu −4,5 px echte Überlappung. Beides hängt am Hash,
  trifft also immer dieselben Zettel — daher „fast immer".
  Der Reststreifen rechts ist dagegen Arithmetik: bei 45 % Deckel bleiben auf
  374 px rund 26 px liegen.
- **Der Stempel wird zusammengelegt (09b).** Ein Stempel je Zettel statt zweier: der
  Grundabdruck ist berechnet (NEU / FÄLLIG / ROUTINE / Projektspruch), darüber stempelt man
  von Hand WICHTIG und DRINGEND. NIE und HEUTE entfallen. Der Stempel **ordnet nichts um**
  → [ADR-0002](docs/adr/0002-stempel-ordnet-nicht.md). **Ändert bereits deployten Code:**
  `complete-task` muss tägliche Aufgaben ins Zurücksetzen aufnehmen, und der nächtliche
  Reset in `reset_recurring_tasks()` entfällt — neue Migration nötig, Migrations sind
  append-only, und der Function-Deploy ist ein eigener Schritt.
  ~~Punkte-Sticker erst ab vier Fußzeilen-Elementen (15)~~ ist dadurch **erledigt**: jeder
  Zettel trägt jetzt einen Stempel, die dreiteilige Fußzeile gibt es nicht mehr.
- **Wochenziel-Leiste in jede Ansicht (08).** Heute liegt sie in
  `WallStatusBar.vue` und ist damit **nur auf der Pinnwand** sichtbar; in Einkauf,
  Notizen und Historie fehlt sie. Der Header soll überall gleich aussehen: Papier,
  Wochenziel-Leiste, keine Rangliste, kein Logo — in allen Ansichten und in
  **beiden** Aussehen. Der Header ist damit die **bewusste Ausnahme** vom
  Aussehen-Schalter, der einzige Teil der Papier-Optik ohne `data-design`-Gate;
  das gehört im Code als Absicht kommentiert. Dafür wandern die `--pw-*`-Tokens
  aufs blanke Wurzelelement, die Papier-*Regeln* bleiben gegated. Die Leiste muss
  ihre Höhe weiter als CSS-Variable melden — die Wand reserviert danach ihr unteres
  Polster. Unabhängig von allem anderen, kann sofort starten.
- **Projekte auf der Pinnwand (03).** Das Abzeichen am Projektzettel zeigt die **Summe der
  bisher verschlungenen Punkte** als Zahl — immer sichtbar, ab 0. Die Summe steht in
  `task_completions`; die Wand lädt heute nur die laufende Woche, das braucht eine eigene
  Abfrage (bewusst keine zweite Spalte auf `tasks`). Projekte bekommen **gar keinen**
  Richtungskranz. Die Geste bleibt: nach unten ziehen öffnet den
  `ProjectWorkModal` — dasselbe Fenster wie „Am Projekt arbeiten" im klassischen
  Aussehen, mit Eintrag was gemacht wurde und wie viel Aufwand. Kein einfaches
  Erledigen, kein Verschieben; zuweisen läuft über den Stift am Zettel. Baut auf
  00b auf.
- **FAB wechselt keine Ansicht (01).** Eigenständig, kleines Ticket.
- **Überstempeln am Zettel (09b).** Die Spalte `emphasis_level`, die Migration
  und die drei Reset-Fälle stehen (09a, `ccc1dd4`, Edge Function als v22 deployt) —
  die **Bedienung fehlt**. Vorbedingung 00a ist inzwischen erfüllt. Vorher die drei
  Überstempeln-Randfälle weiter unten in dieser Datei klären: sie betreffen genau die
  Unteraufgaben, die 09b stempeln würde.

**Richtungsentscheidungen ohne Ticket** — aus der Grilling-Session, bewusst als
„Out of Scope" in der Spec gelandet und deshalb nie ein Ticket geworden. Sie standen
damit nur in `.scratch/pinnwand-ausbau/spec.md`, also gitignored:

- **Das klassische Aussehen soll auf Dauer verschwinden.** Wörtlich vom Nutzer:
  „wir wollen das aussehen ja generell in die gesamte App nach und nach übertragen."
  Der Aussehen-Schalter bleibt vorerst, aber die Richtung ist gesetzt. Wer eine
  Papier-Regel hinter `data-design` gatet, tut das für eine Übergangszeit, nicht für
  immer. Der Abschnitt „Erst wenn der alte `CleaningView` wegfällt" weiter unten
  hängt an dieser Entscheidung.
- **Die Einkaufsansicht wird vollständig auf die geteilten Bausteine umgebaut.**
  Beim langen Zettel (07) wurde bewusst nur die Papierhülle herausgezogen, der Rest
  ausdrücklich vertagt. Überschneidet sich mit „alle drei Listentypen auf geteilte
  Bausteine" weiter unten, ist aber die weitergehende Entscheidung.
- **Die Rangliste im Haushalts-Store.** Ticket 08 entfernt die Rangliste aus dem
  Header; der berechnete Wert wird dadurch unbenutzt und darf bleiben oder
  entfallen. Bewusst offen gelassen, nicht vergessen.

**Prototypen-Zweige** (Wegwerfcode, aber mit abgenommenen Entscheidungen darin):
`proto/kartengroesse` (9 Commits, Kartengröße + Kranz-Prototyp) und
`prototype/einkauf-pinnwand`. Ihre Ergebnisse stehen in
[HANDOFF-kartengroesse.md](HANDOFF-kartengroesse.md) und
[HANDOFF-ziehgeste.md](HANDOFF-ziehgeste.md); die Zweige selbst gehören **nicht**
nach `main`.

### Pinnwand — offene Arbeit
- **Kuratierte Personenfarben-Palette + Migration bestehender `user_color`-Werte.**
  Die Umrandung ist die einzige Person-Info am Zettel, `#4A90E2` misst nur 3,23 gegen Papier
  / 2,43 gegen Kork. Kein Laufzeit-Snapping — die gewählte Farbe bleibt die angezeigte.
  Löst nebenbei: auf hellen Personenfarben wirkt das Aufleuchten als Sättigungs- statt
  Helligkeitssprung (Rotkanal nur 2,1 von 7,4 Stufen).
- **Ältere Erledigungen kennen ihren Erlediger nicht** — der Store lädt nur Completions der
  laufenden Woche, davor grauer Punkt im Erledigt-Streifen. Braucht eigene Query.
- **Kosmetik außerhalb des Bootstrap-Perimeters** sticht auf Kork heraus:
  `.list-chip.active`, `.cat-count`, `.rail-bubble`, weiche Schatten an
  `.category-nav-container` und `.fab`.
- **Punktwerte über 5 fallen alle auf denselben Sticker** (goldener Stern) —
  Bonus-Unteraufgaben sind damit optisch nicht unterscheidbar. Die
  Prototyp-Sitzung hat eine sechste Stufe (Rosette) als denkbar notiert; das
  steht nur in `HANDOFF-kartengroesse.md` und in keinem Ticket.
- **„Langer Zettel" als Begriff** ist zugestimmt, aber ohne Bindung — wörtlich
  „Ja, Zettel oder langer Zettel ist okay." Wem ein besseres Wort begegnet, darf
  es vorschlagen.
- **Badge-Kontur auf gesättigten Füllungen kaum lesbar** (1,93:1 gegen `effort-badge`,
  3,60:1 gegen `completed-badge`). Zierde, keine Information.

**Erst wenn der alte `CleaningView` wegfällt:**
- Doppelte Suchlogik auflösen: `src/lib/taskSearch.ts` vs. Inline-Version in `CleaningView.vue`
  (belegt identische Trefferlisten).
- Nach `pinnwand.css` heben: `.zettel*`, `.pin`, `.tape`, `.clip`, `.points`, `--owner-none`
  (aus `WallNote.vue`), `.fab-card`/`.fab-btn`/`.fab-plus` + Such-Overlay (aus `WallView.vue`).
  `.wall` bleibt scoped.

### Pinnwand — aus der 12er-Abnahme (Titel/Sticker)
- **`footGap = 6` ist verdrahtet** (`WallView.vue`, Messblock) und kommentiert mit
  `// .foot { gap: 6px }`. Dieselbe Fehlerklasse, gegen die `chromeWidth` und
  `cornerExtra` gerade angetreten sind — messbar über `getComputedStyle(footEl).columnGap`.
- **Die Packung des ersten Laufs ist eine andere als danach.** Frisch geladen 3355,52 px
  Wandhöhe, nach dem ersten Relayout 3548,12 und dann stabil — bei identischen Breiten,
  Höhen, Reihenfolge und `metaTop`-Menge, also allein andere Positionen aus `packWall`.
  Der alte Stand lieferte beide Male denselben Wert. Vermutlich vorbestehend, Ursache
  liegt in den Höhen, die der erste Lauf an `packWall` übergibt. Nicht weiterverfolgt.
- **`relayout` schreibt `wall.style.height` inline und nimmt es nie zurück**
  (Scroll-Anker-Zweig). Im Ruhezustand deckt sich der Inline-Wert mit dem gerechneten;
  beim Messen ist er eine Fehlerquelle.

### Korrektheit / Robustheit
- **`runLoadTasks` ersetzt `tasks.value` komplett** — ein Realtime-Echo für eine *fremde*
  Zeile zwischen SELECT und Zuweisung wird überschrieben (Echo-Schutz greift nur für eigene
  IDs). Zweimal belegt, einmal 6 s falscher Zustand. Richtung: Zeilen einzeln mergen.
- **Geschwister-Subtasks parallel abschließbar** — Doppel-Tap-Sperre greift pro `task_id`,
  gleichzeitige `complete-task`-Aufrufe für Geschwister berechnen ggf. verschiedene Punkte.
- **Listen-DELETE kommt bei anderen Sessions nicht an** — Kanal filtert auf `household_id`,
  DELETE liefert ohne `REPLICA IDENTITY FULL` nur den PK. Betrifft Packliste + To-do.
- **`currentHousehold` überlebt externen Logout** bis zur nächsten Navigation.
- **Verschieben wird auch an *erledigten* Aufgaben angeboten.** `canPostpone`
  (`taskSchedule.ts`) prüft nur `task_type`, nicht `completed` — obwohl der eigene
  Kommentar sagt, Verschieben ergebe nur Sinn, „wo eine Aufgabe überhaupt drängelt".
  Eine erledigte Aufgabe drängelt nicht: sie hat gerade ein `last_completed_at` bekommen,
  aus dem ihre nächste Fälligkeit folgt. Ein Verschiebe-Datum ersetzt diese Ableitung durch
  eine Handeingabe (`postponed_until` ist die alleinige Weckquelle, `reset_recurring_tasks()`
  schaltet die Kadenz-Klausel ab, solange sie steht) und **tilgt nebenbei die Erledigung
  optisch**: die Zeile im Erledigt-Streifen zeigt danach „verschoben auf …" statt Uhrzeit,
  und der Personenpunkt wird neutral — wer es getan hat, ist nicht mehr ablesbar, obwohl die
  Punkte verbucht bleiben. Beim QC zu Ticket 04 gefunden; der Zugang ist dort geschlossen —
  aber an der **Aufrufstelle** (`TaskEditModal.vue`: `canPostpone(task) && !task.completed`),
  nicht in `canPostpone` selbst.
  **Warum nicht einfach `!completed` in `canPostpone` ziehen:** `postponeTask` setzt selbst
  `completed = true`. „Erledigt" und „verschoben" sehen auf der Spalte identisch aus, sie
  trennen sich nur über einen Eintrag in `task_completions`. Ein `!completed` in `canPostpone`
  nähme damit auch **verschobenen** Aufgaben das Verschieben — ein gesetztes Datum ließe sich
  nur noch über „wieder dreckig" korrigieren. Ob das gewollt ist, ist eine Entscheidung, keine
  Aufräumarbeit. Wer hier weitermacht, muss zuerst diese Frage beantworten.
  *Aus dem Code abgeleitet, nicht gemessen:* ein Ziel unterhalb von
  `last_completed_at + recurrence_days` holt die Aufgabe dabei heran statt sie wegzuschieben —
  die freie Tageszahl darf ausdrücklich unter der Kadenz liegen. Wird vom Zugangs-Fix
  miterledigt.
  *Nebenpunkt, kosmetisch:* die Vorauswahl „nach Intervall" rechnet `heute + recurrence_days`
  statt `last_completed_at + recurrence_days` und verzögert dadurch um `heute − last_completed_at`
  Tage. Für eine überfällige Aufgabe vertretbar. **Nicht mit anfassen**, solange niemand es
  ausdrücklich beauftragt.
- **Abhaken löscht die Priorität unwiderruflich** — `shoppingStore.ts:846` setzt beim Kauf
  `is_priority: false`, `markUnpurchased` (Z. 871) stellt sie nicht wieder her. Wer aus
  Versehen abhakt und zurückholt, verliert den Stern still. Beim QC zu Ticket 01 an zwei
  Artikeln belegt.
- **Etappen C–F der optimistischen Aktualisierungen** →
  `.scratch/ux-etappen-08-2026/optimistic-updates-plan.md`.

### UX-Umbauten (durchgegrillt, warten auf eine Session)
- **Sticky-Kategoriekopf im Putzen-Tab** — Kopf klebt unter dem Header, braucht
  `--header-height` per `ResizeObserver`. **Blocker:** `CategoryNav` klebt mit `z-index: 850`
  bei `top: 0` über dem Header (z-index 100) — nur zusammen mit dem Rail-Punkt lösbar.
- **Kategorie-Rail statt Filterbubbles im Putzen-Tab** — Rail *springt*, `CategoryNav`
  *filtert* exklusiv; Ersatz kostet den Filter. Dazu Kollision mit dem Such-FAB und breitere
  TaskCards. Eigener Design-Durchgang.
- **„Alles löschen" in die Einstellungen** — Sektion „Gefahrenzone" in `SettingsSidebar`,
  Bestätigung durch Eintippen des Haushaltsnamens. Löscht `task_completions` haushaltsweit
  (Warnung muss das sagen). UI ist aus `HistoryView` schon raus,
  `taskStore.deleteAllCompletions()` hat derzeit keinen Aufrufer.
- **Add-Zeilen global ausblenden, sobald irgendwo abgehakt wurde** — heute pro Kategorie
  (`isAddOpen()` in `ShoppingView.vue`). Offen: manuell geöffnete Zeile stehenlassen
  (`forcedAddOpen`), und ob die Zeilen beim Enthaken zurückkommen.
- **Kategorie umbenennen inline statt im Modal.** Zu klären: wohin das Löschen wandert
  (Modal trägt „nur Kategorie" vs. „mit Produkten" samt Sicherheitsabfrage). Einkauf und
  Packliste gemeinsam umstellen.
- **Sichtbares Vokabular sagt noch „Item"** (Modaltitel, Toasts, Löschabfrage) — laut Glossar
  heißt es **Eintrag**. Betrifft beide Listentypen auf einmal. Datenspalten (`packed`,
  `packed_count`) bleiben unberührt.
- **Letzte Liste nicht löschbar** — Regel sitzt in `deleteList` *und* an `:can-delete` in
  `ChecklistView`. Falls für To-do unerwünscht: `allowDeletingLastList?: boolean` in
  `ChecklistStoreConfig` **plus** Prop, zusammen.
- **Wischgeste app-weit ausrollen** — `useSwipeAction` aus dem Verlauf-Redesign; Einkauf und
  Packliste nutzen noch `useLongPress`.

### Architektur-Kandidaten (Review 02.08.2026)
Kandidat 1 erledigt (Changelog). Reihenfolge = Empfehlung, Stärke in Klammern.

- **2 — Punkteberechnung als ein Modul** *(Strong)*. Formel lebt in der Edge Function
  `complete-task`, das Completion-Modal rechnet sie für seine Warnung nach. Das Modul darf
  nur *vorhersagen* — `task_completions` bleibt Single Source of Truth.
- **3 — Kategorisierte Liste als ein Modul** *(Strong)*. `addCategory`/
  `categoryImportCandidates` zeichengleich in beiden Stores, Item-Edit-Modals unterscheiden
  sich in 8/147 Zeilen. Durch die geteilten Bausteine teils entschärft — neu vermessen.
  Überschneidet sich mit „alle drei Listentypen auf geteilte Bausteine" (Einkauf bleibt
  außen vor wegen eigener `shopping_categories`, Preisen, Priorität, Drag-&-Drop).
- **4 — CleaningView gibt Regeln ab** *(Strong)*. Suchranking (100/80/60/40) und
  Tab-Zuordnung noch View-lokal. Baut auf `lib/taskSchedule.ts` auf.
- **5 — Offline-Queue als Modul** *(Worth exploring)*. 8 Call-Sites im Einkaufsstore; Folge:
  die Packliste hat gar kein Offline.
- **6 — Haushalts-Scope & Realtime** *(Speculative)*. 60 direkte `supabase.from()`, ~20×
  dieselbe Guard-Präambel, 5× dupliziertes Subscribe/Unsubscribe. Größter Umbau, schwächste
  Evidenz — nicht ohne Anlass anfangen.

---

## 💡 Backlog

- **„Meine Aufgaben"-View** — 5. Tab in CategoryNav, Filter `assigned-todo`, Store-Computed
  `taskStore.assignedTasks`.
- **Gamification** — XP/Level/Streaks pro Haushalt, Ranglisten, Achievements.
- **Push Notifications** für überfällige Tasks.
- **Task Categories** (Küche, Bad, …) und **Task Templates** für neue Haushalte.
- **Form Validation** für alle Forms.
- **Automatisierte Tests** — aktuell bewusst keins (manuell via Claude-in-Chrome, siehe
  CLAUDE.md). Falls das kippt: Vitest für reine Logik (erster Kandidat `useHistoryGroups`),
  Playwright für Login / Task-Complete / Shopping-Add. Erst dann greifen `/implement` und
  `/tdd` mit echten Red-Green-Slices.

---

## 🟡 Bekannte Randfälle (geprüft, akzeptiert — keine Aufgabe)

- **Kein Timer für den Wochenwechsel** bei dauerhaft offenem Tab ohne jede Interaktion.
- **`promoteDueWeekStart()` scheitert still** — folgenlos, weil die Leseregel ein fälliges
  Pending ohnehin anwendet.
- **Legende bei drei Mitgliedern** ellipsiert Namen ab 5 Zeichen auf 375 px. Hebel:
  „ Pkt" streichen (+19 px) oder Legende auf 10 px.
- **Kein Puffer zwischen `+N`-Marke und Balken** (1,16 px / 1,8 px Rest) — kollisionsfrei,
  aber jede Änderung an Schriftgröße, Zeilenhöhe oder Drehung kippt es.
- **Helligkeitsdeckel des Aufleuchtens plateaut** ab dem 7,6-fachen Wochenziel; oberhalb
  trägt die `+N`-Zahl das Ausmaß.
- **Zielzahl auf kleinen Telefonen**: 390×844 → 17 Zettel, 375×667 → 10 (Ziel „rund zwölf").
  Preis des 0,68-Breitendeckels.
- **Balken 18 px kürzer als das Papier** (Spritzer-Streifen), leichte Asymmetrie 20/30 px.
- **Zettel-Vermessung kostet ~75 % der Layoutzeit** (7,2–18,4 ms bei 23 Zetteln), wächst
  linear — bei deutlich mehr Aufgaben spürbar.
- **Gezogener Zettel springt bei fremdem Realtime-Relayout** bis 114,7 px unter dem Finger
  (bewusst von der Animation ausgenommen).
- **Akzent-Perforation am Eselsohr** liegt mit 0 px Reserve auf der Ausschnittkante.
- **Acht Zettel sind sechs- oder siebenzeilig** (vorher einer). Die Regel, die den
  Punkte-Sticker nach oben schickt, minimiert die Breite des einzelnen Zettels und
  schaut nie auf seine Höhe — ein schmaler Zettel ist ein hoher Zettel. Die Wand ist
  unterm Strich trotzdem kürzer (3548,12 gegen 3596,72). Vom Nutzer gesehen und so
  entschieden. Wer hier Höhe optimieren will, baut eine andere Regel, nicht diese um.
- **Zuklappen ganz unten springt ~85 px** (Dokument schrumpft am Scroll-Anschlag);
  Aufklappen 0,23 px, Seitenmitte 0,49 px.
- **Inter ist nirgends geladen** — kein `@font-face`, kein Link; die Wand rechnet mit Inter,
  rendert aber System-Schrift.

**Ungeprüft, nicht widerlegt** (Prüfumgebung erreicht sie nicht):
- Verschwinden des Fetzens bei fremder Löschung.
- Unterer Klemmfall des Richtungskranzes (drei Seiten punktgenau gemessen).
- Ein einmaliger Vorfall beim Fetzen (Punkte gebucht, Aufgabe nicht erledigt, Rückgängig
  weg) — trat mit eingefrorenem Automatisierungs-Renderer auf, in 142 s Wiederholung nicht
  reproduzierbar. Auf echtem Gerät nachstellen, falls Gewissheit gewünscht.

---

## 🔒 Security (Audit 16.02.2026)

### 🔴 HIGH
- **`households` SELECT mit `USING (true)`** — jeder User liest alle Haushalte + Invite-Codes
  (`20251026000001_rls_policies.sql:59-62`). Fix: SECURITY-DEFINER
  `find_household_by_invite_code(code)`, SELECT auf Membership beschränken.
- **Soft-Delete + RLS** — `deleted_at` in UPDATE/DELETE-Policies nicht gefiltert
  (`20260103202609_soft_delete_tasks.sql`).
- **Keine Length-Limits → DB-DOS** — `NotesView.vue:95-103` ohne `maxlength`, ebenso
  `tasks.title`, `shopping_items.name`. Fix: UI + `CHECK`-Constraint.
- **Kein Rate-Limiting** auf Edge Function und DB-Writes.
- **npm audit: 18 Vulnerabilities (10 high)** — Vite 7.0-7.3.1, @babel/…, ws. Alle Fixes
  verfügbar, Dev-Server-only.

### 🟠 MEDIUM
- **Kein `onAuthStateChange`-Listener** in `authStore.initializeAuth()`.
- **Jeder Member kann den Haushalt löschen** (`…rls_policies.sql:94-101`) → `owner_id`.
- **`task_completions` DELETE erlaubt Stat-Manipulation** (`…rls_policies.sql:258-270`).
- **CORS `*`** in `supabase/functions/complete-task/index.ts:14`.
- **Schwache Password-Policy** (6 Zeichen, kein Strength-Check, `RegisterView.vue:60-66`).
- **Email-Verification nicht erzwungen** — Dashboard-Setting prüfen.
- **30+ console.log mit sensitiven Daten** → `esbuild.drop: ['console']` im Prod-Build.

### 🟢 LOW
- **Password-Reset-Flow fehlt** (`resetPasswordForEmail()`).
- **localStorage-Cleanup bei Logout** (shoppingStore-Cache, Shared-Device-Leak).
- **SUPABASE_ACCESS_TOKEN in `.env`** liegt im Nextcloud-Sync (Backup-Risiko).

### ✅ Bereits gut
Kein `v-html`/`eval`/`innerHTML` · Edge Function via `auth.getUser()` server-verified ·
Realtime mit `household_id`-Filter · SW cached nur statische Assets · `.env` nicht committed ·
`SUPABASE_ACCESS_TOKEN` ohne `VITE_`-Prefix.

---

## ✅ Erledigt (Changelog)

- **Einkaufsliste-Angleichung + Zentralisierung** — 07/2026. Geteilte Bausteine aus
  PackingView herausgelöst (`useLongPress`, `useGraceWindow`, `useCategoryRail`,
  `ListItemRow`, `CategoryRail`, `CategorySearchModal` mit `importItems`); Einkauf bekam
  Migration `category`/`quantity`, Kategorie-Gruppierung, Gekauft-Block mit Grace-Move,
  ×N-Label, Stern-Highlight, Top-+Sektion-Add, Long-Press-Edit; voll offline via
  `reconcileTempId` + `loadItems`-Merge. Spec-Details: `git log` / CLAUDE.md.
- **Fälligkeit als ein Modul** (Architektur-Kandidat 1) — 03.08.2026. Überfällig-Regel
  existierte 4× mit drei Antworten auf „nie erledigt". Jetzt: *ob* dran → `tasks.completed`,
  *wie dringend* → `lib/taskSchedule.ts`. Dazu [CONTEXT.md](CONTEXT.md),
  [ADR 0001](docs/adr/0001-completed-ist-zustand-keine-ableitung.md), BUG-PATTERNS #4.
- **Packlisten-Redesign** — 16.07.2026
- **Quick-Aufgaben + vereinter Such-/Erstellen-FAB** — 26.06.2026
- **UX Look & Feel P0–P2 + Folge-Politur** — 06/2026
- **Verlaufsgrafik (Trend Line Chart) in StatsView** — 16.02.2026
- **Soft Delete für Tasks** — 04.01.2026
- **CleaningView UX Redesign** — 22.12.2025
- **Fix: Deduct-Subtask Overflow Bug** — 22.12.2025
- **Haushalt-Notizen Feature** — 22.12.2025
- **Task-Dringlichkeitsanzeige & Skip-Funktion** — 02.12.2025
- **Bottom Navigation für Mobile UX** — 02.12.2025
- **Typography-Vereinheitlichung** (Single Source: base.css) — 30.11.2025
- **Chip-Navigation mit Swipe-Gesten** — 30.11.2025
- **Header-Komprimierung + Settings Sidebar** — 30.11.2025
- **Daily Tasks Bonus-only Subtasks** — 30.11.2025
- **Responsive Design ohne Media Queries** — 23.11.2025
- **TaskCard Typography & Spacing**, **Mobile Layout + Modal Refactoring**,
  **Kompakt-Design** — 23.11.2025
- **Shopping-Liste Offline-Modus** — 16.11.2025
- **Shopping-Liste Priorisierung** (`is_priority`) — 15.11.2025
- **Projects Feature** (langfristige Tasks, Effort-Logging) — 15.11.2025
- **Loading States & Race Condition Fixes**, **Toast System** — 06.11.2025
- Subtasks mit Completion-Modes · Effort Override · Stats Dashboard · User Colors · Confetti

---

## 📝 Notizen

**Migrations:** konsolidiert am 26.10.2025 (29 → 4).
