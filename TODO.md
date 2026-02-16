# Putzplan TODOs

**Status:** 🎉 APP IST LIVE AUF GITHUB PAGES! 🎉

---

## 🎯 High Priority

### UX Improvements
- ✅ **CleaningView UX Redesign** - ABGESCHLOSSEN (22.12.2025)
  - Multi-Select Filter-Bubbles oben (statt Single-Select Tabs unten)
  - Gruppierte Aufgaben-Anzeige mit Kategorie-Headers
  - Überfälligkeits-Farbgradient (0-14 Tage = weiß bis rot)
  - Einheitliche Bootstrap Icons in der gesamten App
- ✅ **Bottom Navigation** - ABGESCHLOSSEN (02.12.2025)
  - FAB-Positionierung über Bottom Nav + CategoryNav
  - iOS Safari safe-area-inset-bottom Support
  - Material Design Bottom Nav Pattern
- ✅ **Task-Dringlichkeitsanzeige** - ABGESCHLOSSEN (02.12.2025)
  - "X Tage überfällig" / "Noch nie gemacht" im Putzen-View
  - Sortierung nach Dringlichkeit (dringendste zuerst)
  - "Fällig in X Tagen" / "Erledigt am [Datum]" im Erledigt-View
  - Sortierung nach Fälligkeit (nächste zuerst)
- ✅ **Skip-Funktion** - ABGESCHLOSSEN (02.12.2025)
  - ⏭️ Button im TaskEditModal
  - Task zeitlich verschieben ohne Punkte zu vergeben

### Task Management
- **"Meine Aufgaben" View** - Extra Tab für zugewiesene Tasks (Option 1)
  - CategoryNav erweitern um 5. Tab: "Meine Aufgaben"
  - Neuer Filter in TaskList: `filter="assigned-todo"`
  - Store-Computed: `taskStore.assignedTasks` (filtert nach `assigned_to = current_user_id`)
  - Pattern: Standard in Asana "My Tasks", Todoist "Assigned to me"
  - Vorteil: Klare User-Erwartung, nutzt bereits vorhandenes Assignment-Feature

### Gamification System
- **User Stats** - XP, Level, Streaks pro Haushalt
- **Ranglisten** - Mitglieder nach XP sortiert anzeigen

### Code Quality
- **Form Validation** - Input-Validierung für alle Forms
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
- ✅ Verlaufsgrafik (Trend Line Chart) in StatsView - 16.02.2026
  - Line Chart mit Chart.js: Punkteverlauf über die Zeit
  - Toggle Wochen/Monats-Aggregation (KW X / Monat Jahr)
  - Eine Linie pro WG-Mitglied (user_color) + gestrichelte Gesamt-Linie
  - Tooltip bei Hover/Touch zeigt alle Werte am Zeitpunkt
  - Lücken-Füllung (leere Wochen/Monate = 0, durchgehende Linie)
  - Mobile-optimiert (300px Höhe, autoSkip bei vielen Labels)
- ✅ Soft Delete für Tasks - 04.01.2026
  - `deleted_at` Column statt echtem DELETE
  - Task-Namen bleiben in HistoryView sichtbar (auch nach Löschen)
  - "Gelöscht" Badge zeigt gelöschte Tasks in Historie
  - EnrichedCompletion Type für JOINed History-Daten
  - Fix: Race Condition in loadTasks() - überschrieb enriched Completions mit Rohdaten (06.01.2026)
- ✅ CleaningView UX Redesign - 22.12.2025
  - Multi-Select Filter-Bubbles oben statt Single-Select Tabs unten
  - Gruppierte Aufgaben-Anzeige mit Kategorie-Headers (wie Search-View)
  - Überfälligkeits-Farbgradient für recurring Tasks (0-14 Tage linear)
  - Einheitliche Bootstrap Icons: Emojis/SVGs durch bi-* ersetzt
  - 6 Dateien aktualisiert: CategoryNav, CleaningView, TaskCard, TaskEditModal, SubtaskItem, SettingsSidebar
- ✅ Fix: Deduct-Subtask Overflow Bug - 22.12.2025
  - Edge Function `complete-task` blockierte Parent-Task wenn Deduct-Sum > Parent-Effort
  - Jetzt graceful: `Math.max(0, parentEffort - deductSum)` statt 400 Error
  - Warnung wird geloggt für Debugging
- ✅ Haushalt-Notizen Feature - 22.12.2025
  - 5. Tab "Notizen" in Bottom Navigation
  - Alle Haushaltsmitglieder können Notizen erstellen, bearbeiten, löschen
  - Autor + Datum werden angezeigt, "(bearbeitet)" Tag bei Änderungen
  - Realtime-Sync zwischen allen Mitgliedern
  - Lösch-Bestätigungsmodal
- ✅ Task-Dringlichkeitsanzeige & Skip-Funktion - 02.12.2025
  - Overdue-Anzeige: "X Tage überfällig" / "Noch nie gemacht" im Putzen-View
  - Sortierung nach Dringlichkeit (dringendste Tasks zuerst)
  - Skip-Funktion: ⏭️ Button setzt last_completed_at ohne Punkte zu vergeben
  - Erledigt-View: "Fällig in X Tagen" für recurring Tasks, "Erledigt am [Datum]" für one-time Tasks
  - Sortierung nach Fälligkeit (nächste Fälligkeit zuerst)
  - Graue dezente Textzeile in task-meta (0.75rem)
- ✅ Bottom Navigation für Mobile UX - 02.12.2025
  - Fixed Bottom Navigation mit 4 Tabs (Putzen, Verlauf, Stats, Einkauf)
  - Material Design Pattern mit Active State Indicator
  - Header vereinfacht (Navigation Tabs entfernt, ~50% kompakter)
  - CategoryNav über Bottom Nav positioniert
  - FABs über CategoryNav + Bottom Nav (WhatsApp-Style)
  - iOS Safe-area-inset Support
  - Z-Index Hierarchie optimiert
- ✅ Vollständige Typography-Vereinheitlichung - 30.11.2025
  - Typography-Overrides aus utilities.css entfernt
  - Semantisch korrekte HTML-Heading-Hierarchie (h1 → h2 → h3 → h4)
  - 100% konsistente Typography app-weit (Single Source of Truth: base.css)
  - Usage Guidelines in base.css dokumentiert
  - Bessere Accessibility & SEO durch korrekte Heading-Struktur
- ✅ Chip-Navigation mit Swipe-Gesten - 30.11.2025
  - Kompakte Chip-Navigation (~40px statt 60px, ~33% Platzersparnis)
  - Scrollbare Chip-Leiste (Material Design Pattern)
  - Swipe-Gesten: Links/Rechts swipen zum Tab-Wechsel
  - Versteckte Scrollbar für cleanes Design
  - 1-Click Tab-Wechsel (besser als Dropdown)
  - Touch-optimiert mit iOS smooth scrolling
  - Alle 4 Tabs horizontal scrollbar
- ✅ Header Komprimierung + Settings Sidebar - 30.11.2025
  - Header von ~35% auf ~15% Viewport reduziert (250px → 120px)
  - SettingsSidebar Component mit Slide-in Animation
  - Haushalt-Info, Mitglieder, Profil-Edit in Sidebar verschoben
  - Hamburger-Menü (☰) statt Zahnrad-Icon
  - Backdrop Overlay mit Blur-Effekt
  - ESC-Key Support zum Schließen
  - 4-5 Tasks statt 2-3 Tasks auf Mobile Screen sichtbar
- ✅ Daily Tasks Bonus-only Subtasks - 30.11.2025
  - SubtaskManagementModal: isDailyTask check, nur Bonus-Modus erlaubt
  - Daily-Banner (grün) mit Erklärung für User
  - Kein Punktemodus-Selector bei Daily (auto-select bonus)
  - TaskCard: Flache Subtask-Liste ohne Gruppierung
  - Effort-Badge in Action-Row verschoben (4 Icons statt 3)
  - Subtask-Titel umbrechen bei langer Länge
  - Edge Function: Validation für Daily-Subtasks
  - Dokumentation in CLAUDE.md aktualisiert
- Universell Responsive Design ohne Media Queries - 23.11.2025
  - Mobile Media Queries komplett entfernt für einheitliches Design
  - Touch-optimierte Button-Größen auf allen Viewports (padding: 0.75rem vertikal)
  - Keine separaten Cases für verschiedene Viewports mehr
  - Konsistentes Look & Feel von Mobile bis Desktop
- TaskCard Typography & Spacing Update - 23.11.2025
  - Vergrößerte Schriftgrößen für bessere Lesbarkeit (Titel: 1rem, Info: 0.875rem)
  - Größere Buttons (0.875rem) und Icons (16px)
  - Mehr Padding in Card-Body und Footer (var(--spacing-md))
  - Assignment Badge vergrößert (32px)
  - Bessere Touch-Targets für Mobile
- Mobile Layout Optimierung & Modal Refactoring - 23.11.2025
  - **Neue Modals**: TaskEditModal, TaskCreateModal (statt inline Forms)
  - **SubtaskItem Layout**: 3-Zeilen Struktur wie TaskCard (Assignment Badge, Edit/Delete Icons, Sauber-Button)
  - **Subtasks verwalten Button**: Nur bei ausgeklappten Subtasks sichtbar
  - **Modal Mobile-Fix**: Flexbox Layout mit scrollbarem Body (utilities.css)
  - **Kompakte Buttons**: Subtask "Sauber" nur ✓ (ohne Text)
  - **Punktemodus-Buttons**: Responsive mit flex: 1 für Mobile (360px)
  - Alle Features auf Mobile (360x740) mit Playwright getestet
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