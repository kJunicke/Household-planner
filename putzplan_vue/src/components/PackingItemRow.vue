<script setup lang="ts">
import { onUnmounted } from 'vue'
import type { PackingItem } from '@/types/PackingItem'

defineProps<{ item: PackingItem }>()

const emit = defineEmits<{
  toggle: []
  increment: []
  decrement: []
  edit: []
}>()

// Long-press (touch) + right-click (desktop) → edit.
const LONG_PRESS_MS = 480
const MOVE_TOLERANCE = 10
let pressTimer: number | null = null
let startX = 0
let startY = 0
let armed = false // threshold elapsed → open on release
let fired = false // opened → swallow the trailing click

const isControl = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('.pack-stepper, button')

const clearPress = () => {
  if (pressTimer !== null) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

const onTouchStart = (e: TouchEvent) => {
  if (isControl(e.target)) return
  armed = false
  fired = false
  const t = e.touches[0]
  startX = t.clientX
  startY = t.clientY
  clearPress()
  pressTimer = window.setTimeout(() => { armed = true }, LONG_PRESS_MS)
}

const onTouchMove = (e: TouchEvent) => {
  const t = e.touches[0]
  if (Math.abs(t.clientX - startX) > MOVE_TOLERANCE || Math.abs(t.clientY - startY) > MOVE_TOLERANCE) {
    clearPress()
    armed = false
  }
}

const onTouchEnd = (e: TouchEvent) => {
  clearPress()
  if (armed) {
    e.preventDefault() // swallow the ghost click so it neither toggles nor hits the modal
    fired = true
    emit('edit')
  }
  armed = false
}

const onClick = () => {
  if (fired) { fired = false; return }
  emit('toggle')
}

const onContextMenu = (e: Event) => {
  if (isControl(e.target)) return
  e.preventDefault()
  emit('edit')
}

onUnmounted(clearPress)
</script>

<template>
  <div
    class="pack-row"
    :class="{ packed: item.packed }"
    role="checkbox"
    :aria-checked="item.packed"
    tabindex="0"
    @click="onClick"
    @keydown.enter.prevent="emit('toggle')"
    @keydown.space.prevent="emit('toggle')"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="clearPress"
    @contextmenu="onContextMenu"
  >
    <span class="pack-check" :class="{ on: item.packed }">
      <i v-if="item.packed" class="bi bi-check-lg"></i>
    </span>
    <span class="pack-name">{{ item.name }}</span>

    <div v-if="item.quantity > 1" class="pack-stepper" @click.stop>
      <button
        class="step-btn"
        :disabled="item.packed_count <= 0"
        title="Weniger"
        @click="emit('decrement')"
      >
        <i class="bi bi-dash"></i>
      </button>
      <span class="step-count">{{ item.packed_count }}/{{ item.quantity }}</span>
      <button
        class="step-btn"
        :disabled="item.packed_count >= item.quantity"
        title="Mehr"
        @click="emit('increment')"
      >
        <i class="bi bi-plus"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pack-row {
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
.pack-row:hover { border-color: var(--color-border-hover); }
.pack-row:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.pack-row.packed { opacity: 0.55; }
.pack-row.packed .pack-name { text-decoration: line-through; color: var(--color-text-muted); }

.pack-check {
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
.pack-check.on { background: var(--color-success); border-color: var(--color-success); }

.pack-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-base);
  overflow-wrap: anywhere;
}

.pack-stepper {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.step-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  background: var(--color-background-elevated);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: var(--font-base);
}
.step-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.step-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.step-count {
  min-width: 40px;
  text-align: center;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
