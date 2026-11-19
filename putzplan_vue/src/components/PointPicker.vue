<script setup lang="ts">
/**
 * **Punktwahl** — die eine Auswahl für Punkte in jedem Dialog: die
 * Schnelloptionen des Haushalts als Knöpfe, darunter ein freies Feld für jede
 * ganze Zahl, darunter die Beispiele des Richtwerts zum gewählten Wert.
 *
 * `v-model` ist die gewählte Punktzahl, oder `null`, solange nichts Gültiges
 * gewählt ist (leeres oder ungültiges Feld) — der Dialog sperrt dann „Bestätigen“.
 * Welche Zahlen gültig sind, sagt `kind` (→ `isValidPoints`).
 *
 * Optionales Begründungsfeld: `showReason` blendet es ein, `v-model:reason`
 * trägt den Text. Wann es nötig ist, entscheidet der Dialog über das Modul
 * `taskPoints` (Abweichung), nicht diese Komponente.
 */
import { computed, ref, useId, watch } from 'vue'
import { COMPLETION_NOTE_MAX_LENGTH } from '@/lib/limits'
import { POINTS_MAX, examplesFor, isValidPoints, type PointsKind } from '@/lib/taskPoints'
import { usePointBenchmarkStore } from '@/stores/pointBenchmarkStore'

interface Props {
  kind: PointsKind
  /** Standardpunkte der Aufgabe — ihr Knopf ist markiert (Erledigungs-Dialog). */
  defaultPoints?: number | null
  disabled?: boolean
  /** Begründungsfeld unter der Punktwahl zeigen. */
  showReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  defaultPoints: null,
  disabled: false,
  showReason: false,
  reasonLabel: 'Begründung',
  reasonPlaceholder: '',
})

const points = defineModel<number | null>({ required: true })
const reason = defineModel<string>('reason', { default: '' })

const benchmarkStore = usePointBenchmarkStore()
const fieldId = useId()
const reasonId = useId()

const minPoints = computed(() => (props.kind === 'standard' ? 1 : 0))

// Das freie Feld hält seinen eigenen Text: ein ungültiger Wert („1000“) bleibt
// stehen, damit man ihn sieht und korrigiert, während `points` schon `null` ist.
const fieldText = ref(points.value === null ? '' : String(points.value))

const parse = (text: string): number | null => {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return isValidPoints(value, props.kind) ? value : null
}

const fieldInvalid = computed(
  () => fieldText.value.trim() !== '' && parse(fieldText.value) === null,
)

// Von außen gesetzt (Knopf, Vorbelegung): das Feld zeigt dieselbe Zahl.
watch(points, (value) => {
  if (value !== parse(fieldText.value)) fieldText.value = value === null ? '' : String(value)
})

const onFieldInput = (event: Event) => {
  fieldText.value = (event.target as HTMLInputElement).value
  points.value = parse(fieldText.value)
}

const choose = (value: number) => {
  if (props.disabled) return
  points.value = value
}

const examples = computed(() => examplesFor(benchmarkStore.benchmarks, points.value))
</script>

<template>
  <div class="point-picker">
    <div class="quick-options">
      <button
        v-for="option in benchmarkStore.quickOptionPoints"
        :key="option"
        type="button"
        class="quick-option"
        :class="{ active: points === option, default: option === defaultPoints }"
        :disabled="disabled"
        @click="choose(option)"
      >
        {{ option }}
      </button>
    </div>

    <div class="free-field">
      <label class="free-label" :for="fieldId">Andere Zahl</label>
      <input
        :id="fieldId"
        type="number"
        inputmode="numeric"
        class="form-control free-input"
        :class="{ 'is-invalid': fieldInvalid }"
        :min="minPoints"
        :max="POINTS_MAX"
        step="1"
        :value="fieldText"
        :disabled="disabled"
        @input="onFieldInput"
      />
      <span v-if="fieldInvalid" class="free-error">{{ minPoints }}–{{ POINTS_MAX }}</span>
    </div>

    <p v-if="examples.length > 0" class="examples">z. B. {{ examples.join(' · ') }}</p>

    <div v-if="showReason" class="reason">
      <label class="reason-label" :for="reasonId">{{ reasonLabel }}</label>
      <textarea
        :id="reasonId"
        v-model="reason"
        class="form-control"
        rows="2"
        :maxlength="COMPLETION_NOTE_MAX_LENGTH"
        :placeholder="reasonPlaceholder"
        :disabled="disabled"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
.point-picker {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Sechs Knöpfe passen auf 320 px in eine Zeile: der Dialog lässt der Punktwahl
   dort 280 px, sechs Spalten à 2.5rem plus fünf Lücken brauchen 270 px (mit
   2.75rem waren es 294, und „12“ brach um). Mehr Schnelloptionen brechen um. */
.quick-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(2.5rem, 1fr));
  gap: 0.375rem;
}

.quick-option {
  min-height: 2.75rem;
  padding: 0.25rem;
  border: 2px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text-primary);
  border-radius: var(--radius-md);
  font-size: 1.0625rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-option.default {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.quick-option.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.quick-option:disabled {
  opacity: 0.6;
  cursor: default;
}

.free-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.free-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0;
  white-space: nowrap;
}

.free-input {
  width: 5.5rem;
  padding: 0.375rem 0.5rem;
  font-size: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
}

.free-input.is-invalid {
  border-color: var(--bs-danger, #dc3545);
}

.free-error {
  font-size: 0.8125rem;
  color: var(--bs-danger, #dc3545);
}

.examples {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.3;
  color: var(--color-text-secondary);
}

.reason {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.reason-label {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
  color: var(--color-text-primary);
}
</style>
