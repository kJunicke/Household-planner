<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { useHouseholdStore } from '../stores/householdStore'
import SettingsSidebar from './SettingsSidebar.vue'
import BrandLogo from './BrandLogo.vue'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()

const sidebarOpen = ref(false)

const currentMemberColor = computed(() => {
  const member = householdStore.householdMembers.find(m => m.user_id === authStore.user?.id)
  return member?.user_color || '#4A90E2'
})

onMounted(async () => {
  await householdStore.loadWeeklyCompletions()
})
</script>

<template>
  <header class="app-header">
    <!-- Compact Header Bar -->
    <div class="header-bar">
      <BrandLogo size="sm" />

      <!-- Weekly Points Display -->
      <div v-if="householdStore.weeklyRanking" class="points-display">
        <!-- 1. Platz (Leader) -->
        <div class="rank-item">
          <span class="rank-position">1.</span>
          <span
            class="rank-color-dot"
            :style="{ backgroundColor: householdStore.weeklyRanking.leader.color }"
          ></span>
          <span class="rank-name" :class="{ 'current-user': householdStore.weeklyRanking.isLeader }">
            {{ householdStore.weeklyRanking.leader.name }}
          </span>
          <span class="rank-points">{{ householdStore.weeklyRanking.leader.points }}</span>
        </div>

        <!-- Eigener Platz (falls nicht Leader) -->
        <div v-if="!householdStore.weeklyRanking.isLeader && householdStore.weeklyRanking.currentUser" class="rank-item">
          <span class="rank-position">{{ householdStore.weeklyRanking.currentUserRank }}.</span>
          <span
            class="rank-color-dot"
            :style="{ backgroundColor: householdStore.weeklyRanking.currentUser.color }"
          ></span>
          <span class="rank-name current-user">
            {{ householdStore.weeklyRanking.currentUser.name }}
          </span>
          <span class="rank-points">{{ householdStore.weeklyRanking.currentUser.points }}</span>
        </div>
      </div>

      <!-- Empty state: keine Completions diese Woche -->
      <div v-else class="points-display points-empty">
        <i class="bi bi-trophy"></i>
        <span class="empty-hint">Diese Woche: {{ householdStore.currentUserWeeklyPoints }} Pkt</span>
      </div>

      <div class="header-actions">
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
.points-display {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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

.rank-name.current-user {
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
  gap: 0.75rem;
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
