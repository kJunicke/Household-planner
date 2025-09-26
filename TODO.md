# Putzplan TODOs

## Aktueller Entwicklungsstand (2025-09-22)

**ARCHITEKTUR:** Shared Household System - mehrere Benutzer arbeiten im selben Haushalt zusammen

### Phase 2 Core Functionality - ✅ VOLLSTÄNDIG ABGESCHLOSSEN + CREATE TASK FORM (2025-09-22)
- **✅ Pinia TaskStore** - Vollständig implementiert mit Supabase Integration
- **✅ Task Interface Migration** - Von Mock-Schema zu DB-Schema erfolgreich migriert  
- **✅ Frontend-Database Integration** - Tasks werden aus Supabase geladen, Updates persistieren
- **✅ Reactive State Management** - App.vue nutzt TaskStore statt lokale JSON-Daten
- **✅ Task Toggle Funktionalität** - Vollständig funktional mit DB-Persistence
- **✅ Create Task Form** - Vollständiges Form mit TaskStore Integration funktionsfähig
- **✅ Code Quality** - Alle Linting-Fehler behoben, TypeScript-Konformität sichergestellt

### Technische Implementierung Status
- **Database Schema**: Hybrid-Ansatz mit `completed: boolean` + `task_completions` Historie
- **TaskStore CRUD Functions**: `loadTasks()`, `createTask()`, `toggleTask()`, `updateTask()`, `deleteTask()` vollständig implementiert
- **Create Task Form**: Bootstrap Form mit toggle functionality, form validation und TaskStore integration
- **Event Chain**: TaskCard → TaskList → App.vue → TaskStore funktional
- **Type Safety**: TypeScript Interfaces aligned mit Supabase Schema, Property-Name Bugs behoben

### Development Lessons Learned
- **Minimal Help Principle** angewendet - Konzepte erklären, Details selbst ausarbeiten lassen
- **MVP-First Approach** bewährt - Hybrid boolean statt komplexe Completion Logic
- **TypeScript Compiler** als Schema-Migration Validator genutzt
- **Pinia Composition API** Pattern verstanden und angewendet

## Aktuelle Aufgaben

### MVP Implementierungs-Reihenfolge (Deployment-Ready)

**Phase 1: Foundation (Essential für Testing)**
1. **Supabase Database Setup**
   - [x] ~~Tabellen erstellen~~ households ✓, household_members ✓, tasks ✓, task_completions ✓
   - [ ] Test-Daten für Development
   - [ ] Row Level Security (RLS) Policies konfigurieren (später, vor Multi-User Testing)
   - [ ] **Hardcoded household_id in App.vue anpassen** - Derzeit placeholder in newTask Form

2. **Authentication System - ✅ VOLLSTÄNDIG ABGESCHLOSSEN (2025-09-26)**
   - [x] ~~Supabase Auth Integration in Vue App~~ ✓
   - [x] ~~Login/Register Komponenten~~ ✓
   - [x] ~~Auth Guards für protected routes~~ ✓

3. **Basic Household Management**
   - [ ] Household erstellen (für ersten User)
   - [ ] Household beitreten (Invite Code System)
   - [ ] Current Household Context (Pinia Store)

**Phase 2: Core Functionality (MVP) - ✅ VOLLSTÄNDIG ABGESCHLOSSEN (2025-09-03)**
4. **Task System Migration**
   - [x] ~~**Task Interface anpassen**~~ - Recurrence System vereinfacht (recurrence_days statt type+days) ✓
     - [x] ~~`src/types/Task.ts`~~ - Interface ändern: `recurrence_days: number` (0=once, >0=recurring) ✓
     - [x] ~~`src/components/TaskCard.vue`~~ - Recurrence Display Logic anpassen (Zeile 30-37) ✓
     - [x] ~~TaskStore Implementation~~ - Pinia Store mit Supabase Integration ✓
   - [x] ~~Task-Store Migration von Mock-Data zu Supabase~~ ✓
   - [x] ~~Database Schema Update~~ - `completed` boolean column hinzugefügt ✓

5. **Task Completion System** 
   - [x] ~~TaskCard Toggle System~~ - Funktioniert mit Supabase Persistence ✓
   - [x] ~~App.vue State Management Migration~~ - TaskStore Integration ✓
   - [x] ~~Frontend-Database Sync~~ - Updates persistieren nach Page Reload ✓
   - [x] ~~**Create Task Form**~~ - Vollständiges Form mit allen Feldern und TaskStore integration ✓
   - [x] ~~**CRUD Operations Frontend**~~ - CREATE, READ, UPDATE (toggle), DELETE verfügbar im TaskStore ✓
   - [x] ~~**DELETE Operations UI**~~ - Delete Buttons in TaskCards mit TaskStore Integration ✓
   - [ ] **UPDATE Operations UI** - Edit Task Form
   - [ ] Advanced Completion Tracking (user_id, timestamp) (später für Gamification)
   - [ ] "Wer hat was gemacht" Anzeige (später für Multi-User)

**Phase 3: Multi-User Experience**  
6. **Real-time Updates**
   - [ ] Supabase Realtime Subscriptions
   - [ ] Live Task Status Updates zwischen Haushaltsmitgliedern

**DEPLOY-BEREIT nach Phase 1!** Phase 2 ist abgeschlossen, Authentication System vollständig implementiert!

### Aktueller Status (Funktioniert) - Stand 2025-09-26
- [x] **Vue 3 Setup** - Composition API, TypeScript, Bootstrap 5 ✓
- [x] **Supabase Database Integration** - Vollständig funktional mit TaskStore ✓
- [x] **TaskCard & TaskList Komponenten** - Frontend funktioniert mit echten Datenbank-Daten ✓ 
- [x] **Task Toggle System** - Persistent in Supabase, Updates bleiben nach Reload ✓
- [x] **Pinia State Management** - Reactive TaskStore mit Error Handling ✓
- [x] **TypeScript Type Safety** - Interfaces aligned mit Datenbank Schema ✓
- [x] **Frontend-Database Sync** - Optimistic UI Updates + Database Persistence ✓
- [x] **Authentication System** - Login/Register mit Supabase Auth, Route Guards, Session Persistence ✓
- [x] **Router Architecture** - Vue Router mit protected routes, HomeView/LoginView/RegisterView ✓

### Nächste Development Phase: CRUD UI Completion
**Priorität:** Vollständige CRUD Operations im Frontend implementieren

**Als nächstes zu implementieren:**
1. **✅ Edit Task Functionality** - Task editing Form/Modal ✓
2. **Form Validation** - Input validation und Error handling für Create/Edit Forms
3. **✅ Delete Confirmation** - Confirmation Modal vor Task-Löschung ✓

**Danach:** Authentication System für Multi-User Support

### Priorität: Nächste Session - Router Architecture Completion

**Authentication Foundation - ✅ VOLLSTÄNDIG ABGESCHLOSSEN (2025-09-26)**
- [x] **Supabase AuthStore** - Pinia Store mit login/logout/register actions ✓
- [x] **Vue Router Setup** - Router infrastructure und main.ts integration ✓
- [x] **LoginView Component** - Bootstrap form mit AuthStore integration ✓
- [x] **RegisterView Component** - Registration form mit AuthStore integration ✓
- [x] **Login/Register Routes** - `/login` und `/register` route configuration ✓

**Router Architecture - ✅ VOLLSTÄNDIG ABGESCHLOSSEN (2025-09-26)**
- [x] **HomeView.vue erstellen** - Task functionality aus App.vue extrahiert ✓
- [x] **App.vue refactoring** - Minimal layout + `<router-view>` ✓
- [x] **Router updaten** - `/` route zu HomeView ✓
- [x] **Login flow implementiert** - Navigation zwischen /, /login, /register ✓
- [x] **Route Guards** - Protected routes implementation mit Auth-Checking ✓
- [x] **Auth Navigation** - router-link Navigation zwischen Login/Register ✓
- [x] **Session Persistence** - initializeAuth() beim App-Start für Reload-Beständigkeit ✓

### Code Quality & Refactoring (Nach MVP)
- [ ] **Supabase CLI Integration** - Migrations und lokale Entwicklung
  - [ ] Supabase CLI installieren (`npm install supabase --save-dev`)
  - [ ] `supabase login` und Projekt verknüpfen
  - [ ] Database Migrations erstellen (`supabase migration new migration_name`)
  - [ ] Lokale Entwicklung mit `supabase start` (lokale Postgres + Dashboard)
  - [ ] Migration Workflow: `supabase db diff → migration new → db push`
  - [ ] Schema-Änderungen versionieren statt manuell im Dashboard

- [ ] **camelCase/snake_case Refactoring** - TypeScript Interface auf camelCase umstellen
  - [ ] Task Interface: `taskId`, `householdId`, `recurrenceDays` (statt snake_case)
  - [ ] Database Mapping Layer hinzufügen für Supabase ↔ Frontend Transformation
  - [ ] Utility Functions für automatische Property-Konvertierung

### Datenbankschema (Supabase) - Implementierter Stand

**Aktuell implementiert (✅):**
- **`households`** - Haushalte mit auto-generierten Invite Codes
- **`household_members`** - Benutzer-zu-Haushalt-Zuordnung mit Rollen
- **`tasks`** - Aufgaben-Templates mit vereinfachtem Recurrence-System
- **`task_completions`** - Vollständige Task-Erledigung-Historie

**Geplant für später:**
- `user_stats` - Benutzer-XP, Level, Streaks pro Haushalt
- `achievements` - Benutzer-Achievement-Freischaltungen

**Architektur-Prinzipien:**
- Foreign Key Constraints mit CASCADE-Deletion für Datenintegrität
- Composite Primary Keys wo logisch sinnvoll
- Check Constraints für Datenvalidierung
- UUID Primary Keys für bessere Skalierung
- Completion Tracking statt Boolean-Flags für Historie und Gamification

### Noch zu implementieren (Nice-to-have)
- [ ] **CSS Hover-Effekte** für TaskCards
- [ ] **Leere Liste Handling**
- [ ] **Responsive Design** Verbesserungen
- [ ] **PWA-Features** und mobile Optimierung
- [ ] **Test-Framework** Setup