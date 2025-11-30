<script setup lang="ts">
import {useAuthStore} from "@/stores/authStore"
import { ref } from "vue"
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

const handleRegister = async () => {
    errorMessage.value = ''
    isLoading.value = true

    const result = await authStore.register(email.value, password.value)

    isLoading.value = false

    if (result.success) {
        router.push('/login')
    } else {
        errorMessage.value = result.error || 'Registrierung fehlgeschlagen'
    }
}
</script>

<template>
    <div class="auth-container">
      <div class="auth-wrapper">
        <div class="auth-card">
          <div class="card-body">
            <h1 class="auth-title">Registrierung</h1>
            <p class="auth-subtitle">Erstelle einen Account, um loszulegen.</p>

            <!-- Error Alert -->
            <div v-if="errorMessage" class="alert alert-danger" role="alert">
              {{ errorMessage }}
            </div>

            <form @submit.prevent="handleRegister" class="auth-form">
              <div class="form-group">
                <label class="form-label">E-Mail</label>
                <input
                  type="email"
                  v-model="email"
                  class="form-control"
                  placeholder="deine@email.de"
                  required
                  :disabled="isLoading"
                />
              </div>

              <div class="form-group">
                <label class="form-label">Passwort</label>
                <input
                  type="password"
                  v-model="password"
                  class="form-control"
                  placeholder="••••••••"
                  required
                  :disabled="isLoading"
                />
              </div>

              <button type="submit" class="btn btn-primary w-100" :disabled="isLoading">
                <span v-if="isLoading">Lädt...</span>
                <span v-else>Registrieren</span>
              </button>
            </form>

            <div class="auth-footer">
              <p>
                Schon einen Account?
                <router-link to="/login" class="auth-link">
                  Hier anmelden
                </router-link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>