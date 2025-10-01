import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import { useAuthStore } from './stores/authStore'
import { useHouseholdStore } from './stores/householdStore'

import App from './App.vue'

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

app.use(router)
app.mount('#app')
