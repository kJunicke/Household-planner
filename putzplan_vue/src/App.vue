<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Header from './components/Header.vue'
import BottomNav from './components/BottomNav.vue'
import ToastContainer from './components/ToastContainer.vue'

const route = useRoute()

// Header und BottomNav nur anzeigen wenn User eingeloggt und nicht auf Login/Register/Setup-Seiten
const showNavigation = computed(() => {
  const publicRoutes = ['login', 'register', 'household-setup']
  return !publicRoutes.includes(route.name as string)
})
</script>

<template>
  <div class="app-wrapper">
    <Header v-if="showNavigation" />
    <router-view />
    <BottomNav v-if="showNavigation" />
    <ToastContainer />
  </div>
</template>

<style scoped>
.app-wrapper {
  min-height: 100vh;
  background: var(--color-background);
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
}
</style>
