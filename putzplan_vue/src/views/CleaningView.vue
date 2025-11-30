<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue";
import TaskList from '../components/TaskList.vue';
import TaskCard from '../components/TaskCard.vue';
import CategoryNav from '../components/CategoryNav.vue';
import TaskCreateModal from '../components/TaskCreateModal.vue';
import { useTaskStore } from "../stores/taskStore";
import type { Task } from '@/types/Task';

const taskStore = useTaskStore()
const showCreateModal = ref(false)

// Search state
const searchQuery = ref('')
const isSearchExpanded = ref(false)

// Cross-tab search results (only when search is active)
const crossTabSearchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query || !isSearchExpanded.value) return null

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

// Tab state for task categories
type TaskCategory = 'daily' | 'recurring' | 'project' | 'completed'
const selectedCategory = ref<TaskCategory>('daily')

// Handler for category change from CategoryNav
const handleCategoryChange = (category: TaskCategory) => {
  selectedCategory.value = category
}

const openCreateModal = () => {
  showCreateModal.value = true
}

const closeCreateModal = () => {
  showCreateModal.value = false
}

const toggleSearch = () => {
  isSearchExpanded.value = !isSearchExpanded.value
  if (isSearchExpanded.value) {
    // Focus input nach Vue render cycle
    setTimeout(() => {
      const input = document.querySelector('.search-fab-input') as HTMLInputElement
      input?.focus()
    }, 100)
  } else {
    // Clear search when closing
    searchQuery.value = ''
  }
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

// Track keyboard visibility for PWA (VisualViewport API)
const keyboardHeight = ref(0)

const updateFABPosition = () => {
  if (!window.visualViewport) return

  const viewport = window.visualViewport
  const windowHeight = window.innerHeight
  const viewportHeight = viewport.height

  // Calculate keyboard height (difference between window and visual viewport)
  const newKeyboardHeight = windowHeight - viewportHeight

  // Only update if keyboard height changed significantly (> 100px = keyboard visible)
  if (newKeyboardHeight > 100) {
    keyboardHeight.value = newKeyboardHeight
  } else {
    keyboardHeight.value = 0
  }
}

onMounted(async () => {
  // Lädt Tasks aus Supabase - WARTE bis fertig geladen
  await taskStore.loadTasks()
  // Startet Realtime Subscriptions für Live-Updates (erst NACH initialem Load)
  taskStore.subscribeToTasks()

  // Setup VisualViewport listener for keyboard detection (PWA support)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateFABPosition)
    window.visualViewport.addEventListener('scroll', updateFABPosition)
  }
})

onUnmounted(() => {
  // Cleanup: Beendet Realtime Subscriptions
  taskStore.unsubscribeFromTasks()

  // Cleanup VisualViewport listeners
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', updateFABPosition)
    window.visualViewport.removeEventListener('scroll', updateFABPosition)
  }
})

</script>

<template>
  <!-- Secondary Navigation (rendered in Header slot) -->
  <template v-if="false">
    <CategoryNav @update:category="handleCategoryChange" />
  </template>

  <main class="page-container">
    <CategoryNav @update:category="handleCategoryChange" />

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

      <!-- Cross-Tab Search Results (when search is active) -->
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

      <!-- Normal Tab View (when no search) -->
      <template v-else>
        <section v-if="selectedCategory === 'daily'" class="task-section">
          <TaskList filter="daily-todo" />
        </section>

        <section v-if="selectedCategory === 'recurring'" class="task-section">
          <TaskList filter="recurring-todo" />
        </section>

        <section v-if="selectedCategory === 'project'" class="task-section">
          <TaskList filter="project-todo" />
        </section>

        <section v-if="selectedCategory === 'completed'" class="task-section">
          <TaskList filter="completed" />
        </section>
      </template>
    </div>

    <!-- Floating Action Buttons -->
    <div
      class="fab-group"
      :class="{ 'fab-group-expanded': isSearchExpanded }"
      :style="keyboardHeight > 0 ? { bottom: `${keyboardHeight + 24}px` } : {}"
    >
      <!-- Expanding Search Bar -->
      <div v-if="isSearchExpanded" class="search-fab-expanded">
        <input
          type="text"
          v-model="searchQuery"
          class="search-fab-input"
          placeholder="Suchen..."
          @keyup.esc="toggleSearch"
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

      <!-- Search FAB -->
      <button
        class="fab fab-search"
        @click="toggleSearch"
        :aria-label="isSearchExpanded ? 'Suche schließen' : 'Suchen'"
      >
        <i :class="isSearchExpanded ? 'bi bi-x-lg' : 'bi bi-search'"></i>
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
  margin-bottom: var(--spacing-lg);
}

/* Floating Action Buttons */
.fab-group {
  position: fixed;
  bottom: 24px;
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

/* Expanding Search Bar */
.search-fab-expanded {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  border-radius: 28px;
  padding: 0 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  height: 56px;
  animation: expandSearch 0.3s ease-out;
  max-width: calc(100vw - 180px);
  flex: 1;
  min-width: 0; /* Allow flex shrinking */
}

@keyframes expandSearch {
  from {
    max-width: 0;
    opacity: 0;
  }
  to {
    max-width: 250px;
    opacity: 1;
  }
}

.search-fab-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 1rem;
  background: transparent;
  min-width: 150px;
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
