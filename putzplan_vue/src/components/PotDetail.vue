<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePotStore } from '@/stores/potStore'
import { formatCents } from '@/lib/potLedger'
import { participantNameProblem } from '@/lib/potRules'
import { POT_PARTICIPANT_NAME_MAX_LENGTH } from '@/lib/limits'
import ExpenseCreateModal from './ExpenseCreateModal.vue'
import type { Pot } from '@/types/Pot'

const props = defineProps<{ pot: Pot }>()

const potStore = usePotStore()
const router = useRouter()

const showCreateModal = ref(false)

const title = computed(() => (props.pot.kind === 'household' ? 'Haushaltstopf' : props.pot.name))

const balanceRows = computed(() => {
  const balances = potStore.balancesOf(props.pot.pot_id)
  const current = new Set(
    potStore.currentParticipantsOf(props.pot.pot_id).map((p) => p.participant_id),
  )
  // Ehemalige Mitglieder im Haushaltstopf nur, solange noch Geld offen ist.
  return potStore
    .participantsOf(props.pot.pot_id)
    .map((p) => ({
      id: p.participant_id,
      name: potStore.participantName(p.participant_id),
      cents: balances.get(p.participant_id) ?? 0,
      current: current.has(p.participant_id),
    }))
    .filter((row) => row.current || row.cents !== 0)
})

const isEvent = computed(() => props.pot.kind === 'event')
const isOpen = computed(() => !props.pot.closed_at)

// ---------------------------------------------------------------
// Teilnehmer nachtragen (nur offener Topf für einen Anlass)
// ---------------------------------------------------------------
const newParticipant = ref('')
const participantProblem = computed(() =>
  newParticipant.value.trim() === ''
    ? null
    : participantNameProblem(
        newParticipant.value,
        potStore.participantsOf(props.pot.pot_id).map((p) => p.name),
      ),
)
const problemText = {
  empty: '',
  too_long: 'Der Name ist zu lang',
  duplicate: 'Den Namen gibt es in diesem Topf schon',
} as const

const addParticipant = () => {
  if (newParticipant.value.trim() === '' || participantProblem.value) return
  if (potStore.addParticipant(props.pot.pot_id, newParticipant.value)) newParticipant.value = ''
}

// ---------------------------------------------------------------
// Abschließen, wieder öffnen, löschen
// ---------------------------------------------------------------
type Confirm = 'close' | 'delete' | null
const confirming = ref<Confirm>(null)
const hasOpenBalance = computed(() => balanceRows.value.some((row) => row.cents !== 0))

const closePot = () => {
  if (potStore.setPotClosed(props.pot.pot_id, true)) confirming.value = null
}

const reopenPot = () => {
  potStore.setPotClosed(props.pot.pot_id, false)
}

const deletePot = () => {
  const potId = props.pot.pot_id
  confirming.value = null
  back()
  potStore.deletePot(potId)
}

const formatClosedAt = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

const expenses = computed(() => potStore.expensesOf(props.pot.pot_id))

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
    <div v-if="pot.closed_at" class="closed-banner">
      <i class="bi bi-lock me-1"></i> Abgeschlossen am {{ formatClosedAt(pot.closed_at) }} —
      schreibgeschützt
    </div>

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
          </div>
          <div class="expense-amount">{{ formatCents(e.amount_cents) }}</div>
        </div>
      </div>
    </section>

    <!-- Teilnehmer (Topf für einen Anlass) -->
    <section v-if="isEvent && isOpen" class="mt-4">
      <h3 class="section-title">Teilnehmer eintragen</h3>
      <div class="add-participant">
        <input
          v-model="newParticipant"
          type="text"
          class="form-control"
          :class="{ 'is-invalid': participantProblem }"
          placeholder="Name"
          :maxlength="POT_PARTICIPANT_NAME_MAX_LENGTH"
          @keyup.enter="addParticipant"
        />
        <button
          type="button"
          class="btn btn-outline-primary"
          :disabled="newParticipant.trim() === '' || !!participantProblem"
          @click="addParticipant"
        >
          <i class="bi bi-person-plus"></i>
        </button>
      </div>
      <div v-if="participantProblem" class="invalid-hint">
        {{ problemText[participantProblem] }}
      </div>
    </section>

    <!-- Abschließen, wieder öffnen, löschen -->
    <section v-if="isEvent" class="pot-actions mt-4">
      <template v-if="confirming === 'close'">
        <div class="confirm-box">
          <p v-if="hasOpenBalance" class="text-danger mb-2">
            <i class="bi bi-exclamation-triangle me-1"></i> Es ist noch Geld offen. Trotzdem
            abschließen?
          </p>
          <p v-else class="mb-2">Topf abschließen? Danach ist er schreibgeschützt.</p>
          <button class="btn btn-sm btn-primary me-1" @click="closePot">Abschließen</button>
          <button class="btn btn-sm btn-secondary" @click="confirming = null">Abbrechen</button>
        </div>
      </template>
      <template v-else-if="confirming === 'delete'">
        <div class="confirm-box">
          <p class="text-danger mb-2">
            Topf mit allen Ausgaben und Rückzahlungen wirklich löschen?
          </p>
          <button class="btn btn-sm btn-danger me-1" @click="deletePot">Ja, löschen</button>
          <button class="btn btn-sm btn-secondary" @click="confirming = null">Abbrechen</button>
        </div>
      </template>
      <template v-else>
        <button v-if="isOpen" class="btn btn-outline-primary" @click="confirming = 'close'">
          <i class="bi bi-lock me-1"></i> Abschließen
        </button>
        <button v-else class="btn btn-outline-primary" @click="reopenPot">
          <i class="bi bi-unlock me-1"></i> Wieder öffnen
        </button>
        <button class="btn btn-outline-danger" @click="confirming = 'delete'">
          <i class="bi bi-trash me-1"></i> Löschen
        </button>
      </template>
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

.closed-banner {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
}

.add-participant {
  display: flex;
  gap: var(--spacing-sm);
}

.invalid-hint {
  font-size: 0.85rem;
  color: var(--color-danger, #dc3545);
  margin-top: 4px;
}

.pot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.confirm-box {
  width: 100%;
  padding: var(--spacing-md);
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.expense-amount {
  font-weight: 700;
  white-space: nowrap;
}
</style>
