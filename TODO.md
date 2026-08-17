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
- **Badge-Kontur auf gesättigten Füllungen kaum lesbar** (1,93:1 gegen `effort-badge`,
  3,60:1 gegen `completed-badge`). Zierde, keine Information.

**Erst wenn der alte `CleaningView` wegfällt:**
- Doppelte Suchlogik auflösen: `src/lib/taskSearch.ts` vs. Inline-Version in `CleaningView.vue`
  (belegt identische Trefferlisten).
- Nach `pinnwand.css` heben: `.zettel*`, `.pin`, `.tape`, `.clip`, `.points`, `--owner-none`
  (aus `WallNote.vue`), `.fab-card`/`.fab-btn`/`.fab-plus` + Such-Overlay (aus `WallView.vue`).
  `.wall` bleibt scoped.

### Korrektheit / Robustheit
- **`runLoadTasks` ersetzt `tasks.value` komplett** — ein Realtime-Echo für eine *fremde*
  Zeile zwischen SELECT und Zuweisung wird überschrieben (Echo-Schutz greift nur für eigene
  IDs). Zweimal belegt, einmal 6 s falscher Zustand. Richtung: Zeilen einzeln mergen.
- **Geschwister-Subtasks parallel abschließbar** — Doppel-Tap-Sperre greift pro `task_id`,
  gleichzeitige `complete-task`-Aufrufe für Geschwister berechnen ggf. verschiedene Punkte.
- **Listen-DELETE kommt bei anderen Sessions nicht an** — Kanal filtert auf `household_id`,
  DELETE liefert ohne `REPLICA IDENTITY FULL` nur den PK. Betrifft Packliste + To-do.
- **`currentHousehold` überlebt externen Logout** bis zur nächsten Navigation.
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
