<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ShoppingView from './ShoppingView.vue'
import PackingView from './PackingView.vue'
import TodoView from './TodoView.vue'
import { LISTS_TAB_QUERY } from '@/lib/appNavigation'
import { useShoppingStore } from '@/stores/shoppingStore'
import { usePackingStore } from '@/stores/packingStore'
import { useTodoStore } from '@/stores/todoStore'

type ListsTab = keyof typeof LISTS_TAB_QUERY

// Untertab und offene Liste stehen in der Adresse (?tab=packlisten&liste=…),
// damit der Assistent auf eine bestimmte Liste führen kann (appNavigation.ts).
const route = useRoute()
const router = useRouter()

const activeTab = computed<ListsTab>(() => {
  const tab = route.query.tab
  if (tab === LISTS_TAB_QUERY.packing) return 'packing'
  if (tab === LISTS_TAB_QUERY.todo) return 'todo'
  return 'shopping'
})

const selectTab = (tab: ListsTab) => {
  if (tab === activeTab.value && !route.query.liste) return
  const query = LISTS_TAB_QUERY[tab]
  void router.replace({ name: 'listen', query: query ? { tab: query } : {} })
}

// Die Liste aus der Adresse wird die offene. Die Stores behalten sie beim
// Laden, solange es sie gibt; danach wählt der Nutzer frei über die Chips.
const stores = { shopping: useShoppingStore(), packing: usePackingStore(), todo: useTodoStore() }
watch(
  () => [activeTab.value, route.query.liste] as const,
  ([tab, listId]) => {
    if (typeof listId === 'string' && listId) stores[tab].currentListId = listId
  },
  { immediate: true },
)
// Wählt der Nutzer eine andere Liste, fällt sie aus der Adresse; sonst führte
// ein erneutes Hinführen zur selben Adresse nirgendwohin.
watch(
  () => stores[activeTab.value].currentListId,
  (listId) => {
    const { liste, ...rest } = route.query
    if (liste && listId !== liste) void router.replace({ name: 'listen', query: rest })
  },
)
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
      <button :class="['subtab-chip', activeTab === 'todo' && 'active']" @click="selectTab('todo')">
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
