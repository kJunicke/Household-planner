<script setup lang="ts">
import { ref } from 'vue'
import { useHouseholdStore } from '@/stores/householdStore'
import { useRouter } from 'vue-router'

const householdStore = useHouseholdStore()
const router = useRouter()

// Create Household Form
const newHouseholdName = ref('')

// Error Handling: Speichert Fehlermeldung als String
// - Leer ('') = kein Error → v-if="createError" ist false, Alert versteckt
// - Mit Text = Error vorhanden → v-if="createError" ist true, Alert sichtbar
// YAGNI: Eine Variable statt zwei (showError boolean + errorMessage string)
const createError = ref('')

// Loading State: Während API-Call true
// - Button wird disabled → User kann nicht mehrfach submitten
// - Button-Text ändert sich zu "Erstelle..." → visuelles Feedback
const createLoading = ref(false)

const createHousehold = async () => {
  // Validation: Prüfen ob Name eingegeben wurde
  if (!newHouseholdName.value.trim()) {
    createError.value = 'Bitte gib einen Namen ein'
    return
  }

  // Error zurücksetzen (falls vorheriger Versuch fehlgeschlagen war)
  createError.value = ''
  // Loading State aktivieren
  createLoading.value = true

  try {
    await householdStore.createHousehold(newHouseholdName.value)
    // Success: Redirect zur HomeView
    router.push('/')
  } catch (error) {
    // Error: Zeige Fehlermeldung im UI (nicht console.log!)
    createError.value = 'Fehler beim Erstellen des Haushalts'
    console.error(error) // Zusätzlich für Developer-Debugging
  } finally {
    // Loading State deaktivieren (egal ob success oder error)
    createLoading.value = false
  }
}

// Join Household Form
const inviteCode = ref('')

// Gleiche Pattern wie createError: String enthält Fehlermeldung ODER ist leer
const joinError = ref('')
const joinLoading = ref(false)

const joinHousehold = async () => {
  // Validation: Prüfen ob Invite Code eingegeben wurde
  if (!inviteCode.value.trim()) {
    joinError.value = 'Bitte gib einen Invite Code ein'
    return
  }

  joinError.value = ''
  joinLoading.value = true

  try {
    const success = await householdStore.joinHousehold(inviteCode.value)
    if (success) {
      router.push('/')
    } else {
      // householdStore.joinHousehold() gibt false zurück wenn Code ungültig
      joinError.value = 'Ungültiger Invite Code'
    }
  } catch (error) {
    // Netzwerk-Error oder anderer unerwarteter Fehler
    joinError.value = 'Fehler beim Beitreten'
    console.error(error)
  } finally {
    joinLoading.value = false
  }
}
</script>

<template>
  <div class="auth-container">
    <div class="auth-wrapper" style="max-width: 540px;">
      <div class="auth-card">
        <div class="card-body">
          <h2 class="auth-title">Haushalt einrichten</h2>
          <p class="auth-subtitle">Erstelle einen neuen Haushalt oder trete einem bestehenden bei.</p>

          <!-- Create Household Form -->
          <section class="setup-section">
            <h4 class="section-title">Neuen Haushalt erstellen</h4>
            <form @submit.prevent="createHousehold" class="auth-form">
              <div class="form-group">
                <label class="form-label">Haushalts-Name</label>
                <input
                  type="text"
                  v-model="newHouseholdName"
                  class="form-control"
                  placeholder="z.B. WG Musterstraße"
                  :disabled="createLoading"
                  required
                />
              </div>
              <div v-if="createError" class="alert alert-danger">
                {{ createError }}
              </div>
              <button type="submit" class="btn btn-primary w-100" :disabled="createLoading">
                <span v-if="createLoading">Erstelle...</span>
                <span v-else>Haushalt erstellen</span>
              </button>
            </form>
          </section>

          <div class="divider">
            <span class="divider-text">oder</span>
          </div>

          <!-- Join Household Form -->
          <section class="setup-section">
            <h4 class="section-title">Haushalt beitreten</h4>
            <form @submit.prevent="joinHousehold" class="auth-form">
              <div class="form-group">
                <label class="form-label">Einladungs-Code</label>
                <input
                  type="text"
                  v-model="inviteCode"
                  class="form-control"
                  placeholder="Code eingeben"
                  :disabled="joinLoading"
                  required
                />
              </div>
              <div v-if="joinError" class="alert alert-danger">
                {{ joinError }}
              </div>
              <button type="submit" class="btn btn-success w-100" :disabled="joinLoading">
                <span v-if="joinLoading">Trete bei...</span>
                <span v-else>Beitreten</span>
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-section {
  margin-bottom: var(--spacing-xl);
}

.section-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-lg);
}

.divider {
  position: relative;
  text-align: center;
  margin: var(--spacing-xl) 0;
}

.divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--color-border);
}

.divider-text {
  position: relative;
  display: inline-block;
  background: var(--color-background-elevated);
  padding: 0 var(--spacing-md);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
