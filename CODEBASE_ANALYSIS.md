# Putzplan Codebase Analysis

**Datum:** 25. Oktober 2025
**Status:** App ist live auf GitHub Pages
**Umfang:** 19 Source-Dateien (Vue + TypeScript)

---

## 📊 Executive Summary

### ✅ Stärken
- **Kompakt & Übersichtlich:** Nur 19 Source-Dateien, klare Struktur
- **TypeScript & ESLint:** Keine Compilation-Errors, Code-Quality gut
- **YAGNI befolgt:** Keine Over-Engineering, MVP-fokussiert
- **CSS-Architektur:** Gutes Design-System mit CSS Variables + Utility-Classes
- **Realtime funktioniert:** Supabase Subscriptions implementiert

### ⚠️ Schwachstellen
- **Error Handling fehlt komplett:** Keine User-Feedback bei Fehlern
- **Loading States inkonsistent:** User-Erfahrung leidet
- **RLS zu komplex:** 29 Migrations, schwer zu überblicken
- **Keine Tests:** Komplett manuelles Testing
- **Store-Architektur:** Viel Redundanz, kein Optimistic Updates

---

## 🏗️ Architektur-Übersicht

### Tech Stack
```
Frontend:  Vue 3 + TypeScript + Composition API + Pinia
UI:        Bootstrap 5 + Custom CSS (Design System)
Backend:   Supabase (Auth + Database + Realtime)
Hosting:   GitHub Pages + PWA
```

### Ordnerstruktur
```
putzplan_vue/
├── src/
│   ├── assets/         # CSS (base.css, utilities.css, main.css)
│   ├── components/     # 5 Components (Header, TaskCard, TaskList, etc.)
│   ├── views/          # 6 Views (Cleaning, History, Stats, Auth)
│   ├── stores/         # 3 Pinia Stores (auth, household, task)
│   ├── types/          # 2 Type-Definitionen (Task, Household)
│   ├── router/         # Vue Router mit Guards
│   └── lib/           # Supabase Client Config
├── supabase/
│   ├── config.toml
│   └── migrations/     # 29 SQL-Migrations (!)
```

### Datenmodell (Supabase)
```
households
├── household_id (PK)
├── name
└── invite_code

household_members
├── user_id (PK, FK → auth.users)
├── household_id (FK → households)
└── display_name

tasks
├── task_id (PK)
├── household_id (FK)
├── title, effort (1-5)
├── recurrence_days
├── completed
└── last_completed_at

task_completions (Append-only Historie)
├── completion_id (PK)
├── task_id (FK)
├── user_id (FK)
├── completed_at
├── effort_override (nullable)
└── override_reason (nullable)
```

---

## 🔴 KRITISCHE PROBLEME

### 1. Error Handling fehlt komplett

**Problem:**
- Alle Supabase-Aufrufe haben nur `console.error()`, keine User-Benachrichtigung
- Network-Fehler führen zu stillem Failure
- Keine Retry-Logik bei Timeouts

**Beispiel aus [taskStore.ts:108-115](putzplan_vue/src/stores/taskStore.ts#L108-115):**
```typescript
const { error: completionError } = await supabase
    .from('task_completions')
    .insert(insertData)

if (completionError) {
    console.error('Error creating completion:', completionError)
    return false  // User sieht nichts!
}
```

**Impact:**
- User klickt "Sauber", nichts passiert → Frustration
- Keine Unterscheidung zwischen "Offline" und "Bug"
- Debugging schwer (keine Error-Logs für User)

**Lösung:**
```typescript
// 1. Toast/Notification System
// src/composables/useToast.ts
export function useToast() {
  const showError = (message: string) => {
    // Toast-Component anzeigen
  }
  return { showError, showSuccess }
}

// 2. In Store nutzen
import { useToast } from '@/composables/useToast'

const completeTask = async (taskId: string) => {
  const { showError } = useToast()

  try {
    const { error } = await supabase.from('task_completions').insert(...)
    if (error) throw error
    return true
  } catch (error) {
    showError('Aufgabe konnte nicht abgeschlossen werden. Bitte versuche es erneut.')
    console.error('completeTask failed:', error)
    return false
  }
}
```

**Aufwand:** 2-3 Stunden
- Toast-Component erstellen (Bootstrap-Toast oder Custom)
- Global Error-Handler in allen Stores
- User-friendly Error-Messages

---

### 2. Loading States inkonsistent

**Problem:**
- `isLoading` nur bei CREATE/UPDATE/DELETE gesetzt
- `loadTasks()` und `fetchCompletions()` haben kein Loading-State
- User sieht leere Listen → denkt "keine Daten" statt "lädt noch"

**Beispiel [taskStore.ts:19-55](putzplan_vue/src/stores/taskStore.ts#L19-55):**
```typescript
const loadTasks = async () => {
    console.log('Loading tasks...')
    // KEIN isLoading.value = true!

    const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')

    tasks.value = tasksData || []
}
```

**Impact:**
- UI flackert beim initialen Load
- User klickt mehrfach weil kein visuelles Feedback
- Race Conditions möglich (mehrere parallel requests)

**Lösung:**
```typescript
const loadTasks = async () => {
    if (isLoading.value) return // Prevent parallel requests

    isLoading.value = true
    try {
        const { data, error } = await supabase.from('tasks').select('*')
        if (error) throw error
        tasks.value = data || []
    } finally {
        isLoading.value = false
    }
}
```

**In Views verwenden:**
```vue
<template>
  <div v-if="taskStore.isLoading" class="loading-skeleton">
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  </div>
  <TaskList v-else :tasks="taskStore.tasks" />
</template>
```

**Aufwand:** 1-2 Stunden
- Loading-States in allen Store-Actions
- Skeleton-Screens für Task-Listen
- Spinner für Button-Actions

---

### 3. RLS Security Review benötigt

**Problem:**
- **29 Migrations** (davon 8+ nur für RLS-Fixes)
- Mehrere Iterations-Zyklen sichtbar (infinite recursion, performance-issues)
- Keine systematische Security-Dokumentation
- Unklare Permission-Matrix

**Migration-Historie zeigt Probleme:**
```
20251018135010_add_rls_for_all_tables.sql
20251018135459_fix_function_search_path_security.sql
20251018135956_optimize_rls_performance.sql
20251018140404_fix_household_members_select_circular_rls.sql
20251018140505_fix_household_members_rls_no_recursion.sql
20251018140724_optimize_rls_architecture.sql
20251024205154_fix_household_members_rls_infinite_recursion.sql
20251024205322_fix_rls_no_subquery.sql
```

**Konkrete Risiken:**

1. **Households SELECT zu offen:**
```sql
-- Migration: 20251019140115_allow_join_by_invite_code.sql
CREATE POLICY "Users can view households" ON households FOR SELECT
USING (true); -- Jeder kann ALLE Households lesen!
```
→ Household-Namen sind public, potenzielle Datenleck

2. **Task/Household Deletion ohne Ownership-Check:**
```sql
-- JEDES Mitglied kann Household löschen!
CREATE POLICY "Users can delete their household" ON households FOR DELETE
USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
```
→ Neues Mitglied kann kompletten Haushalt löschen

3. **Completion-Deletion erlaubt Stat-Manipulation:**
```sql
-- User kann eigene Completions löschen
CREATE POLICY "Users can delete their own completions" ON task_completions FOR DELETE
USING (user_id = auth.uid() AND ...);
```
→ User löscht eigene Completions um Stats zu verfälschen

**Impact:**
- Potenzielle Cross-Household Data-Leaks
- Malicious Member kann Daten zerstören
- Keine Audit-Trails für kritische Operations

**Lösung:** Siehe separates Dokument (wird noch erstellt)

**Aufwand:** 4-6 Stunden
- RLS Audit Matrix erstellen
- Threat Model dokumentieren
- Security Test Suite schreiben
- Policies konsolidieren

---

## 🟡 WICHTIGE VERBESSERUNGEN

### 4. Store State Management verbessern

**Problem:**
- Nach jeder Mutation wird `loadTasks()` aufgerufen (kompletter Reload)
- Kein Optimistic Updates → UI fühlt sich langsam an
- Doppelte Daten-Strukturen: `tasks` UND `completions` beide komplett im Store

**Beispiel [taskStore.ts:128-130](putzplan_vue/src/stores/taskStore.ts#L128-130):**
```typescript
// Nach completeTask:
await loadTasks()  // ← Kompletter Reload statt nur Update!
```

**Besser: Optimistic Updates**
```typescript
const completeTask = async (taskId: string) => {
    // 1. Optimistisch UI updaten
    const task = tasks.value.find(t => t.task_id === taskId)
    if (task) task.completed = true

    // 2. Backend-Update
    try {
        await supabase.from('task_completions').insert(...)
        // Kein loadTasks() nötig - Realtime hält sync!
    } catch (error) {
        // Rollback bei Fehler
        if (task) task.completed = false
        throw error
    }
}
```

**Weitere Probleme:**
- `fetchCompletions()` lädt ALLE Completions jedes Mal neu (keine Pagination)
- Keine Getter für computed Properties (z.B. `completedTasks`, `todoTasks`)

**Aufwand:** 3-4 Stunden

---

### 5. Type Safety erhöhen

**Problem:**
- `Task.effort` ist Union Type `1 | 2 | 3 | 4 | 5` aber wird als `number` validiert
- Supabase-Responses haben implizite `any` fallbacks
- Frontend-Types weichen vom DB-Schema ab (dokumentiert in CLAUDE.md)

**Beispiel [Task.ts:5-6](putzplan_vue/src/types/Task.ts#L5-6):**
```typescript
effort: 1 | 2 | 3 | 4 | 5  // Type sagt 1-5
// Aber in Form:
<input type="number" v-model.number="newTask.effort">  // Erlaubt 0, 6, 99, etc.
```

**Lösung: Runtime-Validation mit Zod**
```typescript
// src/types/Task.ts
import { z } from 'zod'

export const TaskSchema = z.object({
  task_id: z.string().uuid(),
  household_id: z.string().uuid(),
  title: z.string().min(1).max(100),
  effort: z.number().min(1).max(5),
  recurrence_days: z.number().min(0),
  completed: z.boolean(),
  last_completed_at: z.string().datetime().nullable()
})

export type Task = z.infer<typeof TaskSchema>

// In Store:
const createTask = async (taskData: unknown) => {
  const validated = TaskSchema.parse(taskData)  // Throws bei invalid data
  // ...
}
```

**Zusätzlich: Supabase Types generieren**
```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

**Aufwand:** 2 Stunden

---

### 6. Component Coupling reduzieren

**Problem:**
- [TaskCard.vue](putzplan_vue/src/components/TaskCard.vue) hat zu viele Verantwortlichkeiten:
  - Display (Normal-Modus)
  - Edit-Form (Edit-Modus)
  - Complete-Logic
  - Modal-Management

**Code-Analyse TaskCard.vue:**
- **210 Zeilen** (zu groß für eine Component)
- **7 verschiedene Aktionen:** startEdit, saveEdit, cancelEdit, handleDeleteTask, handleCompleteTask, handleMarkDirty, openCompletionModal
- **Conditional Rendering:** v-if="!isEditing" vs. v-else

**Lösung: Component aufteilen**
```
TaskCard.vue (Display only, ~80 Zeilen)
├── TaskEditForm.vue (Edit-Modus, ~60 Zeilen)
└── TaskActions.vue (Buttons, ~40 Zeilen)
```

**Vorteile:**
- Bessere Testbarkeit
- Wiederverwendbarkeit (EditForm kann standalone sein)
- Einfacheres Refactoring

**Aufwand:** 2 Stunden

---

## 🟢 NICE-TO-HAVE

### 7. Testing fehlt komplett

**Status:**
- ❌ Keine Unit-Tests für Stores
- ❌ Keine Component-Tests
- ✅ Manuelle Playwright-Tests dokumentiert (CLAUDE.md)

**Empfehlung: Kritische Pfade testen**
```typescript
// tests/stores/taskStore.test.ts
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTaskStore } from '@/stores/taskStore'

describe('TaskStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('completeTask updates task state', async () => {
    const store = useTaskStore()
    // Mock Supabase
    // Test logic
  })
})
```

**Aufwand:** 2-3 Stunden initial Setup, dann incrementell

---

### 8. Entwickler-Erfahrung verbessern

**Probleme:**
- Kein lokales Supabase Setup (erwähnt in TODO.md)
- `.env` Setup nicht dokumentiert (nur `.env.example`)
- Keine Seed-Daten für Entwicklung
- Kein Contributing-Guide

**Quick Wins:**
```bash
# 1. Lokales Supabase
supabase start
supabase db reset  # Migrations anwenden

# 2. Seed-Script
supabase/seed.sql:
INSERT INTO households (name, invite_code) VALUES ('Test-WG', 'TEST123');
```

**Aufwand:** 1-2 Stunden

---

### 9. Performance-Optimierungen

**Aktuelle Metriken:**
- ✅ Routes sind Lazy-Loaded (`import()`)
- ✅ Realtime-Channel filtert per `household_id`
- ⚠️ StatsView lädt ALLE Completions + ALLE Tasks

**Problem [StatsView.vue:23-32](putzplan_vue/src/views/StatsView.vue#L23-32):**
```typescript
completions.forEach(completion => {
  const task = taskStore.tasks.find(t => t.task_id === completion.task_id)
  // ← Bei 1000 Completions = 1000 Array-Searches!
})
```

**Lösung: Map statt find()**
```typescript
const tasksById = new Map(taskStore.tasks.map(t => [t.task_id, t]))
completions.forEach(completion => {
  const task = tasksById.get(completion.task_id)  // O(1) statt O(n)
})
```

**Pagination erst bei >500 Einträgen nötig**

**Aufwand:** 1 Stunde

---

### 10. Code-Duplikation reduzieren

**Gefunden:**

1. **Date-Formatting** (2x):
   - [HistoryView.vue:31-40](putzplan_vue/src/views/HistoryView.vue#L31-40)
   - [TaskCard.vue:66-87](putzplan_vue/src/components/TaskCard.vue#L66-87) (daysUntilDue calculation)

2. **Form-Validierung** (3x):
   - LoginView.vue
   - RegisterView.vue
   - HouseholdSetupView.vue

**Lösung: Composables**
```typescript
// src/composables/useFormatDate.ts
export function useFormatDate() {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const daysUntil = (dateString: string) => {
    // ...
  }

  return { formatDate, daysUntil }
}
```

**Aufwand:** 2 Stunden

---

## ✅ EMPFOHLENER UMSETZUNGSPLAN

### Phase 1: Foundation (JETZT, vor neuen Features)
**Must-Have für Stabilität**

1. **Error Handling System** (2-3h)
   - [ ] Toast/Notification Component erstellen
   - [ ] Global Error Handler in allen Stores
   - [ ] Network Error Detection

2. **Loading States normalisieren** (1-2h)
   - [ ] Loading-States in loadTasks/fetchCompletions
   - [ ] Skeleton Screens für Task-Listen
   - [ ] Button-Spinner für Actions

3. **Form Validation** (2h)
   - [ ] Zod-Schema für Task/Household
   - [ ] Input-Validation in Forms
   - [ ] Error-Messages standardisieren

**Total: ~6 Stunden**

---

### Phase 2: Code Quality (parallel zu neuen Features)
**Refactoring für bessere Maintainability**

4. **Optimistic Updates** (3-4h)
   - [ ] completeTask ohne loadTasks()
   - [ ] createTask/updateTask sofort reflektieren
   - [ ] Rollback bei Errors

5. **Type Safety** (2h)
   - [ ] Supabase Types generieren (`npx supabase gen types`)
   - [ ] Zod Runtime-Validation
   - [ ] Strikte TS-Config (`strict: true`)

6. **Composables extrahieren** (2h)
   - [ ] `useTaskActions.ts` - Duplicate Logic
   - [ ] `useFormatDate.ts` - Date-Formatting
   - [ ] `useToast.ts` - Notifications

**Total: ~8 Stunden**

---

### Phase 3: Tooling (parallel machbar)
**Developer Experience & Testing**

7. **Testing Setup** (2-3h)
   - [ ] Vitest + Vue Test Utils installieren
   - [ ] Basic Store Tests (auth, task CRUD)
   - [ ] Critical Path Coverage

8. **Local Dev Setup** (1h)
   - [ ] `supabase start` dokumentieren
   - [ ] Seed-Script für Test-Daten
   - [ ] README für Contributors

**Total: ~4 Stunden**

---

### Phase 4: Security & Performance (bei Bedarf)

9. **RLS Security Review** (4-6h)
   - [ ] RLS Audit Matrix (separate Dokument)
   - [ ] Policies konsolidieren
   - [ ] Security Tests

10. **Performance** (optional)
    - [ ] Pagination für History (nur bei >500 Tasks)
    - [ ] Map statt find() in StatsView

**Total: ~5 Stunden**

---

## 🎯 QUICK WINS (< 30 min jeweils)

### Sofort umsetzbar:

1. **Environment Check**
```typescript
// src/lib/supabase.ts
if (!import.meta.env.VITE_SUPABASE_URL) {
  throw new Error('VITE_SUPABASE_URL is not set. Copy .env.example to .env')
}
```

2. **Console Cleanup**
```typescript
// src/lib/logger.ts
export const logger = {
  log: import.meta.env.DEV ? console.log : () => {},
  error: console.error  // Errors immer loggen
}

// Ersetze alle console.log mit logger.log
```

3. **Accessibility**
```vue
<!-- Buttons ohne Text brauchen ARIA-Labels -->
<button @click="handleDelete" aria-label="Aufgabe löschen">
  <i class="bi bi-trash"></i>
</button>
```

4. **README Setup-Section**
```markdown
## Setup für Contributors

1. Clone repository
2. Copy `.env.example` to `.env`
3. Fill in Supabase credentials
4. `npm install && npm run dev`

Test-Account:
- Email: test@example.com
- Password: test123456
- Invite Code: FD1EB9CE
```

---

## 📈 Metriken & KPIs

### Code-Qualität
- ✅ TypeScript Strict Mode: **Nein** (sollte aktiviert werden)
- ✅ ESLint Errors: **0**
- ✅ TypeScript Errors: **0**
- ⚠️ Test Coverage: **0%**

### Performance
- Bundle Size: Nicht gemessen
- Lighthouse Score: Nicht gemessen
- First Contentful Paint: Nicht gemessen

### Sicherheit
- ✅ RLS aktiviert: **Ja**
- ⚠️ RLS-Policies auditiert: **Nein**
- ⚠️ Security Tests: **Keine**

---

## 🎓 Lessons Learned

### Was gut läuft:
1. **YAGNI konsequent umgesetzt** - Keine Über-Abstraktion
2. **CSS-Architektur durchdacht** - Design System sauber
3. **Vue 3 Best Practices** - Composition API korrekt genutzt
4. **MVP erfolgreich deployed** - App funktioniert produktiv

### Was verbessert werden sollte:
1. **Error Handling von Anfang an** - Jetzt nachträglich schwer
2. **Testing früher einbauen** - Refactoring jetzt riskanter
3. **RLS schrittweise planen** - 29 Migrations = zu viele Iterations
4. **Dokumentation parallel** - Code-Kommentare fehlen größtenteils

---

## 📚 Ressourcen & Referenzen

### Dokumentation
- [CLAUDE.md](CLAUDE.md) - Development Workflow & Architektur-Entscheidungen
- [TODO.md](TODO.md) - Feature Roadmap & nächste Tasks
- [CHANGELOG.md](CHANGELOG.md) - (leer, sollte gepflegt werden)

### Dependencies
- Vue 3.5.18
- Pinia 3.0.3
- Supabase JS 2.46.2
- Bootstrap 5.3.8
- TypeScript 5.8.0

### Nützliche Links
- Supabase RLS Docs: https://supabase.com/docs/guides/auth/row-level-security
- Vue Testing: https://vuejs.org/guide/scaling-up/testing.html
- Pinia Testing: https://pinia.vuejs.org/cookbook/testing.html

---

**Ende der Analyse**
Nächster Schritt: Entscheidung über Supabase-Strategie (siehe Diskussion)
