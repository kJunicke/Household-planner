<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LISTS_TAB_QUERY, listAreaOfTab, type ListArea } from '@/lib/appNavigation'
import ShoppingView from './ShoppingView.vue'
import PackingView from './PackingView.vue'
import TodoView from './TodoView.vue'

// Der Untertab steht in der Adresse (?tab=packlisten|todo, ohne = Einkauf), damit
// der Assistent auf die Einkaufsliste führen kann, auch wenn gerade ein anderer
// Untertab offen ist.
const route = useRoute()
const router = useRouter()
const activeTab = computed<ListArea>(() => listAreaOfTab(route.query.tab))

const selectTab = (tab: ListArea) => {
  if (tab === activeTab.value) return
  const query = LISTS_TAB_QUERY[tab]
  void router.replace({ name: 'listen', query: query ? { tab: query } : {} })
}
</script>

<template>
  <div class="lists-wrapper">
    <!-- Sub-Tab-Leiste -->
    <div class="subtab-bar">
      <button
        :class="['subtab-chip', activeTab === 'shopping' && 'active']"
        @click="selectTab('shopping')"
      >
        <i class="bi bi-cart3 me-1"></i> Einkauf
      </button>
      <button
        :class="['subtab-chip', activeTab === 'packing' && 'active']"
        @click="selectTab('packing')"
      >
        <i class="bi bi-bag-check me-1"></i> Packlisten
      </button>
      <button
        :class="['subtab-chip', activeTab === 'todo' && 'active']"
        @click="selectTab('todo')"
      >
        <i class="bi bi-check2-square me-1"></i> To-do
      </button>
    </div>

    <!-- Sub-Views -->
    <ShoppingView v-if="activeTab === 'shopping'" />
    <PackingView v-else-if="activeTab === 'packing'" />
    <TodoView v-else />
  </div>
</template>

<style scoped>
.lists-wrapper {
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
