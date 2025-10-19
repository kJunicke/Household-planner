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
  <div class="container mt-5">
    <div class="row justify-content-center">
      <div class="col-md-8">
        <div class="card">
          <div class="card-body">
            <h2 class="card-title text-center">Haushalt einrichten</h2>

            <!-- Create Household Form -->
            <h4>Neuen Haushalt erstellen</h4>
            <form @submit.prevent="createHousehold">
              Haushalts-Name:
              <input
                type="text"
                v-model="newHouseholdName"
                :disabled="createLoading"
                required
              />
              <div v-if="createError" class="alert alert-danger mt-2">
                {{ createError }}
              </div>
              <button type="submit" :disabled="createLoading">
                <span v-if="createLoading">Erstelle...</span>
                <span v-else>Haushalt erstellen</span>
              </button>
            </form>

            <hr class="my-4">

            <!-- Join Household Form -->
            <h4>Haushalt beitreten</h4>
            <form @submit.prevent="joinHousehold">
              Invite Code:
              <input
                type="text"
                v-model="inviteCode"
                :disabled="joinLoading"
                required
              />
              <div v-if="joinError" class="alert alert-danger mt-2">
                {{ joinError }}
              </div>
              <button type="submit" :disabled="joinLoading">
                <span v-if="joinLoading">Trete bei...</span>
                <span v-else>Beitreten</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
