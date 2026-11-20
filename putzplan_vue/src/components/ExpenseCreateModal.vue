<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePotStore } from '@/stores/potStore'
import { expenseShares, formatCents, splitValidity, type ExpenseSplit } from '@/lib/potLedger'
import { formatEuroInput, parseEuroInput } from '@/lib/settlementAmount'
import { POT_EXPENSE_DESCRIPTION_MAX_LENGTH } from '@/lib/limits'
import { parsePotAmount } from '@/lib/potRules'
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
      split: ExpenseSplit
    },
  ]
  delete: []
  close: []
}>()

const potStore = usePotStore()

// Wer heute dabei ist: im Haushaltstopf ohne ehemalige Mitglieder. Ihre
// Reihenfolge ist die des Topfs, nur ohne Ehemalige — Cent-Reste fallen
// darum gleich wie in der Topf-Rechnung des Stores.
const participants = computed(() => potStore.currentParticipantsOf(props.potId))
const participantOrder = computed(() => participants.value.map((p) => p.participant_id))

const editing = props.expense
const isEdit = !!editing

// Wer einträgt, hat meist selbst bezahlt.
const payerId = ref(
  editing?.payer_participant_id ??
    potStore.myParticipantId(props.potId) ??
    participants.value[0]?.participant_id ??
    '',
)
const description = ref(editing?.description ?? '')
const amountText = ref(editing ? formatEuroInput(editing.amount_cents / 100) : '')
const spentOn = ref(editing?.spent_on ?? toIsoDate(new Date()))

const amountCents = computed(() => parsePotAmount(amountText.value))

// ---------------------------------------------------------------
// Aufteilung (CONTEXT.md § Aufteilung)
// ---------------------------------------------------------------

type SplitMode = ExpenseSplit['kind']
type ValueMode = Exclude<SplitMode, 'equal' | 'whole_group'>

const modes: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Gleich' },
  { value: 'ratio', label: 'Verhältnis' },
  { value: 'percent', label: 'Prozent' },
  { value: 'exact', label: 'Beträge' },
]
const unitOf: Record<ValueMode, string> = { ratio: 'Teile', percent: '%', exact: '€' }

const mode = ref<SplitMode>(editing?.split_kind ?? 'equal')
const isQuickMode = (m: SplitMode) => m === 'equal' || m === 'whole_group'
const showAdvanced = ref(!isQuickMode(mode.value))

// Ganze Gruppe (CONTEXT.md § ganze Gruppe): wer beim Anlegen der Ausgabe dabei
// ist, trägt mit; Nachzügler erst, wenn ein Haushaltsmitglied bestätigt.
// Beim Bearbeiten zählt die Anlage-Zeit der Ausgabe, nicht die von heute.
const wholeGroupIds = computed(() =>
  potStore.wholeGroupCarriersAt(props.potId, editing?.created_at ?? new Date().toISOString()),
)
const toggleWholeGroup = () => {
  mode.value = mode.value === 'whole_group' ? 'equal' : 'whole_group'
}

// Schnell: gleich auf alle, einzelne ab- und wieder anwählbar. Beim Bearbeiten
// die gespeicherte Auswahl, soweit es die Teilnehmer noch gibt.
const selectedIds = ref<string[]>(
  editing?.split_kind === 'equal'
    ? participantOrder.value.filter((id) => id in editing.split_values)
    : [...participantOrder.value],
)
const isSelected = (id: string) => selectedIds.value.includes(id)
const toggleSelected = (id: string) => {
  selectedIds.value = isSelected(id)
    ? selectedIds.value.filter((x) => x !== id)
    : [...selectedIds.value, id]
}

// Erweitert: Rohwerte je Art getrennt, damit ein Wechsel nichts verliert.
// Verhältnis startet bei 1 : 1 : …, Prozent und Beträge leer.
const valueTexts = ref<Record<ValueMode, Record<string, string>>>({
  ratio: Object.fromEntries(participantOrder.value.map((id) => [id, '1'])),
  percent: {},
  exact: {},
})

// Beim Bearbeiten die gespeicherten Rohwerte als Eingabe zurückschreiben
// (Beträge sind Cent, Verhältnis und Prozent die Zahl selbst).
if (editing && !isQuickMode(editing.split_kind)) {
  const kind = editing.split_kind
  valueTexts.value[kind] = Object.fromEntries(
    Object.entries(editing.split_values).map(([id, raw]) => [
      id,
      kind === 'exact' ? formatEuroInput(raw / 100) : String(raw).replace('.', ','),
    ]),
  )
}

/** Eingabe als Zahl; leer zählt als 0, Unlesbares als `null`. */
const parseValue = (text: string | undefined): number | null =>
  !text?.trim() ? 0 : parseEuroInput(text)

const badInputIds = computed(() => {
  const current = mode.value
  if (current === 'equal' || current === 'whole_group') return new Set<string>()
  const texts = valueTexts.value[current]
  return new Set(participantOrder.value.filter((id) => parseValue(texts[id]) === null))
})

const split = computed((): ExpenseSplit => {
  const current = mode.value
  if (current === 'whole_group') {
    return { kind: 'whole_group', participantIds: wholeGroupIds.value }
  }
  if (current === 'equal') {
    return { kind: 'equal', participantIds: participantOrder.value.filter(isSelected) }
  }
  const texts = valueTexts.value[current]
  const toRaw = (n: number) => (current === 'exact' ? Math.round(n * 100) : n)
  return {
    kind: current,
    values: Object.fromEntries(
      participantOrder.value.map((id) => [id, toRaw(parseValue(texts[id]) ?? 0)]),
    ),
  }
})

const validity = computed(() =>
  splitValidity(
    { amountCents: amountCents.value ?? 0, split: split.value },
    participantOrder.value,
  ),
)

const formatPercent = (hundredths: number) =>
  `${formatEuroInput(hundredths / 100).replace(/,00$/, '')} %`

/** Was fehlt oder zu viel ist, solange die Aufteilung nicht aufgeht. */
const splitProblem = computed((): string | null => {
  if (badInputIds.value.size > 0) return 'Bitte nur Zahlen mit höchstens zwei Nachkommastellen'
  const v = validity.value
  if (v.valid) return null
  switch (v.reason) {
    case 'nobody':
      return 'Mindestens eine Person muss mittragen'
    case 'negative':
      return 'Werte dürfen nicht negativ sein'
    case 'percent_off':
      return v.missingHundredthPercent > 0
        ? `Es fehlen noch ${formatPercent(v.missingHundredthPercent)}`
        : `${formatPercent(-v.missingHundredthPercent)} zu viel`
    case 'exact_off':
      // Ohne Betrag gibt es noch keinen Fehlbetrag.
      if (amountCents.value === null) return null
      return v.missingCents > 0
        ? `Es fehlen noch ${formatCents(v.missingCents)}`
        : `${formatCents(-v.missingCents)} zu viel`
  }
  return null
})

const splitOk = computed(() => validity.value.valid && badInputIds.value.size === 0)

// Euro je Person, sobald Betrag und Aufteilung stimmen.
const sharesById = computed(() => {
  if (amountCents.value === null || !splitOk.value) return new Map<string, number>()
  return expenseShares(
    { payerId: payerId.value, amountCents: amountCents.value, split: split.value },
    participantOrder.value,
  )
})

const splitTitle = computed(() => {
  if (mode.value === 'whole_group') return 'Ganze Gruppe'
  if (mode.value !== 'equal') return modes.find((m) => m.value === mode.value)?.label
  return selectedIds.value.length === participantOrder.value.length
    ? 'Gleich auf alle'
    : 'Gleich auf Auswahl'
})

const isValid = computed(
  () =>
    !!payerId.value &&
    amountCents.value !== null &&
    description.value.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(spentOn.value) &&
    splitOk.value,
)

const handleSubmit = () => {
  if (!isValid.value || amountCents.value === null) return
  emit('submit', {
    potId: props.potId,
    payerId: payerId.value,
    amountCents: amountCents.value,
    spentOn: spentOn.value,
    description: description.value.trim(),
    split: split.value,
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
            <div class="split-header">
              <label class="form-label mb-0">Aufteilung</label>
              <button
                type="button"
                class="advanced-toggle"
                :aria-expanded="showAdvanced"
                @click="showAdvanced = !showAdvanced"
              >
                Erweitert
                <i :class="['bi', showAdvanced ? 'bi-chevron-up' : 'bi-chevron-down']"></i>
              </button>
            </div>

            <div
              v-if="showAdvanced"
              class="mode-grid"
              role="radiogroup"
              aria-label="Art der Aufteilung"
            >
              <button
                v-for="m in modes"
                :key="m.value"
                type="button"
                role="radio"
                :aria-checked="mode === m.value || (m.value === 'equal' && mode === 'whole_group')"
                :class="[
                  'mode-btn',
                  (mode === m.value || (m.value === 'equal' && mode === 'whole_group')) && 'active',
                ]"
                @click="mode = m.value"
              >
                {{ m.label }}
              </button>
            </div>

            <div class="split-box">
              <div class="split-kind-row">
                <div class="split-kind"><i class="bi bi-people me-1"></i> {{ splitTitle }}</div>
                <button
                  v-if="isQuickMode(mode)"
                  type="button"
                  :class="['group-toggle', mode === 'whole_group' && 'on']"
                  :aria-pressed="mode === 'whole_group'"
                  @click="toggleWholeGroup"
                >
                  <i class="bi bi-people-fill me-1"></i>Ganze Gruppe
                </button>
              </div>
              <div v-for="p in participants" :key="p.participant_id" class="share-row">
                <button
                  v-if="mode === 'equal'"
                  type="button"
                  :class="['share-toggle', isSelected(p.participant_id) && 'on']"
                  :aria-pressed="isSelected(p.participant_id)"
                  @click="toggleSelected(p.participant_id)"
                >
                  <i
                    :class="[
                      'bi',
                      isSelected(p.participant_id) ? 'bi-check-square-fill' : 'bi-square',
                    ]"
                  ></i>
                  <span class="share-name">{{ potStore.participantName(p.participant_id) }}</span>
                </button>
                <span v-else-if="mode === 'whole_group'" class="share-name">
                  {{ potStore.participantName(p.participant_id) }}
                  <span v-if="!wholeGroupIds.includes(p.participant_id)" class="share-note">
                    ·
                    {{ p.rejected ? 'später dazugekommen, nicht dabei' : 'wartet auf Bestätigung' }}
                  </span>
                </span>
                <template v-else>
                  <span class="share-name">{{ potStore.participantName(p.participant_id) }}</span>
                  <span class="share-input">
                    <input
                      v-model="valueTexts[mode][p.participant_id]"
                      type="text"
                      inputmode="decimal"
                      class="form-control form-control-sm"
                      :class="{ 'is-invalid': badInputIds.has(p.participant_id) }"
                      :aria-label="`${potStore.participantName(p.participant_id)} (${unitOf[mode]})`"
                      placeholder="0"
                      autocomplete="off"
                    />
                    <span class="unit">{{ unitOf[mode] }}</span>
                  </span>
                </template>
                <span class="share-euros">
                  {{
                    sharesById.has(p.participant_id)
                      ? formatCents(sharesById.get(p.participant_id) ?? 0)
                      : '–'
                  }}
                </span>
              </div>
              <div v-if="mode === 'whole_group'" class="split-hint">
                Auch wer später dazukommt, trägt mit — sobald ein Haushaltsmitglied das bestätigt.
              </div>
              <div v-if="splitProblem" class="split-problem" role="status">
                <i class="bi bi-exclamation-circle me-1"></i>{{ splitProblem }}
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

.split-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.advanced-toggle {
  background: none;
  border: none;
  padding: 4px 0;
  font-size: 0.85rem;
  color: var(--color-primary);
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}

.mode-btn {
  padding: 6px 2px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}

.mode-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.split-kind {
  font-weight: 600;
  margin-bottom: 4px;
}

.share-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  color: var(--color-text-secondary);
}

.share-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.share-toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 4px 0;
  text-align: left;
  color: var(--color-text-secondary);
}

.share-toggle.on {
  color: var(--color-text-primary);
}

.share-toggle.on i {
  color: var(--color-primary);
}

.share-input {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.share-input input {
  width: 4.5rem;
  text-align: right;
}

.unit {
  width: 2.2rem;
  font-size: 0.8rem;
}

.share-euros {
  flex-shrink: 0;
  min-width: 4.5rem;
  text-align: right;
}

.split-kind-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.group-toggle {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: none;
  color: inherit;
  font-size: 0.8rem;
  padding: 2px 10px;
  -webkit-tap-highlight-color: transparent;
}

.group-toggle.on {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.share-note,
.split-hint {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.split-hint {
  margin-top: 6px;
}

.split-problem {
  margin-top: 6px;
  font-weight: 600;
  color: var(--color-danger, #dc3545);
}
</style>
