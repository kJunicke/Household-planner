<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StatsView from './StatsView.vue'
import SettlementView from './SettlementView.vue'
import PotsView from './PotsView.vue'

type KasseTab = 'statistik' | 'ausgleich' | 'toepfe'

// Untertab und offener Topf stehen in der Adresse (?tab=toepfe&topf=…), damit
// der Ausgleich zum Haushaltstopf springen kann und Zurück dorthin zurückführt.
const route = useRoute()
const router = useRouter()

const activeTab = computed<KasseTab>(() => {
  const tab = route.query.tab
  return tab === 'ausgleich' || tab === 'toepfe' ? tab : 'statistik'
})

const selectTab = (tab: KasseTab) => {
  if (tab === activeTab.value && !route.query.topf) return
  void router.replace({ name: 'kasse', query: tab === 'statistik' ? {} : { tab } })
}
</script>

<template>
  <div class="kasse-wrapper">
    <!-- Sub-Tab-Leiste -->
    <div class="subtab-bar">
      <button
        :class="['subtab-chip', activeTab === 'statistik' && 'active']"
        @click="selectTab('statistik')"
      >
        <i class="bi bi-pie-chart me-1"></i> Statistik
      </button>
      <button
        :class="['subtab-chip', activeTab === 'ausgleich' && 'active']"
        @click="selectTab('ausgleich')"
      >
        <i class="bi bi-arrow-left-right me-1"></i> Ausgleich
      </button>
      <button
        :class="['subtab-chip', activeTab === 'toepfe' && 'active']"
        @click="selectTab('toepfe')"
      >
        <i class="bi bi-wallet2 me-1"></i> Töpfe
      </button>
    </div>

    <!-- Sub-Views -->
    <StatsView v-if="activeTab === 'statistik'" />
    <SettlementView v-else-if="activeTab === 'ausgleich'" />
    <PotsView v-else />
  </div>
</template>

<style scoped>
.kasse-wrapper {
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
