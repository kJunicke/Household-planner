<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue";
import TaskCard from '../components/TaskCard.vue';
import CategoryNav, { type TaskCategory } from '../components/CategoryNav.vue';
import TaskCreateModal from '../components/TaskCreateModal.vue';
import QuickTaskModal from '../components/QuickTaskModal.vue';
import { useTaskStore } from "../stores/taskStore";
import { useHouseholdStore } from "../stores/householdStore";
import type { Task } from '@/types/Task';

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()
const showCreateModal = ref(false)
const showQuickModal = ref(false)

// Search state
const searchQuery = ref('')
const showSearchOverlay = ref(false)

// Cross-tab search results (only when search is active)
const crossTabSearchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return null

  interface SearchResult {
    task: Task
    category: 'daily' | 'recurring' | 'project' | 'completed'
    categoryLabel: string
    relevance: number
  }

  const results: SearchResult[] = []

  // Build subtask map ONCE for O(1) lookups (was O(n²) before)
  const subtasksByParent = new Map<string, Task[]>()
  for (const task of taskStore.tasks) {
    if (task.parent_task_id) {
      const existing = subtasksByParent.get(task.parent_task_id) || []
      existing.push(task)
      subtasksByParent.set(task.parent_task_id, existing)
    }
  }

  // Helper: Calculate relevance score
  const getRelevance = (task: Task): number => {
    const title = task.title.toLowerCase()
    if (title === query) return 100 // Exact match
    if (title.startsWith(query)) return 80 // Starts with query
    if (title.includes(query)) return 60 // Contains query

    // Check subtasks (O(1) lookup via Map)
    const subtasks = subtasksByParent.get(task.task_id) || []
    const subtaskMatch = subtasks.some((st: Task) => st.title.toLowerCase().includes(query))
    if (subtaskMatch) return 40 // Subtask match

    return 0
  }

  // Get category for task
  const getCategory = (task: Task): { category: 'daily' | 'recurring' | 'project' | 'completed', label: string } => {
    if (task.completed) return { category: 'completed', label: 'Erledigt' }
    if (task.task_type === 'daily' || task.task_type === 'one-time') return { category: 'daily', label: 'Alltag' }
    if (task.task_type === 'recurring') return { category: 'recurring', label: 'Putzen' }
    if (task.task_type === 'project') return { category: 'project', label: 'Projekte' }
    return { category: 'daily', label: 'Alltag' }
  }

  // Search all parent tasks
  taskStore.tasks
    .filter((task: Task) => task.parent_task_id === null)
    .forEach((task: Task) => {
      const relevance = getRelevance(task)
      if (relevance > 0) {
        const { category, label } = getCategory(task)
        results.push({ task, category, categoryLabel: label, relevance })
      }
    })

  // Sort by relevance (highest first)
  results.sort((a, b) => b.relevance - a.relevance)

  return results
})

// Multi-select categories (array instead of single)
const selectedCategories = ref<TaskCategory[]>(['daily', 'recurring', 'project', 'completed'])

// Handler for category change from CategoryNav
const handleCategoriesChange = (categories: TaskCategory[]) => {
  selectedCategories.value = categories
}

// Category configuration
const categoryConfig: Record<TaskCategory, { label: string; icon: string }> = {
  daily: { label: 'Tägliche Aufgaben', icon: 'bi-lightning-fill' },
  recurring: { label: 'Putzaufgaben', icon: 'bi-arrow-repeat' },
  project: { label: 'Projekte', icon: 'bi-kanban' },
  completed: { label: 'Erledigt', icon: 'bi-check-circle' }
}

// Helper functions for task filtering and sorting (copied from TaskList logic)
const getDaysOverdue = (task: Task): number => {
  if (!task.last_completed_at) return Infinity
  const lastCompleted = new Date(task.last_completed_at)
  const today = new Date()
  const lastCompletedDate = new Date(lastCompleted.getFullYear(), lastCompleted.getMonth(), lastCompleted.getDate())
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.floor((todayDate.getTime() - lastCompletedDate.getTime()) / (1000 * 60 * 60 * 24))
}

const getDaysUntilDue = (task: Task): number => {
  if (task.task_type === 'one-time') return Infinity
  if (task.task_type !== 'recurring' || !task.recurrence_days || !task.last_completed_at) {
    return Infinity
  }
  const daysPassed = getDaysOverdue(task)
  return task.recurrence_days - daysPassed
}

// Get tasks for a specific category
const getTasksForCategory = (category: TaskCategory): Task[] => {
  let tasks: Task[] = []

  if (category === 'completed') {
    // Completed tasks (non-projects)
    tasks = taskStore.tasks.filter((task: Task) =>
      task.completed &&
      task.parent_task_id === null &&
      task.task_type !== 'project'
    )
    // Sort by days until due (ascending)
    tasks.sort((a, b) => getDaysUntilDue(a) - getDaysUntilDue(b))

    // Add completed projects at the end
    const completedProjects = taskStore.tasks.filter((task: Task) =>
      task.completed &&
      task.parent_task_id === null &&
      task.task_type === 'project'
    ).sort((a, b) => {
      if (!a.last_completed_at || !b.last_completed_at) return 0
      return new Date(b.last_completed_at).getTime() - new Date(a.last_completed_at).getTime()
    })
    tasks = [...tasks, ...completedProjects]

  } else if (category === 'daily') {
    // Daily + one-time tasks (not completed)
    tasks = taskStore.tasks.filter((task: Task) =>
      !task.completed &&
      task.parent_task_id === null &&
      (task.task_type === 'daily' || task.task_type === 'one-time')
    )
    // Alphabetisch sortieren (stabile Reihenfolge)
    tasks.sort((a, b) => a.title.localeCompare(b.title, 'de'))

  } else if (category === 'recurring') {
    // Recurring tasks (not completed)
    tasks = taskStore.tasks.filter((task: Task) =>
      !task.completed &&
      task.parent_task_id === null &&
      task.task_type === 'recurring'
    )
    // Sort by urgency (most overdue first)
    tasks.sort((a, b) => {
      if (!a.last_completed_at && !b.last_completed_at) return 0
      if (!a.last_completed_at) return -1
      if (!b.last_completed_at) return 1
      return getDaysOverdue(b) - getDaysOverdue(a)
    })

  } else if (category === 'project') {
    // Projects (not completed)
    tasks = taskStore.tasks.filter((task: Task) =>
      !task.completed &&
      task.parent_task_id === null &&
      task.task_type === 'project'
    )
  }

  return tasks
}

// Überfällige Aufgaben (recurring, deren Kadenz abgelaufen ist).
// Werden im Dashboard nach oben gezogen ("Jetzt dran") und unten aus der
// regulären Putzaufgaben-Gruppe entfernt, damit nichts doppelt erscheint.
const isOverdue = (task: Task): boolean =>
  task.task_type === 'recurring' &&
  !task.completed &&
  task.parent_task_id === null &&
  !!task.last_completed_at &&
  getDaysUntilDue(task) < 0

const overdueTasks = computed((): Task[] => {
  // Nur zeigen, wenn die Kategorie 'recurring' im aktuellen Filter sichtbar ist
  if (!selectedCategories.value.includes('recurring')) return []
  return taskStore.tasks
    .filter(isOverdue)
    .sort((a, b) => getDaysOverdue(b) - getDaysOverdue(a))
})

// Status-Zeile: definierte, vorhandene Daten (keine neuen Tabellen).
// Daily-Aufgaben sind immer sichtbar/resetten täglich → kein "offener Rückstand",
// daher nur recurring + one-time zählen.
const openTasksCount = computed((): number =>
  taskStore.tasks.filter(
    t => !t.completed &&
      t.parent_task_id === null &&
      (t.task_type === 'recurring' || t.task_type === 'one-time')
  ).length
)

// Grouped tasks computed property
interface TaskGroup {
  category: TaskCategory
  label: string
  icon: string
  tasks: Task[]
}

const groupedTasks = computed((): TaskGroup[] => {
  const order: TaskCategory[] = ['daily', 'recurring', 'project', 'completed']
  const groups: TaskGroup[] = []
  const overdueIds = new Set(overdueTasks.value.map(t => t.task_id))

  for (const cat of order) {
    if (selectedCategories.value.includes(cat)) {
      let tasks = getTasksForCategory(cat)
      // Überfällige sind bereits in der "Jetzt dran"-Sektion oben
      if (cat === 'recurring') {
        tasks = tasks.filter(t => !overdueIds.has(t.task_id))
      }
      if (tasks.length > 0) {
        groups.push({
          category: cat,
          ...categoryConfig[cat],
          tasks
        })
      }
    }
  }

  return groups
})

const closeCreateModal = () => {
  showCreateModal.value = false
}

// Aus dem Such-Overlay heraus: zuerst Suche schließen, dann jeweiliges Modal
// öffnen. searchQuery bleibt erhalten und wird als initialTitle übernommen.
const openCreateFromSearch = () => {
  showSearchOverlay.value = false
  showCreateModal.value = true
}

const openQuickFromSearch = () => {
  showSearchOverlay.value = false
  showQuickModal.value = true
}

const closeQuickModal = () => {
  showQuickModal.value = false
}

const handleCreateQuickTask = async (data: {
  title: string
  effort: 1 | 2 | 3 | 4 | 5
  note?: string
}) => {
  const result = await taskStore.createQuickTask(data)
  if (result) {
    showQuickModal.value = false
    searchQuery.value = ''
  }
}

const openSearchOverlay = () => {
  showSearchOverlay.value = true
  // Focus input nach Vue render cycle
  setTimeout(() => {
    const input = document.querySelector('.search-overlay-input') as HTMLInputElement
    input?.focus()
  }, 100)
}

const closeSearchOverlay = () => {
  showSearchOverlay.value = false
  searchQuery.value = ''
}

const handleCreateTask = async (taskData: {
  title: string
  effort: 1 | 2 | 3 | 4 | 5
  recurrence_days: number
  task_type: 'recurring' | 'daily' | 'one-time' | 'project'
}) => {
  try {
    await taskStore.createTask(taskData)
    showCreateModal.value = false
    searchQuery.value = ''
  } catch (error) {
    console.error('Fehler beim Erstellen:', error)
  }
}

onMounted(async () => {
  // Lädt Tasks aus Supabase - WARTE bis fertig geladen
  await taskStore.loadTasks()
  // Startet Realtime Subscriptions für Live-Updates (erst NACH initialem Load)
  taskStore.subscribeToTasks()
  // Wochen-Completions für die Status-Zeile ("heute erledigt") frisch halten
  householdStore.loadWeeklyCompletions()
})

onUnmounted(() => {
  // Cleanup: Beendet Realtime Subscriptions
  taskStore.unsubscribeFromTasks()
})

</script>

<template>
  <main class="page-container">
    <CategoryNav @update:categories="handleCategoriesChange" />

    <div class="container-fluid">
      <!-- Loading Skeleton (nur beim initialen Load) -->
      <div v-if="taskStore.isLoading && taskStore.tasks.length === 0" class="skeleton-loading">
        <div class="row">
          <div class="col-12 col-md-6 col-lg-3 mb-3">
            <div class="skeleton-card"></div>
          </div>
          <div class="col-12 col-md-6 col-lg-3 mb-3">
            <div class="skeleton-card"></div>
          </div>
          <div class="col-12 col-md-6 col-lg-3 mb-3">
            <div class="skeleton-card"></div>
          </div>
        </div>
      </div>

      <template v-else>
        <!-- Status-Zeile: definierte, kooperative Momentum-Metrik -->
        <div class="dashboard-status">
          <span class="status-item">
            <i class="bi bi-list-task"></i>
            Offen: <strong>{{ openTasksCount }}</strong>
          </span>
          <span v-if="overdueTasks.length" class="status-item status-overdue">
            <i class="bi bi-exclamation-triangle-fill"></i>
            {{ overdueTasks.length }} überfällig
          </span>
          <span class="status-item">
            <i class="bi bi-check2-circle"></i>
            heute erledigt: <strong>{{ householdStore.todayCompletionsCount }}</strong>
          </span>
        </div>

        <!-- Jetzt dran: überfällige Aufgaben nach oben gezogen -->
        <section v-if="overdueTasks.length" class="task-section section-overdue">
          <div class="category-header category-header-overdue">
            <i class="bi bi-exclamation-triangle-fill"></i>
            <span class="category-label">Jetzt dran</span>
            <span class="task-count">{{ overdueTasks.length }}</span>
          </div>
          <div class="task-list">
            <TaskCard
              v-for="task in overdueTasks"
              :key="task.task_id"
              :task="task"
            />
          </div>
        </section>

        <!-- Empty State when no active categories have tasks -->
        <div v-if="groupedTasks.length === 0 && overdueTasks.length === 0" class="empty-state">
          <i class="bi bi-check-circle"></i>
          <p>Keine Aufgaben in den ausgewählten Kategorien</p>
        </div>

        <!-- Grouped Task Sections -->
        <section
          v-for="group in groupedTasks"
          :key="group.category"
          class="task-section"
        >
          <div class="category-header">
            <i :class="group.icon"></i>
            <span class="category-label">{{ group.label }}</span>
            <span class="task-count">{{ group.tasks.length }}</span>
          </div>
          <div class="task-list">
            <TaskCard
              v-for="task in group.tasks"
              :key="task.task_id"
              :task="task"
            />
          </div>
        </section>
      </template>
    </div>

    <!-- Floating Action Button (vereint: Suchen + Erstellen) -->
    <div class="fab-group">
      <button
        class="fab fab-create"
        @click="openSearchOverlay"
        :disabled="taskStore.isLoading"
        aria-label="Aufgabe suchen oder hinzufügen"
      >
        <!-- Lupe = suchen, +-Badge = erstellen -->
        <i class="bi bi-search fab-icon-main"></i>
        <span class="fab-plus-badge" aria-hidden="true">
          <i class="bi bi-plus"></i>
        </span>
      </button>
    </div>

    <!-- Search Overlay -->
    <div v-if="showSearchOverlay" class="search-overlay">
      <div class="search-overlay-backdrop" @click="closeSearchOverlay"></div>
      <div class="search-overlay-content">
        <!-- Search Header -->
        <div class="search-overlay-header">
          <div class="search-overlay-input-wrapper">
            <i class="bi bi-search"></i>
            <input
              type="text"
              v-model="searchQuery"
              class="search-overlay-input"
              placeholder="Aufgabe suchen oder erstellen..."
              @keyup.esc="closeSearchOverlay"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="search-clear-btn"
              aria-label="Eingabe löschen"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <button
            @click="closeSearchOverlay"
            class="search-overlay-close"
            aria-label="Suche schließen"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <!-- Aktionen: erst wenn etwas eingegeben wurde (Titel-Vorschlag) -->
        <div v-if="searchQuery.trim()" class="search-overlay-actions">
          <button class="btn btn-primary action-create" @click="openCreateFromSearch">
            <i class="bi bi-plus-lg"></i> Aufgabe erstellen
          </button>
          <button class="btn btn-success action-quick" @click="openQuickFromSearch">
            <i class="bi bi-lightning-charge-fill"></i> Quick-Aufgabe abschließen
          </button>
        </div>

        <!-- Search Results -->
        <div class="search-overlay-body">
          <!-- Cross-Tab Search Results -->
          <template v-if="crossTabSearchResults && crossTabSearchResults.length > 0">
            <div
              v-for="result in crossTabSearchResults"
              :key="result.task.task_id"
              class="search-result-item"
            >
              <div class="search-result-category">{{ result.categoryLabel }}</div>
              <TaskCard :task="result.task" />
            </div>
          </template>

          <!-- Empty Search State -->
          <div v-else-if="crossTabSearchResults && crossTabSearchResults.length === 0" class="empty-state">
            <i class="bi bi-search"></i>
            <p>Keine Tasks gefunden für "{{ searchQuery }}"</p>
          </div>

          <!-- Initial State (no search query) -->
          <div v-else class="search-overlay-initial">
            <i class="bi bi-search"></i>
            <p>Suche über alle Tasks...</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Task Create Modal -->
    <TaskCreateModal
      v-if="showCreateModal"
      :initialTitle="searchQuery.trim()"
      :isLoading="taskStore.isLoading"
      @close="closeCreateModal"
      @create="handleCreateTask"
    />

    <!-- Quick Task Modal -->
    <QuickTaskModal
      v-if="showQuickModal"
      :initialTitle="searchQuery.trim()"
      :isLoading="taskStore.isLoading"
      @close="closeQuickModal"
      @complete="handleCreateQuickTask"
    />
  </main>
</template>

<style scoped>
.task-list-container {
  width: 100%;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.task-section {
  margin-bottom: var(--spacing-xl);
}

/* Status-Zeile (Dashboard) – schlank, eine Zeile, definierte Werte */
.dashboard-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 1rem;
  padding: 0.75rem 0.25rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.dashboard-status .status-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.dashboard-status .status-item i {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.dashboard-status strong {
  color: var(--color-text-primary);
  font-weight: 600;
}

.dashboard-status .status-overdue,
.dashboard-status .status-overdue i {
  color: var(--color-danger);
  font-weight: 600;
}

/* "Jetzt dran"-Sektion: überfällige Aufgaben, deutlich abgesetzt.
   Dezenter roter Tint (overflow-sicher, kein negativer Margin). */
.section-overdue {
  background: color-mix(in srgb, var(--color-danger) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-danger) 18%, transparent);
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm) var(--spacing-md);
}

.section-overdue .category-header-overdue {
  border-bottom: none;
  margin-bottom: 0;
}

.category-header-overdue {
  color: var(--color-danger);
  border-bottom-color: color-mix(in srgb, var(--color-danger) 35%, transparent);
}

.category-header-overdue i {
  color: var(--color-danger);
}

/* Category Headers */
.category-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0.75rem 0;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
}

.category-header i {
  font-size: 0.875rem;
  color: var(--color-primary);
}

.category-label {
  flex: 1;
}

.task-count {
  background: var(--color-background-muted, #f1f5f9);
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--color-text-secondary);
}

.empty-state i {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.3;
  display: block;
}

.empty-state p {
  font-size: 1.125rem;
  margin: 0;
}

/* Floating Action Buttons */
.fab-group {
  position: fixed;
  bottom: calc(64px + 16px + env(safe-area-inset-bottom));
  right: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1000;
  transition: bottom 0.2s ease, right 0.3s ease;
}

.fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bs-primary);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 1.5rem;
  flex-shrink: 0;
}

/* Lupe + kleines +-Badge: signalisiert "suchen ODER neu anlegen" */
.fab-create {
  position: relative;
}

.fab-icon-main {
  font-size: 1.4rem;
}

.fab-plus-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  color: var(--bs-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--bs-primary);
}

.fab:hover:not(:disabled) {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.fab:active:not(:disabled) {
  transform: scale(0.95);
}

.fab:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Search Overlay */
.search-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2000;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.search-overlay-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1;
}

.search-overlay-content {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease-out;
  z-index: 2;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.search-overlay-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--color-background-elevated);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.search-overlay-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 24px;
  padding: 12px 16px;
}

/* Aktions-Buttons unter der Eingabe (Erstellen / Quick) */
.search-overlay-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-background-elevated);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.search-overlay-actions .btn {
  flex: 1 1 0;
  min-width: 140px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

.search-overlay-input-wrapper i {
  color: var(--bs-secondary);
  font-size: 1.25rem;
}

.search-overlay-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 1rem;
  background: transparent;
  color: var(--color-text-primary);
}

.search-clear-btn {
  background: none;
  border: none;
  color: var(--bs-secondary);
  font-size: 1rem;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.search-clear-btn:hover {
  color: var(--bs-danger);
}

.search-overlay-close {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.search-overlay-close:hover {
  color: var(--color-text-primary);
}

.search-overlay-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.search-overlay-initial {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--color-text-secondary);
}

.search-overlay-initial i {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.3;
  display: block;
}

.search-overlay-initial p {
  font-size: 1.125rem;
  margin: 0;
}

/* Search Result Items */
.search-result-item {
  margin-bottom: 0.5rem;
}

.search-result-category {
  font-size: 0.75rem;
  color: var(--bs-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.25rem;
  padding-left: 0.5rem;
  font-weight: 500;
}
</style>
