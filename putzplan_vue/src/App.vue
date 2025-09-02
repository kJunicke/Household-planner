<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import TaskList from './components/TaskList.vue';
import type { Task } from "@/types/Task"
import testTasksData from '@/data/testTasks.json';

const tasks = ref<Task[]>([]);

const openTasks = computed(() => tasks.value.filter(t => !t.completed))
const completedTasks = computed(() => tasks.value.filter(t => t.completed))


onMounted(() => {
       // Simuliert später den Supabase API-Call
       tasks.value = testTasksData as Task[];
       });

const completeTask = (taskID: number) =>{
  const task = tasks.value.find(t => t.id === taskID)
  if (task) {
    task.completed = true
  }
}
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
      @completeTask="completeTask">
      </TaskList>
      <h3> Erledigt </h3>
      <TaskList :tasks="completedTasks"
      @completeTask="completeTask">
      </TaskList>
    </main>
  </div>

</template>

<style scoped>

</style>
