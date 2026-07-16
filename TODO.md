# Putzplan TODOs

**Status:** 🎉 Live auf GitHub Pages

---

## 🧳 Packlisten-Redesign (geplant)

**Ziel:** Von der flachen Liste mit großen Karten → dichte, nach Kategorien gruppierte Ansicht mit Mengen-/Fortschrittstracking, Reise-Notizen und Wiederverwendung über Reisen hinweg. Kernproblem heute: wenige Items pro Screen, keine Struktur, keine Mengen, jede Reise fängt bei Null an.

> Design vollständig durchgegrillt (22 Fragen + Zusatzanforderungen). Dies ist die verbindliche Spec.

### Kern-Konzept

**Karten-Anatomie (kompakte Zeilen statt großer Karten):**
```
● Kleidung 2/3                                    ← Sektions-Header (Farbpunkt + X/Y)
  ☐  T-Shirt            [–]  2/5  [＋]            ← qty >1: Stepper beidseitig
  ☐  Jacke                          ✓            ← qty 1: simple Checkbox
──────────────────────────────────────
● Bad 0/2
  ☐  Zahnbürste                     ✓
  ┌ + zu Bad… ──────────────── [– 1 +] ┐         ← kontextuelle Add-Zeile
● Unkategorisiert (muted)                         ← immer vorhanden, unten angepinnt
  ┌ + hinzufügen… ────────────────────── ┐
```

**Interaktionsmodell (bewusst entkoppelt):**
- **Tap auf Karten-Körper** = `packed` Fertig-Status togglen — **fasst den Zähler NIE an** (Fehler schnell korrigierbar).
- **Stepper `[–] X/N [＋]`** (nur qty>1) = ändert nur `packed_count`. `[＋]` bis Voll (N/N) → auto-fertig; runterzählen nimmt „fertig" wieder zurück.
- **Long-Press** (Desktop: Rechtsklick) = öffnet Edit-Modal (Name · Kategorie · Menge · Löschen).
- Add-UI pro Sektion **klappt ein, sobald das erste Item abgehakt wird**; ein immer sichtbarer **„+ hinzufügen"-Button** klappt wieder auf. Löschen & Menge-Ändern klappen NICHT ein.

**Kategorien:**
- Frei definierbar **pro Liste**, reine Textlabels, **Farbe automatisch aus Namens-Hash** (keine Kategorie-Tabelle).
- **Reihenfolge:** Erstellungsreihenfolge; **fertige Kategorien sinken automatisch nach unten** + klappen automatisch zu (`✓ Kleidung 3/3`). Kein manuelles Drag.
- Offene Sektionen manuell zuklappbar (Session-only State).
- Gepackte Items bleiben in ihrer Kategorie, durchgestrichen, ans Sektionsende sortiert.
- **„Unkategorisiert"**: feste, muted, nicht löschbare Sektion in jeder Liste, unten angepinnt. Quick-Add-Landeplatz; existierende Items ohne Kategorie erscheinen hier.

**„+ Kategorie" = unified Schnellsuche** (verschmilzt Neu-Erstellen + Import):
```
🔍 bad
  ✚ „bad" — Neu erstellen                        ← immer oberste Option
  📦 Bad · aus Urlaub 2026 (5 Items)             ← Import-Kandidaten, eine Zeile
  📦 Bad & Hygiene · aus Wochenende (3 Items)      pro (Kategorie × Quell-Liste),
                                                    neueste Liste oben
```
- Klick auf Import-Kandidat → **Bestätigungsmodal** listet alle Items (mit Menge) vor Übernahme.
- **Merge** in bestehende Kategorie: exakte Namens-Dubletten (case-insensitive, getrimmt) überspringen, im Modal grau als „bereits vorhanden".

**Reise-Notizen:** Freitext-Feld pro Liste (`notes`), ganz oben, einklappbar, im Pack-Zustand standardmäßig zu.

**Liste kopieren:** Quelle-Dropdown im „Neue Liste"-Modal („Leer" / „Kopieren von…"). Übernimmt Items + Kategorie + Menge, aber `packed_count=0`, `packed=false`.

**Gesamt-Fortschritt:** Dezente Leiste oben, `Urlaub 2026 · 12/40 gepackt` + dünner Balken. Zählt Items (voll gepackt / gesamt), konsistent zur `X/Y`-Header-Logik.

**Reset-Button:** setzt `packed_count → 0` UND `packed → false` für alle Items.

### Datenmodell (Migration)
```sql
-- packing_items
ALTER TABLE packing_items ADD COLUMN category text;              -- NULL = Unkategorisiert
ALTER TABLE packing_items ADD COLUMN quantity int NOT NULL DEFAULT 1;
ALTER TABLE packing_items ADD COLUMN packed_count int NOT NULL DEFAULT 0;
-- bestehendes packed boolean bleibt (Fertig-Flag, entkoppelt vom Zähler)

-- packing_lists
ALTER TABLE packing_lists ADD COLUMN notes text;
```
- Keine Kategorie-Tabelle, keine `category_order`-Spalte (Reihenfolge = Erstellungsreihenfolge, rein clientseitig ableitbar via `created_at` der ersten Items je Kategorie bzw. Insert-Reihenfolge).
- Bestehende Items: `category = NULL` → landen in „Unkategorisiert".
- Constraints erwägen: `CHECK (quantity >= 1)`, `CHECK (packed_count >= 0 AND packed_count <= quantity)`, `CHECK (length(category) <= 100)`, `CHECK (length(notes) <= 5000)`.
- RLS: neue Spalten erben bestehende Policies; kein zusätzlicher Policy-Bedarf.

### Umsetzung in 3 Phasen

**Phase 1 — Fundament (Datenmodell + Gruppierung + Mengen/Zähler)** ✅
- [x] Migration `packing_items` (category, quantity, packed_count) + `packing_lists` (notes) + CHECK-Constraints
- [x] Types erweitern: `PackingItem` (category, quantity, packed_count), `PackingList` (notes)
- [x] `packingStore`: Getter `itemsByCategory` (gruppiert, fertige Kategorien nach unten), `overallProgress`; Actions `incrementPacked`/`decrementPacked` (mit Auto-Fertig bei Voll), `togglePacked` (nur `packed`, Zähler unangetastet), `updateItem` (name/category/quantity). (`renameCategory` verworfen → YAGNI, Umkategorisieren via Edit-Modal)
- [x] `PackingView` neu aufbauen: kompakte Zeilen, Kategorie-Sektionen mit `X/Y`-Header + Farbpunkt (Hash→Farbe via `lib/categoryColor.ts`)
- [x] Karten-Interaktion: Körper-Tap = togglePacked; Stepper `[–] X/N [＋]` bei qty>1; simple Checkbox bei qty=1
- [x] „Unkategorisiert"-Sektion (muted, unten angepinnt, immer da)
- [x] Kontextuelle Add-Zeile pro Sektion (Kategorie aus Kontext) + Einklapp-Logik (erstes Abhaken klappt ein, „+"-Button klappt auf)
- [x] Fertige Kategorien: auto-sinken + auto-zuklappen; offene manuell zuklappbar (Session-State)
- [x] Gesamt-Fortschrittsleiste oben
- [x] Reset-Button auf neues Modell umstellen (`packed_count=0` + `packed=false`)
- [x] Realtime-Handler auf neue Felder anpassen (Row-Replace, neue Felder fließen durch)
- [x] Long-Press → Edit-Modal (Name, Menge, Kategorie-Wahl, Löschen); Desktop-Rechtsklick-Mapping; sauberer Touch-Timer (`touchstart`/`touchmove`-Cancel, öffnet auf `touchend` gegen Modal-unter-Finger, Ghost-Click unterdrückt)
- [x] Browser-Test (Chrome MCP): Abhaken, Zähler, Auto-Fertig, Einklappen, Long-Press ✓

**Phase 2 — Wiederverwendung (Import-Schnellsuche + Liste kopieren)** ✅
- [x] `packingStore`: `categoryImportCandidates(query)` (DISTINCT Kategorie × Quell-Liste über Haushalt, Item-Count, sortiert neueste Liste oben), `importCategory(...)` mit Dubletten-Skip + Case-insensitivem Merge auf existierende Kategorie-Schreibweise
- [x] Unified „+ Kategorie"-Schnellsuche-Overlay: „Neu erstellen" oben + Import-Kandidaten darunter
- [x] Import-Bestätigungsmodal (Item-Liste inkl. Menge, übersprungene Dubletten grau „bereits vorhanden")
- [x] `copyList(sourceListId, newName)` (Items + Kategorie + Menge, packed/packed_count reset)
- [x] Quelle-Dropdown im „Neue Liste"-Modal („Leer" / „Kopieren von…")
- [x] Browser-Test: Kategorie-Import mit Namenskonflikt (Dubletten-Skip), Liste kopieren ✓

**Phase 3 — Notizen + Politur** ✅
- [x] Reise-Notizblock (Freitext, einklappbar, oben; Preview im collapsed Zustand) + `updateNotes` (Optimistic, Focus-Guard gegen Realtime-Überschreiben)
- [x] Farbkontraste (feste 12er-Hash-Palette, Light/Dark lesbar), Empty-States, Keyboard-a11y auf Item-Zeilen (role/aria-checked/tabindex, Enter/Space)
- [x] `maxlength` auf allen neuen Inputs; CLAUDE.md-Doku aktualisiert (Packlisten-Abschnitt)

### Offene Detail-Entscheidungen (beim Bauen final)
- Hash→Farb-Funktion: fester Palette-Satz (z.B. 8–12 vordefinierte, kontrastgeprüfte Farben) statt beliebigem HSL, damit Light/Dark lesbar bleibt.
- Long-Press-Schwelle (~450–500 ms) + Bewegungs-Toleranz gegen versehentliches Auslösen beim Scroll.

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
