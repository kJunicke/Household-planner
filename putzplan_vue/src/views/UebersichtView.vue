<script setup lang="ts">
import { ref } from 'vue'
import StatsView from './StatsView.vue'
import SettlementView from './SettlementView.vue'

type UebersichtTab = 'stats' | 'settlement'

const activeTab = ref<UebersichtTab>('stats')
</script>

<template>
  <div class="uebersicht-wrapper">
    <!-- Sub-Tab-Leiste -->
    <div class="subtab-bar">
      <button
        :class="['subtab-chip', activeTab === 'stats' && 'active']"
        @click="activeTab = 'stats'"
      >
        <i class="bi bi-pie-chart me-1"></i> Statistiken
      </button>
      <button
        :class="['subtab-chip', activeTab === 'settlement' && 'active']"
        @click="activeTab = 'settlement'"
      >
        <i class="bi bi-arrow-left-right me-1"></i> Ausgleich
      </button>
    </div>

    <!-- Sub-Views -->
    <StatsView v-if="activeTab === 'stats'" />
    <SettlementView v-else />
  </div>
</template>

<style scoped>
.uebersicht-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.subtab-bar {
  display: flex;
  gap: 8px;
  padding: 10px 16px 0;
  background: var(--color-background-elevated);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.subtab-chip {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
  margin-bottom: -1px;
}

.subtab-chip:hover {
  color: var(--color-text-primary);
}

.subtab-chip.active {
  color: var(--color-primary);
  font-weight: 600;
  border-bottom-color: var(--color-primary);
}
</style>
