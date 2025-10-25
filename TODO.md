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

### Priorität 1: Multi-User Testing
- [x] ✅ Realtime Testing - Funktioniert! (CREATE, UPDATE, DELETE Events)
- [x] Mobile Testing - PWA Installation auf iOS/Android testen
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
- [ ] User Stats - XP, Level, Streaks pro Haushalt
- [ ] Ranglisten - Mitglieder nach XP sortiert

### Priorität 3: Database & Code Quality
- [x] ✅ Refactoring - `member_id` entfernt, `user_id` als PK (One ID per user!)
- [x] ✅ RLS Policies - Fixed infinite recursion mit SECURITY DEFINER
- [x] ✅ CSS Refactoring - Zentrale utilities.css mit wiederverwendbaren Patterns (~223 Zeilen weniger Code)
- [x] ✅ Migrations & RLS Cleanup - 29 → 4 konsolidierte Migrations mit vollständiger Dokumentation
- [ ] Form Validation
- [ ] Lokale Supabase Dev - `supabase start`

### Future
- Achievements
- Task Categories (Küche, Bad, etc.)
- Task Assignment
- Push Notifications
