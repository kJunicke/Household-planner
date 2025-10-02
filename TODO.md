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

### Priorität 3: Multi-User Experience
- [ ] **Real-time Updates** - Supabase Realtime Subscriptions
- [ ] **Live Task Status Updates** - zwischen Haushaltsmitgliedern
- [ ] **Advanced Completion Tracking** - user_id, timestamp für Gamification
- [ ] **"Wer hat was gemacht" Anzeige** - Task completion history

### Priorität 4: Authentication UX Fixes
- [ ] **Form Validation** - Input validation und Error handling
- [ ] **Loading & Error Feedback** - Loading states und Error messages zu LoginView & RegisterView hinzufügen (Pattern wie HouseholdSetupView)

### Priorität 5: Database Setup
- [ ] **Test-Daten** für Development
- [ ] **Row Level Security (RLS)** Policies für Multi-User Security
- [ ] **UNIQUE Constraint auf household_members.user_id** - Garantiert dass User nur in einem Household sein kann (aktuell nur Frontend-Check)

## 🔧 Code Quality & Refactoring (Später)

### Supabase CLI Integration
- [ ] Supabase CLI installieren (`npm install supabase --save-dev`)
- [ ] `supabase login` und Projekt verknüpfen
- [ ] Database Migrations erstellen
- [ ] Lokale Entwicklung mit `supabase start`

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

**Status:** Household Setup UI & User Management komplett
**Next:** Multi-User Real-time Features (Priorität 3)