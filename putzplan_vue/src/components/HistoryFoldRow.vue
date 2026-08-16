<script setup lang="ts">
import { computed } from 'vue'
import type { HistoryFoldRow } from '@/composables/useHistoryGroups'
import { useSwipeAction } from '@/composables/useSwipeAction'

// Die Subtask-Completions eines Parent-Tasks an einem Tag, zu einer Zeile gefaltet.
// Sie gibt nichts frei, muss aber genauso wenig auf einen horizontalen Zug hin
// auf- oder zuklappen — dafür läuft die Geste durch dasselbe Composable wie bei
// der Einzelzeile, nur ohne Aktion dahinter.
const props = defineProps<{
  row: HistoryFoldRow
  expanded: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()

const { onPointerDown, onPointerMove, onPointerUp, onClick } = useSwipeAction({
  actionWidth: 0,
  onTap: () => emit('toggle')
})

// Farbe allein darf die Beteiligten nicht tragen — Screenreader bekommen sie im Label nach.
const ariaLabel = computed(() => {
  const count = props.row.children.length
  return (
    `${props.row.parentTitle}, ${count} ${count === 1 ? 'Subtask' : 'Subtasks'} von ` +
    `${props.row.people.map(p => p.display_name).join(', ')}, ${props.row.points} Punkte`
  )
})

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  emit('toggle')
}
</script>

<template>
  <div
    class="fold-row"
    role="button"
    tabindex="0"
    :aria-label="ariaLabel"
    :aria-expanded="expanded"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @click="onClick"
    @keydown="onKeydown"
  >
    <i class="bi row-chevron" :class="expanded ? 'bi-chevron-down' : 'bi-chevron-right'"></i>
    <span class="dense-row-title">{{ row.parentTitle }}</span>
    <span class="fold-count">{{ row.children.length }}&times;</span>
    <span
      v-for="person in row.people"
      :key="person.user_id"
      class="user-dot"
      :style="{ background: person.user_color }"
    ></span>
    <span class="dense-row-points">{{ row.points }}</span>
  </div>
</template>

<style scoped>
/* Dieselbe schlanke Karte wie die Einzelzeile (Etappe 2) — der
   Aufklapp-Mechanismus bleibt unverändert, nur die Darstellung zieht nach.
   Klassenname bewusst nicht `card`: Bootstrap lädt nach den Scoped Styles. */
.fold-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: var(--touch-target-dense);
  padding: 0 4px 0 10px;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  touch-action: pan-y;
}

.fold-row:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.row-chevron {
  flex-shrink: 0;
  width: 1rem;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

.fold-count {
  flex-shrink: 0;
  font-size: var(--font-sm);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
}
</style>
