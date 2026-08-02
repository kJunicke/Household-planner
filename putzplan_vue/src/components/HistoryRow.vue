<script setup lang="ts">
import { computed, watch } from 'vue'
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
  swipeStart: []
  swipeEnd: []
}>()

const { offset, revealed, hide, onPointerDown, onPointerMove, onPointerUp, onClick } =
  useSwipeAction({
    onTap: () => props.completion.completion_note && emit('toggleNote'),
    onSwipeStart: () => emit('swipeStart'),
    onHide: () => emit('swipeEnd')
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

// Nur Zeilen mit Notiz klappen auf — nur die sind Buttons und tastaturerreichbar.
const isExpandable = computed(() => !!props.completion.completion_note)

// Farbe allein darf die Person nicht tragen — Screenreader bekommen sie im Label nach.
const ariaLabel = computed(
  () =>
    `${props.completion.tasks?.title || 'Unbekannte Aufgabe'}, ` +
    `${props.completion.household_members.display_name}, ` +
    `${formatTime(props.completion.completed_at)}, ${props.completion.points} Punkte`
)

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  emit('toggleNote')
}
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
        :class="{ 'is-expandable': isExpandable }"
        :role="isExpandable ? 'button' : undefined"
        :tabindex="isExpandable ? 0 : undefined"
        :aria-expanded="isExpandable ? noteExpanded : undefined"
        :aria-label="isExpandable ? ariaLabel : undefined"
        :style="{ transform: `translateX(${offset}px)` }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @click="onClick"
        @keydown="isExpandable && onKeydown($event)"
      >
        <span class="row-time">{{ formatTime(completion.completed_at) }}</span>
        <!-- Quick-Aufgaben tragen technisch auch deleted_at — sie sind aber kein
             gelöschter Task, sondern werden am Blitz erkannt. -->
        <span
          class="dense-row-title"
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
        <!-- Die Farbe trägt die Person nur visuell; vorgelesen wird der Name. -->
        <span class="visually-hidden">{{ completion.household_members.display_name }}</span>
        <span class="dense-row-points">{{ completion.points }}</span>
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
  font-size: var(--font-lg);
}

/* Dichte Zeile: alles auf einer Höhe, damit die Liste scannbar bleibt.
   pan-y überlässt dem Browser das vertikale Scrollen. */
.completion-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: var(--touch-target-dense);
  padding: 0 0.5rem 0 0.125rem;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
  touch-action: pan-y;
  transition: transform 0.18s ease;
}

.completion-row.is-expandable {
  cursor: pointer;
}

.completion-row:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.row-swipe.is-child .completion-row {
  padding-left: 0.5rem;
}

.row-time {
  flex-shrink: 0;
  font-size: var(--font-sm);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}

/* Gelöschter Task: abgeschwächt statt Badge. */
.dense-row-title.is-deleted {
  color: var(--color-text-muted);
  font-style: italic;
}

.row-quick {
  color: var(--color-warning);
  font-size: var(--font-sm);
}

.row-note-icon {
  flex-shrink: 0;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

.row-note {
  padding: 0.5rem 0.125rem 0.625rem 3rem;
  font-size: var(--font-sm);
  line-height: 1.4;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}
</style>
