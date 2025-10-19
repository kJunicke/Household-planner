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
  <div id="app" class="container-fluid">
    <header class="row align-items-center py-3">
      <div class="col-4">
        <span class="text-muted">
          <strong>Haushalt:</strong> {{ householdStore.currentHousehold?.name }} 
          <span class="ms-3">
            <strong>Einladungs Code:</strong> {{ householdStore.currentHousehold?.invite_code }}
          </span>
        </span>
      </div>
      <div class="col-4">
        <h1 class="text-center m-0">Bester Putzplan der Welt</h1>
      </div>
      <div class="col-4 text-end">
        <span class="text-muted me-3">
          <strong>Benutzer:</strong>  {{ authStore.user?.email }}
        </span>
        <button @click="handleLogout" class="btn btn-outline-danger btn-sm">
          Logout
        </button>
      </div>
    </header>

    <main class="row">
      <div class="col-12">
        <div class="text-end mb-3">
          <button @click="toggleForm" class="btn btn-primary">
            <i class="bi bi-plus"></i> Aufgabe hinzufügen
          </button>
        </div>
        
        <section v-if="showCreateTaskForm" class="mb-4">
          <div class="card">
            <div class="card-body">
              <form @submit.prevent="createTask">
                <input type="text" v-model="newTask.title" placeholder="Task Titel" class="form-control">
                Aufwand (1-5):
                <select v-model="newTask.effort" class="form-control">
                  <option :value="1">1 - Sehr leicht</option>
                  <option :value="2">2 - Leicht</option>
                  <option :value="3">3 - Normal</option>
                  <option :value="4">4 - Schwer</option>
                  <option :value="5">5 - Sehr schwer</option>
                </select>
                Tage bis zum nächsten putzen:
                <input type="number" v-model="newTask.recurrence_days" placeholder="3" class="form-control">
                <button type="submit" class="btn btn-success">Aufgabe erstellen</button>
              </form>
            </div>
          </div>
        </section>

        <!-- Task Listen danach -->
        <h3>Muss gemacht werden</h3>
        <TaskList filter="todo" />
        <h3>Erledigt</h3>
        <TaskList filter="completed" />
      </div>
    </main>
  </div>

</template>

<style scoped>

</style>
