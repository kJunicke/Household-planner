# Putzplan TODOs

**Status:** 🎉 APP IST LIVE AUF GITHUB PAGES! 🎉

---

## ✅ Migrations & RLS Cleanup - ABGESCHLOSSEN!

**Status:** ✅ Konsolidiert am 26.10.2025
**Branch:** `refactor/consolidate-migrations-20251026`

**Ergebnis:** 29 Migrations → 4 konsolidierte + vollständige Dokumentation
**Details:** Siehe [RLS_SECURITY.md](putzplan_vue/supabase/RLS_SECURITY.md) und [MIGRATION_AUDIT.md](putzplan_vue/supabase/MIGRATION_AUDIT.md)

⚠️ **Keine Änderungen an Remote-DB** - nur lokale Dateien reorganisiert

---

## 🚀 Nächste Tasks

### Priorität 1: Edge Functions & Testing
- [x] ✅ Edge Function Migration - `completeTask()` von DB-Trigger zu TypeScript Edge Function
- [ ] **E2E Testing** - Edge Function `complete-task` mit Playwright testen
- [ ] Household Invite Flow - Join-Prozess auf mobilen Geräten testen

### Priorität 2: Gamification MVP
- [x] User Display Names - Nutzer können ihren Namen setzen/ändern (household_members.display_name)
- [x] Mitgliederliste im Header - Alle Haushaltsmitglieder werden angezeigt
- [x] ✅ "Wer hat was gemacht" Anzeige - Completion history mit Namen im Verlauf-Tab
- [x] ✅ Navigation mit Header - Putzen/Verlauf/Stats Tabs (Browser-Tab-Style)
- [x] ✅ Verlauf bearbeiten - Einträge löschen bei irrtümlichem Abschluss
- [x] ✅ Stats Tab - Tortendiagramm mit effort-gewichteter Aufgabenverteilung
- [x] ✅ Effort Override Feature - Nutzer können beim Abschluss einen abweichenden Aufwand mit Begründung angeben
- [x] ✅ Stats berechnen effort_override korrekt - Override-Werte werden in Statistik berücksichtigt
- [x] ✅ History "Alle löschen" Button - Gesamten Verlauf für Haushalt löschen mit Confirmation Modal
- [x] ✅ Stats Balkendiagramm - Punkteverteilung pro Mitglied als Bar Chart
- [x] ✅ Stats Zeitraum-Filter - Tabs für Gesamt/Woche/Monat/Jahr mit reaktiver Filterung
- [x] ✅ Chart Styling - Integration in App-Farbschema (Primary, Success, Warning colors)
- [x] ✅ User Color Customization - Nutzer können ihre eigene Farbe wählen
- [x] ✅ Confetti Animation - Celebration-Effekt beim Task-Completion (canvas-confetti)
- [ ] User Stats - XP, Level, Streaks pro Haushalt
- [ ] Ranglisten - Mitglieder nach XP sortiert

### Priorität 3: Database & Code Quality
- [x] ✅ Refactoring - `member_id` entfernt, `user_id` als PK (One ID per user!)
- [x] ✅ RLS Policies - Fixed infinite recursion mit SECURITY DEFINER
- [x] ✅ CSS Refactoring - Zentrale utilities.css mit wiederverwendbaren Patterns (~223 Zeilen weniger Code)
- [x] ✅ Migrations & RLS Cleanup - 29 → 4 konsolidierte Migrations mit vollständiger Dokumentation
- [ ] Form Validation
- [ ] Lokale Supabase Dev - `supabase start`

### Priorität 4: Task Management
- [x] ✅ Task Assignment - Tasks können Mitgliedern zugewiesen werden (permanent oder temporär)
- [x] ✅ Daily/General Tasks - Tasks mit `task_type` Enum (recurring, daily, one-time) für bessere Übersichtlichkeit
  - Database: `task_type` Feld mit CHECK constraint
  - Frontend: Sub-Tabs in CleaningView (Alltagsaufgaben / Putzaufgaben / Erledigt)
  - Conditional rendering mit `v-if` für bessere Übersicht
  - Mobile-responsive Button-Tab UI
- [x] ✅ **Subtasks Feature** - Nested tasks für komplexe Aufgaben (z.B. Wäsche: Sortieren, Waschen, Aufhängen)
  - Self-referencing FK `parent_task_id` in tasks table (statt separate subtasks table)
  - SubtaskManagementModal für Subtask-Verwaltung (Create, Edit, Delete, Reorder)
  - Subtask-Completion-Modes: `'all'` (alle müssen), `'any'` (einer reicht), `'none'` (optional)
  - Separates Effort-System: Parent-Task-Effort + individuelle Subtask-Effort-Werte
  - Collapsible Subtask-Liste in TaskCard mit Expand/Collapse-Icon
  - Subtask-Completions werden einzeln in task_completions getrackt
  - Cron-Job resettet auch Subtasks automatisch bei recurring tasks

### Future
- Achievements
- Task Categories (Küche, Bad, etc.)
- Push Notifications


### Offene Issues
- [ ] tasks bearbeiten erlaubt grad noch nicht diese in verschieden zeitstrukturen zu verschieben
- [ ] Einkäufe zumindest müssen irgendwie auch offline funktionieren. Muss dann geklärt werden, wie das mit dem nachträglichen synchronisieren dann funktionieren soll
- [x] ✅ Subtask Optik optimieren - Simplified layout: Checkbox entfernt, 2-Zeilen Layout (Titel+Effort | Buttons)
