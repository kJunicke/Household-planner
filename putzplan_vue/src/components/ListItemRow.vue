<script setup lang="ts">
import { useLongPress } from '@/composables/useLongPress'

const props = withDefaults(defineProps<{
  /** Checked/done visual state (packed, purchased, …). */
  checked: boolean
  name: string
  /**
   * Long-press / right-click opens the edit modal. Shopping turns this off: the ✎ button
   * took that job over and the hold gesture is reserved for dragging between categories.
   */
  editOnLongPress?: boolean
}>(), { editOnLongPress: false })

const emit = defineEmits<{
  toggle: []
  edit: []
}>()

// Inner buttons and the trailing slot are exempt from tap-toggle & long-press.
const isControl = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('button, .row-trailing')

const lp = useLongPress({
  onLongPress: () => { if (props.editOnLongPress) emit('edit') },
  onTap: () => emit('toggle'),
  isControl,
})

// Without the gesture the browser keeps its own context menu.
const onContextMenu = (e: Event) => {
  if (props.editOnLongPress) lp.onContextMenu(e)
}
</script>

<template>
  <div
    class="list-row"
    :class="{ checked }"
    role="checkbox"
    :aria-checked="checked"
    tabindex="0"
    @click="lp.onClick"
    @keydown.enter.prevent="emit('toggle')"
    @keydown.space.prevent="emit('toggle')"
    @touchstart.passive="lp.onTouchStart"
    @touchmove.passive="lp.onTouchMove"
    @touchend="lp.onTouchEnd"
    @touchcancel="lp.clearPress"
    @contextmenu="onContextMenu"
  >
    <span class="list-check" :class="{ on: checked }">
      <i v-if="checked" class="bi bi-check-lg"></i>
    </span>
    <span class="list-name">{{ name }}</span>
    <div class="row-trailing" @click.stop>
      <slot name="trailing" />
      <button class="row-edit-btn" title="Bearbeiten" aria-label="Bearbeiten" @click="emit('edit')">
        <i class="bi bi-pencil"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Verdichtete Zeile (Etappe 2, Variante D „kompakte Karten"):
   der Kartenlook bleibt, nur das Padding-Übergewicht fällt weg.
   Der Klassenname darf NICHT `card` heißen — Bootstrap wird nach den Scoped
   Styles geladen und würde mit `flex-direction: column` die Zeile zerlegen. */
.list-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 0 10px;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  min-height: 40px;
  transition: background 0.15s, opacity 0.15s;
}
.list-row:hover { border-color: var(--color-border-hover); }
.list-row:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.list-row.checked { opacity: 0.55; }
.list-row.checked .list-name { text-decoration: line-through; color: var(--color-text-muted); }

.list-check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border-hover);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
}
.list-check.on { background: var(--color-success); border-color: var(--color-success); }

.list-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-base);
  overflow-wrap: anywhere;
}

/* 12px Abstand ist Bedingung, keine Optik: jeder Knopf erweitert seine
   Trefferfläche per Pseudo-Element um 5px zur Seite. Bei kleinerem Abstand
   überlappen sich die Flächen und das im DOM spätere Element schluckt den
   Griff auf seinen Nachbarn. */
.row-trailing {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* Edit affordance: 30×38 sichtbar, 40×40 treffbar — so bleibt die Zeile bei
   40px und der Daumen trifft trotzdem. */
.row-edit-btn {
  position: relative;
  width: 30px;
  height: 38px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: var(--font-md);
}
.row-edit-btn::after {
  content: '';
  position: absolute;
  inset: -1px -5px;
}
.row-edit-btn:hover { color: var(--color-primary); }
</style>
