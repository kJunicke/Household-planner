<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { path: '/', icon: 'bi-list-check', label: 'Putzen' },
  { path: '/history', icon: 'bi-clock-history', label: 'Verlauf' },
  { path: '/stats', icon: 'bi-pie-chart', label: 'Stats' },
  { path: '/shopping', icon: 'bi-cart3', label: 'Einkauf' },
  { path: '/notes', icon: 'bi-sticky', label: 'Notizen' }
]
</script>

<template>
  <nav class="bottom-nav">
    <router-link
      v-for="item in navItems"
      :key="item.path"
      :to="item.path"
      class="nav-item"
      :class="{ active: route.path === item.path }"
    >
      <i :class="item.icon"></i>
      <span>{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: var(--color-background-elevated);
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 900;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08);
  padding-bottom: env(safe-area-inset-bottom);
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 4px;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: all 0.2s ease;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  min-height: 56px;
}

.nav-item i {
  font-size: 1.5rem;
  transition: all 0.2s ease;
}

.nav-item span {
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

.nav-item:hover {
  color: var(--color-text-primary);
}

.nav-item.active {
  color: var(--color-primary);
  font-weight: 600;
}

.nav-item.active i {
  transform: scale(1.1);
}

/* Active indicator */
.nav-item.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 3px;
  background: var(--color-primary);
  border-radius: 0 0 3px 3px;
}
</style>
