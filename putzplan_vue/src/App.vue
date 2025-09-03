<script setup lang="ts">
import { onMounted, computed } from "vue";
import TaskList from './components/TaskList.vue';
import { useTaskStore } from "./stores/taskStore";

const taskStore = useTaskStore()

const openTasks = computed(() => taskStore.tasks.filter(t => !t.completed))
const completedTasks = computed(() => taskStore.tasks.filter(t => t.completed))


onMounted(() => {
       // Lädt Tasks aus Supabase
       taskStore.loadTasks()
       });

const toggleTask = taskStore.toggleTask
</script>

<template>
  <div id="app" class="container-fluid">
    <header class="row">
      <div class="col-12">
        <h1 class="text-center py-3">Putzplan</h1>
      </div>
    </header>

    <main class="row">
      <div class="col-12">
        <h2 class="text-center">Bester Putzplan der Welt</h2>
      </div>
      <h3> Muss gemacht werden </h3>
      <TaskList :tasks="openTasks"
      @toggleTask="toggleTask">
      </TaskList>
      <h3> Erledigt </h3>
      <TaskList :tasks="completedTasks"
      @toggleTask="toggleTask">
      </TaskList>
    </main>
  </div>

</template>

<style scoped>

</style>
