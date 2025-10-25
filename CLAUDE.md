# CLAUDE.md

**Putzplan** - Gamifizierte Shared-Household Task-App mit Vue 3 + Supabase

## 🛠️ Development Workflow

**Arbeitsverzeichnis**: `putzplan_vue/`

**WICHTIG**: NIEMALS `npm run dev` ausführen - Ich hab immer schon einen am laufen

### Test Account (Playwright E2E Tests)
Email: test@example.com
Passwort: test123456
Haushalt: Test-Haushalt
Invite Code: FD1EB9CE

### MCP Server Setup

**Context7** für aktuelle Library-Dokumentation nutzen:

Bei jedem Feature: Context7 für Up-to-date Docs konsultieren
# (Vue 3, Pinia, Supabase, TypeScript, etc.)

**Playwright** für Browser-Testing und Automatisierung:
- **Test-URL**: `http://localhost:5173/Household-planner/`
- Features IMMER mit Playwright MCP testen (Browser-Automatisierung)
- Dev-Server läuft bereits - NICHT `npm run dev` ausführen!

```bash
# Code-Qualität prüfen
npm run type-check && npm run lint

# Bei Bedarf formatieren
npm run format

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
│   ├── components/    # Wiederverwendbare Komponenten (Header.vue, TaskCard.vue, etc.)
│   ├── views/         # Route-Level Komponenten (CleaningView.vue, HistoryView.vue)
│   ├── stores/        # Pinia Stores (authStore, householdStore, taskStore)
│   ├── router/        # Vue Router
│   ├── types/         # TypeScript Interfaces
│   └── lib/          # Supabase Config
├── supabase/
│   ├── config.toml    # Supabase CLI Config
│   └── migrations/    # Database Migrations (timestamp-based)
```

### Views & Routes
- `/` - **CleaningView** - Task-Liste mit Erledigt/Dreckig Status
- `/history` - **HistoryView** - Chronologischer Verlauf aller Completions
- `/stats` - **StatsView** - Gamification-Statistiken (Tortendiagramm mit Aufgabenverteilung)
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
- `tasks` - PK: `task_id` (Task-Templates mit `recurrence_days`, `last_completed_at`)
- `task_completions` - PK: `completion_id` (Append-only Historie, **Single Source of Truth**)
  - `user_id` referenziert direkt `auth.users.id`

**Task Recurrence (Hybrid):**
- Frontend: `completeTask()` schreibt in beide Tabellen, `markAsDirty()` setzt nur tasks.completed
- Backend: DB-Trigger aktualisiert automatisch `tasks.last_completed_at` aus `task_completions`
- Backend Cron: SQL Function `reset_recurring_tasks()` + pg_cron (täglich 3:00 UTC) setzt überfällige Tasks automatisch auf dreckig
  - **Calendar Days Logic**: Verwendet `CURRENT_DATE - DATE(last_completed_at)` für ganze Tage (nicht 24h-Perioden)
  - Beispiel: Task completed am 18.10. um 14:00 → Reset am 19.10. um 3:00 (1 ganzer Tag vergangen)

## 📚 Entwicklungsprinzipien

### YAGNI (You Aren't Gonna Need It) - ESSENTIELL
- **Nur implementieren was JETZT gebraucht wird**
- Keine Features "für später" oder "falls mal nötig"
- Code rauswerfen wenn nicht aktiv genutzt
- MVP-First: Erst funktionsfähig, dann perfekt

### Vue 3 Patterns
- context 7 vue bei neuen features consultieren
- **Pinia**: Direkte Store-Nutzung in Components (`taskStore.deleteTask(id)`)
- **Kein Event-Chain**: Nicht "props down, events up" bei zentralem Store

### Pinia Store Initialization
- **Pattern**: Stores in `main.ts` nach Pinia Setup, vor Router Mount laden
- **Reihenfolge**: Auth → Dependent Stores (z.B. householdStore)

### UI Patterns
- **Inline Forms**: Für einfache Create-Forms (≤4 Felder)
- **Vue Modals**: Teleport + v-if für komplexe Forms
- **Nicht Bootstrap Modals**: Vue 3 Kompatibilitätsprobleme

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

**Empfohlener Workflow (Best Practice)**:
```bash
# WICHTIG: Supabase CLI muss über npx aufgerufen werden!
# Direkt "supabase" funktioniert nicht - immer "npx supabase" verwenden

# 1. Lokale Migration erstellen
npx supabase migration new my_feature_name

# 2. SQL in die neue Migration-Datei schreiben
# supabase/migrations/[timestamp]_my_feature_name.sql

# 3. Lokaler Test
npx supabase db reset

# 4. Schema Lint
npx supabase db lint --local

# 5. Migration zur Remote-DB pushen
npx supabase db push
```

**Wichtige Regeln**:
- **Append-only**: Nie gepushte Migrations editieren, immer neue Migration für Änderungen
- **No `db remote commit`**: Deprecated! Wurde durch `db pull` ersetzt
- **Link project**: Einmalig `supabase link` ausführen für Remote-Zugriff
- **Security**: `.env` nicht committen

**Was macht was**:
- `db push` - Pusht lokale Migrations zur Remote-DB (one-way)
- `db pull` - Pullt Remote-Schema-Änderungen als neue Migration (reverse)
- `db reset` - Löscht lokale DB und spielt alle Migrations neu ab
- `db diff` - Zeigt Unterschiede zwischen lokal und remote
- `db lint` - Prüft Schema auf common issues

**Dokumentation:**
- Security: `supabase/RLS_SECURITY.md`
- Schema: Siehe Migration-Files (ausführlich kommentiert)
- Tests: `supabase/tests/rls_security_tests.sql`
- Audit: `supabase/MIGRATION_AUDIT.md`

**Security Checklist**:
- ✅ RLS für alle Tabellen aktivieren
- ✅ `SET search_path = public, pg_temp` bei Functions hinzufügen
- ✅ SECURITY DEFINER für RLS Helper-Functions (verhindert infinite recursion)
- ✅ `(SELECT auth.uid())` für initPlan optimization
- ✅ `TO authenticated` explizit angeben

**RLS Pattern für household_members**:
- Problem: Kann nicht `household_members` in `household_members` RLS Policy abfragen (Rekursion!)
- Lösung: SECURITY DEFINER Helper-Function `get_user_household_id()` die RLS bypassed
- Siehe: `supabase/RLS_SECURITY.md`

---
**Status & nächste Aufgaben**: Siehe `TODO.md`
