# CLAUDE.md

**Putzplan** - Gamifizierte Shared-Household Task-App mit Vue 3 + Supabase

## 🛠️ Development Workflow

**Arbeitsverzeichnis**: `putzplan_vue/`

**WICHTIG**: NIEMALS `npm run dev` ausführen - Claude kann nicht mit Browser interagieren!

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
│   ├── components/     # Wiederverwendbare Komponenten
│   ├── views/         # Route-Level Komponenten
│   ├── stores/        # Pinia Stores
│   ├── router/        # Vue Router
│   ├── types/         # TypeScript Interfaces
│   └── lib/          # Supabase Config
├── supabase/
│   ├── config.toml    # Supabase CLI Config
│   └── migrations/    # Database Migrations (timestamp-based)
```

### Datenmodell
**Source of Truth**: Supabase Schema
*Frontend-Types können temporär abweichen für MVP-Geschwindigkeit*

**Tabellen & Primary Keys** (WICHTIG für `.eq()` Queries):
- `households` - PK: `household_id`
- `household_members` - PK: `member_id`, hat `display_name` (Email-Prefix als Fallback beim Join/Create)
- `tasks` - PK: `task_id` (Task-Templates mit `recurrence_days`, `last_completed_at`)
- `task_completions` - PK: `completion_id` (Append-only Historie, **Single Source of Truth**)

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
- Refactoring erst bei erkennbaren Patterns

### Vue 3 Patterns
- **Referenz**: `vue3-development-guide.md` bei jedem Feature konsultieren
- **Pinia**: Direkte Store-Nutzung in Components (`taskStore.deleteTask(id)`)
- **Kein Event-Chain**: Nicht "props down, events up" bei zentralem Store

### Pinia Store Initialization
- **Pattern**: Stores in `main.ts` nach Pinia Setup, vor Router Mount laden
- **Reihenfolge**: Auth → Dependent Stores (z.B. householdStore)

### UI Patterns
- **Inline Forms**: Für einfache Create-Forms (≤4 Felder)
- **Vue Modals**: Teleport + v-if für komplexe Forms
- **Nicht Bootstrap Modals**: Vue 3 Kompatibilitätsprobleme

### Database Migrations (Supabase CLI)

**Empfohlener Workflow (Best Practice)**:
```bash
# WICHTIG: Supabase CLI muss über npx aufgerufen werden!
# Direkt "supabase" funktioniert nicht - immer "npx supabase" verwenden

# 1. Lokale Migration erstellen
npx supabase migration new my_feature_name

# 2. SQL in die neue Migration-Datei schreiben
# supabase/migrations/[timestamp]_my_feature_name.sql

# 3. Migration zur Remote-DB pushen
npx supabase db push

# 4. (Optional) Remote-Änderungen zurück pullen
# Falls jemand Änderungen im Dashboard gemacht hat:
npx supabase db pull
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

**Security Checklist**:
- ✅ RLS für alle Tabellen aktivieren
- ✅ `SET search_path = public, pg_temp` bei Functions hinzufügen

---
**Status & nächste Aufgaben**: Siehe `TODO.md`
