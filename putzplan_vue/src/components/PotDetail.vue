<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePotStore } from '@/stores/potStore'
import { formatCents, suggestTransfers } from '@/lib/potLedger'
import { entryChangeLine } from '@/lib/potEntryChange'
import ExpenseCreateModal from './ExpenseCreateModal.vue'
import RepaymentCreateModal from './RepaymentCreateModal.vue'
import type { Pot, PotExpense, PotRepayment } from '@/types/Pot'

const props = defineProps<{ pot: Pot }>()

const potStore = usePotStore()
const router = useRouter()

const showCreateModal = ref(false)
const editingExpense = ref<PotExpense | null>(null)

const title = computed(() => (props.pot.kind === 'household' ? 'Haushaltstopf' : props.pot.name))

const balanceRows = computed(() => {
  const balances = potStore.balancesOf(props.pot.pot_id)
  return potStore.participantsOf(props.pot.pot_id).map((p) => ({
    id: p.participant_id,
    name: potStore.participantName(p.participant_id),
    cents: balances.get(p.participant_id) ?? 0,
  }))
})

// Überweisungsvorschläge: wer wem wie viel, damit alle Salden aufgehen.
const transfers = computed(() => suggestTransfers(potStore.balancesOf(props.pot.pot_id)))

// Offenes Rückzahlungs-Formular: frei (ohne `prefill`), aus einem Vorschlag
// oder zum Bearbeiten einer bestehenden Rückzahlung (`repayment`).
type RepaymentPrefill = { fromId: string; toId: string; amountCents: number }
const repaymentModal = ref<{ prefill?: RepaymentPrefill; repayment?: PotRepayment } | null>(null)

const handleRepaymentSubmit = (payload: Parameters<typeof potStore.createRepayment>[0]) => {
  const editing = repaymentModal.value?.repayment
  if (editing) {
    // Schlägt nur fehl, wenn die Rückzahlung inzwischen gelöscht ist; der Store meldet das.
    potStore.updateRepayment(editing.repayment_id, payload)
    repaymentModal.value = null
  } else if (potStore.createRepayment(payload)) {
    repaymentModal.value = null
  }
}

const handleRepaymentDelete = () => {
  const editing = repaymentModal.value?.repayment
  if (editing) potStore.deleteRepayment(editing.repayment_id)
  repaymentModal.value = null
}

// Ausgaben und Rückzahlungen in einer Liste, neueste zuerst.
type Entry =
  | { kind: 'expense'; id: string; day: string; createdAt: string; expense: PotExpense }
  | { kind: 'repayment'; id: string; day: string; createdAt: string; repayment: PotRepayment }

const entries = computed<Entry[]>(() => {
  const expenseEntries = potStore.expensesOf(props.pot.pot_id).map(
    (expense): Entry => ({
      kind: 'expense',
      id: expense.expense_id,
      day: expense.spent_on,
      createdAt: expense.created_at,
      expense,
    }),
  )
  const repaymentEntries = potStore.repaymentsOf(props.pot.pot_id).map(
    (repayment): Entry => ({
      kind: 'repayment',
      id: repayment.repayment_id,
      day: repayment.paid_on,
      createdAt: repayment.created_at,
      repayment,
    }),
  )
  return [...expenseEntries, ...repaymentEntries].sort(
    (a, b) => b.day.localeCompare(a.day) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
})

const formatDay = (isoDate: string) => isoDate.split('-').reverse().join('.')

const back = () => {
  void router.push({ name: 'kasse', query: { tab: 'toepfe' } })
}

const isOpen = computed(() => !props.pot.closed_at)

/** „eingetragen von …“ bzw. „zuletzt geändert von …“ unter jedem Eintrag. */
const changeLine = (entry: PotExpense | PotRepayment) =>
  entryChangeLine({
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    changedByName: potStore.participantExists(entry.updated_by_participant_id)
      ? potStore.participantName(entry.updated_by_participant_id)
      : null,
  })

/** Eintrag antippen: Ausgabe bzw. Rückzahlung zum Bearbeiten öffnen (nur in offenen Töpfen). */
const openEdit = (entry: Entry) => {
  if (!isOpen.value) return
  if (entry.kind === 'expense') editingExpense.value = entry.expense
  else repaymentModal.value = { repayment: entry.repayment }
}

const closeExpenseModal = () => {
  showCreateModal.value = false
  editingExpense.value = null
}

const handleSubmit = (payload: Parameters<typeof potStore.createExpense>[0]) => {
  if (editingExpense.value) {
    // Schlägt nur fehl, wenn die Ausgabe inzwischen gelöscht ist; der Store meldet das.
    potStore.updateExpense(editingExpense.value.expense_id, payload)
    closeExpenseModal()
  } else if (potStore.createExpense(payload)) {
    closeExpenseModal()
  }
}

const handleDelete = () => {
  if (editingExpense.value) potStore.deleteExpense(editingExpense.value.expense_id)
  closeExpenseModal()
}
</script>

<template>
  <div class="pot-detail">
    <div class="page-header-row">
      <button class="back-btn" type="button" @click="back">
        <i class="bi bi-chevron-left"></i> Töpfe
      </button>
      <div v-if="!pot.closed_at" class="header-actions">
        <button class="btn btn-outline-secondary btn-sm" @click="repaymentModal = {}">
          <i class="bi bi-arrow-left-right me-1"></i> Rückzahlung
        </button>
        <button class="btn btn-primary btn-sm" @click="showCreateModal = true">
          <i class="bi bi-plus-lg me-1"></i> Ausgabe
        </button>
      </div>
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

    <!-- Überweisungsvorschläge: ein Tipp füllt die Rückzahlung vor -->
    <section v-if="!pot.closed_at && transfers.length > 0" class="mb-4">
      <h3 class="section-title">Vorschlag zum Ausgleichen</h3>
      <div class="transfer-list">
        <button
          v-for="t in transfers"
          :key="`${t.fromId}-${t.toId}`"
          type="button"
          class="transfer-row"
          @click="repaymentModal = { prefill: t }"
        >
          <span class="transfer-text">
            {{ potStore.participantName(t.fromId) }} überweist
            {{ potStore.participantName(t.toId) }}
          </span>
          <span class="transfer-amount">
            {{ formatCents(t.amountCents) }} <i class="bi bi-chevron-right"></i>
          </span>
        </button>
      </div>
    </section>

    <!-- Ausgaben und Rückzahlungen in einer Liste -->
    <section>
      <h3 class="section-title">Ausgaben und Rückzahlungen</h3>
      <div v-if="entries.length === 0" class="empty-state">
        <i class="bi bi-receipt"></i>
        <p>Noch keine Ausgaben eingetragen</p>
      </div>
      <div v-else class="expense-list">
        <template v-for="entry in entries" :key="entry.id">
          <button
            v-if="entry.kind === 'expense'"
            type="button"
            class="expense-item"
            :disabled="!isOpen"
            @click="openEdit(entry)"
          >
            <div class="expense-info">
              <div class="expense-title">{{ entry.expense.description }}</div>
              <div class="expense-meta">
                {{ potStore.participantName(entry.expense.payer_participant_id) }} hat bezahlt ·
                {{ formatDay(entry.day) }}
              </div>
              <div v-if="changeLine(entry.expense)" class="expense-change">
                {{ changeLine(entry.expense) }}
              </div>
            </div>
            <div class="expense-amount">{{ formatCents(entry.expense.amount_cents) }}</div>
          </button>
          <button
            v-else
            type="button"
            class="expense-item repayment-item"
            :disabled="!isOpen"
            @click="openEdit(entry)"
          >
            <i class="bi bi-arrow-left-right repayment-icon"></i>
            <div class="expense-info">
              <div class="expense-title">
                {{ potStore.participantName(entry.repayment.from_participant_id) }} an
                {{ potStore.participantName(entry.repayment.to_participant_id) }}
              </div>
              <div class="expense-meta">Rückzahlung · {{ formatDay(entry.day) }}</div>
              <div v-if="changeLine(entry.repayment)" class="expense-change">
                {{ changeLine(entry.repayment) }}
              </div>
            </div>
            <div class="expense-amount repayment-amount">
              {{ formatCents(entry.repayment.amount_cents) }}
            </div>
          </button>
        </template>
      </div>
    </section>

    <ExpenseCreateModal
      v-if="showCreateModal || editingExpense"
      :pot-id="pot.pot_id"
      :expense="editingExpense ?? undefined"
      @submit="handleSubmit"
      @delete="handleDelete"
      @close="closeExpenseModal"
    />

    <RepaymentCreateModal
      v-if="repaymentModal"
      :pot-id="pot.pot_id"
      :prefill="repaymentModal.prefill"
      :repayment="repaymentModal.repayment"
      @submit="handleRepaymentSubmit"
      @delete="handleRepaymentDelete"
      @close="repaymentModal = null"
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

.header-actions {
  display: flex;
  gap: var(--spacing-sm);
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

.expense-meta,
.expense-change {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.expense-change {
  font-style: italic;
}

/* Ganze Zeile antippbar: öffnet den Eintrag zum Bearbeiten. */
button.expense-item {
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-border);
  color: inherit;
  font: inherit;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

button.expense-item:last-child {
  border-bottom: none;
}

button.expense-item:disabled {
  opacity: 1;
  cursor: default;
}

.expense-amount {
  font-weight: 700;
  white-space: nowrap;
}

/* Rückzahlung ist keine Ausgabe: Pfeil, kursiv, gedämpfter Betrag. */
.repayment-item .expense-info {
  flex: 1;
}

.repayment-item .expense-title {
  font-weight: 400;
  font-style: italic;
}

.repayment-icon {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.repayment-amount {
  font-weight: 500;
  color: var(--color-text-secondary);
}

.transfer-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.transfer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background-elevated);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  text-align: left;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}

.transfer-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.transfer-amount {
  font-weight: 600;
  white-space: nowrap;
}
</style>
