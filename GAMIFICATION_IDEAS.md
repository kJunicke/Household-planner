# 🎮 Gamification-Ideen für Putzplan-App

**Status:** Brainstorming-Sammlung (26.10.2025)
**Kontext:** Vue 3 + Supabase App mit bestehendem Effort-Points System

---

## 📊 Aktueller Stand

**Bereits implementiert:**
- ✅ Effort-Points pro Task (gewichtetes Punktesystem)
- ✅ Stats-View mit Pie/Bar Charts (Zeitraum-Filter: Woche/Monat/Jahr/Gesamt)
- ✅ Task-Historie (`task_completions` append-only)
- ✅ User-Farben für Personalisierung
- ✅ Task-Assignment System (permanent/temporary)

**Tech Stack:**
- Vue 3 + TypeScript + Pinia
- Supabase (Auth, DB, Realtime, Edge Functions)
- Bootstrap 5 + Custom CSS Variables
- Chart.js für Visualisierung

---

## 🎯 Feature-Kategorien

### 1. 🏆 Progression & Achievements

#### 1.1 Level-System
**Konzept:** Sammle XP basierend auf Effort-Points, steige Level auf

**Implementierung:**
```typescript
// Neue Tabelle: user_stats
type UserStats = {
  user_id: string
  household_id: string
  total_xp: number
  current_level: number
  current_streak: number
  longest_streak: number
  total_completions: number
  created_at: string
}

// XP Calculation
const XP_PER_EFFORT_POINT = 10
const LEVEL_FORMULA = (level: number) => level * 100 + (level - 1) * 50
```

**Level-Titel:**
- Level 1-5: "Putznovize"
- Level 6-10: "Sauberkeitsheld"
- Level 11-20: "Hygienemeister"
- Level 21-30: "Putzguru"
- Level 31+: "Sauberkeitsgott"

**DB Migration:**
```sql
CREATE TABLE user_stats (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(household_id) ON DELETE CASCADE,
  total_xp INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  total_completions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, household_id)
);
```

**UI Location:** Stats-View (Top-Banner) + Header (Level-Badge)

**Komplexität:** 🟡 Mittel (2-3h)

---

#### 1.2 Achievement-System
**Konzept:** Sammelbare Badges für Meilensteine

**Achievement-Typen:**

**Streak-Achievements:**
- 🔥 "Früher Vogel" - 5 Tasks vor 9:00 Uhr
- ⚡ "Putzteufel" - 7 Tage in Folge mindestens 1 Task
- 💪 "Durchhaltemeister" - 30 Tage Streak
- 🏅 "Unstoppable" - 100 Tage Streak

**Task-Achievements:**
- 🧹 "Spezialist" - 10x denselben Task completed
- 🎯 "Perfektionist" - 50 Tasks mit effort_override 0
- 💎 "Centurion" - 100 Tasks total
- 🏆 "Legend" - 1000 Tasks total

**Effort-Achievements:**
- 💪 "Schwere Arbeit" - 10 Tasks mit effort ≥5
- 🦾 "Herkulesaufgabe" - Einen Task mit effort 10+
- 📈 "Punktejäger" - 1000 Effort-Points gesammelt

**Social-Achievements:**
- 👑 "Monats-Champion" - Meiste Punkte im Monat
- 🤝 "Team-Player" - In einer Woche in jedem Raum mind. 1 Task
- 🎨 "Individualist" - Profil personalisiert (Name + Farbe)

**Implementierung:**
```typescript
// Neue Tabelle: achievements
type Achievement = {
  achievement_id: string
  name: string
  description: string
  icon: string // emoji oder icon-class
  category: 'streak' | 'task' | 'effort' | 'social'
  requirement_type: 'count' | 'streak' | 'condition'
  requirement_value: number
  created_at: string
}

// Neue Tabelle: user_achievements
type UserAchievement = {
  user_id: string
  household_id: string
  achievement_id: string
  unlocked_at: string
  progress?: number // Optional für "10/50"-Anzeige
}
```

**Achievement-Check Logic:**
- Edge Function `check-achievements` nach jedem Task-Complete
- Frontend: Achievement-Toast-Notification mit Konfetti-Animation
- Stats-View: Achievement-Showcase Grid

**Komplexität:** 🔴 Hoch (4-6h)

---

#### 1.3 Streak-Tracker
**Konzept:** Tägliche Aktivitäts-Streak mit Visualisierung

**Features:**
- Feuer-Icon mit Streak-Count 🔥 7
- Kalender-Visualisierung (letzte 30 Tage)
- Warnung bei Gefahr: "Deine Streak endet heute!" (Push-Notification optional)
- Freeze-Item: 1x pro Monat einen Tag "überspringen" (Shop-Item)

**Implementierung:**
```typescript
// In user_stats bereits: current_streak, longest_streak

// Neue Tabelle: daily_activity (für Kalender-View)
type DailyActivity = {
  user_id: string
  household_id: string
  date: string // YYYY-MM-DD
  tasks_completed: number
  effort_earned: number
  PRIMARY KEY (user_id, household_id, date)
}

// Edge Function: update-streak (called after completeTask)
// - Check if last activity was yesterday
// - Increment current_streak oder reset to 1
// - Update longest_streak if exceeded
```

**UI Location:**
- Header: Compact Streak-Badge 🔥 23
- Stats-View: Kalender-Heatmap (GitHub-Style)
- Streak-Freeze-Button (falls vorhanden)

**Komplexität:** 🟡 Mittel (3-4h)

---

### 2. 🏁 Competitive Features

#### 2.1 Wöchentliche Challenges
**Konzept:** Auto-generierte Challenges mit Rangliste

**Challenge-Typen:**
- "Badezimmer-Meister" - Wer macht die meisten Bad-Tasks?
- "Küchen-König" - Höchste Effort-Points in Küche
- "Vollstrecker" - Meiste Tasks insgesamt
- "Effizienz-Champion" - Höchster Schnitt (Effort/Task)

**Implementierung:**
```typescript
// Neue Tabelle: challenges
type Challenge = {
  challenge_id: string
  household_id: string
  title: string
  description: string
  challenge_type: 'room_specific' | 'total_tasks' | 'effort_specific' | 'efficiency'
  filter_room?: string // z.B. "Bad" für room_specific
  start_date: string
  end_date: string // 7 Tage später
  created_at: string
}

// Cron Job: Generate weekly challenge (Montag 0:00 UTC)
// Edge Function: calculate-challenge-leaderboard
```

**UI:**
- CleaningView: Challenge-Banner oben
- Stats-View: Challenge-Podium (1st 🥇, 2nd 🥈, 3rd 🥉)
- Live-Rangliste während Challenge

**Komplexität:** 🔴 Hoch (5-7h)

---

#### 2.2 Power Hour
**Konzept:** Zufällige 2x XP Zeitfenster

**Implementierung:**
```typescript
// In household settings: next_power_hour
type Household = {
  // ... existing fields
  power_hour_start?: string // ISO timestamp
  power_hour_active: boolean
}

// Cron Job: Generiere täglich 1-2 random Power Hours (1-2h Dauer)
// Edge Function complete-task: Check if within power_hour → XP *= 2

// Realtime: Broadcast Power-Hour-Start an alle Household-Members
```

**UI:**
- Push-Notification: "⚡ Power Hour gestartet! 2x XP für 1 Stunde!"
- Header: Pulsierendes ⚡-Icon während Power-Hour
- Task-Cards: "2x XP"-Badge

**Komplexität:** 🟡 Mittel (2-3h)

---

#### 2.3 Head-to-Head Duels
**Konzept:** Andere User zu 1-vs-1 Task-Battle challengen

**Flow:**
1. User A challenged User B: "Wer putzt mehr Badezimmer diese Woche?"
2. User B acceptiert/lehnt ab
3. Live-Counter während Duel
4. Sieger bekommt Bonus-XP + Badge

**Implementierung:**
```typescript
type Duel = {
  duel_id: string
  household_id: string
  challenger_id: string
  challenged_id: string
  challenge_type: 'room_specific' | 'total_tasks' | 'effort_total'
  filter_room?: string
  status: 'pending' | 'active' | 'completed' | 'rejected'
  winner_id?: string
  start_date: string
  end_date: string
  created_at: string
}

type DuelParticipant = {
  duel_id: string
  user_id: string
  score: number // Tasks completed oder Effort-Points
}
```

**UI:**
- Stats-View: "Duel-Arena" mit Challenge-Button
- Modal: Duel-Setup (Gegner, Type, Dauer)
- Realtime-Ticker: "Max hat gerade 3 Punkte geholt! 🔥"

**Komplexität:** 🔴 Sehr Hoch (6-8h)

---

### 3. 🎨 Personalisierung & Fun

#### 3.1 Avatar-System
**Konzept:** Profilbilder mit Upload oder Icon-Auswahl

**Implementierung:**
```typescript
// In household_members erweitern:
type HouseholdMember = {
  // ... existing fields
  avatar_url?: string // Supabase Storage URL
  avatar_type: 'upload' | 'icon' | 'emoji'
  avatar_value?: string // Icon-Name oder Emoji
}

// Supabase Storage Bucket: 'avatars'
// Max file size: 2MB, nur Images
```

**UI:**
- Header: Avatar statt initials
- Stats-View: Avatare in Leaderboard
- Settings: Avatar-Editor

**Komplexität:** 🟡 Mittel (3-4h)

---

#### 3.2 Custom Task-Icons
**Konzept:** Emojis für Tasks vergeben

**Implementierung:**
```typescript
// In tasks erweitern:
type Task = {
  // ... existing fields
  icon?: string // Emoji oder Bootstrap-Icon-Name
}
```

**UI:**
- TaskCard: Icon links neben Titel
- CreateTask-Form: Emoji-Picker-Button

**Komplexität:** 🟢 Einfach (1-2h)

---

#### 3.3 Putz-Personas
**Konzept:** Witzige Stats-basierte Persona-Titel

**Beispiel-Personas:**
- 🥷 "Küchen-Ninja" - 80% der Tasks sind Küche
- 🦸 "Badezimmer-Held" - Meist Bad-Tasks
- 🌙 "Nacht-Eule" - 60% der Tasks nach 20:00 Uhr
- ☀️ "Morgenstern" - 60% der Tasks vor 10:00 Uhr
- 🎯 "Allrounder" - Gleichmäßig über alle Räume verteilt

**Implementierung:**
```typescript
// Edge Function: calculate-persona (wöchentlich via Cron)
// Analysiert letzte 30 Tage Completions
// Speichert in user_stats.persona: string

// Frontend: Badge in Stats-View
```

**UI:**
- Stats-View: Persona-Badge mit Tooltip (Erklärung)
- Fun-Animation beim Persona-Wechsel

**Komplexität:** 🟡 Mittel (2-3h)

---

#### 3.4 Sound-Effekte
**Konzept:** Optionale Audio-Feedback bei Events

**Sounds:**
- Task-Complete: "Ding!" oder "Whoosh"
- Level-Up: Fanfare
- Achievement-Unlock: Applaus
- Streak-Milestone: Trommelwirbel
- Power-Hour-Start: Sirene

**Implementierung:**
```typescript
// Sound-Assets: /public/sounds/
// LocalStorage: soundEnabled: boolean

// Composable: useSoundEffects()
const playSound = (eventType: 'complete' | 'levelup' | 'achievement') => {
  if (!localStorage.getItem('soundEnabled')) return
  new Audio(`/sounds/${eventType}.mp3`).play()
}
```

**UI:**
- Settings: Toggle "Sound-Effekte aktivieren"
- Volume-Slider (optional)

**Komplexität:** 🟢 Einfach (1-2h)

---

### 4. 📱 Social Features

#### 4.1 Activity Feed
**Konzept:** Social-Media-Style Feed mit Household-Aktivitäten

**Feed-Items:**
- "Max hat gerade das Bad geputzt 💪" (2 min ago)
- "Lisa ist Level 10 aufgestiegen! 🎉" (5 min ago)
- "Tom hat den Achievement 'Putzteufel' unlocked! 🏆" (1h ago)
- "Anna started a Power Hour! ⚡" (2h ago)

**Implementierung:**
```typescript
type ActivityFeedItem = {
  activity_id: string
  household_id: string
  user_id: string
  activity_type: 'task_complete' | 'level_up' | 'achievement' | 'power_hour' | 'challenge_won'
  metadata: Record<string, any> // { task_title: "Bad putzen", effort: 5 }
  created_at: string
}

// Realtime: Broadcast via Supabase Channel
// Frontend: Auto-scroll Feed mit Like-Button
```

**UI:**
- CleaningView: Feed-Widget (Sidebar oder unten)
- Infinite-Scroll mit letzten 50 Items
- Like-Button (optional: Reactions 👍❤️🔥)

**Komplexität:** 🔴 Hoch (4-6h)

---

#### 4.2 Task-Kommentare
**Konzept:** Kommentare/Notes bei Task-Completion

**Use-Cases:**
- "War heute echt schlimm 😅"
- "Hab auch den Mülleimer geleert 👍"
- Foto-Upload vom Ergebnis

**Implementierung:**
```typescript
// Erweitere task_completions:
type TaskCompletion = {
  // ... existing fields
  comment?: string
  photo_url?: string // Supabase Storage
}

// Supabase Storage Bucket: 'completion_photos'
```

**UI:**
- TaskCompletionModal: Comment-Textarea + Photo-Upload (optional)
- HistoryView: Kommentare/Fotos anzeigen
- Lightbox für Fotos

**Komplexität:** 🟡 Mittel (3-4h)

---

#### 4.3 Team-Goals
**Konzept:** Kooperative Haushaltsziele

**Beispiele:**
- "100 Tasks diese Woche als Team!"
- "500 Effort-Points gemeinsam sammeln"
- "Jeder mindestens 5 Tasks"

**Implementierung:**
```typescript
type TeamGoal = {
  goal_id: string
  household_id: string
  title: string
  description: string
  goal_type: 'total_tasks' | 'total_effort' | 'min_per_member'
  target_value: number
  current_value: number
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'failed'
  reward_xp?: number // Bonus für alle bei Erreichen
}

// Edge Function: update-team-goal (nach jedem completeTask)
```

**UI:**
- CleaningView: Progress-Bar für aktives Team-Goal
- Konfetti-Animation bei Erreichen
- Team-Goal-History in Stats-View

**Komplexität:** 🟡 Mittel (3-4h)

---

### 5. 🎁 Rewards & Motivation

#### 5.1 Punkte-Shop
**Konzept:** XP gegen Rewards eintauschen

**Reward-Beispiele:**
- "1 Woche Müll nicht rausbringen" (500 XP)
- "Freie Wahl beim Kochen" (300 XP)
- "Doppel-XP für 24h" (1000 XP)
- "Streak-Freeze" (200 XP) - 1x Streak pausieren ohne zu verlieren
- "Task-Skip" (150 XP) - Assigned Task an jemand anderen weitergeben

**Implementierung:**
```typescript
type ShopItem = {
  item_id: string
  household_id: string
  name: string
  description: string
  cost_xp: number
  item_type: 'privilege' | 'boost' | 'cosmetic'
  icon: string
  created_by: string // Owner kann eigene Items erstellen
}

type UserInventory = {
  user_id: string
  household_id: string
  item_id: string
  quantity: number
  acquired_at: string
}

// Edge Function: purchase-item
// - Check if user has enough XP
// - Deduct XP from user_stats
// - Add to user_inventory
```

**UI:**
- Shop-View (neue Route /shop)
- Inventory in Settings
- Purchase-Modal mit Konfirmation

**Komplexität:** 🔴 Hoch (5-7h)

---

#### 5.2 Mystery Boxes
**Konzept:** Zufällige Belohnungen nach Task-Complete

**Chance:**
- 10% nach jedem Task (höher bei high-effort Tasks)
- Enthält: Mini-XP-Boost, Streak-Freeze, Fun-Messages, Shop-Items

**Implementierung:**
```typescript
type MysteryBox = {
  box_id: string
  reward_type: 'xp_boost' | 'streak_freeze' | 'message' | 'shop_item'
  reward_value: number | string
}

// Edge Function complete-task:
// - Random roll (10% chance)
// - Select random MysteryBox reward
// - Apply reward + Show notification
```

**UI:**
- Task-Complete: "🎁 Mystery Box!" Animation
- Modal zeigt Reward an

**Komplexität:** 🟡 Mittel (2-3h)

---

#### 5.3 Task-Roulette
**Konzept:** Zufälligen Task ziehen mit Bonus-XP

**Flow:**
1. User klickt "Task-Roulette" Button
2. Roulette-Animation (Wheel-of-Fortune)
3. Assigned random Task aus Pool
4. Bonus +50% XP wenn completed

**Implementierung:**
```typescript
// Frontend: Wheel-Animation mit allen Tasks
// Mark assigned task with is_roulette: boolean (temporary flag)
// Edge Function complete-task: Check flag → XP *= 1.5
```

**UI:**
- CleaningView: "🎰 Task-Roulette" Button (1x täglich?)
- Roulette-Wheel-Animation
- Task-Card zeigt "🎰 +50% XP" Badge

**Komplexität:** 🟡 Mittel (3-4h)

---

#### 5.4 Daily Quest
**Konzept:** Ein zufälliger Task pro Tag mit Extra-Bonus

**Implementierung:**
```typescript
type DailyQuest = {
  household_id: string
  date: string // YYYY-MM-DD
  task_id: string
  bonus_xp: number
  PRIMARY KEY (household_id, date)
}

// Cron Job: Generiere täglich (0:00 UTC) random Task
// Edge Function complete-task: Check if is daily quest → extra XP
```

**UI:**
- CleaningView: "⭐ Daily Quest" Banner
- Task-Card: Gold-Border für Daily Quest
- Completion: "🌟 Daily Quest completed! +100 XP"

**Komplexität:** 🟢 Einfach (1-2h)

---

### 6. 🌈 Feel-Good Features

#### 6.1 Konfetti-Animation
**Konzept:** Celebration-Effekt bei Milestones

**Trigger:**
- Level-Up
- Achievement-Unlock
- Streak-Milestone (7, 30, 100 Tage)
- Team-Goal erreicht
- Challenge gewonnen

**Implementierung:**
```typescript
// npm install canvas-confetti
import confetti from 'canvas-confetti'

const celebrateEvent = (type: 'levelup' | 'achievement' | 'streak') => {
  confetti({
    particleCount: type === 'levelup' ? 200 : 100,
    spread: 70,
    origin: { y: 0.6 }
  })
}
```

**Komplexität:** 🟢 Einfach (30min)

---

#### 6.2 Progress-Bars
**Konzept:** Visuelle Fortschritts-Anzeige

**Locations:**
- Header: Level-Progress (XP bis nächstes Level)
- Stats-View: Team-Goal Progress
- Challenge-Banner: Challenge-Progress

**Komplexität:** 🟢 Einfach (1h)

---

#### 6.3 Seasonal Themes
**Konzept:** Event-basierte Designs & Animationen

**Beispiele:**
- 🎃 Halloween: Skelett-Animation bei Task-Complete
- 🎄 Weihnachten: Jingle-Sound, Schnee-Konfetti
- 🎆 Neujahr: Feuerwerk-Animation
- 🌸 Frühling: Blumen-Konfetti

**Implementierung:**
```typescript
// base.css: CSS Variables für Theme
const getCurrentTheme = () => {
  const now = new Date()
  if (now.getMonth() === 9) return 'halloween' // Oktober
  if (now.getMonth() === 11) return 'christmas' // Dezember
  return 'default'
}

// Dynamic CSS class: theme-halloween, theme-christmas
```

**Komplexität:** 🟡 Mittel (2-3h pro Theme)

---

## 🚀 MVP-Empfehlungen (Quick Wins)

### Phase 1: Foundation (1-2 Tage)
1. **Streak-Tracker** 🔥 - Hoher Motivationsfaktor, nutzt bestehende Daten
2. **Custom Task-Icons** 🎨 - Einfach, macht App persönlicher
3. **Konfetti-Animation** 🎉 - Instant-Dopamine-Hit
4. **Daily Quest** ⭐ - Simpel, lenkt Fokus auf einen Task

**Geschätzter Aufwand:** 6-8h

---

### Phase 2: Progression (2-3 Tage)
5. **Level-System** 📈 - Nutzt bestehendes XP-System
6. **Achievement-System (Basic)** 🏆 - Start mit 5-8 einfachen Achievements
7. **Progress-Bars** 📊 - Visuelles Feedback

**Geschätzter Aufwand:** 10-12h

---

### Phase 3: Social & Competitive (3-5 Tage)
8. **Activity Feed** 📱 - Social-Component, nutzt Realtime
9. **Wöchentliche Challenges** 🏁 - Competitive Element
10. **Task-Kommentare** 💬 - Interaktion & Stories

**Geschätzter Aufwand:** 12-16h

---

### Phase 4: Economy & Rewards (3-4 Tage)
11. **Punkte-Shop** 🛒 - Custom Rewards, von Haushalt definiert
12. **Mystery Boxes** 🎁 - Zufalls-Element
13. **Power Hour** ⚡ - Bonus-XP-Zeitfenster

**Geschätzter Aufwand:** 10-14h

---

## 🗂️ Datenbank-Erweiterungen (Gesamt-Schema)

```sql
-- User Stats & Progression
CREATE TABLE user_stats (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(household_id) ON DELETE CASCADE,
  total_xp INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  total_completions INTEGER DEFAULT 0,
  persona VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, household_id)
);

-- Achievements
CREATE TABLE achievements (
  achievement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  category VARCHAR(20), -- 'streak', 'task', 'effort', 'social'
  requirement_type VARCHAR(20), -- 'count', 'streak', 'condition'
  requirement_value INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_achievements (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(household_id) ON DELETE CASCADE,
  achievement_id UUID REFERENCES achievements(achievement_id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  progress INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, household_id, achievement_id)
);

-- Daily Activity (für Kalender-View)
CREATE TABLE daily_activity (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(household_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  tasks_completed INTEGER DEFAULT 0,
  effort_earned INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, household_id, date)
);

-- Challenges
CREATE TABLE challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(household_id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  challenge_type VARCHAR(30), -- 'room_specific', 'total_tasks', etc.
  filter_room VARCHAR(50),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Feed
CREATE TABLE activity_feed (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(household_id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type VARCHAR(30), -- 'task_complete', 'level_up', 'achievement', etc.
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_feed_household ON activity_feed(household_id, created_at DESC);

-- Shop & Inventory
CREATE TABLE shop_items (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(household_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  cost_xp INTEGER NOT NULL,
  item_type VARCHAR(20), -- 'privilege', 'boost', 'cosmetic'
  icon VARCHAR(50),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_inventory (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(household_id) ON DELETE CASCADE,
  item_id UUID REFERENCES shop_items(item_id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, household_id, item_id)
);

-- Daily Quests
CREATE TABLE daily_quests (
  household_id UUID REFERENCES households(household_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  task_id UUID REFERENCES tasks(task_id) ON DELETE CASCADE,
  bonus_xp INTEGER DEFAULT 100,
  PRIMARY KEY (household_id, date)
);

-- Team Goals
CREATE TABLE team_goals (
  goal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(household_id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  goal_type VARCHAR(30), -- 'total_tasks', 'total_effort', 'min_per_member'
  target_value INTEGER NOT NULL,
  current_value INTEGER DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'failed'
  reward_xp INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Erweitere bestehende Tabellen
ALTER TABLE household_members
  ADD COLUMN avatar_url TEXT,
  ADD COLUMN avatar_type VARCHAR(20) DEFAULT 'icon',
  ADD COLUMN avatar_value VARCHAR(50);

ALTER TABLE tasks
  ADD COLUMN icon VARCHAR(50);

ALTER TABLE task_completions
  ADD COLUMN comment TEXT,
  ADD COLUMN photo_url TEXT,
  ADD COLUMN is_roulette BOOLEAN DEFAULT FALSE;

ALTER TABLE households
  ADD COLUMN power_hour_start TIMESTAMPTZ,
  ADD COLUMN power_hour_active BOOLEAN DEFAULT FALSE;
```

---

## 🎨 UI/UX Mockup-Ideen

### Header Erweiterung
```
┌────────────────────────────────────────────────────┐
│ [Avatar] Max 🔥 23  ⭐ Level 12  ━━━━━━━━━○ 850/1000 XP │
│                                            [⚡ Power Hour!] │
└────────────────────────────────────────────────────┘
```

### Stats-View Erweiterung
```
┌──────────────────────────────────────────┐
│ 🏆 Achievements (12/50 unlocked)         │
│ ┌───┬───┬───┬───┬───┐                   │
│ │🔥│⚡│💪│🎯│👑│ ...                    │
│ └───┴───┴───┴───┴───┘                   │
│                                          │
│ 📊 Your Persona: 🥷 Küchen-Ninja         │
│ "Du dominierst die Küche wie ein Profi!"│
│                                          │
│ 📈 Level Progress                        │
│ ━━━━━━━━━━━━━○ Level 13 (850/1000 XP)   │
└──────────────────────────────────────────┘
```

### Activity Feed (Sidebar)
```
┌─────────────────────────────┐
│ 🔔 Activity Feed            │
├─────────────────────────────┤
│ Max 💪 Bad geputzt          │
│ 2 min ago          👍 2     │
├─────────────────────────────┤
│ Lisa 🎉 Level 10!           │
│ 5 min ago          ❤️ 5    │
├─────────────────────────────┤
│ Tom 🏆 'Putzteufel' unlocked│
│ 1h ago             🔥 3     │
└─────────────────────────────┘
```

### Daily Quest Banner
```
┌────────────────────────────────────────────┐
│ ⭐ DAILY QUEST                             │
│ Putze das Badezimmer (+100 Bonus-XP)      │
│ ⏰ Noch 6 Stunden                          │
└────────────────────────────────────────────┘
```

---

## 💡 Weitere spontane Ideen

- **Title-System:** Sammelbare Titel wie "Meister der Ordnung" (equipped in Profil)
- **Leaderboard-Seasons:** Monatliche Resets mit Hall-of-Fame
- **Task-Difficulty-Voting:** Member können Tasks up/downvoten → Auto-adjust effort
- **Bet-System:** "Ich wette 50 XP, dass ich heute 5 Tasks schaffe!"
- **Voice-Commands:** "Hey Putzplan, markiere Bad als erledigt" (Alexa/Google Home)
- **Photo-Before/After:** Upload Vorher-Nachher-Fotos bei Task-Complete
- **Task-Templates:** Community-Templates "Standard-WG-Putzplan" importieren
- **Multi-Household:** User kann mehreren Households beitreten (WG + Elternhaus)
- **Pet-System:** Virtuelles Haustier das "wächst" mit Household-XP
- **Weather-Integration:** "☀️ Schönes Wetter! Bonus-XP für Fenster putzen"

---

## ✅ Nächste Schritte

1. **Priorisierung:** Welche Features passen zur Vision?
2. **MVP definieren:** Phase 1 implementieren (Streak + Icons + Konfetti + Daily Quest)
3. **Prototyping:** Erste UI-Komponenten in Figma/Code sketchen
4. **DB Migration:** Schema-Erweiterungen testen (lokal mit `npx supabase db reset`)
5. **Iteratives Rollout:** Feature-Flags für schrittweise Aktivierung

---

**Status:** Ready for Discussion & Implementation 🚀
