# Putzplan TODOs

**Status:** 🎉 APP IST LIVE AUF GITHUB PAGES! 🎉

---

## 🎯 High Priority

### Gamification System
- **User Stats** - XP, Level, Streaks pro Haushalt
- **Ranglisten** - Mitglieder nach XP sortiert anzeigen

### Code Quality
- ✅ **Toast Notifications** - Zentralisiertes Error & Success Feedback (Bootstrap 5 + Pinia)
- ✅ **Loading States** - Skeleton Screens, Button Disabled States, Race Condition Fixes (06.11.2025)
- **Form Validation** - Input-Validierung für alle Forms
- **Lokale Supabase Dev** - `supabase start` Setup für lokales Testing

---

## 📋 Medium Priority

### Shopping-Liste Features
- ✅ **Priorisierung** - Items nach Wichtigkeit sortieren/markieren (15.11.2025)
- ✅ **Offline-Modus** - Shopping-Liste offline nutzbar (mit Sync beim Reconnect) (16.11.2025)

---

## 💡 Backlog (Future Ideas)

### Gamification
- **Achievements** - Badges/Trophäen für besondere Leistungen
- **Push Notifications** - Erinnerungen für überfällige Tasks

### Task Management
- **Task Categories** - Kategorien wie Küche, Bad, Wohnzimmer etc.
- **Task Templates** - Vorgefertigte Task-Sets für neue Haushalte

---

## 📝 Notizen

**Migrations:** Konsolidiert am 26.10.2025 (29 → 4 Migrations)

**Letzte größere Features:**
- UI/UX Kompakt-Design Optimierung - 23.11.2025
  - TaskCard kompakter (reduzierte Paddings, kleinere Fonts)
  - Grid-Layout: 2 Spalten auf Mobile (360px)
  - Kategorie-Navigation als 2. Leiste unter Hauptnavigation
  - Icons + Labels (Blitz-Icon für Alltag statt Uhr)
  - Footer zweizeilig: Oben Actions (Zuweisung/Edit/Delete), unten Sauber-Button
  - Sauber-Button immer auf gleicher Höhe innerhalb Spalte
  - Subtasks standardmäßig eingeklappt
  - Deutlich weniger Leerraum, mehr Übersichtlichkeit
- Shopping-Liste Offline-Modus - 16.11.2025
  - Offline-First Architektur mit localStorage Cache
  - Optimistic Updates (UI reagiert sofort)
  - Mutation Queue für Offline-Operationen
  - Auto-Sync bei Reconnect mit Exponential Backoff Retry
  - Temp ID Blocking (Updates nur für existierende Items)
  - Offline/Sync Status Banner in UI
  - Network Status Detection (useNetworkStatus composable)
- Shopping-Liste Priorisierung - 15.11.2025
  - `is_priority` Boolean-Flag in DB
  - Stern-Button zum Markieren/Demarkieren
  - Orange Gradient-Hintergrund für Priority-Items
  - Auto-Sortierung: Priority Items ganz oben
  - DB-Trigger: Priorität wird beim Abhaken automatisch entfernt
- Projects Feature für langfristige Task-Verwaltung - 15.11.2025
  - Eigener "Projekte" Tab mit separater Completed-Sektion
  - Auto-generierter "Am Projekt arbeiten" Subtask
  - ProjectWorkModal für Effort-Logging (1-5 Punkte) + Notes
  - Nur Bonus/Checklist Subtasks erlaubt (Deduct disabled)
  - ProjectCompleteModal mit Bestätigung
  - Custom Effort Tracking in History & Stats
- Loading States & Race Condition Fixes - 06.11.2025
  - Skeleton Screens für Initial Load
  - Button Disabled States während Actions
  - Guard Clauses gegen parallele Calls
  - Sequential Load → Subscribe Pattern
- Toast Notification System (Bootstrap 5 + Pinia) - 06.11.2025
- Subtasks System mit Completion-Modes
- Effort Override mit Begründung
- Stats Dashboard mit Zeit-Filtern
- User Color Customization
- Confetti Animation bei Task-Completion