<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useHouseholdStore } from '../stores/householdStore'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const router = useRouter()
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

const closeSidebar = () => {
  emit('update:open', false)
}

const handleLogout = async () => {
  await authStore.logout()
  closeSidebar()
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

// Close on ESC key
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSidebar()
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }
})
</script>

<template>
  <!-- Backdrop Overlay -->
  <Transition name="backdrop">
    <div
      v-if="open"
      class="sidebar-backdrop"
      @click="closeSidebar"
    />
  </Transition>

  <!-- Sidebar -->
  <Transition name="slide">
    <aside v-if="open" class="settings-sidebar">
      <!-- Header -->
      <div class="sidebar-header">
        <h2>Einstellungen</h2>
        <button @click="closeSidebar" class="close-btn" aria-label="Schließen">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <!-- Content -->
      <div class="sidebar-content">
        <!-- Haushalt Info Section -->
        <section class="sidebar-section">
          <h3>Haushalt</h3>
          <div class="info-item">
            <span class="info-label">Name:</span>
            <span class="info-value">{{ householdStore.currentHousehold?.name }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Einladungs-Code:</span>
            <span class="info-value mono">{{ householdStore.currentHousehold?.invite_code }}</span>
          </div>
        </section>

        <!-- Mitglieder Section -->
        <section class="sidebar-section">
          <h3>Mitglieder</h3>
          <div v-if="householdStore.householdMembers.length > 0" class="members-list">
            <div
              v-for="member in householdStore.householdMembers"
              :key="member.user_id"
              class="member-item"
            >
              <div
                class="member-color"
                :style="{ backgroundColor: member.user_color || '#4A90E2' }"
              />
              <span class="member-name">{{ member.display_name || 'Unbekannt' }}</span>
            </div>
          </div>
          <div v-else class="text-muted">Keine Mitglieder</div>
        </section>

        <!-- Profil Section -->
        <section class="sidebar-section">
          <h3>Dein Profil</h3>

          <div v-if="!isEditingName" class="profile-view">
            <div class="profile-info">
              <div
                class="profile-color-large"
                :style="{ backgroundColor: currentMemberColor }"
              />
              <div class="profile-details">
                <div class="profile-name">{{ currentMemberName }}</div>
                <div class="profile-email">{{ authStore.user?.email }}</div>
              </div>
            </div>
            <button @click="startEditingName" class="btn btn-outline-primary btn-sm w-100">
              <i class="bi bi-pencil-fill"></i> Profil bearbeiten
            </button>
          </div>

          <div v-else class="profile-edit">
            <input
              v-model="newDisplayName"
              type="text"
              class="form-control mb-3"
              placeholder="Dein Name"
              @keyup.enter="saveDisplayName"
              @keyup.escape="cancelEditingName"
            />

            <div class="color-picker-section mb-3">
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

            <div class="d-flex gap-2">
              <button @click="saveDisplayName" class="btn btn-success btn-sm flex-1">
                <i class="bi bi-check-lg"></i> Speichern
              </button>
              <button @click="cancelEditingName" class="btn btn-secondary btn-sm flex-1">
                <i class="bi bi-x-lg"></i> Abbrechen
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- Footer with Logout -->
      <div class="sidebar-footer">
        <button @click="handleLogout" class="btn btn-danger w-100">
          <i class="bi bi-box-arrow-right"></i> Logout
        </button>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
/* Backdrop */
.sidebar-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1040;
  backdrop-filter: blur(2px);
}

.backdrop-enter-active,
.backdrop-leave-active {
  transition: opacity 0.3s ease;
}

.backdrop-enter-from,
.backdrop-leave-to {
  opacity: 0;
}

/* Sidebar */
.settings-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-width: 380px;
  background: var(--color-background-elevated);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
  z-index: 1050;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 480px) {
  .settings-sidebar {
    max-width: 100%;
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

/* Sidebar Header */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background);
}

.sidebar-header h2 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  color: var(--color-text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
  transition: color 0.2s ease;
}

.close-btn:hover {
  color: var(--color-text-primary);
}

/* Sidebar Content */
.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
}

.sidebar-section {
  margin-bottom: var(--spacing-xl);
}

.sidebar-section:last-child {
  margin-bottom: 0;
}

.sidebar-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
}

/* Info Items */
.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--color-border);
}

.info-item:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.info-value {
  font-size: 0.9375rem;
  color: var(--color-text-primary);
  font-weight: 500;
}

.info-value.mono {
  font-family: 'Courier New', monospace;
  letter-spacing: 0.05em;
}

/* Members List */
.members-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.member-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--color-background);
  border-radius: var(--radius-md);
}

.member-color {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  flex-shrink: 0;
}

.member-name {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

/* Profile View */
.profile-view {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.profile-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-background);
  border-radius: var(--radius-md);
}

.profile-color-large {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 3px solid var(--color-border);
  flex-shrink: 0;
}

.profile-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.profile-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.profile-email {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

/* Profile Edit */
.profile-edit {
  display: flex;
  flex-direction: column;
}

.color-picker-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
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
  gap: var(--spacing-sm);
}

.color-option {
  width: 40px;
  height: 40px;
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
  box-shadow: 0 0 0 2px var(--color-background-elevated), 0 0 0 4px var(--color-primary);
  transform: scale(1.1);
}

/* Sidebar Footer */
.sidebar-footer {
  padding: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
  background: var(--color-background);
}

/* Utilities */
.text-muted {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.flex-1 {
  flex: 1;
}
</style>
