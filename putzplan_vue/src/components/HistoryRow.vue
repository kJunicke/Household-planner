<script setup lang="ts">
import type { HistoryEntry } from '@/composables/useHistoryGroups'

// Eine Completion als dichte Zeile — im Verlauf entweder für sich stehend oder
// eingerückt als Kind einer aufgeklappten Subtask-Faltgruppe.
const props = defineProps<{
  completion: HistoryEntry
  noteExpanded: boolean
  indented?: boolean
}>()

defineEmits<{
  toggleNote: []
  delete: []
}>()

const formatTime = (dateString: string) =>
  new Date(dateString).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

// Farbe allein darf die Person nicht tragen — Screenreader bekommen sie im Label nach.
const label = () =>
  `${props.completion.tasks?.title || 'Unbekannte Aufgabe'}, ` +
  `${props.completion.household_members.display_name}, ` +
  `${formatTime(props.completion.completed_at)}, ${props.completion.points} Punkte`
</script>

<template>
  <div>
    <div
      class="completion-row"
      :class="{ 'is-expandable': !!completion.completion_note, 'is-child': indented }"
      :aria-label="label()"
      @click="completion.completion_note && $emit('toggleNote')"
    >
      <span class="row-time">{{ formatTime(completion.completed_at) }}</span>
      <!-- Quick-Aufgaben tragen technisch auch deleted_at — sie sind aber kein
           gelöschter Task, sondern werden am Blitz erkannt. -->
      <span class="row-title" :class="{ 'is-deleted': completion.isDeleted && !completion.isQuick }">
        <i v-if="completion.isQuick" class="bi bi-lightning-charge-fill row-quick"></i>
        {{ completion.tasks?.title || 'Unbekannte Aufgabe' }}
      </span>
      <i v-if="completion.completion_note" class="bi bi-sticky row-note-icon"></i>
      <span class="user-dot" :style="{ background: completion.household_members.user_color }"></span>
      <span class="row-points">{{ completion.points }}</span>
      <button
        @click.stop="$emit('delete')"
        class="btn btn-sm btn-delete-ghost row-delete"
        title="Eintrag löschen"
      >
        <i class="bi bi-trash"></i>
      </button>
    </div>
    <div v-if="completion.completion_note && noteExpanded" class="row-note">
      {{ completion.completion_note }}
    </div>
  </div>
</template>

<style scoped>
/* Dichte Zeile: alles auf einer Höhe, damit die Liste scannbar bleibt. */
.completion-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 40px;
  padding: 0 0.125rem;
  border-bottom: 1px solid var(--color-border);
}

.completion-row.is-expandable {
  cursor: pointer;
}

/* Kindzeile einer Faltgruppe: eingerückt und als zugehörig erkennbar. */
.completion-row.is-child {
  margin-left: 1rem;
  padding-left: 0.5rem;
  border-left: 2px solid var(--color-border);
}

.row-time {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}

.row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  color: var(--color-text-primary);
}

/* Gelöschter Task: abgeschwächt statt Badge. */
.row-title.is-deleted {
  color: var(--color-text-muted);
  font-style: italic;
}

.row-quick {
  color: var(--color-warning);
  font-size: 0.75rem;
}

.row-note-icon {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.row-points {
  flex-shrink: 0;
  min-width: 1.25rem;
  text-align: right;
  font-size: 0.875rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
}

/* Höhe gedeckelt, damit die Zeile nicht über 40px wächst (der Button weicht in 04
   ohnehin der Wischgeste). */
.row-delete {
  flex-shrink: 0;
  padding: 0 0.5rem;
  line-height: 1;
}

.row-note {
  padding: 0.5rem 0.125rem 0.625rem 3rem;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}

.user-dot {
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}
</style>
