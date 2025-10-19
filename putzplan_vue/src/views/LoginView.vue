<script setup lang="ts">
import {useAuthStore} from "@/stores/authStore"
import {useHouseholdStore} from "@/stores/householdStore"
import { ref } from "vue"
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

const handleLogin = async () => {
    errorMessage.value = ''
    isLoading.value = true

    const result = await authStore.login(email.value, password.value)

    isLoading.value = false

    if (result.success) {
        // Load household after successful login (prevents race condition with router guard)
        await householdStore.loadUserHousehold()
        router.push('/')
    } else {
        errorMessage.value = result.error || 'Login fehlgeschlagen'
    }
}
</script>

<template>
    <div class="login-container">
      <div class="login-wrapper">
        <div class="login-card">
          <div class="card-body">
            <h2 class="auth-title">Login</h2>
            <p class="auth-subtitle">Willkommen zurück! Melde dich an, um fortzufahren.</p>

            <!-- Error Alert -->
            <div v-if="errorMessage" class="alert alert-danger" role="alert">
              {{ errorMessage }}
            </div>

            <form @submit.prevent="handleLogin" class="auth-form">
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
                <span v-else>Anmelden</span>
              </button>
            </form>

            <div class="auth-footer">
              <p>
                Noch kein Account?
                <router-link to="/register" class="auth-link">
                  Hier registrieren
                </router-link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>

  <style scoped>
  .login-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background);
    padding: var(--spacing-lg);
  }

  .login-wrapper {
    width: 100%;
    max-width: 440px;
  }

  .login-card {
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