# Putzplan TODOs

**Status:** 🎉 APP IST LIVE AUF GITHUB PAGES! 🎉

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
- [ ] User Stats - XP, Level, Streaks pro Haushalt
- [ ] Ranglisten - Mitglieder nach XP sortiert

### Priorität 3: Database & Code Quality
- [x] ✅ Refactoring - `member_id` entfernt, `user_id` als PK (One ID per user!)
- [x] ✅ RLS Policies - Fixed infinite recursion mit SECURITY DEFINER
- [ ] Form Validation
- [ ] Lokale Supabase Dev - `supabase start`

### Future
- Achievements
- Task Categories (Küche, Bad, etc.)
- Task Assignment
- Push Notifications

Styling sollte unified und ausgelagert werden, damit mans nicht für jede komponente einzeln machen muss