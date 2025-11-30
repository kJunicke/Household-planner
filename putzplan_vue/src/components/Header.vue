<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useHouseholdStore } from '../stores/householdStore'
import SettingsSidebar from './SettingsSidebar.vue'

const route = useRoute()
const authStore = useAuthStore()
const householdStore = useHouseholdStore()

const sidebarOpen = ref(false)

const currentMemberColor = computed(() => {
  const member = householdStore.householdMembers.find(m => m.user_id === authStore.user?.id)
  return member?.user_color || '#4A90E2'
})
</script>

<template>
  <header class="app-header">
    <!-- Compact Header Bar -->
    <div class="header-bar">
      <h1 class="page-title">Putzplan</h1>
      <div class="header-actions">
        <button
          class="user-avatar"
          :style="{ backgroundColor: currentMemberColor }"
          :title="'Deine Farbe: ' + currentMemberColor"
          @click="sidebarOpen = true"
        />
        <button
          class="menu-btn"
          @click="sidebarOpen = true"
          aria-label="Menü öffnen"
        >
          <i class="bi bi-list"></i>
        </button>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <nav class="nav-tabs-container">
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
        <router-link to="/shopping" class="nav-tab" :class="{ active: route.path === '/shopping' }">
          <i class="bi bi-cart3"></i> Einkauf
        </router-link>
      </div>
    </nav>

    <!-- Secondary Navigation for Category Tabs (only on Cleaning view) -->
    <slot name="secondary-nav"></slot>

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
  border-bottom: 1px solid var(--color-border);
}

.page-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
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

.menu-btn {
  background: none;
  border: none;
  font-size: 1.75rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.menu-btn:hover {
  color: var(--color-text-primary);
}

/* Navigation Tabs */
.nav-tabs-container {
  background: var(--color-background-elevated);
}

.nav-tabs-wrapper {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--color-border);
}

.nav-tab {
  flex: 1;
  padding: 0.75rem 0.5rem;
  background: var(--color-background);
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-align: center;
}

.nav-tab i {
  font-size: 1rem;
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

/* Desktop: slightly larger */
@media (min-width: 768px) {
  .header-bar {
    padding: 1rem 1.5rem;
  }

  .page-title {
    font-size: 1.5rem;
  }

  .nav-tab {
    padding: 0.875rem 1rem;
    font-size: 0.9375rem;
  }

  .nav-tab i {
    font-size: 1.1rem;
  }
}
</style>
