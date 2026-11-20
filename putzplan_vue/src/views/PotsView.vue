<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePotStore } from '@/stores/potStore'
import { formatCents } from '@/lib/potLedger'
import PotDetail from '@/components/PotDetail.vue'
import type { Pot } from '@/types/Pot'

const potStore = usePotStore()
const route = useRoute()
const router = useRouter()

const openPot = computed(() => {
  const id = route.query.topf
  return typeof id === 'string' ? (potStore.pots.find((p) => p.pot_id === id) ?? null) : null
})

// Haushaltstopf oben, darunter die laufenden, zuletzt die abgeschlossenen.
const rank = (p: Pot) => (p.kind === 'household' ? 0 : p.closed_at ? 2 : 1)
const sortedPots = computed(() =>
  [...potStore.pots].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(b.created_at) - Date.parse(a.created_at),
  ),
)

const potTitle = (p: Pot) => (p.kind === 'household' ? 'Haushaltstopf' : p.name)

/** Kurzstand: wer am meisten gut hat, oder „ausgeglichen“. */
const potSummary = (p: Pot) => {
  let topId: string | null = null
  let top = 0
  for (const [id, cents] of potStore.balancesOf(p.pot_id)) {
    if (cents > top) {
      top = cents
      topId = id
    }
  }
  return topId ? `${potStore.participantName(topId)} hat ${formatCents(top)} gut` : 'ausgeglichen'
}

const showPot = (p: Pot) => {
  void router.push({ name: 'kasse', query: { tab: 'toepfe', topf: p.pot_id } })
}
</script>

<template>
  <div class="page-container">
    <div class="container-fluid">
      <PotDetail v-if="openPot" :pot="openPot" />

      <div v-else-if="!potStore.loaded" class="text-center py-4">
        <span class="spinner-border spinner-border-sm me-2"></span> Lädt...
      </div>

      <div v-else class="pot-list">
        <button v-for="p in sortedPots" :key="p.pot_id" class="pot-card" @click="showPot(p)">
          <i
            :class="['bi', p.kind === 'household' ? 'bi-house-heart' : 'bi-wallet2', 'pot-icon']"
          ></i>
          <span class="pot-text">
            <span class="pot-name">{{ potTitle(p) }}</span>
            <span class="pot-summary">{{ potSummary(p) }}</span>
          </span>
          <i class="bi bi-chevron-right text-muted"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pot-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding-top: var(--spacing-md);
}

.pot-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  width: 100%;
  padding: var(--spacing-md);
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-align: left;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}

.pot-icon {
  font-size: 1.4rem;
  color: var(--color-primary);
}

.pot-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pot-name {
  font-weight: 600;
}

.pot-summary {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}
</style>
