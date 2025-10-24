<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Header from './components/Header.vue'

const route = useRoute()

// Header nur anzeigen wenn User eingeloggt und nicht auf Login/Register/Setup-Seiten
const showHeader = computed(() => {
  const publicRoutes = ['login', 'register', 'household-setup']
  return !publicRoutes.includes(route.name as string)
})
</script>

<template>
  <div class="app-wrapper">
    <Header v-if="showHeader" />
    <router-view />
  </div>
</template>

<style scoped>
.app-wrapper {
  min-height: 100vh;
  background: var(--color-background);
}
</style>
