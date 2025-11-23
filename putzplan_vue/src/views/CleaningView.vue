<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from "vue";
import TaskList from '../components/TaskList.vue';
import TaskCard from '../components/TaskCard.vue';
import CategoryNav from '../components/CategoryNav.vue';
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
type TaskCategory = 'daily' | 'recurring' | 'project' | 'completed'
const selectedCategory = ref<TaskCategory>('daily')

// Handler for category change from CategoryNav
const handleCategoryChange = (category: TaskCategory) => {
  selectedCategory.value = category
}

const newTask = ref({
  title: '',
  effort: 1,
  recurrence_days: 0,
  task_type: 'recurring' as 'recurring' | 'daily' | 'one-time' | 'project'
})

const resetForm = () => {
  newTask.value = {
    title: '',
    effort: 1,
    recurrence_days: 0,
    task_type: 'recurring' as 'recurring' | 'daily' | 'one-time' | 'project'
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
  <!-- Secondary Navigation (rendered in Header slot) -->
  <template v-if="false">
    <CategoryNav @update:category="handleCategoryChange" />
  </template>

  <main class="page-container">
    <CategoryNav @update:category="handleCategoryChange" />

    <div class="container-fluid">
      <div class="row mb-3">
        <div class="col-12 text-end">
          <button @click="toggleForm" class="btn btn-primary btn-sm" :disabled="taskStore.isLoading">
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
                  <option value="project">Projekt (langfristig)</option>
                </select>
              </div>
              <div class="mb-3" v-if="newTask.task_type === 'recurring'">
                <label class="form-label">Tage bis zum nächsten Putzen</label>
                <input type="number" v-model="newTask.recurrence_days" placeholder="3" class="form-control" :disabled="taskStore.isLoading">
              </div>
              <div v-if="newTask.task_type === 'project'" class="mb-3">
                <p class="text-muted small">
                  <i class="bi bi-info-circle"></i>
                  Projekte sind langfristige Aufgaben ohne Wiederholung. Es wird automatisch ein "Am Projekt arbeiten" Subtask erstellt.
                </p>
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
      <div class="mb-3">
        <div class="input-group input-group-sm">
          <span class="input-group-text">
            <i class="bi bi-search"></i>
          </span>
          <input
            type="text"
            v-model="searchQuery"
            class="form-control"
            placeholder="Suchen..."
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
          <div class="row task-grid">
            <div v-for="task in searchFilteredTasks"
              :key="task.task_id"
              class="col-6 col-md-4 col-lg-3 col-xl-2 task-grid-item">
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

        <section v-if="selectedCategory === 'project'" class="task-section">
          <TaskList filter="project-todo" />
        </section>

        <section v-if="selectedCategory === 'completed'" class="task-section">
          <TaskList filter="completed" />
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.task-grid {
  --bs-gutter-x: 0.5rem;
  --bs-gutter-y: 0.5rem;
}

.task-grid-item {
  margin-bottom: 0;
}

.task-section {
  margin-bottom: var(--spacing-lg);
}
</style>
