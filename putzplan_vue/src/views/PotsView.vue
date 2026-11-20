<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePotStore } from '@/stores/potStore'
import { formatCents } from '@/lib/potLedger'
import { potTitle, sortPots } from '@/lib/potRules'
import PotDetail from '@/components/PotDetail.vue'
import PotCreateModal from '@/components/PotCreateModal.vue'
import type { Pot } from '@/types/Pot'

const potStore = usePotStore()
const route = useRoute()
const router = useRouter()

const openPot = computed(() => {
  const id = route.query.topf
  return typeof id === 'string' ? (potStore.pots.find((p) => p.pot_id === id) ?? null) : null
})

const sortedPots = computed(() => sortPots(potStore.pots))
const firstClosedId = computed(() => sortedPots.value.find((p) => p.closed_at)?.pot_id ?? null)

const showCreateModal = ref(false)
const creating = ref(false)

const handleCreate = async (payload: {
  name: string
  memberIds: string[]
  guestNames: string[]
}) => {
  if (creating.value) return
  creating.value = true
  try {
    const potId = await potStore.createEventPot(payload)
    if (potId) {
      showCreateModal.value = false
      void router.push({ name: 'kasse', query: { tab: 'toepfe', topf: potId } })
    }
  } finally {
    creating.value = false
  }
}

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
        <div class="pot-list-header">
          <button class="btn btn-primary btn-sm" @click="showCreateModal = true">
            <i class="bi bi-plus-lg me-1"></i> Topf
          </button>
        </div>
        <template v-for="p in sortedPots" :key="p.pot_id">
          <h3 v-if="p.pot_id === firstClosedId" class="closed-heading">Abgeschlossen</h3>
          <button :class="['pot-card', p.closed_at && 'closed']" @click="showPot(p)">
            <i
              :class="[
                'bi',
                p.kind === 'household' ? 'bi-house-heart' : p.closed_at ? 'bi-lock' : 'bi-wallet2',
                'pot-icon',
              ]"
            ></i>
            <span class="pot-text">
              <span class="pot-name">{{ potTitle(p) }}</span>
              <span class="pot-summary">{{ potSummary(p) }}</span>
              <span
                v-if="!p.closed_at && potStore.pendingJoinsOf(p.pot_id).length"
                class="pot-pending"
              >
                <i class="bi bi-person-exclamation me-1"></i>Neu in der Gruppe — bitte bestätigen
              </span>
            </span>
            <i class="bi bi-chevron-right text-muted"></i>
          </button>
        </template>
      </div>

      <PotCreateModal
        v-if="showCreateModal"
        :saving="creating"
        @submit="handleCreate"
        @close="showCreateModal = false"
      />
    </div>
  </div>
</template>

<style scoped>
.pot-pending {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-primary);
}

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

.pot-list-header {
  display: flex;
  justify-content: flex-end;
}

.closed-heading {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: var(--spacing-md) 0 0;
}

.pot-card.closed {
  opacity: 0.75;
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
