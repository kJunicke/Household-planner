# Putzplan Codebase Analysis - Senior Code Review

**Review Date:** 6. November 2025
**Status:** Produktiv auf GitHub Pages | 15 Vue Components | 3 Pinia Stores | 555 Zeilen taskStore.ts

---

## 📊 Executive Summary

### 🎯 Was du GUT gemacht hast

- ✅ **Funktionierendes Produkt deployed** - Live auf GitHub Pages, PWA-fähig
- ✅ **Moderne Tech-Stack** - Vue 3, TypeScript, Supabase (Edge Functions + Realtime)
- ✅ **Komplexe Features** - Self-Referencing Subtasks, Task Types, Effort Override
- ✅ **YAGNI befolgt** - Kein Over-Engineering, MVP-Fokus
- ✅ **CSS Design System** - CSS Variables, wiederverwendbare Patterns

### 🚨 Kritische Probleme (SOFORT fixen)

1. ✅ **Error Handling implementiert** - Toast-System mit Bootstrap 5 + Pinia für alle 65+ Error-Points (06.11.2025)
2. **⚠️ Loading States fehlen** - Race Conditions, flackernde UI, schlechte UX
3. **🐌 Zu viele Full-Reloads** - `loadTasks()` nach jeder Mutation statt Optimistic Updates
4. **🔓 Keine Input-Validierung** - Forms akzeptieren invalide Daten (effort: 999, empty titles)

### 🟡 Wichtige Verbesserungen

5. **📦 Component zu groß** - [TaskCard.vue:787](putzplan_vue/src/components/TaskCard.vue) macht 7 Dinge
6. **🔄 Code-Duplikation** - Date-Formatting 3x, Form-Struktur 3x
7. **🔒 Type Safety Lücken** - Supabase-Types nicht generiert
8. **🦮 Accessibility fehlt** - Keine ARIA-Labels, keine Keyboard-Navigation
9. **🧪 Keine Tests** - Refactoring ist riskant
10. **📂 Migration-Hygiene** - 15 Migrations (gut konsolidiert, aber viele Iterationen sichtbar)

---

## 🔥 TOP 4 CRITICAL FIXES

### 1. Error Handling (3-4h)

**Problem:** Silent Failure - User klickt, nichts passiert, keine Erklärung.

**Lösung:**
```typescript
// src/composables/useToast.ts
import { ref } from 'vue'

const toasts = ref<Array<{ id: number; message: string; type: 'success' | 'error' }>>([])

export function useToast() {
  const showToast = (message: string, type: 'success' | 'error') => {
    const toast = { id: Date.now(), message, type }
    toasts.value.push(toast)
    setTimeout(() => toasts.value = toasts.value.filter(t => t.id !== toast.id), 4000)
  }
  return {
    toasts,
    showError: (msg: string) => showToast(msg, 'error'),
    showSuccess: (msg: string) => showToast(msg, 'success')
  }
}

// In Store verwenden
const completeTask = async (taskId: string) => {
  const { showError, showSuccess } = useToast()
  try {
    const { data, error } = await supabase.functions.invoke('complete-task', { body: { taskId } })
    if (error) throw error
    showSuccess('Aufgabe abgeschlossen! 🎉')
    return true
  } catch (error: any) {
    const message = !navigator.onLine
      ? '⚠️ Keine Internetverbindung'
      : '❌ Aufgabe konnte nicht abgeschlossen werden'
    showError(message)
    return false
  }
}
```

---

### 2. Loading States (2-3h)

**Problem:** User sieht leere Liste während Load, klickt mehrfach weil kein Feedback.

**Lösung:**
```typescript
// taskStore.ts
const loadTasks = async () => {
  if (isLoading.value) return // Prevent parallel calls
  isLoading.value = true
  try {
    const { data, error } = await supabase.from('tasks').select('*')
    if (error) throw error
    tasks.value = data || []
  } catch (error) {
    useToast().showError('Aufgaben konnten nicht geladen werden')
  } finally {
    isLoading.value = false // IMMER, auch bei Error
  }
}

// CleaningView.vue - Await vor Subscribe
onMounted(async () => {
  await taskStore.loadTasks()      // ← WARTE bis geladen
  taskStore.subscribeToTasks()     // ← DANN subscribe
})
```

**UI mit Skeleton:**
```vue
<div v-if="taskStore.isLoading" class="skeleton-card"></div>
<TaskCard v-else v-for="task in tasks" :key="task.task_id" :task="task" />
```

---

### 3. Optimistic Updates (4-5h)

**Problem:** Nach jeder Mutation `loadTasks()` → Reload ALLER 50 Tasks + 500 Completions.

**Lösung:**
```typescript
const completeTask = async (taskId: string) => {
  const task = tasks.value.find(t => t.task_id === taskId)
  if (!task) return false

  const originalState = { ...task } // Backup für Rollback
  task.completed = true             // 1️⃣ OPTIMISTIC UPDATE

  try {
    const { error } = await supabase.functions.invoke('complete-task', { body: { taskId } })
    if (error) throw error
    // 2️⃣ Realtime-Handler synced automatisch (KEIN loadTasks() nötig!)
    return true
  } catch (error) {
    Object.assign(task, originalState) // 3️⃣ ROLLBACK
    return false
  }
}
```

**Vorteile:** Instant UI (0ms), weniger Requests, keine Flickers.

---

### 4. Input-Validierung (2-3h)

**Problem:** TypeScript-Types ≠ Runtime. User kann `effort: 999` eingeben.

**Lösung mit Zod:**
```bash
npm install zod
```

```typescript
// src/schemas/task.schema.ts
import { z } from 'zod'

export const TaskSchema = z.object({
  title: z.string().trim().min(1, 'Titel darf nicht leer sein').max(100),
  effort: z.number().int().min(1).max(5, 'Aufwand muss 1-5 sein'),
  recurrence_days: z.number().int().min(0),
  task_type: z.enum(['daily', 'recurring', 'one-time'])
})

// taskStore.ts
const createTask = async (taskData: Partial<Task>) => {
  try {
    const validated = TaskSchema.parse(taskData) // Runtime-Validation
    const { data, error } = await supabase.from('tasks').insert(validated)
    if (error) throw error
    return data
  } catch (error) {
    if (error instanceof z.ZodError) {
      useToast().showError(`Ungültige Eingabe: ${error.errors[0].message}`)
    }
    return null
  }
}
```

---

## 🟡 WICHTIGE VERBESSERUNGEN

### 5. Component-Splitting (3-4h)

**Problem:** [TaskCard.vue:787](putzplan_vue/src/components/TaskCard.vue) macht Display + Edit + Subtasks + 3 Modals + Business-Logic.

**Lösung:**
```
TaskCard.vue (200 Zeilen)           → Display + Coordination
TaskEditForm.vue (120 Zeilen)       → Edit-Modus
TaskSubtasksSection.vue (150 Zeilen) → Subtask Display
```

---

### 6. Code-Duplikation (2-3h)

**Lösung: Composables**
```typescript
// src/composables/useDate.ts
export function useDate() {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const calculateDaysUntil = (lastCompleted: string, recurrenceDays: number) => {
    const daysPassed = Math.floor((Date.now() - new Date(lastCompleted).getTime()) / 86400000)
    return recurrenceDays - daysPassed
  }

  return { formatDate, calculateDaysUntil }
}
```

---

### 7. Type Safety (1-2h)

**Lösung:**
```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

```typescript
// lib/supabase.ts
import type { Database } from '@/types/supabase'
export const supabase = createClient<Database>(...)

// Jetzt: Autocomplete für Tables + Columns!
const { data } = await supabase.from('tasks').select('title, effort')
```

---

### 8. Accessibility (2-3h)

**Quick Wins:**
```vue
<!-- ARIA-Labels -->
<button aria-label="Aufgabe bearbeiten" @click="startEdit">
  <svg aria-hidden="true">...</svg>
</button>

<!-- Divs → Buttons -->
<button class="assignment-badge" :aria-label="`Zugewiesen an ${member.name}`">
  {{ initials }}
</button>

<!-- Form-Labels -->
<label for="task-title">Titel</label>
<input id="task-title" v-model="title" aria-required="true" />
```

---

### 9. Testing Setup (2-3h)

**Vitest + Vue Test Utils:**
```bash
npm install -D vitest @vue/test-utils happy-dom
```

```typescript
// tests/stores/taskStore.test.ts
import { describe, it, expect } from 'vitest'
import { useTaskStore } from '@/stores/taskStore'

describe('TaskStore', () => {
  it('completeTask updates task optimistically', async () => {
    const store = useTaskStore()
    store.tasks = [{ task_id: '123', completed: false }]

    await store.completeTask('123')

    expect(store.tasks[0].completed).toBe(true)
  })
})
```

---

## 🚀 UMSETZUNGSPLAN

### Phase 1: STABILITÄT (1 Woche, 10-12h) ⚡

**Must-Have vor neuen Features:**

```
✅ Error Handling (3-4h)
   → Toast-System + try/catch in allen Stores

✅ Loading States (2-3h)
   → isLoading in loadTasks/loadItems
   → Skeleton-Screens

✅ Input-Validierung (2-3h)
   → Zod installieren + Schemas

✅ Type Safety (1-2h)
   → Supabase Types generieren
```

### Phase 2: CODE-QUALITÄT (2 Wochen, 15-20h) 🔧

```
Week 1: Refactoring
├── Component-Splitting (4-5h)
├── Composables (useDate, useToast) (2-3h)
└── Optimistic Updates (4-5h)

Week 2: Testing
├── Vitest Setup (1h)
├── Store-Tests (4-5h)
└── Component-Tests (3-4h)
```

### Phase 3: FEATURES (4 Wochen) 🎮

Jetzt kannst du **sicher** neue Features bauen (TODO.md).

---

## 🎯 QUICK WINS (< 30 Min pro Item)

1. **Environment-Check** (10 Min)
```typescript
if (!import.meta.env.VITE_SUPABASE_URL) {
  throw new Error('❌ .env fehlt! Kopiere .env.example')
}
```

2. **Console-Cleanup** (20 Min)
```typescript
// lib/logger.ts
export const logger = {
  log: (...args) => import.meta.env.DEV && console.log(...args),
  error: console.error
}
```

3. **ARIA-Labels** (30 Min) - Buttons mit Icons brauchen `aria-label`

4. **Button-Disable** (15 Min)
```vue
<button :disabled="isLoading">
  <span v-if="!isLoading">Sauber</span>
  <span v-else>Speichert...</span>
</button>
```

---

## 🎓 FAZIT

### Du bist auf einem **guten Weg**! 🚀

**Was ich als Senior sehe:**
- ✅ Funktionierendes Produkt deployed (das schaffen viele nicht)
- ✅ Moderne Technologien richtig eingesetzt
- ✅ Komplexe Features umgesetzt (Self-Referencing Subtasks)

**Typische Junior-Fehler (normal!):**
- ❌ Error Handling vergessen ("funktioniert bei mir")
- ❌ Loading States vergessen (Happy-Path-Denken)
- ❌ Zu große Components (fehlendes Refactoring-Gefühl)
- ❌ Performance-Awareness (zu viele Reloads)

### Mein Rat:

1. **Fixe Phase 1** (1 Woche) → Macht App production-ready
2. **Schreibe Tests für neuen Code** → Habit aufbauen
3. **Lerne von Code-Reviews** → Zeig Code erfahrenen Devs
4. **Lies "Clean Code"** (Robert C. Martin) → Transformiert dein Verständnis
5. **Baue weiter!** → Shipping > Perfection

Die Fehler die du machst sind **normal für einen Junior**. Wichtig ist dass du sie **erkennst und behebst**.

**Keep coding! 💪**

---

## 📚 Lern-Ressourcen

**Bücher:**
- "Clean Code" - Robert C. Martin (Must-Read!)
- "Refactoring" - Martin Fowler

**Online:**
- Vue Mastery (vueschool.io)
- Testing Vue.js Apps (testingjavascript.com)
- Web Accessibility (web.dev/learn/accessibility)

**Nächstes Review:** Nach Phase 1 (in ~2 Wochen)
