import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import { useAuthStore } from './stores/authStore'
import { useHouseholdStore } from './stores/householdStore'
import { useShoppingStore } from './stores/shoppingStore'
import { useVisualViewportHeight } from './composables/useVisualViewportHeight'
import { initializeDesign } from './lib/design'

import App from './App.vue'

// Das Attribut ist zu diesem Zeitpunkt schon vom Inline-Script im <head> von
// index.html gesetzt (dort, weil das gebaute CSS render-blockierend ist und
// dieses Modul deferred läuft). Der Aufruf hier normalisiert nur noch: ein
// kaputter localStorage-Wert wird auf 'classic' zurückgesetzt.
initializeDesign()

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
