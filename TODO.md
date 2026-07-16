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

### Task Management
- **"Meine Aufgaben" View** - Extra Tab für zugewiesene Tasks (Option 1)
  - CategoryNav erweitern um 5. Tab: "Meine Aufgaben"
  - Neuer Filter in TaskList: `filter="assigned-todo"`
  - Store-Computed: `taskStore.assignedTasks` (filtert nach `assigned_to = current_user_id`)
  - Pattern: Standard in Asana "My Tasks", Todoist "Assigned to me"

### Gamification System
- **User Stats** - XP, Level, Streaks pro Haushalt
- **Ranglisten** - Mitglieder nach XP sortiert anzeigen

### Code Quality
- **Form Validation** - Input-Validierung für alle Forms
- **Playwright CLI E2E Tests einrichten** - Automatisierte Regressionstests für kritische Flows
  - `npm init playwright@latest` in `putzplan_vue/`
  - Test-Accounts aus CLAUDE.md nutzen (test@example.com / test2@example.com)
  - Kritische Flows zuerst: Login, Task-Complete, Shopping-Item hinzufügen

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
