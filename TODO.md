# Putzplan TODOs

## Aktueller Entwicklungsstand (2025-10-01)

**ARCHITEKTUR:** Shared Household System - mehrere Benutzer arbeiten im selben Haushalt zusammen

## ✅ Vollständig implementierte Features

### Core Task System
- **Vue 3 Setup** - Composition API, TypeScript, Bootstrap 5
- **Supabase Database Integration** - TaskStore mit vollständiger CRUD-Funktionalität
- **Task Management** - CREATE, READ, UPDATE, DELETE mit UI
- **TaskCard & TaskList Komponenten** - Reactive UI mit Supabase-Persistence
- **Task Edit Functionality** - Inline Edit Forms in TaskCards
- **Task Toggle System** - Completed/Uncompleted Status mit DB-Sync
- **Pinia State Management** - Reactive TaskStore mit Error Handling
- **TypeScript Type Safety** - Interfaces aligned mit Supabase Schema

### Authentication & Router System
- **Complete Authentication System** - Login/Register mit Supabase Auth
- **AuthStore** - Pinia Store mit login/logout/register actions
- **LoginView & RegisterView** - Bootstrap Forms mit Auth Integration
- **Vue Router Architecture** - Protected routes mit Route Guards
- **Session Persistence** - initializeAuth() für Browser-Reload
- **Navigation** - router-link zwischen Login/Register/Home

### Household Management System
- **HouseholdStore** - Pinia Store mit currentHousehold State
- **Household & HouseholdMember Interfaces** - TypeScript Types (YAGNI-Prinzip)
- **Store Actions** - loadUserHousehold(), createHousehold(), joinHousehold(), leaveHousehold()
- **Invite Code System** - Supabase UUID-basiert (collision-safe)
- **Store Initialization** - In main.ts nach Auth geladen
- **Frontend-Check** - User kann nicht zweiten Household joinen

### Database Schema
- **`households`** - Haushalte mit auto-generierten Invite Codes (UUID-based)
- **`household_members`** - Benutzer-zu-Haushalt-Zuordnung
- **`tasks`** - Aufgaben-Templates mit Recurrence-System
- **`task_completions`** - Task-Erledigung-Historie

## 🚀 Nächste Development-Phase

### Priorität 1: TaskStore Integration ✅ DONE
- [x] **Hardcoded household_id entfernen** - TaskStore nutzt householdStore.currentHousehold.household_id
- [x] **loadTasks() anpassen** - Filter nach currentHousehold
- [x] **createTask() anpassen** - household_id aus Store statt hardcoded
- [x] **HomeView anpassen** - hardcoded household_id entfernen

### Priorität 2: Household Setup UI ✅ DONE
- [x] **HouseholdSetupView erstellen** - Route /household-setup
- [x] **Create Household Form** - Input für Household-Name mit Error/Loading States
- [x] **Join Household Form** - Input für Invite Code mit Error/Loading States
- [x] **Router Guard erweitern** - Redirect zu /household-setup wenn kein Household (aktiv)
- [x] **Household Info in Navbar** - Aktueller Household-Name + Invite Code anzeigen
- [x] **User Info in Header** - Eingeloggter User (Email) mit Logout-Button

### Priorität 2.5: Task Recurrence System (Backend-Driven) ✅ DONE (Database)
**Architektur:** Supabase als Source of Truth - Task completion Status wird von PostgreSQL berechnet

#### Phase 1: Database Schema & Functions ✅ COMPLETED
- [x] **Supabase CLI Setup** - Professionelle Migration-Struktur mit `supabase/migrations/`
- [x] **Base Schema Migration** - CREATE TABLE für alle 4 Tabellen (households, household_members, tasks, task_completions)
- [x] **is_task_completed() Function** - PostgreSQL Function für Status-Berechnung
- [x] **Auto-Update Triggers** - Automatisches Update von tasks.completed bei INSERT/DELETE in task_completions
- [x] **RLS Policies** - Row Level Security für task_completions (SELECT, INSERT, DELETE)
- [x] **Migrations gepusht** - Alle 4 Migrations erfolgreich in Supabase DB deployed
- [x] **Security** - .env aus Git entfernt, SUPABASE_ACCESS_TOKEN sicher gespeichert

#### Phase 2: Frontend Integration ✅ DONE
- [x] **Database Migration** - Triggers entfernt (rollback_task_triggers.sql)
- [x] **taskStore.ts refactoring** - `completeTask()` + `markAsDirty()` implementiert
- [x] **completeTask() implementieren** - INSERT in `task_completions` + UPDATE `tasks.completed = TRUE`
- [x] **markAsDirty() implementieren** - UPDATE `tasks.completed = FALSE` (keine completions gelöscht!)
- [x] **TaskCard.vue anpassen** - Buttons nutzen `handleCompleteTask()` und `handleMarkDirty()`
- [x] **HomeView.vue cleanup** - `completed` aus newTask entfernt (Database DEFAULT FALSE)
- [x] **Type-Check** - `npm run type-check` ohne Task-bezogene Errors

#### Phase 3: Testing & Validation
- [ ] **Manual Testing** - Task completion flow testen (Sauber → Dreckig)
- [ ] **Recurrence Testing** - Wiederkehrende Tasks nach X Tagen testen

#### Phase 4: Automatic Recurrence (Backend Cron Job) - SPÄTER
- [ ] **Supabase Edge Function** - daily-recurrence-check erstellen
- [ ] **Cron Job Setup** - Täglicher Job der nur TRUE → FALSE setzt
- [ ] **Testing** - Recurrence nach X Tagen automatisch testen

### Priorität 3: Multi-User Experience
- [ ] **Real-time Updates** - Supabase Realtime Subscriptions
- [ ] **Live Task Status Updates** - zwischen Haushaltsmitgliedern
- [ ] **Advanced Completion Tracking** - user_id, timestamp für Gamification
- [ ] **"Wer hat was gemacht" Anzeige** - Task completion history
- [ ] **Undo Button** - Letzte eigene completion rückgängig machen (DELETE aus task_completions, nur eigene completions)

### Priorität 4: Authentication UX Fixes
- [ ] **Form Validation** - Input validation und Error handling
- [ ] **Loading & Error Feedback** - Loading states und Error messages zu LoginView & RegisterView hinzufügen (Pattern wie HouseholdSetupView)

### Priorität 5: Database Setup
- [ ] **Test-Daten** für Development
- [ ] **Row Level Security (RLS)** Policies für Multi-User Security
- [ ] **UNIQUE Constraint auf household_members.user_id** - Garantiert dass User nur in einem Household sein kann (aktuell nur Frontend-Check)

## 🔧 Code Quality & Refactoring (Später)

### Supabase CLI Integration ✅ DONE
- [x] Supabase CLI installieren (`npm install supabase --save-dev`)
- [x] `supabase link` - Projekt verknüpfen mit Access Token
- [x] Database Migrations erstellen und strukturieren
- [ ] Lokale Entwicklung mit `supabase start` (requires Docker Desktop)

### Code Improvements
- [ ] **camelCase/snake_case** Refactoring für konsistente Naming
- [ ] **Database Mapping Layer** für Property-Transformation
- [ ] **CSS Hover-Effekte** für TaskCards
- [ ] **Responsive Design** Verbesserungen
- [ ] **PWA-Features** und mobile Optimierung

## 🎯 Gamification Features (Future)
- `user_stats` - Benutzer-XP, Level, Streaks pro Haushalt
- `achievements` - Benutzer-Achievement-Freischaltungen
- Ranglisten und XP-System

---

**Status:** Task Recurrence Frontend Integration komplett (Hybrid-Architektur)
**Next:** Manual Testing + Automatic Recurrence Cron Job (Priorität 2.5 Phase 3-4)