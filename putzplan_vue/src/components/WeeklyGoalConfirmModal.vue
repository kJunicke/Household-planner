<script setup lang="ts">
import { computed } from 'vue'
import { WEEK_DAY_LABELS, formatWeekStartDate } from '@/lib/weekWindow'

/**
 * Bestätigung vor dem Speichern von Wochenziel und Wochenstart.
 *
 * Sie benennt die Folgen **konkret** statt allgemein „bist du sicher?": die
 * beiden Änderungen wirken zu verschiedenen Zeitpunkten, und genau das ist der
 * Punkt, an dem sich sonst jemand um seinen laufenden Stand betrogen fühlt.
 */
interface Props {
  /** Bisheriges Ziel / bisheriger Wochenstart — für den „von … auf …"-Satz. */
  currentGoalPoints: number
  currentWeekStartDay: number
  newGoalPoints: number
  newWeekStartDay: number
  /** Punkte, die der Haushalt in der laufenden Woche schon hat. */
  currentPoints: number
  /** Start der laufenden Woche — Basis für ihre einmalige Überlänge. */
  currentWeekStart: Date
  /** Tag, ab dem der neue Wochenstart greift. */
  effectiveFrom: Date
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const goalChanged = computed(() => props.newGoalPoints !== props.currentGoalPoints)
const weekStartChanged = computed(() => props.newWeekStartDay !== props.currentWeekStartDay)

const newWeekStartLabel = computed(() => WEEK_DAY_LABELS[props.newWeekStartDay])
const effectiveFromLabel = computed(() => formatWeekStartDate(props.effectiveFrom))

/**
 * Länge der laufenden Woche bis zum Wechsel. Sie ist einmalig länger als
 * sieben Tage, wenn der neue Wochentag nicht genau auf das Wochenende fällt —
 * das gehört in die Bestätigung, sonst wundert sich später jemand, warum der
 * Balken diesmal so lange nicht zurückgesetzt hat.
 */
const DAY_MS = 24 * 60 * 60 * 1000
const transitionWeekDays = computed(() =>
  Math.round((props.effectiveFrom.getTime() - props.currentWeekStart.getTime()) / DAY_MS)
)
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop goal-confirm" @click="emit('close')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">Wochenziel ändern?</h3>
          <button class="btn-close" @click="emit('close')" aria-label="Schließen">×</button>
        </div>

        <div class="modal-body">
          <ul class="consequence-list">
            <li v-if="goalChanged">
              <i class="bi bi-lightning-charge-fill consequence-icon now"></i>
              <span>
                Das Ziel gilt <strong>sofort für diese Woche</strong>:
                {{ currentPoints }} von {{ newGoalPoints }} Punkten statt
                {{ currentPoints }} von {{ currentGoalPoints }}.
              </span>
            </li>
            <li v-if="weekStartChanged">
              <i class="bi bi-calendar-event consequence-icon later"></i>
              <span>
                Der neue Wochenstart ({{ newWeekStartLabel }}) greift
                <strong>erst ab {{ effectiveFromLabel }}</strong>.
                Die laufende Woche bleibt unangetastet — keine Punkte
                verschwinden.
                <template v-if="transitionWeekDays > 7">
                  Sie ist dafür einmalig {{ transitionWeekDays }} Tage lang
                  statt sieben.
                </template>
              </span>
            </li>
          </ul>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="emit('close')">
            Abbrechen
          </button>
          <button type="button" class="btn btn-primary" @click="emit('confirm')">
            Speichern
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Über der Settings-Sidebar (z-index 1050), aus der das Modal geöffnet wird. */
.goal-confirm {
  z-index: 1060;
}

.consequence-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.consequence-list li {
  display: flex;
  gap: var(--spacing-sm);
  align-items: flex-start;
  color: var(--color-text-primary);
  line-height: 1.45;
}

.consequence-icon {
  flex-shrink: 0;
  margin-top: 0.15rem;
  font-size: 1.1rem;
}

.consequence-icon.now {
  color: var(--color-primary);
}

.consequence-icon.later {
  color: var(--color-text-secondary);
}
</style>
