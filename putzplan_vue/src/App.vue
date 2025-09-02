<script setup lang="ts">
import TaskCard  from './components/TaskCard.vue';


//TODO Test Tasks müssen wieder entfernt werden
  const testTask = {
    id: 1,
    title: "Küche putzen",
    effort: 3,
    recurrence: { type: 'recurring', days: 7 }
  }
  const testTask2 = {
    id: 1,
    title: "Schrank aufbauen",
    effort: 4,
    recurrence: { type: 'once'}
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

      <!--TODO wieder entfernen nach dem testen--> 
      <div class="col-4">
        <TaskCard :task="testTask" />
      </div>
      <div class="col-4">
        <TaskCard :task="testTask2" />
      </div>
    </main>
  </div>

</template>

<style scoped>

</style>
