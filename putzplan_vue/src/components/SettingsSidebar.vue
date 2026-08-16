<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useHouseholdStore } from '../stores/householdStore'
import { MEMBER_COLORS, DEFAULT_MEMBER_COLOR } from '../lib/memberColors'
import { useDesignStore } from '../stores/designStore'
import type { DesignMode } from '../lib/design'
import {
  MIN_WEEKLY_GOAL_POINTS,
  MAX_WEEKLY_GOAL_POINTS
} from '../stores/householdStore'
import { WEEK_DAY_LABELS } from '../lib/weekWindow'
import WeeklyGoalConfirmModal from './WeeklyGoalConfirmModal.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const router = useRouter()
const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const designStore = useDesignStore()

// Aussehen-Auswahl. Gilt nur für dieses Gerät, greift sofort ohne Neuladen.
const designOptions: { value: DesignMode; label: string; hint: string }[] = [
  { value: 'classic', label: 'Klassisch', hint: 'Das gewohnte Aussehen' },
  { value: 'pinnwand', label: 'Pinnwand', hint: 'Kork, Papier und Tinte' },
]

const isEditingName = ref(false)
const newDisplayName = ref('')
const newUserColor = ref('')

const predefinedColors = MEMBER_COLORS

const closeSidebar = () => {
  emit('update:open', false)
}

const codeCopied = ref(false)
const copyInviteCode = async () => {
  const code = householdStore.currentHousehold?.invite_code
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    codeCopied.value = true
    setTimeout(() => { codeCopied.value = false }, 2000)
  } catch {
    // Clipboard API not available (e.g. insecure context) — silently ignore
  }
}

const handleLogout = async () => {
  await authStore.logout()
  closeSidebar()
  router.push('/login')
}

const startEditingName = () => {
  newDisplayName.value = householdStore.getCurrentMemberDisplayName()
  const currentMember = householdStore.householdMembers.find(m => m.user_id === authStore.user?.id)
  newUserColor.value = currentMember?.user_color || DEFAULT_MEMBER_COLOR
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
  return member?.user_color || DEFAULT_MEMBER_COLOR
})

// ---------------------------------------------------------------
// Wochenziel
//
// Bearbeitet wird bewusst hier und nicht in der Statusleiste: die Änderung
// betrifft alle Mitglieder und soll hinter einer Bestätigung liegen.
// ---------------------------------------------------------------
const goalInput = ref<number | null>(null)
const weekStartInput = ref<number>(1)
const showGoalConfirm = ref(false)
const savingGoal = ref(false)

const weekDayOptions = WEEK_DAY_LABELS.map((label, value) => ({ value, label }))

/** Die Eingabefelder mit dem aktuellen Stand des Haushalts füllen. */
const resetGoalForm = () => {
  goalInput.value = householdStore.weeklyGoalPoints
  weekStartInput.value = householdStore.selectedWeekStartDay
}

const goalError = computed(() => {
  const value = goalInput.value
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'Bitte eine Punktzahl eintragen'
  }
  if (!Number.isInteger(value)) return 'Nur ganze Punkte'
  if (value < MIN_WEEKLY_GOAL_POINTS || value > MAX_WEEKLY_GOAL_POINTS) {
    return `Zwischen ${MIN_WEEKLY_GOAL_POINTS} und ${MAX_WEEKLY_GOAL_POINTS} Punkten`
  }
  return null
})

const goalDirty = computed(() =>
  goalInput.value !== householdStore.weeklyGoalPoints ||
  weekStartInput.value !== householdStore.selectedWeekStartDay
)

const canSaveGoal = computed(() => !goalError.value && goalDirty.value && !savingGoal.value)

/** Tag, ab dem ein geänderter Wochenstart greift — Text der Bestätigung. */
const goalEffectiveFrom = computed(() =>
  householdStore.weekStartEffectiveFrom(weekStartInput.value)
)

const openGoalConfirm = () => {
  if (!canSaveGoal.value) return
  showGoalConfirm.value = true
}

const confirmGoalChange = async () => {
  if (goalError.value || goalInput.value === null) return
  savingGoal.value = true
  const result = await householdStore.updateWeeklyGoalSettings(
    goalInput.value,
    weekStartInput.value
  )
  savingGoal.value = false
  showGoalConfirm.value = false
  if (!result.success) resetGoalForm()
}

// Beim Öffnen den Stand frisch übernehmen — ein anderes Mitglied kann
// zwischenzeitlich geändert haben. `refreshHousehold()` ist der Rückfallweg,
// falls der Broadcast der Gegenseite verpasst wurde.
watch(() => props.open, async (isOpen) => {
  if (!isOpen) {
    showGoalConfirm.value = false
    return
  }
  resetGoalForm()
  await householdStore.refreshHousehold()
  resetGoalForm()
}, { immediate: true })

// Ändert ein anderes Mitglied den Wert, während die Sidebar offen ist und
// nichts Eigenes angefangen wurde, zieht das Formular nach.
watch(
  () => [householdStore.weeklyGoalPoints, householdStore.selectedWeekStartDay],
  ([newGoal, newDay], [oldGoal, oldDay]) => {
    // Verglichen wird gegen den **vorherigen** Stand: nur wer nichts Eigenes
    // eingetippt hatte, bekommt den fremden Wert untergeschoben.
    if (goalInput.value === oldGoal && weekStartInput.value === oldDay) {
      goalInput.value = newGoal
      weekStartInput.value = newDay
    }
  }
)

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
  <!-- Teleport to body so the sidebar escapes the sticky header's stacking
       context; otherwise root-level fixed elements (FABs) paint over it. -->
  <Teleport to="body">
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
            <span class="info-value-row">
              <span class="info-value mono">{{ householdStore.currentHousehold?.invite_code }}</span>
              <button
                class="copy-btn"
                @click="copyInviteCode"
                :title="codeCopied ? 'Kopiert!' : 'Code kopieren'"
              >
                <i :class="codeCopied ? 'bi bi-check-lg' : 'bi bi-clipboard'"></i>
              </button>
            </span>
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
                :style="{ backgroundColor: member.user_color || DEFAULT_MEMBER_COLOR }"
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
              <i class="bi bi-pencil"></i> Profil bearbeiten
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
              <button @click="saveDisplayName" class="btn btn-primary btn-sm flex-1">
                <i class="bi bi-check-lg"></i> Speichern
              </button>
              <button @click="cancelEditingName" class="btn btn-secondary btn-sm flex-1">
                <i class="bi bi-x-lg"></i> Abbrechen
              </button>
            </div>
          </div>
        </section>

        <!-- Wochenziel Section -->
        <section v-if="householdStore.currentHousehold" class="sidebar-section">
          <h3>Wochenziel</h3>

          <div class="goal-field">
            <label for="weekly-goal-points" class="goal-label">Punkte pro Woche</label>
            <input
              id="weekly-goal-points"
              v-model.number="goalInput"
              type="number"
              inputmode="numeric"
              class="form-control goal-input"
              :min="MIN_WEEKLY_GOAL_POINTS"
              :max="MAX_WEEKLY_GOAL_POINTS"
              step="1"
            />
            <p v-if="goalError" class="goal-error">{{ goalError }}</p>
            <p v-else class="goal-hint">
              Aktuell {{ householdStore.weeklyTotalPoints }} von
              {{ householdStore.weeklyGoalPoints }} Punkten in dieser Woche.
            </p>
          </div>

          <div class="goal-field">
            <label for="week-start-day" class="goal-label">Woche beginnt am</label>
            <select
              id="week-start-day"
              v-model.number="weekStartInput"
              class="form-select goal-input"
            >
              <option v-for="day in weekDayOptions" :key="day.value" :value="day.value">
                {{ day.label }}
              </option>
            </select>
            <p class="goal-hint">Ein neuer Wochenstart greift erst ab der nächsten Woche.</p>
          </div>

          <button
            type="button"
            class="btn btn-primary w-100 goal-save"
            :disabled="!canSaveGoal"
            @click="openGoalConfirm"
          >
            <i class="bi bi-check-lg"></i> Wochenziel speichern
          </button>
        </section>

        <!-- Aussehen Section -->
        <section class="sidebar-section">
          <h3>Aussehen</h3>
          <div class="design-options">
            <button
              v-for="option in designOptions"
              :key="option.value"
              type="button"
              class="design-option"
              :class="{ selected: designStore.design === option.value }"
              @click="designStore.setDesign(option.value)"
            >
              <span class="design-swatch" :class="`swatch-${option.value}`" />
              <span class="design-text">
                <span class="design-label">{{ option.label }}</span>
                <span class="design-hint">{{ option.hint }}</span>
              </span>
              <i
                v-if="designStore.design === option.value"
                class="bi bi-check-lg design-check"
              ></i>
            </button>
          </div>
          <p class="design-note">Gilt nur für dieses Gerät.</p>
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

  <WeeklyGoalConfirmModal
    v-if="showGoalConfirm && goalInput !== null"
    :current-goal-points="householdStore.weeklyGoalPoints"
    :current-week-start-day="householdStore.selectedWeekStartDay"
    :current-week-start="householdStore.currentWeekStart()"
    :new-goal-points="goalInput"
    :new-week-start-day="weekStartInput"
    :current-points="householdStore.weeklyTotalPoints"
    :effective-from="goalEffectiveFrom"
    @close="showGoalConfirm = false"
    @confirm="confirmGoalChange"
  />
  </Teleport>
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

.info-value-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.copy-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-background);
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

/* Wochenziel */
.goal-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: var(--spacing-md);
}

.goal-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0;
}

.goal-input {
  min-height: var(--touch-target-min);
}

.goal-hint,
.goal-error {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.goal-error {
  color: var(--color-danger);
}

.goal-save {
  min-height: var(--touch-target-min);
}

/* Aussehen */
.design-options {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.design-option {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  min-height: var(--touch-target-min);
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: left;
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-base);
}

.design-option:hover {
  border-color: var(--color-border-hover);
}

.design-option.selected {
  border-color: var(--color-primary);
  background: var(--color-background-elevated);
}

.design-swatch {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.swatch-classic {
  background: linear-gradient(135deg, #ffffff 0 50%, #4f46e5 50% 100%);
}

.swatch-pinnwand {
  background: linear-gradient(135deg, #e7dcc8 0 50%, #fffdf6 50% 100%);
  border-color: #241f1a;
}

.design-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
}

.design-label {
  font-size: 0.9375rem;
  font-weight: 600;
}

.design-hint {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.design-check {
  color: var(--color-primary);
  font-size: 1.125rem;
  flex-shrink: 0;
}

.design-note {
  margin: var(--spacing-sm) 0 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
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
