<script setup lang="ts">
/**
 * **Bewerten vor dem Erledigen** (CONTEXT.md § unbewertet): jeder Weg zum
 * Erledigen einer unbewerteten Aufgabe öffnet zuerst diesen Dialog. Der gewählte
 * Wert wird zu ihren Standardpunkten und gilt ab jetzt; erledigt wird erst nach
 * „Bestätigen“ (der Aufrufer ruft `completeTask` mit `standardPoints`).
 * Abbrechen ändert nichts — der Zettel bleibt hängen.
 *
 * Erstes Bewerten ist keine **Abweichung**: es gibt keinen Standard, von dem
 * man abwiche, deshalb kein Begründungsfeld.
 */
import { computed, ref } from 'vue'
import PointPicker from './PointPicker.vue'

interface Props {
  taskTitle: string
  /** Checklisten-Unteraufgabe: das Abhaken zählt 0 Punkte, die Standardpunkte bleiben trotzdem. */
  checklist?: boolean
  isLoading?: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'confirm', standardPoints: number): void
}

const props = withDefaults(defineProps<Props>(), { checklist: false, isLoading: false })
const emit = defineEmits<Emits>()

const selected = ref<number | null>(null)

const canConfirm = computed(() => selected.value !== null && !props.isLoading)

const handleConfirm = () => {
  if (canConfirm.value && selected.value !== null) emit('confirm', selected.value)
}

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click="handleClose">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">Erst bewerten</h3>
          <button class="btn-close" @click="handleClose" aria-label="Schließen"></button>
        </div>

        <div class="modal-body">
          <p class="task-name">{{ taskTitle }}</p>
          <p class="rating-hint">
            Noch unbewertet. Der Wert gilt ab jetzt für diese Aufgabe.
            <template v-if="checklist">Das Abhaken selbst zählt als Checkliste 0 Punkte.</template>
          </p>

          <label class="selection-label">Standardpunkte:</label>
          <PointPicker v-model="selected" kind="standard" :disabled="isLoading" />
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" :disabled="isLoading" @click="handleClose">
            Abbrechen
          </button>
          <button class="btn btn-primary" :disabled="!canConfirm" @click="handleConfirm">
            <span v-if="isLoading" class="spinner-border spinner-border-sm me-1"></span>
            {{ isLoading ? 'Speichert...' : 'Bewerten und erledigen' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.task-name {
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
}

.rating-hint {
  margin: 0 0 1rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.selection-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 0.75rem;
}
</style>
