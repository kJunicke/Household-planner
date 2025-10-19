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
const isEditingName = ref(false)
const newDisplayName = ref('')

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

const startEditingName = () => {
  newDisplayName.value = authStore.getUserDisplayName()
  isEditingName.value = true
}

const saveDisplayName = async () => {
  if (!newDisplayName.value.trim()) {
    return
  }

  const result = await authStore.updateDisplayName(newDisplayName.value.trim())
  if (result.success) {
    isEditingName.value = false
  }
}

const cancelEditingName = () => {
  isEditingName.value = false
  newDisplayName.value = ''
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
              <div v-if="!isEditingName" class="d-flex align-items-center gap-3 justify-content-end">
                <div class="user-details">
                  <div class="user-name">{{ authStore.getUserDisplayName() }}</div>
                  <div class="user-email-small">{{ authStore.user?.email }}</div>
                </div>
                <button @click="startEditingName" class="btn btn-light border settings-btn btn-sm" title="Namen bearbeiten">
                  <i class="bi bi-gear-fill fs-5"></i>
                </button>
                <button @click="handleLogout" class="btn btn-danger btn-sm">
                  Logout
                </button>
              </div>
              <div v-else class="d-flex align-items-center gap-2 justify-content-end">
                <input
                  v-model="newDisplayName"
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Dein Name"
                  @keyup.enter="saveDisplayName"
                  @keyup.escape="cancelEditingName"
                  style="max-width: 150px;"
                />
                <button @click="saveDisplayName" class="btn btn-success btn-sm">
                  <i class="bi bi-check-lg"></i>
                </button>
                <button @click="cancelEditingName" class="btn btn-secondary btn-sm">
                  <i class="bi bi-x-lg"></i>
                </button>
              </div>
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

.user-details {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.user-name {
  font-size: 0.9375rem;
  color: var(--color-text-primary);
  font-weight: 600;
}

.user-email-small {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.settings-btn {
  padding: 0.5rem 0.75rem;
}

.settings-btn i {
  color: #6c757d;
}

.settings-btn:hover i {
  color: #495057;
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
