# Putzplan TODOs

## Aktueller Entwicklungsstand (2025-10-19)

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
- **Store Initialization** - In main.ts nach Auth geladen + nach Login geladen
- **Login Race Condition Fix** - householdStore wird nach Login geladen (verhindert falschen Redirect)
- **Frontend-Check** - User kann nicht zweiten Household joinen

### Task Recurrence System
- **Due Date Display** - "Fällig in X Tagen" UI für wiederkehrende Tasks (Calendar Days Logic)
- **Database Trigger** - `last_completed_at` automatisch aus `task_completions` aktualisiert
- **Robust Architecture** - Single Source of Truth in `task_completions`, keine Inkonsistenzen
- **Automatic Recurrence (Cron Job)** - SQL Function + pg_cron (täglich 3:00 UTC) mit Calendar Days Logic
- **Calendar Days Consistency** - Backend (Cron) und Frontend (UI) verwenden identische Logik für Tagesberechnung

### Multi-User Real-time System
- **Supabase Realtime Subscriptions** - WebSocket-basierte Live-Updates zwischen Haushaltsmitgliedern
- **TaskStore Realtime Methods** - subscribeToTasks(), unsubscribeFromTasks() mit household_id filtering
- **Automatic State Sync** - INSERT, UPDATE, DELETE Events synchronisieren lokalen State automatisch
- **Lifecycle Management** - Subscription in HomeView mit onMounted/onUnmounted cleanup

### Database Schema & Security
- **`households`** - Haushalte mit auto-generierten Invite Codes (UUID-based)
- **`household_members`** - Benutzer-zu-Haushalt-Zuordnung
- **`tasks`** - Aufgaben-Templates mit Recurrence-System + `last_completed_at` (AUTO via Trigger)
- **`task_completions`** - Task-Erledigung-Historie (Append-only, Single Source of Truth)
- **Row Level Security (RLS)** - Production-ready mit optimierter Performance
- **SECURITY DEFINER Helper** - `private.get_user_household_ids()` verhindert RLS-Rekursion
- **Function Security** - `SET search_path` bei allen Functions gegen Schema-Injection

## 🚀 Nächste Development-Phase

### ⚠️ Priorität 0: GitHub Pages Deployment Vorbereitung - IN ARBEIT

**Ziel:** App für Multi-User Testing auf Handy launchen

#### Phase 1: Build Fix (KRITISCH - Blocker)
- [ ] **ESLint Config Fix** - 'files' Property TypeScript Error in eslint.config.ts beheben
- [ ] **Build Test** - `npm run build` erfolgreich durchlaufen lassen

#### Phase 2: GitHub Pages Setup
- [ ] **Vite Config** - `base: '/Putplan/'` für GitHub Repository Path setzen
- [ ] **GitHub Actions Workflow** - `.github/workflows/deploy.yml` für Auto-Deploy bei main push
- [ ] **Environment Variables** - Supabase Credentials via GitHub Secrets (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- [ ] **README Update** - Deployment-Anleitung für GitHub Pages

#### Phase 3: UX Polish (Empfohlen vor Launch)
- [ ] **Page Title** - "Putzplan" statt "Vite App" in index.html setzen
- [ ] **Favicon** - Custom Icon erstellen/setzen
- [ ] **Error Messages** - Auth Error Display in LoginView/RegisterView (User-sichtbar)
- [ ] **Loading States** - Feedback/Spinner bei Task Create/Delete/Update

### ✅ Priorität 1: Task Recurrence System - ABGESCHLOSSEN
- [x] **Automatic Recurrence (Cron Job)** - ✅ SQL Function + pg_cron implementiert (läuft täglich um 3:00 UTC)
- [x] **Calendar Days Logic (Backend)** - ✅ Migration 20251019121735: Backend verwendet Kalendertage
- [x] **Calendar Days Logic (Frontend)** - ✅ TaskCard.vue: UI-Anzeige "Fällig in X Tagen" verwendet Kalendertage
- [x] **Recurrence Testing** - ✅ Diagnostische Migrations + manueller Test erfolgreich
- [x] **Production Verification** - ✅ Cron-Job läuft in Produktion (pg_cron verified)

### ✅ Priorität 3: Multi-User Experience - REALTIME IMPLEMENTIERT
- [x] **Real-time Updates** - ✅ Supabase Realtime Subscriptions für Live-Updates zwischen Haushaltsmitgliedern
- [x] **Database Migration** - ✅ Enable Realtime publication für `tasks` table
- [x] **TaskStore Realtime** - ✅ subscribeToTasks(), unsubscribeFromTasks() mit household_id filtering
- [x] **Lifecycle Management** - ✅ Subscription in HomeView mit onMounted/onUnmounted cleanup
- [ ] **Realtime Testing** - Mit zwei Browsern testen (CREATE, UPDATE, DELETE Events)
- [ ] **Advanced Completion Tracking** - user_id, timestamp in task_completions für Gamification
- [ ] **"Wer hat was gemacht" Anzeige** - Task completion history in UI
- [ ] **Undo Button** - Letzte eigene completion rückgängig machen

### Priorität 4: UX & Polish (weitere Features)
- [ ] **Authentication UX** - Loading & Error States zu LoginView/RegisterView (Pattern: HouseholdSetupView)
- [ ] **Form Validation** - Input validation und besseres Error handling
- [ ] **CSS Improvements** - Hover-Effekte für TaskCards, responsive Design

### Priorität 5: Database Security & Integrity
- [x] **RLS Policies** - ✅ Vollständige Row Level Security für alle Tabellen (Production-ready)
- [x] **Function Security** - ✅ `SET search_path` für Schema-Injection-Schutz
- [x] **RLS Performance** - ✅ SECURITY DEFINER Helper-Function in private Schema
- [x] **Supabase CLI** - ✅ Updated zu v2.51.0
- [ ] **UNIQUE Constraint** - household_members.user_id (aktuell nur Frontend-Check)
- [ ] **Test-Daten** für Development Environment

## 🔧 Code Quality & Refactoring (Später)
- [ ] **ESLint Config Fix** - TypeScript Fehler in eslint.config.ts beheben ('files' does not exist in type)
- [ ] **Lokale Supabase Dev** - `supabase start` mit Docker Desktop
- [ ] **camelCase/snake_case** - Konsistente Naming Convention
- [ ] **Database Mapping Layer** - Property-Transformation zwischen DB und Frontend
- [ ] **PWA-Features** - Mobile Optimierung, Offline-Support

## 🎯 Gamification Features (Future)
- `user_stats` - Benutzer-XP, Level, Streaks pro Haushalt
- `achievements` - Benutzer-Achievement-Freischaltungen
- Ranglisten und XP-System

---

**Status:** Vorbereitung für GitHub Pages Deployment 🚀
**Letzte Änderung:** Priorität 0 hinzugefügt - Build Fix & Deployment Setup
**Next:** ESLint Config Fix (Blocker für Build)