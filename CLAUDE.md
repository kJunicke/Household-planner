# CLAUDE.md

**Putzplan** - Gamifizierte Shared-Household Task-App mit Vue 3 + Supabase

## 🛠️ Development Workflow

**Arbeitsverzeichnis**: `putzplan_vue/`

**WICHTIG**: `npm run dev` läuft bereits

### Test Accounts (Playwright E2E Tests)
**Account 1:**
Email: test@example.com
Passwort: test123456
Haushalt: Test-Haushalt
Invite Code: FD1EB9CE

**Account 2:**
Email: test2@example.com
Passwort: test123456
Haushalt: Test-Haushalt (beigetreten via FD1EB9CE)

### MCP Server Setup

**Context7** - Bei jedem Feature für Up-to-date Library-Docs konsultieren (Vue 3, Pinia, Supabase, TypeScript)

**Playwright** für Browser-Testing und Automatisierung:
- **Test-URL**: `http://localhost:5173/Household-planner/`
- Features IMMER mit Playwright MCP testen (Browser-Automatisierung)
- **Mobile Testing**: IMMER mit schmaler Viewport testen (360x740 für Smartphone)
  - Standard Playwright Viewport ist zu breit für echtes Mobile Testing
  - Verwende `browser_resize` mit width: 360, height: 740 vor dem Testen
```bash
# Code-Qualität prüfen
npm run type-check && npm run lint

# Build testen (optional)
npm run build
```

## 🏗️ Architektur-Entscheidungen

### Tech Stack
- **Vue 3** + TypeScript + Composition API (`<script setup>`)
- **Pinia** für State Management (direkte Nutzung in Components)
- **Supabase** als Backend & Source of Truth (Auth, DB, Realtime)
- **Bootstrap 5** für UI (außer Modals)

### Projektstruktur
```
putzplan_vue/
├── src/
│   ├── assets/        # CSS (base.css, utilities.css, main.css)
│   ├── components/
│   ├── views/
│   ├── stores/
│   ├── router/
│   ├── types/
│   └── lib/          # Supabase Config
├── supabase/
│   └── migrations/    # Timestamp-based SQL migrations
```

### Views & Routes
- `/` - **CleaningView** - Task-Liste mit Sub-Tabs (Alltagsaufgaben / Putzaufgaben / Erledigt)
  - **FAB-Buttons**: Expanding Search + Create Task (unten rechts, thumb-freundlich)
  - **Cross-Tab Search**: Intelligente Suche über alle Kategorien mit Relevanz-Sortierung
- `/history` - **HistoryView** - Chronologischer Verlauf aller Completions
- `/stats` - **StatsView** - Gamification-Statistiken (Tortendiagramm mit Aufgabenverteilung)
- `/shopping` - **ShoppingView** - Einkaufsliste mit Autocomplete und Purchase-Tracking
- `/login` - LoginView
- `/register` - RegisterView
- `/household-setup` - HouseholdSetupView

### Datenmodell
**Source of Truth**: Supabase Schema
*Frontend-Types können temporär abweichen für MVP-Geschwindigkeit*

**Tabellen & Primary Keys** (WICHTIG für `.eq()` Queries):
- `households` - PK: `household_id`
- `household_members` - PK: `user_id` (**One ID per user!** - referenziert `auth.users.id`)
  - Hat `display_name` (Email-Prefix als Fallback beim Join/Create)
  - Keine redundante `member_id` mehr (wurde entfernt für einfacheres Datenmodell)
- `tasks` - PK: `task_id` (Task-Templates mit `recurrence_days`, `last_completed_at`, `task_type`)
  - `task_type` - Enum mit Subtask-Verhalten:
    - `'recurring'`: Zeitbasiert, **alle Subtask-Modi erlaubt** (checklist/deduct/bonus)
    - `'daily'`: Immer sichtbar, **nur 'bonus' Subtasks** (eigenständige Belohnungen)
    - `'one-time'`: Einmalig, **alle Subtask-Modi erlaubt**
    - `'project'`: Langfristig, **nur 'checklist' + 'bonus'** (kein deduct)
- `task_completions` - PK: `completion_id` (Append-only Historie, **Single Source of Truth**)
  - `user_id` referenziert direkt `auth.users.id`
- `shopping_items` - PK: `shopping_item_id` (Einkaufsliste mit Purchase-Tracking)
  - `times_purchased` - Counter für Kaufhäufigkeit
  - `last_purchased_at`, `last_purchased_by` - Tracking von letztem Einkauf
  - `purchased` - Boolean für aktuellen Status (gekauft/nicht gekauft)

**Task Recurrence & Business Logic:**
- Frontend: `completeTask()` ruft Edge Function auf, `markAsDirty()` setzt nur tasks.completed
- **Edge Function** (`complete-task`): TypeScript Business-Logik für Task-Completion
  - Schreibt in `task_completions` Historie
  - Updated `tasks.completed` + `tasks.last_completed_at`
  - Ersetzt alten DB-Trigger (besseres Debugging, TypeScript statt SQL)
  - ✅ CORS-Headers für localhost Development
- Backend Cron: SQL Function `reset_recurring_tasks()` + pg_cron (täglich 3:00 UTC) setzt überfällige Tasks automatisch auf dreckig
  - **Calendar Days Logic**: Verwendet `CURRENT_DATE - DATE(last_completed_at)` für ganze Tage (nicht 24h-Perioden)
  - Beispiel: Task completed am 18.10. um 14:00 → Reset am 19.10. um 3:00 (1 ganzer Tag vergangen)

### Subtask Points Modes (Task-Type-abhängig)

**Available Modes by Task Type:**
- **Daily Tasks (`task_type: 'daily'`)**: Nur `bonus` erlaubt
  - Reason: Daily tasks werden nie completed → Subtasks nie resettet → nur Bonus verhindert Doppelpunkte
- **Projects (`task_type: 'project'`)**: Nur `checklist` + `bonus` erlaubt (kein `deduct`)
  - Reason: Projects haben "Am Projekt arbeiten" Subtask mit custom Effort-Logging
- **Recurring/One-time**: Alle Modi erlaubt (`checklist`, `deduct`, `bonus`)

**Mode Descriptions:**
- `'checklist'`: 0 Punkte (nur Tracking, Fortschritts-Anzeige)
- `'deduct'`: Aufwand wird von Parent-Effort abgezogen (Parent - Deduct = finale Punkte)
- `'bonus'`: Volle Punkte zusätzlich zum Parent (eigenständige Belohnung)

**Business Logic (Daily Tasks):**
1. Daily task completed → `tasks.completed` bleibt `false` (Edge Function)
2. `task_completions` wird trotzdem geschrieben (History-Tracking)
3. Subtasks werden NICHT resettet (kein Parent-Complete-Trigger)
4. Lösung: Nur Bonus-Subtasks → User versteht "Extra-Belohnung", kein Doppelpunkt-Problem

**UI Behavior:**
- SubtaskManagementModal: Bei Daily kein Modus-Selector (auto-select bonus)
- TaskCard: Bei Daily keine Gruppierung (flache Liste, alle Subtasks = Bonus)

## 📚 Entwicklungsprinzipien

### YAGNI (You Aren't Gonna Need It) - ESSENTIELL
- **Nur implementieren was JETZT gebraucht wird**
- Keine Features "für später" oder "falls mal nötig"
- Code rauswerfen wenn nicht aktiv genutzt
- MVP-First: Erst funktionsfähig, dann perfekt

### Vue 3 Patterns
- **Pinia**: Direkte Store-Nutzung in Components (`taskStore.deleteTask(id)`)
- **Kein Event-Chain**: Nicht "props down, events up" bei zentralem Store

### UI Patterns
- **Vue Modals**: Teleport + v-if für alle Forms (TaskCreateModal, TaskEditModal, TaskCompletionModal etc.)
- **Nicht Bootstrap Modals**: Vue 3 Kompatibilitätsprobleme
- **Modal Pattern**: Zentralisierte Utility-Styles in `utilities.css` (flexbox, scrollable body)
- **FAB Pattern** (CleaningView):
  - Floating Action Buttons unten rechts (Material Design Standard)
  - Search FAB: Expandiert zu Suchleiste (250px, smooth animation)
  - Create FAB: Öffnet Task-Modal
  - Thumb-freundliche Position für Mobile UX

### CSS Architecture
- **Design System**: CSS Variables in `base.css` (Farben, Spacing, Shadows, Border-Radius, Transitions)
- **Bootstrap Overrides**: Zentrale Button/Card/Form-Styles in `base.css`
- **Utility Classes**: Wiederverwendbare Patterns in `utilities.css`:
  - Auth-Container Pattern (Login/Register/HouseholdSetup)
  - Modal Pattern (TaskCompletionModal, HistoryView)
  - Page-Container Pattern (alle Views)
  - Section-Title Pattern
  - Empty-State Pattern
  - Form-Group Utility
- **Component Styles**: Nur component-spezifische Styles in `<style scoped>`

### Database Migrations (Supabase CLI)

**Status:** ✅ Konsolidiert (26.10.2025)
- **4 strukturierte Migrations** (war: 29)
- Alte Migrations archiviert in `supabase/migrations/archive/`

**Struktur:**
```
supabase/migrations/
├── 20251026000000_consolidated_schema.sql  # Tables, Indexes, Triggers
├── 20251026000001_rls_policies.sql         # RLS Policies (documented)
├── 20251026000002_realtime.sql             # Realtime config
├── 20251026000003_cron_jobs.sql            # Recurring tasks cron
└── archive/                                 # Old migrations (reference)
```

**Workflow** (WICHTIG: CLI über `npx` ausführen):
```bash
# Migration erstellen und bearbeiten
npx supabase migration new my_feature_name
# → SQL in supabase/migrations/[timestamp]_my_feature_name.sql schreiben

# Migration pushen
npx supabase db push

# Remote-Schema-Änderungen pullen (optional)
npx supabase db pull

# Migration-Status checken (optional)
npx supabase migration list --linked
```

**Wichtige Regeln**:
- **Append-only**: Nie gepushte Migrations editieren
- **Security**: RLS für alle Tabellen, SECURITY DEFINER für Helper-Functions (`get_user_household_id()`)
- `.env` nicht committen

---
**Status & nächste Aufgaben**: Siehe `TODO.md`
