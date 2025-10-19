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
    <div class="register-container">
      <div class="register-wrapper">
        <div class="register-card">
          <div class="card-body">
            <h2 class="auth-title">Registrierung</h2>
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

  <style scoped>
  .register-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background);
    padding: var(--spacing-lg);
  }

  .register-wrapper {
    width: 100%;
    max-width: 440px;
  }

  .register-card {
    background: var(--color-background-elevated);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
    border: 1px solid var(--color-border);
  }

  .auth-title {
    font-size: 1.875rem;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-xs);
    text-align: center;
  }

  .auth-subtitle {
    color: var(--color-text-secondary);
    text-align: center;
    margin-bottom: var(--spacing-xl);
    font-size: 0.9375rem;
  }

  .auth-form {
    margin-bottom: var(--spacing-lg);
  }

  .form-group {
    margin-bottom: var(--spacing-lg);
  }

  .auth-footer {
    text-align: center;
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  .auth-footer p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.9375rem;
  }

  .auth-link {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
    transition: color var(--transition-base);
  }

  .auth-link:hover {
    color: var(--color-primary-light);
    text-decoration: underline;
  }
  </style>