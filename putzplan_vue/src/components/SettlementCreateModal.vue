<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { SettlementMethod } from '@/types/Settlement'
import { useHouseholdStore } from '@/stores/householdStore'
import { useAuthStore } from '@/stores/authStore'
import { useSettlementStore } from '@/stores/settlementStore'
import { usePotStore } from '@/stores/potStore'
import { formatCents } from '@/lib/potLedger'
import {
  MAX_PAID_EUROS,
  formatEuroInput,
  householdPotCredit,
  openBalance,
  parseEuroInput,
  potOffsetPoints,
  suggestEuros,
} from '@/lib/settlementAmount'

const props = defineProps<{
  preselectedFromId?: string
  preselectedToId?: string
}>()

const emit = defineEmits<{
  submit: [
    payload: {
      fromUserId: string
      toUserId: string
      pointsSettled: number
      method: SettlementMethod
      paidEuros?: number
      description?: string
      settledAt?: string
    },
  ]
  close: []
}>()

const householdStore = useHouseholdStore()
const authStore = useAuthStore()
const settlementStore = useSettlementStore()
const potStore = usePotStore()

const MAX_SETTLEMENT_POINTS = 9999
/** Grenze einer Rückzahlung (pot_repayments.amount_cents ≤ 99.999.999). */
const MAX_POT_REPAYMENT_EUROS = 999999.99

const fromUserId = ref(props.preselectedFromId ?? authStore.user?.id ?? '')
const toUserId = ref(props.preselectedToId ?? '')
// Leeres Feld statt 0, wenn nichts offen ist: dann trägt man selbst ein.
const pointsSettled = ref<number | ''>('')
const method = ref<SettlementMethod>('activity')
const eurosText = ref('')
const description = ref('')
const settledAt = ref(new Date().toISOString().slice(0, 16)) // datetime-local format

const openPoints = computed(() =>
  openBalance(settlementStore.pairBalances, fromUserId.value, toUserId.value),
)

// Verrechnen mit dem Haushaltstopf: angeboten, wenn wer hinten liegt (Von)
// im Haushaltstopf bei An Geld gut hat. Ereignistöpfe zählen nie.
const potCreditCents = computed(() => {
  const pot = potStore.householdPot
  if (!pot) return 0
  const participantOf = (userId: string) =>
    potStore.participantsOf(pot.pot_id).find((p) => p.user_id === userId)?.participant_id ?? ''
  return householdPotCredit(
    potStore.balancesOf(pot.pot_id),
    participantOf(fromUserId.value),
    participantOf(toUserId.value),
  )
})

const potPoints = computed(() =>
  potOffsetPoints(openPoints.value, potCreditCents.value, householdStore.eurosPerPoint),
)

const canOffsetWithPot = computed(() => potPoints.value > 0)

watch(canOffsetWithPot, (available) => {
  if (!available && method.value === 'pot') method.value = 'activity'
})

// Vorbelegt ist die ganze offene Bilanz des Paars, beim Verrechnen höchstens
// so viel, wie das Guthaben im Topf deckt; verringern = Teilausgleich.
watch(
  [fromUserId, toUserId, () => method.value === 'pot'],
  ([, , withPot]) => {
    const points = withPot ? potPoints.value : openPoints.value
    pointsSettled.value = points > 0 ? points : ''
  },
  { immediate: true },
)

const carriesEuros = computed(() => method.value === 'money' || method.value === 'pot')

const validPoints = computed(() => {
  const p = pointsSettled.value
  return typeof p === 'number' && Number.isInteger(p) && p > 0 && p <= MAX_SETTLEMENT_POINTS
    ? p
    : null
})

// Euro-Vorschlag folgt den Punkten. Der Betrag selbst wirkt nie auf die
// Punkte zurück: die Punkte gleichen die Bilanz aus, der Betrag hält fest,
// was floss (CONTEXT.md § Ausgleich).
watch(
  [validPoints, method],
  ([points, m]) => {
    if ((m !== 'money' && m !== 'pot') || points === null) return
    eurosText.value = formatEuroInput(suggestEuros(points, householdStore.eurosPerPoint))
  },
  { immediate: true },
)

// Beim Verrechnen wird der Betrag eine Rückzahlung: mindestens ein Cent.
const paidEuros = computed(() => {
  const value = parseEuroInput(eurosText.value)
  if (value === null) return null
  if (method.value === 'pot') return value > 0 && value <= MAX_POT_REPAYMENT_EUROS ? value : null
  return value <= MAX_PAID_EUROS ? value : null
})

const rateLabel = computed(() => formatEuroInput(householdStore.eurosPerPoint))

const allMethods: { value: SettlementMethod; label: string; icon: string }[] = [
  { value: 'activity', label: 'Aktivität', icon: 'bi-bullseye' },
  { value: 'money', label: 'Geld', icon: 'bi-cash-coin' },
  { value: 'pot', label: 'Topf', icon: 'bi-house-heart' },
  { value: 'surprise', label: 'Überraschung', icon: 'bi-gift' },
  { value: 'other', label: 'Sonstiges', icon: 'bi-three-dots' },
]

const methods = computed(() =>
  allMethods.filter((m) => m.value !== 'pot' || canOffsetWithPot.value),
)

const members = computed(() => householdStore.householdMembers)

const otherMembers = computed(() => members.value.filter((m) => m.user_id !== fromUserId.value))

const isValid = computed(
  () =>
    fromUserId.value &&
    toUserId.value &&
    fromUserId.value !== toUserId.value &&
    validPoints.value !== null &&
    (!carriesEuros.value || paidEuros.value !== null) &&
    (method.value !== 'pot' || canOffsetWithPot.value),
)

const handleFromChange = () => {
  if (toUserId.value === fromUserId.value) {
    toUserId.value = ''
  }
}

const handleSubmit = () => {
  if (!isValid.value || validPoints.value === null) return
  emit('submit', {
    fromUserId: fromUserId.value,
    toUserId: toUserId.value,
    pointsSettled: validPoints.value,
    method: method.value,
    paidEuros: carriesEuros.value ? (paidEuros.value ?? undefined) : undefined,
    description: description.value.trim() || undefined,
    settledAt: new Date(settledAt.value).toISOString(),
  })
}

const getMemberName = (userId: string) => {
  const m = members.value.find((m) => m.user_id === userId)
  return m?.display_name ?? 'Unbekannt'
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content settlement-modal" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">Neuer Ausgleich</h5>
          <button class="btn-close" @click="emit('close')" aria-label="Schließen"></button>
        </div>

        <div class="modal-body">
          <!-- Von / An -->
          <div class="user-row">
            <div class="form-group flex-1">
              <label class="form-label">Von</label>
              <select v-model="fromUserId" class="form-select" @change="handleFromChange">
                <option v-for="m in members" :key="m.user_id" :value="m.user_id">
                  {{ m.display_name }}
                </option>
              </select>
            </div>
            <div class="arrow-icon">
              <i class="bi bi-arrow-right"></i>
            </div>
            <div class="form-group flex-1">
              <label class="form-label">An</label>
              <select v-model="toUserId" class="form-select">
                <option value="" disabled>Wählen…</option>
                <option v-for="m in otherMembers" :key="m.user_id" :value="m.user_id">
                  {{ m.display_name }}
                </option>
              </select>
            </div>
          </div>

          <!-- Punkte -->
          <div class="form-group">
            <label class="form-label">Punkte</label>
            <input
              v-model.number="pointsSettled"
              type="number"
              class="form-control"
              min="1"
              :max="MAX_SETTLEMENT_POINTS"
              step="1"
              inputmode="numeric"
            />
          </div>

          <!-- Methode -->
          <div class="form-group">
            <label class="form-label">Art des Ausgleichs</label>
            <div
              class="method-grid"
              :style="{ gridTemplateColumns: `repeat(${methods.length}, 1fr)` }"
            >
              <button
                v-for="m in methods"
                :key="m.value"
                :class="['method-btn', method === m.value && 'active']"
                @click="method = m.value"
                type="button"
              >
                <i :class="['bi', m.icon]"></i>
                <span>{{ m.label }}</span>
              </button>
            </div>
          </div>

          <!-- Verrechnen: woher das Geld kommt -->
          <p v-if="method === 'pot'" class="pot-hint">
            <i class="bi bi-house-heart me-1"></i>
            Mit dem Haushaltstopf verrechnen: {{ getMemberName(fromUserId) }} hat dort bei
            {{ getMemberName(toUserId) }} {{ formatCents(potCreditCents) }} gut. Der Betrag wird als
            Rückzahlung im Haushaltstopf eingetragen.
          </p>

          <!-- Betrag (Geld und Verrechnen) -->
          <div v-if="carriesEuros" class="form-group">
            <label class="form-label">
              {{ method === 'pot' ? 'Betrag im Haushaltstopf' : 'Betrag' }}
              <span class="text-muted">(Vorschlag: Punkte × {{ rateLabel }} €)</span>
            </label>
            <div class="euro-input">
              <input
                v-model="eurosText"
                type="text"
                inputmode="decimal"
                class="form-control"
                :class="{ 'is-invalid': eurosText !== '' && paidEuros === null }"
                autocomplete="off"
              />
              <span class="euro-sign">€</span>
            </div>
          </div>

          <!-- Kommentar -->
          <div class="form-group">
            <label class="form-label">Kommentar <span class="text-muted">(optional)</span></label>
            <input
              v-model="description"
              type="text"
              class="form-control"
              placeholder="z.B. aufgerundet, heute Abend kochen..."
              maxlength="500"
            />
          </div>

          <!-- Datum -->
          <div class="form-group">
            <label class="form-label">Datum</label>
            <input v-model="settledAt" type="datetime-local" class="form-control" />
          </div>

          <!-- Vorschau -->
          <div v-if="isValid" class="preview-box">
            <i class="bi bi-info-circle me-2 text-muted"></i>
            <span>
              <strong>{{ getMemberName(fromUserId) }}</strong>
              gleicht
              <strong>{{ validPoints }}</strong> Punkte aus für
              <strong>{{ getMemberName(toUserId) }}</strong>
              <template v-if="method === 'money'">
                mit <strong>{{ formatEuroInput(paidEuros ?? 0) }} €</strong>
              </template>
              <template v-if="method === 'pot'">
                und verrechnet <strong>{{ formatEuroInput(paidEuros ?? 0) }} €</strong> im
                Haushaltstopf
              </template>
            </span>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="emit('close')">Abbrechen</button>
          <button class="btn btn-primary" @click="handleSubmit" :disabled="!isValid">
            <i class="bi bi-check-lg me-1"></i> Eintragen
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settlement-modal {
  max-width: 480px;
}

.user-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: var(--spacing-md);
}

.flex-1 {
  flex: 1;
  margin-bottom: 0;
}

.arrow-icon {
  padding-bottom: 8px;
  color: var(--color-text-secondary);
  font-size: 1.2rem;
  flex-shrink: 0;
}

/* Spaltenzahl im Template: „Topf“ kommt nur dazu, wenn Verrechnen geht. */
.method-grid {
  display: grid;
  gap: 8px;
}

.pot-hint {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-md);
}

.method-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  -webkit-tap-highlight-color: transparent;
}

.method-btn i {
  font-size: 1.25rem;
}

.method-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-text-primary);
}

.method-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.euro-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.euro-sign {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.preview-box {
  display: flex;
  align-items: center;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}
</style>
