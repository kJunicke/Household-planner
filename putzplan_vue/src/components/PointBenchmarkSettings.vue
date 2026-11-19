<script setup lang="ts">
/**
 * Pflege der **Richtwerte** in den Haushalts-Einstellungen: Liste aufsteigend
 * nach Punkten, je Richtwert der Schalter „Knopf“ (**Schnelloption**) und die
 * Beispiele; anlegen, Beispiele bearbeiten, löschen.
 *
 * Alles speichert sofort über den Store (optimistisch, Realtime hält das andere
 * Gerät gleich). Was gültig ist, sagt `@/lib/pointBenchmarks`.
 */
import { computed, ref, useId } from 'vue'
import { POINTS_MAX } from '@/lib/taskPoints'
import { parseBenchmarkPoints, parseExamples } from '@/lib/pointBenchmarks'
import { usePointBenchmarkStore } from '@/stores/pointBenchmarkStore'
import type { PointBenchmark } from '@/types/PointBenchmark'

const benchmarkStore = usePointBenchmarkStore()
const newPointsId = useId()

const sortedBenchmarks = computed(() =>
  [...benchmarkStore.benchmarks].sort((a, b) => a.points - b.points),
)

// --- Anlegen -----------------------------------------------------------------
const newPointsText = ref('')
const newIsQuickOption = ref(true)
// Die Meldung erscheint erst nach dem ersten Versuch, nicht schon beim Tippen
// der ersten Ziffer von „12“, wenn es „1“ schon gibt.
const createAttempted = ref(false)

const newPointsParsed = computed(() =>
  parseBenchmarkPoints(benchmarkStore.benchmarks, newPointsText.value),
)
const createError = computed(() =>
  createAttempted.value && 'error' in newPointsParsed.value ? newPointsParsed.value.error : null,
)

const create = () => {
  createAttempted.value = true
  const parsed = newPointsParsed.value
  if ('error' in parsed) return
  if (benchmarkStore.createBenchmark(parsed.points, newIsQuickOption.value)) {
    newPointsText.value = ''
    createAttempted.value = false
  }
}

const onNewPointsInput = (event: Event) => {
  newPointsText.value = (event.target as HTMLInputElement).value
}

// --- Beispiele bearbeiten, löschen -------------------------------------------
const editingId = ref<string | null>(null)
const examplesText = ref('')
const confirmingDeleteId = ref<string | null>(null)

const examplesParsed = computed(() => parseExamples(examplesText.value))
const examplesError = computed(() =>
  'error' in examplesParsed.value ? examplesParsed.value.error : null,
)

const startEditing = (benchmark: PointBenchmark) => {
  editingId.value = benchmark.benchmark_id
  examplesText.value = benchmark.examples.join('\n')
  confirmingDeleteId.value = null
}

const stopEditing = () => {
  editingId.value = null
  examplesText.value = ''
  confirmingDeleteId.value = null
}

const saveExamples = (benchmark: PointBenchmark) => {
  const parsed = examplesParsed.value
  if ('error' in parsed) return
  benchmarkStore.updateBenchmark(benchmark.benchmark_id, { examples: parsed.examples })
  stopEditing()
}

const toggleQuickOption = (benchmark: PointBenchmark) => {
  benchmarkStore.updateBenchmark(benchmark.benchmark_id, {
    is_quick_option: !benchmark.is_quick_option,
  })
}

const remove = (benchmark: PointBenchmark) => {
  if (confirmingDeleteId.value !== benchmark.benchmark_id) {
    confirmingDeleteId.value = benchmark.benchmark_id
    return
  }
  benchmarkStore.deleteBenchmark(benchmark.benchmark_id)
  stopEditing()
}
</script>

<template>
  <div class="benchmarks">
    <p class="benchmarks-hint">
      1 Punkt ≈ 5 Minuten leichte Arbeit. Richtwerte mit „Knopf“ erscheinen in jeder Punktwahl, ihre
      Beispiele zeigt sie zur gewählten Zahl.
    </p>

    <ul v-if="sortedBenchmarks.length > 0" class="benchmark-list">
      <li v-for="benchmark in sortedBenchmarks" :key="benchmark.benchmark_id" class="benchmark">
        <div class="benchmark-head">
          <span class="benchmark-points">{{ benchmark.points }}</span>
          <button
            type="button"
            class="benchmark-examples"
            :aria-expanded="editingId === benchmark.benchmark_id"
            @click="editingId === benchmark.benchmark_id ? stopEditing() : startEditing(benchmark)"
          >
            <span v-if="benchmark.examples.length > 0">{{ benchmark.examples.join(' · ') }}</span>
            <span v-else class="benchmark-empty">Beispiele eintragen</span>
          </button>
          <label class="quick-switch">
            <input
              type="checkbox"
              role="switch"
              class="form-check-input"
              :checked="benchmark.is_quick_option"
              @change="toggleQuickOption(benchmark)"
            />
            <span>Knopf</span>
          </label>
        </div>

        <div v-if="editingId === benchmark.benchmark_id" class="benchmark-edit">
          <textarea
            v-model="examplesText"
            class="form-control"
            rows="3"
            placeholder="Eine Aufgabe pro Zeile, z. B. Spülmaschine ausräumen"
            :aria-label="`Beispiele für ${benchmark.points} Punkte`"
          ></textarea>
          <p v-if="examplesError" class="field-error">{{ examplesError }}</p>
          <div class="edit-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="examplesError !== null"
              @click="saveExamples(benchmark)"
            >
              Speichern
            </button>
            <button type="button" class="btn btn-secondary btn-sm" @click="stopEditing">
              Abbrechen
            </button>
            <button
              type="button"
              class="btn btn-sm delete-btn"
              :class="
                confirmingDeleteId === benchmark.benchmark_id ? 'btn-danger' : 'btn-outline-danger'
              "
              @click="remove(benchmark)"
            >
              <i class="bi bi-trash"></i>
              {{ confirmingDeleteId === benchmark.benchmark_id ? 'Wirklich löschen' : 'Löschen' }}
            </button>
          </div>
        </div>
      </li>
    </ul>
    <p v-else-if="benchmarkStore.loaded" class="benchmarks-hint">Noch keine Richtwerte.</p>

    <form class="benchmark-create" novalidate @submit.prevent="create">
      <label :for="newPointsId" class="create-label">Neuer Richtwert</label>
      <div class="create-row">
        <input
          :id="newPointsId"
          type="number"
          inputmode="numeric"
          class="form-control create-input"
          :class="{ 'is-invalid': createError }"
          min="1"
          :max="POINTS_MAX"
          step="1"
          placeholder="Pkt."
          :value="newPointsText"
          @input="onNewPointsInput"
        />
        <label class="quick-switch">
          <input
            v-model="newIsQuickOption"
            type="checkbox"
            role="switch"
            class="form-check-input"
          />
          <span>Knopf</span>
        </label>
        <button type="submit" class="btn btn-outline-primary create-btn">
          <i class="bi bi-plus-lg"></i> Anlegen
        </button>
      </div>
      <p v-if="createError" class="field-error">{{ createError }}</p>
    </form>
  </div>
</template>

<style scoped>
.benchmarks {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.benchmarks-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.benchmark-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.benchmark {
  background: var(--color-background);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
}

.benchmark-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: var(--touch-target-min);
}

.benchmark-points {
  flex-shrink: 0;
  min-width: 2.75rem;
  text-align: center;
  font-size: 1.0625rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
}

/* Die Beispiele sind zugleich der Knopf zum Bearbeiten: die ganze Breite
   zwischen Zahl und Schalter ist Trefferfläche. */
.benchmark-examples {
  flex: 1;
  min-width: 0;
  min-height: var(--touch-target-min);
  padding: 0.25rem;
  border: none;
  background: none;
  text-align: left;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
  cursor: pointer;
}

.benchmark-empty {
  color: var(--color-text-secondary);
  font-style: italic;
}

.quick-switch {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-height: var(--touch-target-min);
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.quick-switch .form-check-input {
  width: 2.25rem;
  height: 1.25rem;
  margin: 0;
  border-radius: 1rem;
  cursor: pointer;
}

.benchmark-edit {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.edit-actions .btn {
  min-height: var(--touch-target-min);
}

.delete-btn {
  margin-left: auto;
}

.benchmark-create {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.create-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0;
}

/* Feld, Schalter und Knopf in einer Zeile auch auf 320 px (dort 272 px breit,
   gemessen 2026-11-19: vorher 309 px Inhalt). Das Feld gibt nach (bis 4rem, für
   drei Ziffern und „Pkt.“), Lücken und Knopf-Innenrand sind schmal. */
.create-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.create-input {
  flex: 1 1 4rem;
  min-width: 0;
  max-width: 6rem;
  min-height: var(--touch-target-min);
  padding-inline: 0.5rem;
}

.create-btn {
  flex: 1;
  min-height: var(--touch-target-min);
  padding-inline: 0.75rem;
  white-space: nowrap;
}

.field-error {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-danger);
}
</style>
