import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import { useAuthStore } from './stores/authStore'

import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Auth State beim App-Start laden
const authStore = useAuthStore()
authStore.initializeAuth()

app.mount('#app')
