<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePotStore } from '@/stores/potStore'
import { expenseShares, formatCents } from '@/lib/potLedger'
import { formatEuroInput, parseEuroInput } from '@/lib/settlementAmount'
import { POT_AMOUNT_MAX_CENTS, POT_EXPENSE_DESCRIPTION_MAX_LENGTH } from '@/lib/limits'
import { toIsoDate } from '@/lib/taskSchedule'
import type { PotExpense } from '@/types/Pot'

// Mit `expense` bearbeitet der Dialog eine bestehende Ausgabe, sonst legt er eine an.
const props = defineProps<{ potId: string; expense?: PotExpense }>()

const emit = defineEmits<{
  submit: [
    payload: {
      potId: string
      payerId: string
      amountCents: number
      spentOn: string
      description: string
      participantIds: string[]
    },
  ]
  delete: []
  close: []
}>()

const potStore = usePotStore()

const participants = computed(() => potStore.participantsOf(props.potId))

const isEdit = !!props.expense

// Wer einträgt, hat meist selbst bezahlt.
const payerId = ref(
  props.expense?.payer_participant_id ??
    potStore.myParticipantId(props.potId) ??
    participants.value[0]?.participant_id ??
    '',
)
const description = ref(props.expense?.description ?? '')
const amountText = ref(props.expense ? formatEuroInput(props.expense.amount_cents / 100) : '')
const spentOn = ref(props.expense?.spent_on ?? toIsoDate(new Date()))

const amountCents = computed(() => {
  const euros = parseEuroInput(amountText.value)
  if (euros === null) return null
  const cents = Math.round(euros * 100)
  return cents > 0 && cents <= POT_AMOUNT_MAX_CENTS ? cents : null
})

// Gleich auf alle, die heute im Topf sind. Beim Bearbeiten bleibt die
// gespeicherte Auswahl, soweit es die Teilnehmer noch gibt.
const participantIds = computed(() => {
  const all = participants.value.map((p) => p.participant_id)
  const saved = props.expense ? Object.keys(props.expense.split_values) : null
  return saved ? all.filter((id) => saved.includes(id)) : all
})

const shares = computed(() => {
  if (amountCents.value === null) return []
  const byId = expenseShares(
    {
      payerId: payerId.value,
      amountCents: amountCents.value,
      split: { kind: 'equal', participantIds: participantIds.value },
    },
    participantIds.value,
  )
  return participants.value.map((p) => ({
    id: p.participant_id,
    name: potStore.participantName(p.participant_id),
    cents: byId.get(p.participant_id) ?? 0,
  }))
})

const isValid = computed(
  () =>
    !!payerId.value &&
    amountCents.value !== null &&
    description.value.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(spentOn.value) &&
    participantIds.value.length > 0,
)

const handleSubmit = () => {
  if (!isValid.value || amountCents.value === null) return
  emit('submit', {
    potId: props.potId,
    payerId: payerId.value,
    amountCents: amountCents.value,
    spentOn: spentOn.value,
    description: description.value.trim(),
    participantIds: participantIds.value,
  })
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content expense-modal" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">{{ isEdit ? 'Ausgabe bearbeiten' : 'Neue Ausgabe' }}</h5>
          <button class="btn-close" @click="emit('close')" aria-label="Schließen"></button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Beschreibung</label>
            <input
              v-model="description"
              type="text"
              class="form-control"
              placeholder="z.B. Wocheneinkauf, Stromrechnung..."
              :maxlength="POT_EXPENSE_DESCRIPTION_MAX_LENGTH"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Betrag</label>
            <div class="euro-input">
              <input
                v-model="amountText"
                type="text"
                inputmode="decimal"
                class="form-control"
                :class="{ 'is-invalid': amountText !== '' && amountCents === null }"
                placeholder="0,00"
                autocomplete="off"
              />
              <span class="euro-sign">€</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Bezahlt von</label>
            <select v-model="payerId" class="form-select">
              <option v-for="p in participants" :key="p.participant_id" :value="p.participant_id">
                {{ potStore.participantName(p.participant_id) }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Datum</label>
            <input v-model="spentOn" type="date" class="form-control" />
          </div>

          <div class="form-group">
            <label class="form-label">Aufteilung</label>
            <div class="split-box">
              <div class="split-kind"><i class="bi bi-people me-1"></i> Gleich auf alle</div>
              <div v-for="s in shares" :key="s.id" class="share-row">
                <span>{{ s.name }}</span>
                <span>{{ formatCents(s.cents) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <!-- Ohne Rückfrage: das Löschen lässt sich über den Hinweis zurücknehmen. -->
          <button v-if="isEdit" class="btn btn-outline-danger me-auto" @click="emit('delete')">
            <i class="bi bi-trash me-1"></i> Löschen
          </button>
          <button class="btn btn-secondary" @click="emit('close')">Abbrechen</button>
          <button class="btn btn-primary" @click="handleSubmit" :disabled="!isValid">
            <i class="bi bi-check-lg me-1"></i> {{ isEdit ? 'Speichern' : 'Eintragen' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.expense-modal {
  max-width: 480px;
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

.split-box {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.9rem;
}

.split-kind {
  font-weight: 600;
  margin-bottom: 4px;
}

.share-row {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-secondary);
}
</style>
