<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue";
import TaskCard from '../components/TaskCard.vue';
import CategoryNav, { type TaskCategory } from '../components/CategoryNav.vue';
import TaskCreateModal from '../components/TaskCreateModal.vue';
import { useTaskStore } from "../stores/taskStore";
import type { Task } from '@/types/Task';

const taskStore = useTaskStore()
const showCreateModal = ref(false)

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

  // Helper: Calculate relevance score
  const getRelevance = (task: Task): number => {
    const title = task.title.toLowerCase()
    if (title === query) return 100 // Exact match
    if (title.startsWith(query)) return 80 // Starts with query
    if (title.includes(query)) return 60 // Contains query

    // Check subtasks
    const subtasks = taskStore.tasks.filter((t: Task) => t.parent_task_id === task.task_id)
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

  for (const cat of order) {
    if (selectedCategories.value.includes(cat)) {
      const tasks = getTasksForCategory(cat)
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

const openCreateModal = () => {
  showCreateModal.value = true
}

const closeCreateModal = () => {
  showCreateModal.value = false
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
  } catch (error) {
    console.error('Fehler beim Erstellen:', error)
  }
}

onMounted(async () => {
  // Lädt Tasks aus Supabase - WARTE bis fertig geladen
  await taskStore.loadTasks()
  // Startet Realtime Subscriptions für Live-Updates (erst NACH initialem Load)
  taskStore.subscribeToTasks()
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

      <!-- Empty State when no active categories have tasks -->
      <div v-else-if="groupedTasks.length === 0" class="empty-state">
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
    </div>

    <!-- Floating Action Buttons -->
    <div class="fab-group">
      <!-- Search FAB -->
      <button
        class="fab fab-search"
        @click="openSearchOverlay"
        aria-label="Suchen"
      >
        <i class="bi bi-search"></i>
      </button>

      <!-- Create FAB -->
      <button
        class="fab fab-create"
        @click="openCreateModal"
        :disabled="taskStore.isLoading"
        aria-label="Aufgabe hinzufügen"
      >
        <i class="bi bi-plus"></i>
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
              placeholder="Suchen..."
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

.fab-search {
  background: var(--bs-secondary);
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
