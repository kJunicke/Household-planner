<script setup lang="ts">
import { useLongPress } from '@/composables/useLongPress'

defineProps<{
  /** Checked/done visual state (packed, purchased, …). */
  checked: boolean
  name: string
}>()

const emit = defineEmits<{
  toggle: []
  edit: []
}>()

// Inner buttons and the trailing slot are exempt from tap-toggle & long-press.
const isControl = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('button, .row-trailing')

const lp = useLongPress({
  onLongPress: () => emit('edit'),
  onTap: () => emit('toggle'),
  isControl,
})
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
    @contextmenu="lp.onContextMenu"
  >
    <span class="list-check" :class="{ on: checked }">
      <i v-if="checked" class="bi bi-check-lg"></i>
    </span>
    <span class="list-name">{{ name }}</span>
    <div class="row-trailing" @click.stop>
      <slot name="trailing" />
    </div>
  </div>
</template>

<style scoped>
.list-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-sm);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  min-height: 44px;
  transition: background 0.15s, opacity 0.15s;
}
.list-row:hover { border-color: var(--color-border-hover); }
.list-row:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.list-row.checked { opacity: 0.55; }
.list-row.checked .list-name { text-decoration: line-through; color: var(--color-text-muted); }

.list-check {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
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

.row-trailing {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
</style>
