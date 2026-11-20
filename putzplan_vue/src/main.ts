import 'bootstrap/dist/css/bootstrap.min.css'
import './assets/main.css'

import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import { useAuthStore } from './stores/authStore'
import { useHouseholdStore } from './stores/householdStore'
import { useShoppingStore } from './stores/shoppingStore'
import { useVisualViewportHeight } from './composables/useVisualViewportHeight'

import App from './App.vue'

// Schlüssel des früheren klassischen Aussehens wegräumen (Aussehen-Umschalter,
// Kategorie-Filter). Gelesen werden sie nicht mehr; `data-design` steht fest
// in index.html.
try {
  localStorage.removeItem('putzplan.design')
  localStorage.removeItem('putzplan_active_category')
} catch {
  // localStorage gesperrt — dann liegt dort auch nichts
}

// Visual-Viewport-Höhe global bereitstellen (--visual-viewport-height).
// Das geteilte Modal-Muster bemisst sich daran, damit die Bildschirmtastatur
// den Modal-Footer nicht verdeckt.
useVisualViewportHeight()

const app = createApp(App)

app.use(createPinia())

// Initialize stores after Pinia is ready
const authStore = useAuthStore()
await authStore.initializeAuth()

const householdStore = useHouseholdStore()

// Load household after auth is initialized. Ein Gast hat keinen; den Rahmen
// seiner geteilten Liste setzt die Gastansicht nach dem Einlösen.
if (authStore.user && !authStore.isGuest) {
  await householdStore.loadUserHousehold()
}

// Einkaufs-Store einmalig instanziieren, damit er sich beim Sync-Indikator
// anmeldet, ohne dass die Einkaufsansicht montiert sein muss. Das Setup liest
// nur den localStorage — kein Netzwerkzugriff, keine Realtime-Subscription.
useShoppingStore()

app.use(router)

// Endet die Sitzung von außen (anderer Tab, widerrufenes Token), räumen die
// Stores über `onSessionEnd` auf — aber der Router-Guard läuft nur beim
// Navigieren, die Ansicht bliebe leer stehen. Übernimmt ohne Abmeldung ein
// anderes Konto, braucht es dessen Haushalt, sonst schickte der Guard es zur
// Einrichtung. Eine normale Anmeldung (vorher niemand) erledigt LoginView.
watch(
  () => authStore.user?.id ?? null,
  async (userId, previousUserId) => {
    if (userId === null) {
      const name = router.currentRoute.value.name
      if (name !== 'login' && name !== 'register') await router.replace('/login')
      return
    }
    if (previousUserId !== null) {
      await householdStore.loadUserHousehold()
      // `force`: stand man schon auf `/`, liefe der Guard sonst nicht, und ein
      // Konto ohne Haushalt bliebe vor der leeren Wand statt in der Einrichtung.
      await router.replace({ path: '/', force: true })
    }
  },
)

app.mount('#app')
