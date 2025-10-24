<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useHouseholdStore } from '../stores/householdStore'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const householdStore = useHouseholdStore()

const isEditingName = ref(false)
const newDisplayName = ref('')

const handleLogout = async () => {
  await authStore.logout()
  router.push('/login')
}

const startEditingName = () => {
  newDisplayName.value = householdStore.getCurrentMemberDisplayName()
  isEditingName.value = true
}

const saveDisplayName = async () => {
  if (!newDisplayName.value.trim()) {
    return
  }

  const result = await householdStore.updateMemberDisplayName(newDisplayName.value.trim())
  if (result.success) {
    isEditingName.value = false
  }
}

const cancelEditingName = () => {
  isEditingName.value = false
  newDisplayName.value = ''
}

const currentMemberName = computed(() => {
  return householdStore.getCurrentMemberDisplayName()
})
</script>

<template>
  <header class="app-header">
    <div class="container-fluid">
      <div class="row align-items-center">
        <div class="col-lg-3 col-md-12 mb-3 mb-lg-0">
          <div class="info-badge">
            <strong>Haushalt:</strong> {{ householdStore.currentHousehold?.name }}
          </div>
          <div class="info-badge mt-2">
            <strong>Code:</strong> {{ householdStore.currentHousehold?.invite_code }}
          </div>
          <div class="info-badge mt-2">
            <strong>Mitglieder:</strong>
            <span v-if="householdStore.householdMembers.length > 0">
              {{ householdStore.householdMembers.map(m => m.display_name || 'Unbekannt').join(', ') }}
            </span>
            <span v-else class="text-muted">Keine Mitglieder</span>
          </div>
        </div>
        <div class="col-lg-6 col-md-12 mb-3 mb-lg-0">
          <h1 class="page-title">Bester Putzplan der Welt</h1>

          <!-- Navigation Tabs -->
          <nav class="nav-tabs-container">
            <router-link to="/" class="nav-tab" :class="{ active: route.path === '/' }">
              <i class="bi bi-list-check"></i> Putzen
            </router-link>
            <router-link to="/history" class="nav-tab" :class="{ active: route.path === '/history' }">
              <i class="bi bi-clock-history"></i> Verlauf
            </router-link>
          </nav>
        </div>
        <div class="col-lg-3 col-md-12 text-lg-end">
          <div class="user-info">
            <div v-if="!isEditingName" class="d-flex align-items-center gap-3 justify-content-end">
              <div class="user-details">
                <div class="user-name">{{ currentMemberName }}</div>
                <div class="user-email-small">{{ authStore.user?.email }}</div>
              </div>
              <button @click="startEditingName" class="btn btn-light border settings-btn btn-sm" title="Namen bearbeiten">
                <i class="bi bi-gear-fill fs-5"></i>
              </button>
              <button @click="handleLogout" class="btn btn-danger btn-sm">
                Logout
              </button>
            </div>
            <div v-else class="d-flex align-items-center gap-2 justify-content-end">
              <input
                v-model="newDisplayName"
                type="text"
                class="form-control form-control-sm"
                placeholder="Dein Name"
                @keyup.enter="saveDisplayName"
                @keyup.escape="cancelEditingName"
                style="max-width: 150px;"
              />
              <button @click="saveDisplayName" class="btn btn-success btn-sm">
                <i class="bi bi-check-lg"></i>
              </button>
              <button @click="cancelEditingName" class="btn btn-secondary btn-sm">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  background: var(--color-background-elevated);
  border-bottom: 1px solid var(--color-border);
  padding: var(--spacing-lg) 0;
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--spacing-xl);
}

.page-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 1rem 0;
  text-align: center;
}

.nav-tabs-container {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.nav-tab {
  padding: 0.5rem 1.5rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-tab:hover {
  background: var(--color-background-elevated);
  color: var(--color-text-primary);
}

.nav-tab.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.nav-tab i {
  font-size: 1.1rem;
}

.info-badge {
  display: inline-block;
  background: var(--color-background);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.info-badge strong {
  color: var(--color-text-primary);
  margin-right: 0.25rem;
}

.user-info {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.user-details {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.user-name {
  font-size: 0.9375rem;
  color: var(--color-text-primary);
  font-weight: 600;
}

.user-email-small {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.settings-btn {
  padding: 0.5rem 0.75rem;
}

.settings-btn i {
  color: #6c757d;
}

.settings-btn:hover i {
  color: #495057;
}
</style>
