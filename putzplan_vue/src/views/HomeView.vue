<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import TaskList from '../components/TaskList.vue';
import { useTaskStore } from "../stores/taskStore";
import { useAuthStore } from "../stores/authStore";
import { useHouseholdStore } from "../stores/householdStore";

const router = useRouter()
const taskStore = useTaskStore()
const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const showCreateTaskForm = ref(false)

const newTask = ref({
  title: '',
  effort: 1,
  recurrence_days: 0
})

const resetForm = () => {
  newTask.value = {
    title: '',
    effort: 1,
    recurrence_days: 0
  }
}

const toggleForm = () => {
  showCreateTaskForm.value = !showCreateTaskForm.value
  if(!showCreateTaskForm.value) resetForm()
}

const createTask = async () => {
  try {
    await taskStore.createTask({
      ...newTask.value,
      effort: newTask.value.effort as 1 | 2 | 3 | 4 | 5
    })
    resetForm()
    showCreateTaskForm.value = false
  } catch (error) {
    console.error('Fehler beim Erstellen:', error)
  }
 }

const handleLogout = async () => {
  await authStore.logout()
  router.push('/login')
}

onMounted(() => {
  // Lädt Tasks aus Supabase
  taskStore.loadTasks()
  // Startet Realtime Subscriptions für Live-Updates
  taskStore.subscribeToTasks()
})

onUnmounted(() => {
  // Cleanup: Beendet Realtime Subscriptions
  taskStore.unsubscribeFromTasks()
})

</script>

<template>
  <div id="app" class="app-container">
    <header class="app-header">
      <div class="container-fluid">
        <div class="row align-items-center">
          <div class="col-lg-3 col-md-12 mb-3 mb-lg-0">
            <div class="info-badge">
              <strong>Haushalt:</strong> {{ householdStore.currentHousehold?.name }}
            </div>
            <div class="info-badge mt-2">
              <strong>Code:</strong> {{ householdStore.currentHousehold?.invite_code }}
            </div>
          </div>
          <div class="col-lg-6 col-md-12 mb-3 mb-lg-0">
            <h1 class="page-title">Bester Putzplan der Welt</h1>
          </div>
          <div class="col-lg-3 col-md-12 text-lg-end">
            <div class="user-info">
              <span class="user-email">{{ authStore.user?.email }}</span>
              <button @click="handleLogout" class="btn btn-outline-danger btn-sm ms-2">
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="container-fluid">
        <div class="row mb-4">
          <div class="col-12 text-end">
            <button @click="toggleForm" class="btn btn-primary">
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
                  <input type="text" v-model="newTask.title" placeholder="z.B. Küche putzen" class="form-control">
                </div>
                <div class="mb-3">
                  <label class="form-label">Aufwand (1-5)</label>
                  <select v-model="newTask.effort" class="form-control">
                    <option :value="1">1 - Sehr leicht</option>
                    <option :value="2">2 - Leicht</option>
                    <option :value="3">3 - Normal</option>
                    <option :value="4">4 - Schwer</option>
                    <option :value="5">5 - Sehr schwer</option>
                  </select>
                </div>
                <div class="mb-3">
                  <label class="form-label">Tage bis zum nächsten Putzen</label>
                  <input type="number" v-model="newTask.recurrence_days" placeholder="3" class="form-control">
                </div>
                <div class="d-flex gap-2">
                  <button type="submit" class="btn btn-success">Aufgabe erstellen</button>
                  <button type="button" @click="toggleForm" class="btn btn-secondary">Abbrechen</button>
                </div>
              </form>
            </div>
          </div>
        </section>

        <!-- Task Listen danach -->
        <section class="task-section">
          <h3 class="section-title">Muss gemacht werden</h3>
          <TaskList filter="todo" />
        </section>

        <section class="task-section mt-5">
          <h3 class="section-title">Erledigt</h3>
          <TaskList filter="completed" />
        </section>
      </div>
    </main>
  </div>

</template>

<style scoped>
.app-container {
  min-height: 100vh;
}

.app-header {
  background: var(--color-background-elevated);
  border-bottom: 1px solid var(--color-border);
  padding: var(--spacing-lg) 0;
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--spacing-xl);
}

.page-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  text-align: center;
}

.info-badge {
  display: inline-block;
  background: var(--color-background);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.info-badge strong {
  color: var(--color-text-primary);
  margin-right: 0.25rem;
}

.user-info {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.user-email {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.app-main {
  padding-bottom: var(--spacing-xl);
}

.task-section {
  margin-bottom: var(--spacing-xl);
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-sm);
  border-bottom: 2px solid var(--color-border);
}
</style>
