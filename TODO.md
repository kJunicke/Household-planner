# Putzplan TODOs

Diese Datei ist der Backlog die aktiven todos sind tickets im Task tracker

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

### Pinnwand-Ausbau — die offenen Tickets (08/00b/01/03 erledigt)

> Der Ausbau ist am 18.08.2026 nach `main` gemergt (`d8f0aa7`). Abgenommen sind
> Karten-Redesign, Wand-Anordnung, Erledigt-Streifen, gedämpfte Kategorien, langer
> Zettel, Nachdruck-Datenmodell, Zuweisungsfarbe, Stapelreihenfolge, Titelbreite
> und seit dem 19.08. der gemeinsame Header (08). Am 21.08. dazu: der
> Richtungskranz (00b, `f4cde5a`), die Rückgängig-Geste (01, `f5bbd3c`) und die
> Projekt-Geste samt Bearbeiten-Fenster (03-1/03-4, `7bcf892`).
> **Die übrigen hier sind nicht gebaut.** Die ausführlichen Tickets liegen unter
> `.scratch/pinnwand-ausbau/issues/` — und das ist **gitignored**, hängt also an
> dieser Platte. Was hier steht, ist die haltbare Fassung.

- ~~**Richtungskranz einbauen (00b).**~~ **erledigt** — `f4cde5a`, Zweig
  `ticket-00b-richtungskranz`. Vollbild-Overlay mit Randnebel-Ellipsen und
  Beschriftung an den Bildschirmrändern; die Laufzeitvermessung des Zettels samt
  Klemmlogik ist ersatzlos entfallen. Der Messursprung wanderte von der Zettelmitte
  auf den **Aufsetzpunkt**, `COMMIT_DISTANCE` fiel 48 → **32** und wird exportiert,
  `ARROW_GAP` hängt als `COMMIT_DISTANCE - ARROW_MIN` daran. Belegt: 441
  Rasterpunkte, Richtung-ohne-Pfeil = 0, beide Spalten springen auf demselben Pixel
  (d=31 nichts, d=32 Richtung **und** Pfeil mit 3,00 px Schaft); in der Diagonale
  alle vier Nebel auf `opacity 0.3`. Unterer Randpunkt aus **gemessener**
  Nav-Höhe statt verdrahteter Zahl.
  - **Die geforderte Klemmung der rechten Beschriftung ist toter Code.** Der vom
    Ticket unterstellte 9-px-Überstand existiert bei zweizeiliger Beschriftung
    nicht (gemessen 20 px Luft bei 360/390/420 px). Die Klemme löst erst aus, wenn
    die breiteste Zeile über **100 px** misst — unabhängig von `vw`; „anpassen"
    misst 68,4 px. Formal umgesetzt, praktisch nie wirksam, **in der laufenden App
    nicht verifizierbar**. Wer eine längere Beschriftung ergänzt, aktiviert sie —
    dann greifen die beiden Schwächen darunter.
  - **Die Messzwillinge messen die falsche Sache.** Sie messen ein nacktes
    `<text>`, die echte Beschriftung ist `<text><tspan>` → **6,8 % Überschätzung**
    (94,47 gegen 88,45). Dazu läuft `measureLabels()` einmalig ohne
    `document.fonts.ready`; bei später eintreffender Schrift bliebe `halfWidth`
    veraltet. Beides folgenlos, solange die Klemme nie greift.
  - **`EDGE_PAD = 6` ist gesetzt, nicht gemessen** (4 px Luft + 1,75 px halbe
    Kontur, weil `getBBox()` ohne Stroke rechnet). Dieselbe Klasse wie das
    notierte `footGap = 6`.

- **Aufklappen springt (13) — gebaut, NICHT abgenommen.** Zweig
  `ticket-13-aufklappen-bleibt-liegen`, WIP-Commit, `type-check` grün. **Der QC steht
  noch aus** — kein Prüfschritt ist in der laufenden App belegt. Übergabe mit
  Schwerpunkten für den QC: `.scratch/pinnwand-ausbau/HANDOVER-13.md`, Messbelege in
  `13-baseline-messung.md` (beides gitignored, hängt an dieser Platte). Haltbar hier:
  - **Der Nutzerbefund ist mit Zahlen bestätigt.** Δ`style.top` beim Aufklappen bis
    **+906 px**; der Scroll-Anker reichte das 1:1 an die Seite weiter (Δ`scrollY` 905),
    der Zettel stand dabei im Fenster still. Es sprang also die **Wand unter ihm weg**.
    Nach oben war der Anker bei `scrollY = 0` abgeschnitten: offen auf `sy = 100`
    scrollen und zuklappen ließ den Zettel **675 px aus dem Bild** springen — das ist
    das „springt wild umher" in Reinform. Die Herkunft **02** ist damit bestätigt,
    11 und 12 sind unbeteiligt.
  - Die Zuspitzung des Tickets „wandert ans untere Ende seiner Gruppe" gilt nur halb:
    sie trifft die Platzierungs*reihenfolge*, nicht die Endposition. Ein Zettel wanderte
    906 px und lag danach trotzdem nur auf Rang 27 von 53.
  - **Vorbestehend gefunden und im Zuge des Tickets behoben: `packWall` war nicht
    deterministisch.** Bei identischer Eingabe (83 Zettel, Breiten, Höhen, Reihenfolge,
    `clientWidth` — alles nachweislich gleich) pendelte die Wand zwischen zwei
    Packungen (Höhe 4623,95 / 4616,31, 21 Zettel um bis zu ±18 px), je nachdem welcher
    Zettel zuletzt angetippt war. Ursache: der aufgeklappte Zettel verlor die Klasse
    `zettel--meta-top`, die über `cornerExtra` (41…46 px) den Titelkasten verengt — beim
    Zuklappen wurde sie zwar neu entschieden, erreichte das DOM aber erst im nächsten
    Tick, sodass die Höhenmessung noch die alte Fassung traf. Der Prüfschritt „Zuklappen
    stellt die Wandhöhe exakt wieder her" scheiterte damit schon **vor** dem Ticket.
  - Neu im Code: `WallPin` + dritter Parameter `pins` an `packWall`, `resolvePins()`
    (bei Konflikt gewinnt der zuletzt Angetippte), `WallNoteMetrics.previousTop`,
    `pinnedTops` in `WallView`. **Die Scroll-Nachführung ist ersatzlos entfallen.**
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
- **Der Stempel wird zusammengelegt (09b).**
  > ⚠️ **Die Prämisse dieses Tickets stimmt nicht.** Projekte tragen heute **gar
  > keinen** Stempel — gemessen 38 von 78 Zetteln mit `.due-stamp`, davon **0
  > Projekte**, weil `scheduleOf()` für Projekte `not-scheduled` liefert
  > (`src/lib/taskSchedule.ts:20`) und `urgency`/`stampLabel` damit `null` werden.
  > Das Ticket geht davon aus, ein Projektzettel zeige einen falschen Stempel, den
  > der Projektspruch ersetzt. Tatsächlich wird der Spruch ein **neues** Element
  > sein. Vor dem Bau neu fassen.

  Ein Stempel je Zettel statt zweier: der
  Grundabdruck ist berechnet (NEU / FÄLLIG / ROUTINE / Projektspruch), darüber stempelt man
  von Hand WICHTIG und DRINGEND. NIE und HEUTE entfallen. Der Stempel **ordnet nichts um**
  → [ADR-0002](docs/adr/0002-stempel-ordnet-nicht.md). **Ändert bereits deployten Code:**
  `complete-task` muss tägliche Aufgaben ins Zurücksetzen aufnehmen, und der nächtliche
  Reset in `reset_recurring_tasks()` entfällt — neue Migration nötig, Migrations sind
  append-only, und der Function-Deploy ist ein eigener Schritt.
  ~~Punkte-Sticker erst ab vier Fußzeilen-Elementen (15)~~ ist dadurch **erledigt**: jeder
  Zettel trägt jetzt einen Stempel, die dreiteilige Fußzeile gibt es nicht mehr.
- ~~**Wochenziel-Leiste in jede Ansicht (08).**~~ **erledigt** — `149d8c0`, Zweig
  `ticket-08-header-ueberall-gleich`. Drei QC-Runden in der laufenden App.
  Abweichungen von der Spec, alle vom Nutzer im Lauf entschieden:
  - **Der Header wurde einzeilig**, nicht zweizeilig. Vorgabe: er darf vertikal
    nicht wachsen. Gemessen 61 px offen / 57 kompakt, in beiden Breiten und
    beiden Aussehen. Die Wand beginnt jetzt bei 71 statt 141 px.
  - **Das Logo kommt zurück, aber rechts als Menü-Knopf.** Die Spec-Zeile „kein
    Logo" meinte den alten Platz links neben der Rangliste; der farbige
    Avatar-Kreis ist dafür ersatzlos entfallen.
  - **`--wall-status-height` entfällt ersatzlos** — die verdeckende Höhe ist jetzt
    die Headerhöhe, die `--app-header-height` bereits meldet.
  - **Die Legende blieb über dem Balken**, in der Kopfzeile neben der Punktzahl.
    Eine Fassung mit Beschriftung *in* den Segmenten wurde gebaut und vom Nutzer
    verworfen („sieht seltsam aus"); mit ihr fielen Text-Halo, Canvas-Messung und
    die Kontrastwahl je Segment wieder weg.

- **Projekte auf der Pinnwand (03) — zur Hälfte gebaut.** In vier Schnitte
  zerlegt; `7bcf892` enthält die ersten beiden:
  - ~~**03-1 Geste und Unterdrückung**~~ **erledigt.** Abwärtszug öffnet den
    `ProjectWorkModal`, Eselsohr-Zug ebenso; die drei anderen Richtungen tun
    nichts, kein Kranz, kein Fetzen, kein Abreiß-Umriss. Belegt per SQL: genau
    **eine** Zeile je Bedienung, und zwar an der **Unteraufgabe** (0 Zeilen auf
    der Projekt-ID), Projektzeile bleibt `completed=false`.
  - ~~**03-4 „Projekt" im Bearbeiten-Fenster**~~ **erledigt.** War vorbestehend
    (das Typ-Feld stand bei Projekten leer), wurde aber verschärft, weil Zuweisen
    und Aufwand bei Projekten jetzt **ausschließlich** über den Stift laufen.
  - ~~**03-2 Die Punkte-Summe**~~ **erledigt** — `66bea83`, Zweig
    `ticket-03-2-projekt-punktesumme`. Die Wand holt die Summe selbst: zwei
    schmale Selects, Summe im Client, kein zweiter Zähler, keine Migration.
    Gelöschte Unteraufgaben zählen mit (belegt an einer soft-gelöschten mit
    5 Punkten). Alle Projektzettel gegen SQL identisch (1500 / 200 / 105 / 23 / 0).
    Zwei Dinge, die in der Abnahme still falsch waren und jetzt stehen:
    - **Der Realtime-INSERT-Handler steigt bei der eigenen Buchung früh aus**,
      weil `replaceOptimisticCompletion()` die Serverzeile längst eingesetzt
      hat, bevor das Echo eintrifft. Ein Nachruf am Ende des Zweigs war
      unerreichbar — gemessen vier Buchungen ohne jede Änderung über 15 s, bei
      **0** Summen-Abfragen. Der Nachruf steht jetzt **oberhalb** beider `return`.
      Nach dem Fix: +N in 1,2–2,2 s, Doppeltipp erzeugt genau **eine** Zeile.
    - **Die Abfrage blättert**, weil PostgREST bei `max_rows = 1000` deckelt;
      die 150 IDs je Scheibe begrenzen die URL-Länge, nicht die Zeilenzahl.
      Belegt an 1500 Erledigungen, die als 1500 ankommen statt als 1000.
      Abbruch bei einer **leeren** Seite (nicht bei einer kurzen), damit die
      Bedingung nicht daran hängt, dass `max_rows` zufällig gleich der
      Seitengröße ist, und `.order('completion_id')` darüber.
    Der Nachruf in `deleteCompletion`/`deleteAllCompletions` bleibt als Vorsorge
    stehen, **greift aber heute nie** (`stopProjectEffortTotals()` legt beim
    Verlassen der Wand den Riegel um, und beide werden nur aus `HistoryView`
    gerufen). Dass die Zahl nach dem Zurückkleben trotzdem stimmt, trägt allein
    `WallView.onMounted`. Steht so im Code kommentiert.
  - ~~**03-3 Abzeichen-Aussehen + Büroklammer-Farbe**~~ **erledigt** — `c924678`,
    Zweig `ticket-03-3-abzeichen-aussehen`. Eigene Klassen `points--b1…b5` statt
    `points--s*`, Fläche auf **allen** Stufen 34×34 (der Sticker wächst bei `s5`
    auf 39,1 px — das war die Ursache der 39 px bei dreistellig), Schriftgröße
    folgt der Stellenzahl, `999+` ab vier Stellen bei ungeklemmter Stufenrechnung.
    `.clip` trägt `var(--owner, var(--owner-none))`, gemessen identisch mit der
    Reißzwecke derselben Person, beide Klammern.
    - **Die umlaufende Skala trägt die Ordinalität nicht.** Sie war als
      ordinaler Träger gebaut („zählbar wie ein Ladebalken, funktioniert auch
      bei Farbenblindheit"); in 3,4 px Bandbreite bei 34 px Marke ist 80 % von
      100 % am Bild nicht zu unterscheiden, auf Stufe 5 frisst der Zackenkranz
      das Band zusätzlich an. Sie bleibt als **Schmuck**, der Kommentar sagt das
      jetzt. Getragen wird die Ordnung von der Helligkeitsrampe (Luminanz 0,921
      bis 0,046, Nachbarabstände 1,46–2,00) samt Ziffernumschlag ab Stufe 4 und
      vom Zackenkranz auf Stufe 5.
    - **Das schwächste Paar ist b1↔b2 mit 1,46.** Dort stützt sich der
      Unterschied zusätzlich auf den Tonwechsel cremeweiß→blassblau — wer weder
      Ton noch diese 1,46 sieht, unterscheidet die beiden untersten Stufen
      nicht. Bewusst so belassen; die Bänder blieben unverschoben, weil die
      Verteilung über 13 Projekte am Bild sinnvoll wirkte.
    - **Stufe 2 liegt farblich beim Zwei-Punkte-Sticker** (Helligkeitsverhältnis
      1,02, `rgb(200,207,219)` gegen `#bcd3e8`). Nebeneinander gestellt trennt
      die Silhouette sie zuverlässig (Kreis mit Ringsegment gegen abgerundetes
      Quadrat), dazu sitzt ein Abzeichen immer auf Packpapier. Kein Fehler —
      gehört aber auf die Liste, wenn die Sticker-Palette einmal kuratiert wird.
  - **Der teuerste stille Bruch bei 03-2/03-3 ist ausgeblieben:** `relayout` misst
    `.points` und `.corner`; anderes Markup oder andere Klassennamen hätten
    `pointsWidth = 0` und damit Ticket 12 zurückgeholt, ohne dass jemand einen
    Fehler sieht. Klassenname und Platz sind unangetastet, nachgemessen 0 von 83
    Zetteln mit Breite 0 und 0 Titelüberläufe.
  - **Vorbestehend, in der 03-2-Abnahme belegt, nicht Teil des Tickets:** das
    **klassische Aussehen zeigt bei allen Projekten `0 Pkt`**, auch bei einem mit
    105. `taskStore.completions` wird von **keinem** Loader gefüllt (nur per
    Realtime-`push`), also liefert `getProjectEffort()` dort immer 0. Selbst mit
    geladenen Completions liefe es auseinander, weil `getSubtasks()` auf
    `tasks.value` arbeitet und `loadTasks` `deleted_at IS NULL` filtert — die
    Punkte gelöschter Unteraufgaben fehlten dort. An der Wand ist das gelöst,
    im klassischen Aussehen nicht.
  - Getroffene Entscheidungen: alle Unteraufgaben-Erledigungen zählen (nicht nur
    „Am Projekt arbeiten"); der Zettel folgt beim Zug weiter dem Finger; ein
    Alt-Projekt ohne Arbeits-Unteraufgabe öffnet **kein** Fenster (`console.error`,
    kein stilles Nachlegen); kein Konfetti; kein optimistisches Hochzählen.

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
- **Die Rangliste im Haushalts-Store.** Ticket 08 hat die Rangliste aus dem Header
  entfernt; `weeklyRanking` ist seitdem **tatsächlich unbenutzt** und darf bleiben
  oder entfallen. Bewusst nicht im 08er-Commit aufgeräumt, damit das Ticket nicht
  nebenbei fremden Code anfasst.

**Prototypen-Zweige** (Wegwerfcode, aber mit abgenommenen Entscheidungen darin):
`proto/kartengroesse` (9 Commits, Kartengröße + Kranz-Prototyp) und
`prototype/einkauf-pinnwand`. Ihre Ergebnisse stehen in
[HANDOFF-kartengroesse.md](HANDOFF-kartengroesse.md) und
[HANDOFF-ziehgeste.md](HANDOFF-ziehgeste.md); die Zweige selbst gehören **nicht**
nach `main`.

### Pinnwand — offene Arbeit
- **Die Legende im Header schmilzt ab vier Mitgliedern auf Farbpunkt plus Zahl.**
  Gemessen in der 08er-Abnahme, schmalster Viewport: bei fünf Mitgliedern haben
  die *kürzesten* Namen `clientWidth: 0` — nicht einmal ein Auslassungszeichen —,
  während die langen „Ä…", „W…" behalten. Grund: Flex schrumpft proportional zur
  Basisbreite, der Nutzer verliert also zuerst die Namen, die noch gepasst
  hätten. Ab acht Mitgliedern läuft die Legende sauber über (keine halben
  Farbpunkte, keine angeschnittenen Zahlen — der letzte Eintrag bleibt als Punkt
  ohne Zahl stehen). **Kein Regress von 08**: dieselbe Legende stand vorher in
  derselben Kopfzeile. Bei zwei bis drei Mitgliedern — dem realistischen Fall —
  ist alles einwandfrei. Ob das reicht, ist eine Nutzerentscheidung.
- **`.user-avatar` ist mit 08 verschwunden**, damit auch der einzige Ort, an dem
  die eigene Personenfarbe im Header stand. Die Zuweisungsfarbe trägt weiter die
  Reißzwecke am Zettel (Ticket 10). Falls die Farbe im Header vermisst wird,
  wäre die Legende der Platz dafür.
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
- **Kein DB-Cross-Check zwischen `task_type` und `subtask_points_mode`.**
  `20251115132535_add_project_task_type.sql` prüft nur den Wertebereich von
  `task_type`. Die Sperre gegen einen Typwechsel sitzt seit `7bcf892` **nur im
  Modal** (`TaskEditModal`, `:disabled` an den Optionen). Wer den Typ per SQL oder
  über einen anderen Weg umstellt, hinterlässt ein Projekt ohne die Unteraufgabe
  „Am Projekt arbeiten" (die entsteht nur beim Anlegen, `taskStore.ts:765`) und
  `deduct`-Unteraufgaben, die weiter abziehen (`taskStore.ts:397` filtert `deduct`
  ohne Blick auf den Parent-Typ). Ein `CHECK` bzw. Trigger wäre der richtige Ort.
- **Der gehaltene Zettel sperrt ab 420 ms den Bildlauf und schluckt den
  Loslass-Tipp** — gemessen 400 ms → 105 px, 430 ms → 0 px; nach 600 ms Halten
  klappt der Zettel beim Loslassen nicht auf. Gilt für **alle** Zettel, nicht nur
  Projekte; bei normalen Aufgaben erklärt es der Kranz. Seit `7bcf892` haben auch
  Projekte eine sichtbare Rückmeldung (Papier +21,8 % Luminanz gegen den Nachbarn,
  Schatten 4 px hart → 7/10 px bei 35 %). Der Zettel sagt damit „ich höre zu",
  aber **nicht** „der Bildlauf ist aus" — dafür bräuchte es eine Aussage über die
  Wand, und die verbietet Ticket 03 am Projekt. Restunschärfe, bewusst akzeptiert.
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
- **Die Wischgeste selbst ist nie gemessen worden** (00b, 01, 03). Belegt ist
  durchgehend nur `history.back()`/`popstate` bzw. synthetische Zeigerereignisse —
  der Mechanismus, den Randwisch und Zurück-Taste teilen. Für iOS Safari, wo der
  Randwisch eine interaktive Transition ist, steht ein Gerätetest aus.
- **Gesperrte `<option>`-Einträge auf mobilen Auswahlrädern.** `03-4` sperrt den
  Typwechsel über `:disabled` an den Optionen, nicht am `<select>`. In Chrome sind
  sie weder per Maus noch per Pfeiltaste erreichbar; manche Android-WebViews
  stellen gesperrte Einträge nicht erkennbar grau.
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
