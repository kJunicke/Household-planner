<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useSettlementStore } from '@/stores/settlementStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { useAuthStore } from '@/stores/authStore'
import { usePotStore } from '@/stores/potStore'
import { useRouter } from 'vue-router'
import { formatCents } from '@/lib/potLedger'
import SettlementCreateModal from '@/components/SettlementCreateModal.vue'
import type { SettlementMethod } from '@/types/Settlement'
import { formatEuroInput, MAX_EUROS_PER_POINT, parseEuroInput } from '@/lib/settlementAmount'

const settlementStore = useSettlementStore()
const householdStore = useHouseholdStore()
const authStore = useAuthStore()
const potStore = usePotStore()
const router = useRouter()

const showCreateModal = ref(false)
const preselectedFromId = ref<string | undefined>(undefined)
const preselectedToId = ref<string | undefined>(undefined)
const filterUserId = ref<string | null>(null)

const getMemberName = (userId: string | null) => {
  if (!userId) return 'Unbekannt'
  return (
    householdStore.householdMembers.find((m) => m.user_id === userId)?.display_name ?? 'Unbekannt'
  )
}

const methodLabel: Record<SettlementMethod, string> = {
  activity: 'Aktivität',
  money: 'Geld',
  surprise: 'Überraschung',
  other: 'Sonstiges',
  pot: 'Haushaltstopf',
}

const methodIcon: Record<SettlementMethod, string> = {
  activity: 'bi-bullseye',
  money: 'bi-cash-coin',
  surprise: 'bi-gift',
  other: 'bi-three-dots',
  pot: 'bi-house-heart',
}

// Kurs: steht hier, wo er verwendet wird, und ist hier änderbar. Eine
// Änderung wirkt nur auf künftige Vorschläge; frühere Geld-Ausgleiche tragen
// ihren gezahlten Betrag selbst.
const editingRate = ref(false)
const rateText = ref('')
const rateInput = computed(() => {
  const value = parseEuroInput(rateText.value)
  return value !== null && value > 0 && value <= MAX_EUROS_PER_POINT ? value : null
})

const startEditRate = () => {
  rateText.value = formatEuroInput(householdStore.eurosPerPoint)
  editingRate.value = true
}

const saveRate = async () => {
  if (rateInput.value === null) return
  if (await householdStore.updateEurosPerPoint(rateInput.value)) editingRate.value = false
}

// Haushaltstopf neben der Bilanz: eigene Zeile in Euro, getrennt von den
// Bilanz-Karten, die nur Punkte zeigen (CONTEXT.md § Ausgleich).
const householdPotLine = computed(() => {
  const pot = potStore.householdPot
  if (!pot) return null
  const creditors = [...potStore.balancesOf(pot.pot_id)]
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, cents]) => `${potStore.participantName(id)} hat ${formatCents(cents)} gut`)
  return { potId: pot.pot_id, text: creditors.length ? creditors.join(', ') : 'ausgeglichen' }
})

const openHouseholdPot = (potId: string) => {
  void router.push({ name: 'kasse', query: { tab: 'toepfe', topf: potId } })
}

const formatEuros = (value: number) => `${formatEuroInput(value)} €`

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

const filteredSettlements = computed(() => {
  if (!filterUserId.value) return settlementStore.sortedSettlements
  return settlementStore.sortedSettlements.filter(
    (s) => s.from_user_id === filterUserId.value || s.to_user_id === filterUserId.value,
  )
})

const canDelete = (settlement: { created_by: string | null; created_at: string }) => {
  if (settlement.created_by !== authStore.user?.id) return false
  return new Date(settlement.created_at).getTime() > Date.now() - 5 * 60 * 1000
}

const openCreateModal = (fromId?: string, toId?: string) => {
  preselectedFromId.value = fromId
  preselectedToId.value = toId
  showCreateModal.value = true
}

const handleSubmit = async (payload: Parameters<typeof settlementStore.createSettlement>[0]) => {
  await settlementStore.createSettlement(payload)
  showCreateModal.value = false
}

onMounted(async () => {
  await settlementStore.loadCompletions()
  await settlementStore.loadSettlements()
  settlementStore.subscribe()
})

onUnmounted(() => {
  settlementStore.unsubscribe()
})
</script>

<template>
  <div class="page-container">
    <div class="container-fluid">
      <!-- Titel kommt vom Tab darüber (Statistik/Ausgleich) -->
      <div class="page-header-row">
        <form v-if="editingRate" class="rate-edit" @submit.prevent="saveRate">
          <span>1 Pkt. =</span>
          <input
            v-model="rateText"
            type="text"
            inputmode="decimal"
            class="form-control form-control-sm rate-input"
            :class="{ 'is-invalid': rateInput === null }"
            autocomplete="off"
          />
          <span>€</span>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="rateInput === null">
            <i class="bi bi-check-lg"></i>
          </button>
          <button type="button" class="btn btn-sm btn-secondary" @click="editingRate = false">
            <i class="bi bi-x-lg"></i>
          </button>
        </form>
        <button v-else class="rate-display" type="button" @click="startEditRate">
          Kurs: 1 Pkt. = {{ formatEuros(householdStore.eurosPerPoint) }}
          <i class="bi bi-pencil ms-1"></i>
        </button>
        <button class="btn btn-primary btn-sm" @click="openCreateModal()">
          <i class="bi bi-plus-lg me-1"></i> Neu
        </button>
      </div>

      <!-- Loading -->
      <div v-if="settlementStore.isLoading" class="text-center py-4">
        <span class="spinner-border spinner-border-sm me-2"></span> Lädt...
      </div>

      <template v-else>
        <!-- Salden-Übersicht -->
        <section class="mb-4">
          <h3 class="section-title">Offene Salden</h3>

          <div v-if="settlementStore.pairBalances.length === 0" class="empty-state">
            <i class="bi bi-check-circle"></i>
            <p>Alles ausgeglichen!</p>
          </div>

          <div v-else class="balance-list">
            <div
              v-for="pair in settlementStore.pairBalances"
              :key="`${pair.userAId}-${pair.userBId}`"
              class="balance-card"
            >
              <div class="balance-users">
                <template v-if="pair.balance > 0">
                  <!-- A is ahead: B owes A -->
                  <span class="debtor">{{ getMemberName(pair.userBId) }}</span>
                  <span class="balance-arrow"> schuldet </span>
                  <span class="creditor">{{ getMemberName(pair.userAId) }}</span>
                </template>
                <template v-else>
                  <!-- B is ahead: A owes B -->
                  <span class="debtor">{{ getMemberName(pair.userAId) }}</span>
                  <span class="balance-arrow"> schuldet </span>
                  <span class="creditor">{{ getMemberName(pair.userBId) }}</span>
                </template>
              </div>
              <div class="balance-amount">{{ Math.abs(pair.balance) }} Pkt.</div>
              <button
                class="btn btn-sm btn-outline-primary"
                @click="
                  openCreateModal(
                    pair.balance > 0 ? pair.userBId : pair.userAId,
                    pair.balance > 0 ? pair.userAId : pair.userBId,
                  )
                "
              >
                Ausgleichen
              </button>
            </div>
          </div>
        </section>

        <!-- Haushaltstopf: springt zum Topf -->
        <button
          v-if="householdPotLine"
          type="button"
          class="pot-line mb-4"
          @click="openHouseholdPot(householdPotLine.potId)"
        >
          <i class="bi bi-house-heart pot-line-icon"></i>
          <span class="pot-line-text">
            <strong>Haushaltstopf:</strong> {{ householdPotLine.text }}
          </span>
          <i class="bi bi-chevron-right text-muted"></i>
        </button>

        <!-- Punkte-Übersicht pro User -->
        <section class="mb-4">
          <h3 class="section-title">Gesamtpunkte</h3>
          <div class="points-list">
            <div
              v-for="member in householdStore.householdMembers"
              :key="member.user_id"
              class="points-row"
            >
              <span class="member-name">{{ member.display_name }}</span>
              <span class="member-points">
                {{ settlementStore.pointsByUser.get(member.user_id) ?? 0 }} Pkt.
              </span>
            </div>
          </div>
        </section>

        <!-- Historie -->
        <section>
          <div class="section-header">
            <h3 class="section-title">Historie</h3>
            <!-- Filter-Chips -->
            <div class="filter-chips">
              <button
                :class="['filter-chip', filterUserId === null && 'active']"
                @click="filterUserId = null"
              >
                Alle
              </button>
              <button
                v-for="member in householdStore.householdMembers"
                :key="member.user_id"
                :class="['filter-chip', filterUserId === member.user_id && 'active']"
                @click="filterUserId = filterUserId === member.user_id ? null : member.user_id"
              >
                {{ member.display_name }}
              </button>
            </div>
          </div>

          <div v-if="filteredSettlements.length === 0" class="empty-state">
            <i class="bi bi-clock-history"></i>
            <p>Noch keine Ausgleiche eingetragen</p>
          </div>

          <div v-else class="settlement-list">
            <div v-for="s in filteredSettlements" :key="s.settlement_id" class="settlement-item">
              <div class="settlement-main">
                <div class="settlement-info">
                  <i :class="['bi', methodIcon[s.method as SettlementMethod], 'method-icon']"></i>
                  <div>
                    <div class="settlement-title">
                      <strong>{{ getMemberName(s.from_user_id) }}</strong>
                      →
                      <strong>{{ getMemberName(s.to_user_id) }}</strong>
                      <span class="badge bg-secondary ms-1">{{ s.points_settled }} Pkt.</span>
                      <span
                        v-if="(s.method === 'money' || s.method === 'pot') && s.paid_euros != null"
                        class="paid-euros"
                      >
                        {{ formatEuros(s.paid_euros) }}
                      </span>
                    </div>
                    <div class="settlement-meta">
                      {{ methodLabel[s.method as SettlementMethod] }}
                      <span v-if="s.description"> · {{ s.description }}</span>
                      <span class="text-muted"> · {{ formatDate(s.settled_at) }}</span>
                    </div>
                  </div>
                </div>
                <button
                  v-if="canDelete(s)"
                  class="btn btn-sm btn-outline-danger"
                  @click="settlementStore.deleteSettlement(s.settlement_id)"
                  title="Löschen"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>

  <SettlementCreateModal
    v-if="showCreateModal"
    :preselected-from-id="preselectedFromId"
    :preselected-to-id="preselectedToId"
    @submit="handleSubmit"
    @close="showCreateModal = false"
  />
</template>

<style scoped>
.page-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.rate-display {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  -webkit-tap-highlight-color: transparent;
}

.rate-edit {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
}

.rate-input {
  width: 5.5rem;
}

.paid-euros {
  margin-left: 6px;
  font-weight: 600;
  white-space: nowrap;
}

.page-header-row .page-title {
  margin-bottom: 0;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: var(--spacing-md);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.section-header .section-title {
  margin-bottom: 0;
}

/* Balances */
.balance-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.balance-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--color-background-elevated);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  flex-wrap: wrap;
  box-shadow: var(--shadow-sm);
}

.balance-users {
  flex: 1;
  font-size: 0.9rem;
}

.debtor {
  font-weight: 600;
  color: var(--color-danger, #dc3545);
}

.creditor {
  font-weight: 600;
  color: var(--color-success, #198754);
}

.balance-arrow {
  color: var(--color-text-secondary);
}

.balance-amount {
  font-weight: 700;
  font-size: 1.1rem;
  flex-shrink: 0;
}

/* Haushaltstopf-Zeile */
.pot-line {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-md);
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-align: left;
  color: inherit;
  font-size: 0.9rem;
  -webkit-tap-highlight-color: transparent;
}

.pot-line-icon {
  color: var(--color-primary);
  font-size: 1.1rem;
}

.pot-line-text {
  flex: 1;
  min-width: 0;
}

/* Points overview */
.points-list {
  background: var(--color-background-elevated);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  box-shadow: var(--shadow-sm);
}

.points-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--color-border);
}

.points-row:last-child {
  border-bottom: none;
}

.member-name {
  font-weight: 500;
}

.member-points {
  font-weight: 600;
  color: var(--color-primary);
}

/* Filter chips */
.filter-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-chip {
  padding: 4px 10px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--color-text-secondary);
  -webkit-tap-highlight-color: transparent;
}

.filter-chip:hover {
  border-color: var(--color-primary);
  color: var(--color-text-primary);
}

.filter-chip.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

/* Settlement list */
.settlement-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.settlement-item {
  background: var(--color-background-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  padding: var(--spacing-md);
}

.settlement-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.settlement-info {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  flex: 1;
}

.method-icon {
  font-size: 1.25rem;
  color: var(--color-text-secondary);
  flex-shrink: 0;
  margin-top: 2px;
}

.settlement-title {
  font-size: 0.9rem;
  font-weight: 500;
}

.settlement-meta {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  margin-top: 2px;
}
</style>
