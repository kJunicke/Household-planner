<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePotStore } from '@/stores/potStore'
import { formatCents } from '@/lib/potLedger'
import { formatEuroInput, parseEuroInput } from '@/lib/settlementAmount'
import { POT_AMOUNT_MAX_CENTS } from '@/lib/limits'
import { toIsoDate } from '@/lib/taskSchedule'

/**
 * Rückzahlung eintragen (CONTEXT.md § Rückzahlung): frei, oder vorausgefüllt
 * aus einem Überweisungsvorschlag (`prefill`).
 */
const props = defineProps<{
  potId: string
  prefill?: { fromId: string; toId: string; amountCents: number }
}>()

const emit = defineEmits<{
  submit: [
    payload: { potId: string; fromId: string; toId: string; amountCents: number; paidOn: string },
  ]
  close: []
}>()

const potStore = usePotStore()

const participants = computed(() => potStore.participantsOf(props.potId))

// Wer einträgt, hat meist selbst überwiesen.
const fromId = ref(
  props.prefill?.fromId ??
    potStore.myParticipantId(props.potId) ??
    participants.value[0]?.participant_id ??
    '',
)
const toId = ref(
  props.prefill?.toId ??
    participants.value.find((p) => p.participant_id !== fromId.value)?.participant_id ??
    '',
)
const amountText = ref(props.prefill ? formatEuroInput(props.prefill.amountCents / 100) : '')
const paidOn = ref(toIsoDate(new Date()))

// Von und an dürfen nicht dieselbe Person sein: wer „von“ auf den Empfänger
// stellt, tauscht beide.
watch(fromId, (next, prev) => {
  if (next === toId.value) toId.value = prev
})

const amountCents = computed(() => {
  const euros = parseEuroInput(amountText.value)
  if (euros === null) return null
  const cents = Math.round(euros * 100)
  return cents > 0 && cents <= POT_AMOUNT_MAX_CENTS ? cents : null
})

const isValid = computed(
  () =>
    !!fromId.value &&
    !!toId.value &&
    fromId.value !== toId.value &&
    amountCents.value !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(paidOn.value),
)

const handleSubmit = () => {
  if (!isValid.value || amountCents.value === null) return
  emit('submit', {
    potId: props.potId,
    fromId: fromId.value,
    toId: toId.value,
    amountCents: amountCents.value,
    paidOn: paidOn.value,
  })
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content repayment-modal" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">Rückzahlung</h5>
          <button class="btn-close" @click="emit('close')" aria-label="Schließen"></button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Von</label>
            <select v-model="fromId" class="form-select">
              <option v-for="p in participants" :key="p.participant_id" :value="p.participant_id">
                {{ potStore.participantName(p.participant_id) }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">An</label>
            <select v-model="toId" class="form-select">
              <option
                v-for="p in participants"
                :key="p.participant_id"
                :value="p.participant_id"
                :disabled="p.participant_id === fromId"
              >
                {{ potStore.participantName(p.participant_id) }}
              </option>
            </select>
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
            <label class="form-label">Datum</label>
            <input v-model="paidOn" type="date" class="form-control" />
          </div>

          <div v-if="isValid && amountCents !== null" class="preview-box">
            <i class="bi bi-arrow-left-right me-1"></i>
            {{ potStore.participantName(fromId) }} überweist {{ potStore.participantName(toId) }}
            {{ formatCents(amountCents) }}
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
.repayment-modal {
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

.preview-box {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 0.9rem;
}
</style>
