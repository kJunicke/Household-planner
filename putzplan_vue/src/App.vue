<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Header from './components/Header.vue'
import BottomNav from './components/BottomNav.vue'
import ToastContainer from './components/ToastContainer.vue'
import { useAuthStore } from './stores/authStore'
import { useHouseholdStore } from './stores/householdStore'

const route = useRoute()
const authStore = useAuthStore()
const householdStore = useHouseholdStore()

// Header und BottomNav nur anzeigen wenn User eingeloggt und nicht auf Login/Register/Setup-Seiten
const showNavigation = computed(() => {
  const publicRoutes = ['login', 'register', 'household-setup']
  return !publicRoutes.includes(route.name as string)
})

// Übernimmt ohne Abmeldung ein anderes Konto (anderer Tab), räumt das
// Session-Ende Daten und Kanäle der offenen Ansicht ab; steht sie schon auf
// `/`, ändert `router.replace('/')` in main.ts nichts, und die Wand bliebe leer
// und ohne Abo. Der Schlüssel montiert die Ansicht neu, sobald Konto oder
// Haushalt wechseln — sonst nie, also kein Flackern im Normalfall. Auf den
// öffentlichen Seiten bleibt er weg: dort setzen Anmelden und Einrichten den
// Haushalt selbst, ein Neumontieren mitten im Ablauf wäre falsch.
const viewKey = computed(() =>
  showNavigation.value
    ? `${authStore.user?.id ?? ''}:${householdStore.currentHousehold?.household_id ?? ''}`
    : undefined,
)
</script>

<template>
  <div class="app-wrapper">
    <Header v-if="showNavigation" />
    <router-view :key="viewKey" />
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
