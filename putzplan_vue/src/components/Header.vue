<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { useHouseholdStore } from '../stores/householdStore'
import SettingsSidebar from './SettingsSidebar.vue'
import BrandLogo from './BrandLogo.vue'
import SyncIndicator from './SyncIndicator.vue'
import { useElementHeightVar } from '../composables/useElementHeightVar'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()

const sidebarOpen = ref(false)

// Der Header meldet seine eigene Höhe global; Toasts und Sync-Indikator hängen
// sich daran, ein fester Pixelwert wäre auf Desktop und bei umbrechender
// Rangliste falsch.
const headerEl = ref<HTMLElement | null>(null)
useElementHeightVar(headerEl, '--app-header-height')

const currentMemberColor = computed(() => {
  const member = householdStore.householdMembers.find(m => m.user_id === authStore.user?.id)
  return member?.user_color || '#4A90E2'
})

onMounted(async () => {
  await householdStore.loadWeeklyCompletions()
})
</script>

<template>
  <header ref="headerEl" class="app-header">
    <!-- Compact Header Bar -->
    <div class="header-bar">
      <BrandLogo size="sm" />

      <!-- Wochen-Rangliste: alle Haushaltsmitglieder, eigener Eintrag hervorgehoben -->
      <div v-if="householdStore.weeklyRanking.length > 0" class="points-display">
        <div
          v-for="entry in householdStore.weeklyRanking"
          :key="entry.userId"
          class="rank-item"
          :class="{ 'current-user': entry.isCurrentUser }"
        >
          <span class="rank-position">{{ entry.rank }}.</span>
          <span class="rank-color-dot" :style="{ backgroundColor: entry.color }"></span>
          <span class="rank-name">{{ entry.name }}</span>
          <span class="rank-points">{{ entry.points }}</span>
        </div>
      </div>

      <!-- Empty state: Mitglieder noch nicht geladen -->
      <div v-else class="points-display points-empty">
        <i class="bi bi-trophy"></i>
        <span class="empty-hint">Diese Woche: {{ householdStore.currentUserWeeklyPoints }} Pkt</span>
      </div>

      <div class="header-actions">
        <SyncIndicator />
        <button
          class="user-avatar"
          :style="{ backgroundColor: currentMemberColor }"
          :title="'Einstellungen · Deine Farbe: ' + currentMemberColor"
          aria-label="Einstellungen öffnen"
          @click="sidebarOpen = true"
        />
      </div>
    </div>

    <!-- Settings Sidebar -->
    <SettingsSidebar v-model:open="sidebarOpen" />
  </header>
</template>

<style scoped>
.app-header {
  background: var(--color-background-elevated);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 0;
  z-index: 100;
}

/* Compact Header Bar */
.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  gap: 0.75rem;
}

/* Weekly Points Display */
/* Auf zwei Mitglieder optimiert. Mehr Mitglieder sollen lediglich nicht
   zerbrechen: die Einträge umbrechen dann in eine zweite Zeile. */
.points-display {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  flex-shrink: 1;
  min-width: 0;
}

/* Empty state when there are no completions this week */
.points-empty {
  gap: 0.375rem;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}

.points-empty i {
  color: var(--color-warning);
  font-size: 0.9rem;
}

.points-empty .empty-hint {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
  min-width: 0;
}

/* Eigener Eintrag bleibt hervorgehoben */
.rank-item.current-user {
  background: rgba(79, 70, 229, 0.1);
  outline: 1px solid rgba(79, 70, 229, 0.25);
}

.rank-position {
  font-weight: 700;
  color: var(--color-text-secondary);
  font-size: 0.7rem;
}

.rank-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.rank-name {
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 4rem;
}

.rank-item.current-user .rank-name {
  color: var(--color-primary);
  font-weight: 700;
}

.rank-points {
  font-weight: 700;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
  background: var(--color-primary);
}

.user-avatar:hover {
  transform: scale(1.05);
  border-color: var(--color-text-primary);
}

/* Desktop: slightly larger */
@media (min-width: 768px) {
  .header-bar {
    padding: 1rem 1.5rem;
  }
}
</style>
