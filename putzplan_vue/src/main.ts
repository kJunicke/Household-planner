import 'bootstrap/dist/css/bootstrap.min.css'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import { useAuthStore } from './stores/authStore'
import { useHouseholdStore } from './stores/householdStore'
import { useShoppingStore } from './stores/shoppingStore'
import { useVisualViewportHeight } from './composables/useVisualViewportHeight'

import App from './App.vue'

// Den Schlüssel des früheren Aussehen-Umschalters wegräumen. Gelesen wird er
// nicht mehr; das Attribut steht fest in index.html.
try {
  localStorage.removeItem('putzplan.design')
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

// Load household after auth is initialized
if (authStore.user) {
  const householdStore = useHouseholdStore()
  await householdStore.loadUserHousehold()
}

// Einkaufs-Store einmalig instanziieren, damit er sich beim Sync-Indikator
// anmeldet, ohne dass die Einkaufsansicht montiert sein muss. Das Setup liest
// nur den localStorage — kein Netzwerkzugriff, keine Realtime-Subscription.
useShoppingStore()

app.use(router)
app.mount('#app')
