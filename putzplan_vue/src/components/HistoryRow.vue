<script setup lang="ts">
import { watch } from 'vue'
import type { HistoryEntry } from '@/composables/useHistoryGroups'
import { useSwipeAction } from '@/composables/useSwipeAction'

// Eine Completion als dichte Zeile — im Verlauf entweder für sich stehend oder
// eingerückt als Kind einer aufgeklappten Subtask-Faltgruppe. Ein Wisch nach links
// legt das Löschen frei; im Ruhezustand bleibt die Zeile ruhig.
const props = defineProps<{
  completion: HistoryEntry
  noteExpanded: boolean
  /** Zeile, die aktuell aufgewischt ist — es ist immer nur eine offen. */
  swipeOpenId: string | null
  indented?: boolean
}>()

const emit = defineEmits<{
  toggleNote: []
  delete: []
  reveal: []
}>()

const { offset, revealed, hide, onPointerDown, onPointerMove, onPointerUp, onClick } =
  useSwipeAction({
    onTap: () => props.completion.completion_note && emit('toggleNote'),
    onReveal: () => emit('reveal')
  })

// Wischt woanders eine Zeile auf, schließt sich diese hier.
watch(
  () => props.swipeOpenId,
  id => {
    if (revealed.value && id !== props.completion.completion_id) hide()
  }
)

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
    <div class="row-swipe" :class="{ 'is-child': indented }">
      <button
        class="row-swipe-delete"
        :tabindex="revealed ? 0 : -1"
        :aria-hidden="!revealed"
        title="Eintrag löschen"
        @click="$emit('delete')"
      >
        <i class="bi bi-trash"></i>
      </button>
      <div
        class="completion-row"
        :class="{ 'is-expandable': !!completion.completion_note }"
        :style="{ transform: `translateX(${offset}px)` }"
        :aria-label="label()"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @click="onClick"
      >
        <span class="row-time">{{ formatTime(completion.completed_at) }}</span>
        <!-- Quick-Aufgaben tragen technisch auch deleted_at — sie sind aber kein
             gelöschter Task, sondern werden am Blitz erkannt. -->
        <span
          class="row-title"
          :class="{ 'is-deleted': completion.isDeleted && !completion.isQuick }"
        >
          <i v-if="completion.isQuick" class="bi bi-lightning-charge-fill row-quick"></i>
          {{ completion.tasks?.title || 'Unbekannte Aufgabe' }}
        </span>
        <i v-if="completion.completion_note" class="bi bi-sticky row-note-icon"></i>
        <span
          class="user-dot"
          :style="{ background: completion.household_members.user_color }"
        ></span>
        <span class="row-points">{{ completion.points }}</span>
      </div>
    </div>
    <div v-if="completion.completion_note && noteExpanded" class="row-note">
      {{ completion.completion_note }}
    </div>
  </div>
</template>

<style scoped>
/* Die Löschfläche liegt hinter der Zeile und wird vom Wisch freigelegt. */
.row-swipe {
  position: relative;
  overflow: hidden;
}

.row-swipe.is-child {
  margin-left: 1rem;
  border-left: 2px solid var(--color-border);
}

.row-swipe-delete {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--bs-danger, #dc3545);
  color: #fff;
  font-size: 1rem;
}

/* Dichte Zeile: alles auf einer Höhe, damit die Liste scannbar bleibt.
   pan-y überlässt dem Browser das vertikale Scrollen. */
.completion-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 40px;
  padding: 0 0.5rem 0 0.125rem;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
  touch-action: pan-y;
  transition: transform 0.18s ease;
}

.completion-row.is-expandable {
  cursor: pointer;
}

.row-swipe.is-child .completion-row {
  padding-left: 0.5rem;
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
