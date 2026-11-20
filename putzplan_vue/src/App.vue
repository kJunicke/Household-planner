<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
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
  const publicRoutes = ['login', 'register', 'household-setup', 'guest']
  return !publicRoutes.includes(route.name as string)
})

// Übernimmt ohne Abmeldung ein anderes Konto (anderer Tab), räumt das
// Session-Ende Daten und Kanäle der offenen Ansicht ab; steht sie schon auf
// `/`, ändert `router.replace('/')` in main.ts nichts, und die Wand bliebe leer
// und ohne Abo. Der Schlüssel montiert die Ansicht neu, sobald Konto oder
// Haushalt wechseln — sonst nie, also kein Flackern im Normalfall.
//
// Gültig ist er nur mit Konto **und** Haushalt. Dazwischen (Abmelden, Konto
// gewechselt, Haushalt noch nicht geladen) bleibt der letzte stehen: sonst
// montierte das Abmelden die Ansicht noch einmal, und der Kontowechsel eine
// halbe Ansicht ohne Haushalt, bevor die richtige kommt. Auf den öffentlichen
// Seiten bleibt er weg: dort setzen Anmelden und Einrichten den Haushalt
// selbst, ein Neumontieren mitten im Ablauf wäre falsch.
const lastViewKey = ref<string>()
watchEffect(() => {
  const userId = authStore.user?.id
  const householdId = householdStore.currentHousehold?.household_id
  if (userId && householdId) lastViewKey.value = `${userId}:${householdId}`
})
const viewKey = computed(() => (showNavigation.value ? lastViewKey.value : undefined))
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
