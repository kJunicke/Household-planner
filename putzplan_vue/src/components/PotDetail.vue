<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePotStore } from '@/stores/potStore'
import { formatCents } from '@/lib/potLedger'
import ExpenseCreateModal from './ExpenseCreateModal.vue'
import type { Pot, PotExpense } from '@/types/Pot'

const props = defineProps<{ pot: Pot }>()

const potStore = usePotStore()
const router = useRouter()

const showCreateModal = ref(false)

const title = computed(() => (props.pot.kind === 'household' ? 'Haushaltstopf' : props.pot.name))

const balanceRows = computed(() => {
  const balances = potStore.balancesOf(props.pot.pot_id)
  return potStore.participantsOf(props.pot.pot_id).map((p) => ({
    id: p.participant_id,
    name: potStore.participantName(p.participant_id),
    cents: balances.get(p.participant_id) ?? 0,
  }))
})

const expenses = computed(() => potStore.expensesOf(props.pot.pot_id))

const splitLabel: Record<PotExpense['split_kind'], string> = {
  equal: 'gleich',
  ratio: 'nach Verhältnis',
  percent: 'nach Prozent',
  exact: 'nach Beträgen',
}

/** Euro je Person einer Ausgabe, in Topf-Reihenfolge. */
const shareRows = (e: PotExpense) =>
  [...potStore.sharesOf(e)].map(([id, cents]) => ({
    id,
    name: potStore.participantName(id),
    cents,
  }))

const formatDay = (isoDate: string) => isoDate.split('-').reverse().join('.')

const back = () => {
  void router.push({ name: 'kasse', query: { tab: 'toepfe' } })
}

const handleSubmit = (payload: Parameters<typeof potStore.createExpense>[0]) => {
  if (potStore.createExpense(payload)) showCreateModal.value = false
}
</script>

<template>
  <div class="pot-detail">
    <div class="page-header-row">
      <button class="back-btn" type="button" @click="back">
        <i class="bi bi-chevron-left"></i> Töpfe
      </button>
      <button v-if="!pot.closed_at" class="btn btn-primary btn-sm" @click="showCreateModal = true">
        <i class="bi bi-plus-lg me-1"></i> Ausgabe
      </button>
    </div>

    <h2 class="pot-title">{{ title }}</h2>

    <!-- Saldo je Person -->
    <section class="mb-4">
      <h3 class="section-title">Saldo</h3>
      <div class="balance-list">
        <div v-for="row in balanceRows" :key="row.id" class="balance-row">
          <span class="member-name">{{ row.name }}</span>
          <span v-if="row.cents > 0" class="creditor">hat {{ formatCents(row.cents) }} gut</span>
          <span v-else-if="row.cents < 0" class="debtor"
            >schuldet {{ formatCents(-row.cents) }}</span
          >
          <span v-else class="text-muted">ausgeglichen</span>
        </div>
      </div>
    </section>

    <!-- Ausgaben -->
    <section>
      <h3 class="section-title">Ausgaben</h3>
      <div v-if="expenses.length === 0" class="empty-state">
        <i class="bi bi-receipt"></i>
        <p>Noch keine Ausgaben eingetragen</p>
      </div>
      <div v-else class="expense-list">
        <div v-for="e in expenses" :key="e.expense_id" class="expense-item">
          <div class="expense-info">
            <div class="expense-title">{{ e.description }}</div>
            <div class="expense-meta">
              {{ potStore.participantName(e.payer_participant_id) }} hat bezahlt ·
              {{ formatDay(e.spent_on) }}
            </div>
            <div class="expense-split">
              <span class="split-label">{{ splitLabel[e.split_kind] }}:</span>
              <span v-for="s in shareRows(e)" :key="s.id" class="split-share">
                {{ s.name }} {{ formatCents(s.cents) }}
              </span>
            </div>
          </div>
          <div class="expense-amount">{{ formatCents(e.amount_cents) }}</div>
        </div>
      </div>
    </section>

    <ExpenseCreateModal
      v-if="showCreateModal"
      :pot-id="pot.pot_id"
      @submit="handleSubmit"
      @close="showCreateModal = false"
    />
  </div>
</template>

<style scoped>
.page-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin: var(--spacing-md) 0 var(--spacing-sm);
}

.back-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  -webkit-tap-highlight-color: transparent;
}

.pot-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: var(--spacing-md);
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: var(--spacing-md);
}

.balance-list,
.expense-list {
  background: var(--color-background-elevated);
  border-radius: var(--radius-lg);
  padding: 0 var(--spacing-md);
  box-shadow: var(--shadow-sm);
}

.balance-row,
.expense-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--color-border);
}

.balance-row:last-child,
.expense-item:last-child {
  border-bottom: none;
}

.member-name {
  font-weight: 500;
}

.creditor {
  font-weight: 600;
  color: var(--color-success, #198754);
}

.debtor {
  font-weight: 600;
  color: var(--color-danger, #dc3545);
}

.expense-info {
  min-width: 0;
}

.expense-title {
  font-weight: 500;
  overflow-wrap: anywhere;
}

.expense-meta {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.expense-split {
  display: flex;
  flex-wrap: wrap;
  column-gap: 10px;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.split-share {
  white-space: nowrap;
}

.expense-amount {
  font-weight: 700;
  white-space: nowrap;
}
</style>
