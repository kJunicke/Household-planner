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
const newUserColor = ref('')

const predefinedColors = [
  '#4A90E2', // Blue
  '#E74C3C', // Red
  '#2ECC71', // Green
  '#F39C12', // Orange
  '#9B59B6', // Purple
  '#1ABC9C', // Turquoise
  '#E67E22', // Dark Orange
  '#34495E', // Dark Gray
  '#3498DB', // Light Blue
  '#E91E63', // Pink
  '#16A085', // Dark Turquoise
  '#C0392B', // Dark Red
]

const handleLogout = async () => {
  await authStore.logout()
  router.push('/login')
}

const startEditingName = () => {
  newDisplayName.value = householdStore.getCurrentMemberDisplayName()
  const currentMember = householdStore.householdMembers.find(m => m.user_id === authStore.user?.id)
  newUserColor.value = currentMember?.user_color || '#4A90E2'
  isEditingName.value = true
}

const saveDisplayName = async () => {
  if (!newDisplayName.value.trim()) {
    return
  }

  const result = await householdStore.updateMemberProfile(
    newDisplayName.value.trim(),
    newUserColor.value
  )
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

const currentMemberColor = computed(() => {
  const member = householdStore.householdMembers.find(m => m.user_id === authStore.user?.id)
  return member?.user_color || '#4A90E2'
})
</script>

<template>
  <header class="app-header">
    <div class="container-fluid">
      <!-- Top section: Info, Title, User -->
      <div class="row align-items-start mb-3">
        <div class="col-md-3 col-12 mb-2 mb-md-0">
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
        <div class="col-md-6 col-12 mb-2 mb-md-0 text-center">
          <h1 class="page-title">Bester Putzplan der Welt</h1>
        </div>
        <div class="col-md-3 col-12 text-md-end">
          <div class="user-info">
            <div v-if="!isEditingName" class="d-flex align-items-center gap-2 justify-content-md-end justify-content-center">
              <div class="user-color-indicator" :style="{ backgroundColor: currentMemberColor }" :title="'Deine Farbe: ' + currentMemberColor"></div>
              <div class="user-details">
                <div class="user-name">{{ currentMemberName }}</div>
                <div class="user-email-small">{{ authStore.user?.email }}</div>
              </div>
              <button @click="startEditingName" class="btn btn-light border settings-btn btn-sm" title="Profil bearbeiten">
                <i class="bi bi-gear-fill fs-5"></i>
              </button>
              <button @click="handleLogout" class="btn btn-danger btn-sm">
                Logout
              </button>
            </div>
            <div v-else class="edit-profile-container">
              <div class="d-flex flex-column gap-2 mb-2">
                <input
                  v-model="newDisplayName"
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Dein Name"
                  @keyup.enter="saveDisplayName"
                  @keyup.escape="cancelEditingName"
                />
                <div class="color-picker-section">
                  <label class="color-label">Deine Farbe:</label>
                  <div class="color-grid">
                    <button
                      v-for="color in predefinedColors"
                      :key="color"
                      type="button"
                      class="color-option"
                      :class="{ selected: newUserColor === color }"
                      :style="{ backgroundColor: color }"
                      @click="newUserColor = color"
                      :title="color"
                    />
                  </div>
                </div>
              </div>
              <div class="d-flex align-items-center gap-2 justify-content-center">
                <button @click="saveDisplayName" class="btn btn-success btn-sm">
                  <i class="bi bi-check-lg"></i> Speichern
                </button>
                <button @click="cancelEditingName" class="btn btn-secondary btn-sm">
                  <i class="bi bi-x-lg"></i> Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs - Full width at bottom of header -->
    <nav class="nav-tabs-container">
      <div class="container-fluid">
        <div class="nav-tabs-wrapper">
          <router-link to="/" class="nav-tab" :class="{ active: route.path === '/' }">
            <i class="bi bi-list-check"></i> Putzen
          </router-link>
          <router-link to="/history" class="nav-tab" :class="{ active: route.path === '/history' }">
            <i class="bi bi-clock-history"></i> Verlauf
          </router-link>
          <router-link to="/stats" class="nav-tab" :class="{ active: route.path === '/stats' }">
            <i class="bi bi-pie-chart"></i> Stats
          </router-link>
        </div>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.app-header {
  background: var(--color-background-elevated);
  border-bottom: 1px solid var(--color-border);
  padding: var(--spacing-lg) 0 0 0;
  box-shadow: var(--shadow-sm);
  margin-bottom: 0;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
}

/* Mobile first: page title smaller */
@media (min-width: 768px) {
  .page-title {
    font-size: 1.75rem;
  }
}

/* Navigation Tabs Container - full width at bottom */
.nav-tabs-container {
  background: var(--color-background-elevated);
  border-top: 1px solid var(--color-border);
  margin-top: 0;
}

.nav-tabs-wrapper {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--color-border);
}

.nav-tab {
  flex: 1;
  padding: 0.75rem 1rem;
  background: var(--color-background);
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-align: center;
}

/* Mobile: smaller font, adjust padding */
@media (max-width: 767px) {
  .nav-tab {
    padding: 0.625rem 0.5rem;
    font-size: 0.875rem;
  }

  .nav-tab i {
    font-size: 1rem;
  }
}

.nav-tab:hover {
  background: var(--color-background-elevated);
  color: var(--color-text-primary);
}

.nav-tab.active {
  background: white;
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}

.nav-tab i {
  font-size: 1.1rem;
}

.info-badge {
  display: inline-block;
  background: var(--color-background);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

@media (min-width: 768px) {
  .info-badge {
    padding: var(--spacing-xs) var(--spacing-md);
    font-size: 0.875rem;
  }
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

/* Mobile: center user details */
@media (max-width: 767px) {
  .user-details {
    align-items: center;
  }
}

.user-name {
  font-size: 0.875rem;
  color: var(--color-text-primary);
  font-weight: 600;
}

@media (min-width: 768px) {
  .user-name {
    font-size: 0.9375rem;
  }
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

.user-color-indicator {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  flex-shrink: 0;
}

.edit-profile-container {
  background: var(--color-background);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  min-width: 280px;
}

.color-picker-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.color-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.5rem;
}

.color-option {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
}

.color-option:hover {
  transform: scale(1.1);
  border-color: var(--color-text-primary);
}

.color-option.selected {
  border: 3px solid var(--color-text-primary);
  box-shadow: 0 0 0 2px var(--color-background), 0 0 0 4px var(--color-primary);
  transform: scale(1.1);
}
</style>
