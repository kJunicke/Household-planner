# Daily Tasks - Bonus-only Subtasks Implementation Guide

**Branch:** `feature/daily-tasks-bonus-only-subtasks`
**Status:** 🚧 In Progress

---

## 📋 Problem

Bei Alltagsaufgaben (task_type='daily') führen Subtasks zu Doppelpunkten:

**Beispiel "Spülmaschine" (2 Punkte Haupttask):**
- User hakt "Einräumen" Subtask (bonus, 2 Punkte) → +2 Punkte
- User hakt "Ausräumen" Subtask (bonus, 2 Punkte) → +2 Punkte
- User hakt "Spülmaschine" Haupttask → +2 Punkte
- **Gesamt: 6 Punkte statt 2 Punkte** ❌

**Root Cause:**
- Daily tasks werden NIE als `completed = true` markiert (Edge Function Zeile 241)
- Subtask-Reset erfolgt nur bei Parent-Complete (Edge Function Zeile 265-276)
- → Bei Daily tasks werden Subtasks NIEMALS zurückgesetzt
- → Doppelpunkte-Problem

---

## ✅ Lösung

Für Daily Tasks nur **Bonus-Subtasks** erlauben (keine Checkliste/Abziehen).

**Konzept:**
- Jeder Subtask ist eigenständig und gibt sofort Punkte
- Haupttask gibt ebenfalls Punkte
- User versteht: "Subtasks = Extra-Belohnungen"
- Kein Doppelpunkt-Problem mehr

---

## 📝 Detaillierte Änderungen

### 1. SubtaskManagementModal.vue

**Datei:** `putzplan_vue/src/components/SubtaskManagementModal.vue`

#### 1.1 Script Section (Zeile 19-35)

**Änderung:** `isDailyTask` Check + `availableModes` Filter + Default `bonus`

```typescript
// ============ VORHER ============
// Check if parent is a project
const isProject = computed(() => props.parentTask.task_type === 'project')

// Add Subtask Form
const newSubtaskTitle = ref('')
const newSubtaskEffort = ref<1 | 2 | 3 | 4 | 5>(1)
const newSubtaskPointsMode = ref<'checklist' | 'deduct' | 'bonus'>('checklist')

// Available modes (filtered for projects)
const availableModes = computed(() => {
  if (isProject.value) {
    // Projects: only checklist and bonus allowed
    return ['checklist', 'bonus'] as const
  }
  // Regular tasks: all modes allowed
  return ['checklist', 'deduct', 'bonus'] as const
})

// ============ NACHHER ============
// Check if parent is a project or daily task
const isProject = computed(() => props.parentTask.task_type === 'project')
const isDailyTask = computed(() => props.parentTask.task_type === 'daily')

// Add Subtask Form
const newSubtaskTitle = ref('')
const newSubtaskEffort = ref<1 | 2 | 3 | 4 | 5>(1)
const newSubtaskPointsMode = ref<'checklist' | 'deduct' | 'bonus'>('bonus') // Default: bonus (für Daily + Projects)

// Available modes (filtered for projects and daily tasks)
const availableModes = computed(() => {
  if (isProject.value) {
    // Projects: only checklist and bonus allowed
    return ['checklist', 'bonus'] as const
  }
  if (isDailyTask.value) {
    // Daily tasks: only bonus allowed (subtasks are always extra rewards)
    return ['bonus'] as const
  }
  // Regular tasks: all modes allowed
  return ['checklist', 'deduct', 'bonus'] as const
})
```

**Warum:**
- `isDailyTask`: Neuer Check für Daily-spezifische Logik
- `availableModes`: Bei Daily nur `['bonus']` → 1 Option
- Default `'bonus'`: Passt für Daily + Projects (häufigster Use-Case)

---

#### 1.2 Reset Form (Zeile 69)

**Änderung:** Reset auf `'bonus'` statt `'checklist'`

```typescript
// VORHER:
newSubtaskPointsMode.value = 'checklist' // Reset to default

// NACHHER:
newSubtaskPointsMode.value = 'bonus' // Reset to default (bonus für Daily/Projects)
```

**Warum:** Konsistent mit neuem Default-Wert.

---

#### 1.3 Template - Info Banner (Zeile 91-95)

**Änderung:** Daily-spezifischer Info-Banner hinzufügen

```vue
<!-- ============ VORHER ============ -->
<!-- PROJECT INFO (nur bei Projekten) -->
<div v-if="isProject" class="project-info-banner">
  <i class="bi bi-info-circle"></i>
  <span>Projekt-Unteraufgaben: Nur <strong>Checkliste</strong> und <strong>Bonus</strong> verfügbar</span>
</div>

<!-- ============ NACHHER ============ -->
<!-- INFO BANNER (für Projekte + Daily Tasks) -->
<div v-if="isProject" class="info-banner">
  <span>💡 Projekt-Unteraufgaben: Nur <strong>Checkliste</strong> und <strong>Bonus</strong> verfügbar</span>
</div>
<div v-else-if="isDailyTask" class="info-banner daily-banner">
  <span>💡 Unteraufgaben für <strong>Alltagsaufgaben</strong> geben sofort <strong>Bonus-Punkte</strong> beim Abhaken</span>
</div>
```

**Warum:**
- User muss verstehen: Daily-Subtasks = immer Bonus (keine Wahl)
- Grüner Banner (Success-Farbe) für Daily, Blau für Projects

---

#### 1.4 Template - Punktemodus Selector (Zeile 108-128)

**Änderung:** Selector nur anzeigen wenn mehr als 1 Option

```vue
<!-- ============ VORHER ============ -->
<!-- Points Mode Selector (zuerst, da es die Aufwand-Anzeige steuert) -->
<div class="form-row">
  <label class="form-label-inline">Punktemodus:</label>
  <div class="points-mode-selector">
    <label
      v-for="mode in availableModes"
      :key="mode"
      class="mode-option-compact"
      :class="{ active: newSubtaskPointsMode === mode }"
    >
      <!-- Radio Buttons -->
    </label>
  </div>
</div>

<!-- ============ NACHHER ============ -->
<!-- Points Mode Selector (nur wenn mehr als 1 Option) -->
<div v-if="availableModes.length > 1" class="form-row">
  <label class="form-label-inline">Punktemodus:</label>
  <div class="points-mode-selector">
    <label
      v-for="mode in availableModes"
      :key="mode"
      class="mode-option-compact"
      :class="{ active: newSubtaskPointsMode === mode }"
    >
      <!-- Radio Buttons -->
    </label>
  </div>
</div>
```

**Warum:**
- Bei Daily: `availableModes = ['bonus']` → 1 Option
- Kein Selector nötig → cleaner UI, weniger Verwirrung

---

#### 1.5 Template - Effort Selector (Zeile 130-149)

**Änderung:** Immer anzeigen (nicht nur bei non-checklist)

```vue
<!-- ============ VORHER ============ -->
<!-- Effort Selector (nur bei non-checklist) -->
<div v-if="newSubtaskPointsMode !== 'checklist'" class="form-row">
  <label class="form-label-inline">Aufwand:</label>
  <div class="effort-selector">
    <!-- 1-5 Buttons -->
  </div>
</div>

<!-- ============ NACHHER ============ -->
<!-- Effort Selector (immer anzeigen bei Daily, da nur Bonus) -->
<div class="form-row">
  <label class="form-label-inline">Aufwand:</label>
  <div class="effort-selector">
    <label
      v-for="effort in [1, 2, 3, 4, 5]"
      :key="effort"
      class="effort-option"
      :class="{ active: newSubtaskEffort === effort }"
    >
      <input type="radio" :value="effort" v-model.number="newSubtaskEffort" name="subtaskEffort" />
      {{ effort }}
    </label>
  </div>
</div>
```

**Warum:**
- Bei Daily ist immer Bonus-Modus (hat immer Effort)
- Vereinfacht UI-Logik (kein conditional nötig)

---

#### 1.6 Template - Existing Subtasks (Zeile 162-189)

**Änderung:** Mode-Buttons nur bei nicht-Daily Tasks anzeigen

```vue
<!-- ============ VORHER ============ -->
<div v-if="existingSubtasks.length > 0" class="section">
  <h6 class="section-title">Bestehende Unteraufgaben ({{ existingSubtasks.length }})</h6>
  <div class="subtasks-list">
    <div v-for="subtask in existingSubtasks" :key="subtask.task_id" class="subtask-preview">
      <span class="subtask-title">{{ subtask.title }}</span>
      <span v-if="subtask.subtask_points_mode !== 'checklist'" class="subtask-effort">{{ subtask.effort }}</span>

      <!-- Points Mode Selector für existierende Subtasks -->
      <div class="subtask-mode-selector">
        <button v-for="mode in ['checklist', 'deduct', 'bonus'] as const" :key="mode">
          {{ mode }}
        </button>
      </div>
    </div>
  </div>
</div>

<!-- ============ NACHHER ============ -->
<div v-if="existingSubtasks.length > 0" class="section">
  <h6 class="section-title">Bestehende Unteraufgaben ({{ existingSubtasks.length }})</h6>
  <div class="subtasks-list">
    <div v-for="subtask in existingSubtasks" :key="subtask.task_id" class="subtask-preview">
      <span class="subtask-title">{{ subtask.title }}</span>
      <span class="subtask-effort">{{ subtask.effort }}</span>

      <!-- Points Mode Selector für existierende Subtasks (nur wenn nicht Daily) -->
      <div v-if="!isDailyTask" class="subtask-mode-selector">
        <button v-for="mode in ['checklist', 'deduct', 'bonus'] as const" :key="mode">
          {{ mode }}
        </button>
      </div>
    </div>
  </div>
</div>
```

**Warum:**
- Bei Daily: Alle Subtasks = Bonus, keine Änderung möglich/nötig
- Effort immer anzeigen (nicht nur bei non-checklist)

---

#### 1.7 Style Section (Zeile 203-220)

**Änderung:** `daily-banner` Styling hinzufügen

```css
/* ============ VORHER ============ */
/* Project Info Banner */
.project-info-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--bs-info-bg-subtle, #cfe2ff);
  border: 1px solid var(--bs-info-border-subtle, #9ec5fe);
  border-radius: var(--radius-md);
  color: var(--bs-info-text, #084298);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

/* ============ NACHHER ============ */
/* Info Banner */
.info-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--bs-info-bg-subtle, #cfe2ff);
  border: 1px solid var(--bs-info-border-subtle, #9ec5fe);
  border-radius: var(--radius-md);
  color: var(--bs-info-text, #084298);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.info-banner.daily-banner {
  background: var(--bs-success-bg-subtle, #d1e7dd);
  border-color: var(--bs-success-border-subtle, #a3cfbb);
  color: var(--bs-success-text, #0a3622);
}
```

**Warum:**
- Grüner Banner für Daily (Success = Bonus-Belohnung)
- Blauer Banner für Projects (Info = Einschränkung)

---

### 2. TaskCard.vue

**Datei:** `putzplan_vue/src/components/TaskCard.vue`

#### 2.1 Subtasks Section (Zeile 289-346)

**Änderung:** Für Daily Tasks keine Gruppierung, flache Liste

```vue
<!-- ============ VORHER ============ -->
<!-- SUBTASKS SECTION (nur für Parent Tasks) - Gruppiert nach Punktemodus -->
<div v-if="!props.task.parent_task_id && subtasks.length > 0" class="subtasks-section">
  <div class="subtasks-header-row">
    <!-- Header mit Toggle + Reset Button -->
  </div>

  <div v-show="subtasksExpanded" class="subtasks-list">
    <!-- Checkliste Gruppe -->
    <div v-if="subtasksByMode.checklist.length > 0" class="subtask-group">
      <div class="subtask-group-header">
        <span class="subtask-group-badge badge-checklist">✓ Checkliste</span>
        <span class="subtask-group-count">{{ subtasksByMode.checklist.length }}</span>
      </div>
      <SubtaskItem v-for="subtask in subtasksByMode.checklist" :key="subtask.task_id" :task="subtask" />
    </div>

    <!-- Abziehen Gruppe -->
    <div v-if="subtasksByMode.deduct.length > 0" class="subtask-group">
      <div class="subtask-group-header">
        <span class="subtask-group-badge badge-deduct">− Abziehen</span>
        <span class="subtask-group-count">{{ subtasksByMode.deduct.length }}</span>
      </div>
      <SubtaskItem v-for="subtask in subtasksByMode.deduct" :key="subtask.task_id" :task="subtask" />
    </div>

    <!-- Bonus Gruppe -->
    <div v-if="subtasksByMode.bonus.length > 0" class="subtask-group">
      <div class="subtask-group-header">
        <span class="subtask-group-badge badge-bonus">+ Bonus</span>
        <span class="subtask-group-count">{{ subtasksByMode.bonus.length }}</span>
      </div>
      <SubtaskItem v-for="subtask in subtasksByMode.bonus" :key="subtask.task_id" :task="subtask" />
    </div>
  </div>
</div>

<!-- ============ NACHHER ============ -->
<!-- SUBTASKS SECTION (nur für Parent Tasks) -->
<div v-if="!props.task.parent_task_id && subtasks.length > 0" class="subtasks-section">
  <div class="subtasks-header-row">
    <div class="subtasks-header" @click="toggleSubtasks">
      <span class="toggle-icon">{{ subtasksExpanded ? '▼' : '▶' }}</span>
      Subtasks ({{ completedSubtasksCount }}/{{ subtasks.length }})
    </div>
    <button v-if="completedSubtasksCount > 0" class="btn btn-sm btn-outline-secondary reset-subtasks-btn" @click="handleResetSubtasks" title="Alle Subtasks zurücksetzen">
      ↺
    </button>
  </div>

  <div v-show="subtasksExpanded" class="subtasks-list">
    <!-- DAILY TASKS: Flache Liste (alle sind Bonus) -->
    <template v-if="props.task.task_type === 'daily'">
      <SubtaskItem
        v-for="subtask in subtasks"
        :key="subtask.task_id"
        :task="subtask"
      />
    </template>

    <!-- REGULAR/RECURRING/PROJECTS: Gruppiert nach Modus -->
    <template v-else>
      <!-- Checkliste Gruppe -->
      <div v-if="subtasksByMode.checklist.length > 0" class="subtask-group">
        <div class="subtask-group-header">
          <span class="subtask-group-badge badge-checklist">✓ Checkliste</span>
          <span class="subtask-group-count">{{ subtasksByMode.checklist.length }}</span>
        </div>
        <SubtaskItem v-for="subtask in subtasksByMode.checklist" :key="subtask.task_id" :task="subtask" />
      </div>

      <!-- Abziehen Gruppe -->
      <div v-if="subtasksByMode.deduct.length > 0" class="subtask-group">
        <div class="subtask-group-header">
          <span class="subtask-group-badge badge-deduct">− Abziehen</span>
          <span class="subtask-group-count">{{ subtasksByMode.deduct.length }}</span>
        </div>
        <SubtaskItem v-for="subtask in subtasksByMode.deduct" :key="subtask.task_id" :task="subtask" />
      </div>

      <!-- Bonus Gruppe -->
      <div v-if="subtasksByMode.bonus.length > 0" class="subtask-group">
        <div class="subtask-group-header">
          <span class="subtask-group-badge badge-bonus">+ Bonus</span>
          <span class="subtask-group-count">{{ subtasksByMode.bonus.length }}</span>
        </div>
        <SubtaskItem v-for="subtask in subtasksByMode.bonus" :key="subtask.task_id" :task="subtask" />
      </div>
    </template>
  </div>
</div>
```

**Warum:**
- Bei Daily: Alle Subtasks = Bonus → Gruppierung verwirrend/unnötig
- Cleaner UI, weniger visueller Noise
- User versteht sofort: "Das sind alles Bonus-Aufgaben"

---

### 3. complete-task/index.ts (OPTIONAL)

**Datei:** `putzplan_vue/supabase/functions/complete-task/index.ts`

#### 3.1 Validation (nach Zeile 84)

**Änderung:** Warning für falsche Modi bei Daily-Subtasks

```typescript
// ============ NEU (nach Zeile 84) ============
// 5. Fetch task details (for parent_task_id check + assignment_permanent + task_type + subtask_points_mode)
const { data: taskDetails, error: fetchError } = await supabase
  .from('tasks')
  .select('effort, parent_task_id, assignment_permanent, task_type, subtask_points_mode')
  .eq('task_id', taskId)
  .single()

if (fetchError || !taskDetails) {
  console.error('Error fetching task details:', fetchError)
  return new Response(
    JSON.stringify({ error: 'Task not found', details: fetchError?.message }),
    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// NEU: Fetch Parent Task Type wenn Subtask (für Daily-Validation)
let parentTaskType: string | null = null
if (taskDetails.parent_task_id !== null) {
  const { data: parentTask } = await supabase
    .from('tasks')
    .select('task_type')
    .eq('task_id', taskDetails.parent_task_id)
    .single()

  parentTaskType = parentTask?.task_type || null

  // NEU: Validation für Daily-Subtasks (sollten immer bonus sein)
  if (parentTaskType === 'daily' && taskDetails.subtask_points_mode !== 'bonus') {
    console.warn(
      `[Daily Task Validation] Subtask should be bonus mode!`,
      `Task: ${taskId}, Mode: ${taskDetails.subtask_points_mode}, Parent Type: ${parentTaskType}`
    )
    // Optional: Force bonus behavior oder Error werfen für strikte Validation
    // return new Response(JSON.stringify({ error: 'Daily task subtasks must be bonus mode' }), ...)
  }
}
```

**Warum:**
- Für existierende falsch konfigurierte Subtasks (Migration/Debugging)
- Logging für Monitoring (falls User manuelle DB-Änderungen macht)
- Optional: Strikte Validierung (Error werfen statt Warning)

---

### 4. CLAUDE.md

**Datei:** `CLAUDE.md` (Root-Verzeichnis)

#### 4.1 Task Type Dokumentation (Zeile 12-16)

**Änderung:** Subtask-Verhalten pro Task-Type dokumentieren

```markdown
<!-- ============ VORHER ============ -->
**Tabellen & Primary Keys** (WICHTIG für `.eq()` Queries):
- `tasks` - PK: `task_id` (Task-Templates mit `recurrence_days`, `last_completed_at`, `task_type`)
  - `task_type` - Enum: `'recurring'` (zeitbasiert), `'daily'` (immer sichtbar), `'one-time'` (einmalig), `'project'` (langfristig)

<!-- ============ NACHHER ============ -->
**Tabellen & Primary Keys** (WICHTIG für `.eq()` Queries):
- `tasks` - PK: `task_id` (Task-Templates mit `recurrence_days`, `last_completed_at`, `task_type`)
  - `task_type` - Enum mit Subtask-Verhalten:
    - `'recurring'`: Zeitbasiert, **alle Subtask-Modi erlaubt** (checklist/deduct/bonus)
    - `'daily'`: Immer sichtbar, **nur 'bonus' Subtasks** (eigenständige Belohnungen)
    - `'one-time'`: Einmalig, **alle Subtask-Modi erlaubt**
    - `'project'`: Langfristig, **nur 'checklist' + 'bonus'** (kein deduct)
```

---

#### 4.2 Subtask Points Mode Section (NEU, nach Zeile 35)

**Änderung:** Neue Sektion für Subtask-Business-Logic

```markdown
<!-- ============ NEU (nach Zeile 35) ============ -->

### Subtask Points Modes (Task-Type-abhängig)

**Available Modes by Task Type:**
- **Daily Tasks (`task_type: 'daily'`)**: Nur `bonus` erlaubt
  - Reason: Daily tasks werden nie completed → Subtasks nie resettet → nur Bonus verhindert Doppelpunkte
- **Projects (`task_type: 'project'`)**: Nur `checklist` + `bonus` erlaubt (kein `deduct`)
  - Reason: Projects haben "Am Projekt arbeiten" Subtask mit custom Effort-Logging
- **Recurring/One-time**: Alle Modi erlaubt (`checklist`, `deduct`, `bonus`)

**Mode Descriptions:**
- `'checklist'`: 0 Punkte (nur Tracking, Fortschritts-Anzeige)
- `'deduct'`: Aufwand wird von Parent-Effort abgezogen (Parent - Deduct = finale Punkte)
- `'bonus'`: Volle Punkte zusätzlich zum Parent (eigenständige Belohnung)

**Business Logic (Daily Tasks):**
1. Daily task completed → `tasks.completed` bleibt `false` (Edge Function Zeile 241)
2. `task_completions` wird trotzdem geschrieben (History-Tracking)
3. Subtasks werden NICHT resettet (kein Parent-Complete-Trigger)
4. Lösung: Nur Bonus-Subtasks → User versteht "Extra-Belohnung", kein Doppelpunkt-Problem

**UI Behavior:**
- SubtaskManagementModal: Bei Daily kein Modus-Selector (auto-select bonus)
- TaskCard: Bei Daily keine Gruppierung (flache Liste, alle Subtasks = Bonus)
```

**Warum:**
- Dokumentation für zukünftige Features/Entwickler
- Klarheit über Business-Logik (warum Daily = nur Bonus?)
- Vermeidung von Regression-Bugs

---

## 🧪 Testing Plan (Playwright)

**Test-URL:** `http://localhost:5173/Household-planner/`
**Viewport:** 360x740 (Mobile)

### Test-Szenario: Daily Task mit Bonus-Subtasks

```javascript
// 1. Daily Task erstellen
await page.goto('http://localhost:5173/Household-planner/')
await page.resize({ width: 360, height: 740 })

// Navigate zu "Alltagsaufgaben" Tab
await page.click('text=Alltag')

// Open TaskCreateModal
await page.click('text=+ Neue Aufgabe')

// Fill form
await page.fill('input[placeholder="Aufgabenname"]', 'Spülmaschine')
await page.click('button:has-text("2")') // Effort = 2
await page.click('button:has-text("Alltagsaufgabe")') // task_type = daily
await page.click('button:has-text("Erstellen")')

// ✅ ASSERT: Task erscheint in Liste
await page.waitForSelector('text=Spülmaschine')

// 2. Subtask hinzufügen
await page.click('.task-card:has-text("Spülmaschine") .subtasks-header') // Expand subtasks
await page.click('button:has-text("⚙ Subtasks verwalten")')

// ✅ ASSERT: Daily-Banner sichtbar
await page.waitForSelector('text=Unteraufgaben für Alltagsaufgaben geben sofort Bonus-Punkte')

// ✅ ASSERT: Kein Punktemodus-Selector (da nur 1 Option)
const modeSelectorVisible = await page.isVisible('.points-mode-selector')
expect(modeSelectorVisible).toBe(false)

// Fill subtask form
await page.fill('input[placeholder="Name der Unteraufgabe"]', 'Einräumen')
await page.click('.effort-option:has-text("1")') // Effort = 1
await page.click('button:has-text("+ Hinzufügen")')

// ✅ ASSERT: Subtask erscheint ohne Mode-Buttons
await page.waitForSelector('text=Einräumen')
const modeButtonsVisible = await page.isVisible('.subtask-mode-selector')
expect(modeButtonsVisible).toBe(false)

await page.click('button:has-text("Schließen")')

// 3. Subtask abhaken
await page.click('.subtask-item:has-text("Einräumen") button:has-text("✓")')

// ✅ ASSERT: Confetti Animation
// ✅ ASSERT: +1 Punkt in History
await page.click('text=Verlauf')
await page.waitForSelector('text=Einräumen')
await page.waitForSelector('text=1 Punkt') // Effort = 1

// 4. Haupttask abhaken
await page.click('text=Alltag')
await page.click('.task-card:has-text("Spülmaschine") button:has-text("Sauber")')

// ✅ ASSERT: +2 Punkte in History
await page.click('text=Verlauf')
await page.waitForSelector('text=Spülmaschine')
const completions = await page.locator('.completion-entry').count()
expect(completions).toBe(2) // Einräumen + Spülmaschine

// ✅ ASSERT: Gesamt 3 Punkte (nicht 6!)
const totalPoints = await page.textContent('.stats-total-points')
expect(totalPoints).toContain('3')

// 5. UI Check: Keine Gruppierung
await page.click('text=Alltag')
await page.click('.task-card:has-text("Spülmaschine") .subtasks-header') // Expand

// ✅ ASSERT: Keine Gruppen-Header (badge-bonus)
const groupHeaderVisible = await page.isVisible('.subtask-group-header')
expect(groupHeaderVisible).toBe(false)

// ✅ ASSERT: Flache Liste
const subtaskItems = await page.locator('.subtask-item').count()
expect(subtaskItems).toBeGreaterThan(0)
```

---

## ✅ Definition of Done

- [ ] `SubtaskManagementModal.vue`: Alle 7 Änderungen implementiert
- [ ] `TaskCard.vue`: Conditional rendering für Daily (flache Liste)
- [ ] `complete-task/index.ts`: Validation (optional, aber empfohlen)
- [ ] `CLAUDE.md`: Dokumentation aktualisiert
- [ ] Playwright Tests: Alle Assertions grün
- [ ] Type-Check: `npm run type-check` ohne Fehler
- [ ] Lint: `npm run lint` ohne Fehler
- [ ] Manual Testing: Daily Task mit 2-3 Subtasks durchspielen
- [ ] Git Commit mit sauberer Message
- [ ] PR erstellen gegen `main` Branch

---

## 📌 Notes

- **Backup erstellt:** `SubtaskManagementModal.vue.backup` (falls Rollback nötig)
- **Keine Migration nötig:** Existierende Daily-Subtasks funktionieren weiter (nur Warning im Log)
- **Breaking Change:** Nein (UI-Only, Backend-kompatibel)
- **Performance Impact:** Keine (nur Template-Conditionals)
