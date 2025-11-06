<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue";
import TaskList from '../components/TaskList.vue';
import TaskCard from '../components/TaskCard.vue';
import { useTaskStore } from "../stores/taskStore";
import type { Task } from '@/types/Task';

const taskStore = useTaskStore()
const showCreateTaskForm = ref(false)

// Search state
const searchQuery = ref('')

// Filtered tasks based on search query
// Wenn eine Subtask matched, wird die ganze Parent Task Card angezeigt
const searchFilteredTasks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return null // Null = kein Suchfilter aktiv

  const matchedParentIds = new Set<string>()

  // Durchsuche alle Tasks
  taskStore.tasks.forEach((task: Task) => {
    const titleMatch = task.title.toLowerCase().includes(query)

    if (task.parent_task_id === null) {
      // Parent Task
      if (titleMatch) {
        matchedParentIds.add(task.task_id)
      }
    } else {
      // Subtask - wenn matched, füge Parent hinzu
      if (titleMatch) {
        matchedParentIds.add(task.parent_task_id)
      }
    }
  })

  // Gib nur Parent Tasks zurück (TaskCard zeigt Subtasks intern)
  return taskStore.tasks.filter((task: Task) =>
    matchedParentIds.has(task.task_id) && task.parent_task_id === null
  )
})

// Tab state for task categories
type TaskCategory = 'daily' | 'recurring' | 'completed'
const STORAGE_KEY = 'putzplan_selected_category'

// Load from localStorage or default to 'daily'
const selectedCategory = ref<TaskCategory>(
  (localStorage.getItem(STORAGE_KEY) as TaskCategory) || 'daily'
)

// Save to localStorage when category changes
const selectCategory = (category: TaskCategory) => {
  selectedCategory.value = category
  localStorage.setItem(STORAGE_KEY, category)
}

const newTask = ref({
  title: '',
  effort: 1,
  recurrence_days: 0,
  task_type: 'recurring' as 'recurring' | 'daily' | 'one-time'
})

const resetForm = () => {
  newTask.value = {
    title: '',
    effort: 1,
    recurrence_days: 0,
    task_type: 'recurring' as 'recurring' | 'daily' | 'one-time'
  }
}

const toggleForm = () => {
  showCreateTaskForm.value = !showCreateTaskForm.value
  if(!showCreateTaskForm.value) {
    resetForm()
  } else {
    // Wenn Form geöffnet wird und Suchquery existiert, in title übernehmen
    if (searchQuery.value.trim()) {
      newTask.value.title = searchQuery.value.trim()
    }
  }
}

const createTask = async () => {
  try {
    await taskStore.createTask({
      ...newTask.value,
      effort: newTask.value.effort as 1 | 2 | 3 | 4 | 5,
      task_type: newTask.value.task_type
    })
    resetForm()
    showCreateTaskForm.value = false
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
    <div class="container-fluid">
      <div class="row mb-4">
        <div class="col-12 text-end">
          <button @click="toggleForm" class="btn btn-primary" :disabled="taskStore.isLoading">
            <i class="bi bi-plus"></i> Aufgabe hinzufügen
          </button>
        </div>
      </div>

      <section v-if="showCreateTaskForm" class="mb-4">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title mb-4">Neue Aufgabe erstellen</h5>
            <form @submit.prevent="createTask">
              <div class="mb-3">
                <label class="form-label">Task Titel</label>
                <input type="text" v-model="newTask.title" placeholder="z.B. Küche putzen" class="form-control" :disabled="taskStore.isLoading">
              </div>
              <div class="mb-3">
                <label class="form-label">Aufwand (1-5)</label>
                <select v-model="newTask.effort" class="form-control" :disabled="taskStore.isLoading">
                  <option :value="1">1 - Sehr leicht</option>
                  <option :value="2">2 - Leicht</option>
                  <option :value="3">3 - Normal</option>
                  <option :value="4">4 - Schwer</option>
                  <option :value="5">5 - Sehr schwer</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Task-Typ</label>
                <select v-model="newTask.task_type" class="form-control" :disabled="taskStore.isLoading">
                  <option value="daily">Täglich / Allgemein (immer sichtbar)</option>
                  <option value="recurring">Wiederkehrend (zeitbasiert)</option>
                  <option value="one-time">Einmalig</option>
                </select>
              </div>
              <div class="mb-3" v-if="newTask.task_type === 'recurring'">
                <label class="form-label">Tage bis zum nächsten Putzen</label>
                <input type="number" v-model="newTask.recurrence_days" placeholder="3" class="form-control" :disabled="taskStore.isLoading">
              </div>
              <div class="d-flex gap-2">
                <button type="submit" class="btn btn-success" :disabled="taskStore.isLoading">
                  <span v-if="!taskStore.isLoading">Aufgabe erstellen</span>
                  <span v-else>
                    <span class="spinner-border spinner-border-sm me-2"></span>
                    Erstellt...
                  </span>
                </button>
                <button type="button" @click="toggleForm" class="btn btn-secondary" :disabled="taskStore.isLoading">Abbrechen</button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <!-- Search Field -->
      <div class="mb-4">
        <div class="input-group">
          <span class="input-group-text">
            <i class="bi bi-search"></i>
          </span>
          <input
            type="text"
            v-model="searchQuery"
            class="form-control"
            placeholder="Tasks oder Subtasks durchsuchen..."
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="btn btn-outline-secondary"
            type="button"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>

      <!-- Category Tabs -->
      <div class="task-category-tabs mb-4">
        <button
          @click="selectCategory('daily')"
          :class="['btn', 'btn-sm', selectedCategory === 'daily' ? 'btn-primary' : 'btn-outline-primary']"
        >
          <i class="bi bi-clock"></i> Alltagsaufgaben
        </button>
        <button
          @click="selectCategory('recurring')"
          :class="['btn', 'btn-sm', selectedCategory === 'recurring' ? 'btn-primary' : 'btn-outline-primary']"
        >
          <i class="bi bi-arrow-repeat"></i> Putzaufgaben
        </button>
        <button
          @click="selectCategory('completed')"
          :class="['btn', 'btn-sm', selectedCategory === 'completed' ? 'btn-primary' : 'btn-outline-primary']"
        >
          <i class="bi bi-check-circle"></i> Erledigt
        </button>
      </div>

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

      <!-- Task Lists (conditional rendering) -->
      <!-- Search Results -->
      <section v-else-if="searchFilteredTasks !== null" class="task-section">
        <div v-if="searchFilteredTasks.length === 0" class="empty-state">
          <i class="bi bi-search"></i>
          <p>Keine Tasks gefunden für "{{ searchQuery }}"</p>
        </div>
        <div v-else class="container-fluid">
          <div class="row">
            <div v-for="task in searchFilteredTasks"
              :key="task.task_id"
              class="col-12 col-md-6 col-lg-3 mb-3">
              <TaskCard :task="task" />
            </div>
          </div>
        </div>
      </section>

      <!-- Category Filtered Lists (only when no search) -->
      <template v-else>
        <section v-if="selectedCategory === 'daily'" class="task-section">
          <TaskList filter="daily-todo" />
        </section>

        <section v-if="selectedCategory === 'recurring'" class="task-section">
          <TaskList filter="recurring-todo" />
        </section>

        <section v-if="selectedCategory === 'completed'" class="task-section">
          <TaskList filter="completed" />
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.task-section {
  margin-bottom: var(--spacing-xl);
}

/* Category Tabs - Similar to StatsView time-period-tabs */
.task-category-tabs {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  justify-content: center;
}

.task-category-tabs .btn {
  flex: 1;
  min-width: 140px;
  font-weight: 500;
  transition: all 0.2s ease;
}

/* Mobile: smaller buttons, allow wrapping */
@media (max-width: 576px) {
  .task-category-tabs .btn {
    font-size: 0.8125rem;
    padding: 0.5rem 0.75rem;
    min-width: 120px;
  }
}

/* Very small mobile: stack buttons */
@media (max-width: 400px) {
  .task-category-tabs {
    flex-direction: column;
  }

  .task-category-tabs .btn-sm {
    font-size: 0.875rem;
    padding: 0.625rem 1rem;
  }
}
</style>
