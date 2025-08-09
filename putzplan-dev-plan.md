# Gamifizierter Putzplan - Entwicklungsplan

## Phase 1: Setup & Grundlagen (Tag 1-2)

### ✅ Setup (bereits erledigt)
- [x] Vue.js + TypeScript Projekt erstellt
- [x] Router, Pinia, ESLint, Prettier konfiguriert

### 🔧 Supabase Setup
- [x] Supabase Account erstellen
- [x] Neues Projekt anlegen
- [ ] API Keys in Vue-App einbinden
- [ ] Erste Verbindung testen

### 📊 Datenbank Design
- [ ] Tabellen erstellen (tasks, completed_tasks, user_stats)
- [ ] Row Level Security (RLS) konfigurieren
- [ ] Test-Daten einfügen

## Phase 2: Authentication (Tag 2-3)

### 🔐 User Management
- [ ] Login/Register Komponenten erstellen
- [ ] Supabase Auth Integration
- [ ] Protected Routes einrichten
- [ ] User Store (Pinia) erstellen

### 🎯 MVP Features
- [ ] Einfaches Dashboard mit User-Info
- [ ] Logout-Funktionalität
- [ ] Navigation zwischen Seiten

## Phase 3: Core Features (Tag 3-5)

### 📝 Task Management
- [ ] TaskList Komponente
- [ ] TaskCard Komponente  
- [ ] "Task abschließen" Button
- [ ] Task Store (Pinia) für State Management

### 🎮 Basic Gamification
- [ ] XP System implementieren
- [ ] Level-Berechnung (z.B. Level = XP / 250)
- [ ] XP-Display Komponente
- [ ] Simple Progress Bar

### 💾 Data Flow
- [ ] Tasks von Supabase laden
- [ ] Completed Tasks speichern
- [ ] User Stats aktualisieren
- [ ] Real-time Updates zwischen Geräten

## Phase 4: Gamification Enhancement (Tag 5-7)

### 🏆 Advanced Gaming Features
- [ ] Achievement System
  - "Erste Aufgabe", "10 Tasks", "Woche komplett"
- [ ] Streak Counter (täglich putzen)
- [ ] Kategorien mit verschiedenen XP-Werten
  - Küche: 20 XP, Bad: 30 XP, Wohnzimmer: 15 XP

### 📊 Statistics & Leaderboard
- [ ] Personal Stats Dashboard
- [ ] Leaderboard zwischen euch beiden
- [ ] Wöchentliche/monatliche Auswertung
- [ ] Charts für Fortschritt (optional)

## Phase 5: UI/UX Polish (Tag 7-8)

### 🎨 Design Verbesserungen
- [ ] Responsive Design für Mobile
- [ ] Dark/Light Mode
- [ ] Animationen für XP-Gewinn
- [ ] Icons und visuelle Verbesserungen
- [ ] Loading States

### 📱 Mobile Optimierung
- [ ] PWA Features (installierbar)
- [ ] Touch-friendly Buttons
- [ ] Swipe Gestures (optional)

## Phase 6: Bonus Features (Tag 9+)

### 🔔 Notifications & Reminders
- [ ] Browser Notifications
- [ ] Tägliche Erinnerungen
- [ ] Aufgaben-Scheduler

### 🎁 Reward System
- [ ] Belohnungen definieren
- [ ] "Gutschein" System (Kino, Essen gehen)
- [ ] Penalty System (wer weniger putzt, kocht)

### 📈 Analytics
- [ ] Welche Aufgaben werden oft vergessen?
- [ ] Produktivitäts-Trends
- [ ] Export-Funktion für Daten

## Technische Struktur

### 📁 Komponenten Übersicht
```
src/
├── components/
│   ├── TaskCard.vue
│   ├── TaskList.vue  
│   ├── XPDisplay.vue
│   ├── LevelProgress.vue
│   ├── Leaderboard.vue
│   └── AchievementBadge.vue
├── views/
│   ├── Dashboard.vue
│   ├── Login.vue
│   ├── Profile.vue
│   └── Stats.vue
├── stores/
│   ├── auth.ts
│   ├── tasks.ts
│   └── user.ts
└── utils/
    ├── supabase.ts
    └── gamification.ts
```

### 🗄️ Datenbank Schema
```sql
-- Aufgaben-Templates
tasks (id, name, description, xp_reward, category)

-- Erledigte Aufgaben  
completed_tasks (id, user_id, task_id, completed_at, xp_earned)

-- User Statistiken
user_stats (user_id, total_xp, level, streak_days, tasks_completed)

-- Achievements
achievements (id, user_id, achievement_type, unlocked_at)
```

## Zeitziele

- **MVP (Phase 1-3):** 5 Tage
- **Vollversion (Phase 1-5):** 8 Tage  
- **Mit Bonus Features:** 10+ Tage

## Nächste Schritte

1. **Jetzt:** Supabase Account erstellen
2. **Heute:** Datenbank aufsetzen + erste Vue-Komponente
3. **Morgen:** Authentication implementieren
4. **Tag 3:** Erste Tasks abschließbar machen

---

*Tipp: Arbeitet in kleinen Schritten und testet regelmäßig! Lieber ein funktionierendes MVP als ein halbfertiges Vollfeature-Monster.*