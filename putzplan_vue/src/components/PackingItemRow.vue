<script setup lang="ts">
import type { PackingItem } from '@/types/PackingItem'
import ListItemRow from '@/components/ListItemRow.vue'

defineProps<{ item: PackingItem }>()

const emit = defineEmits<{
  toggle: []
  increment: []
  decrement: []
  edit: []
}>()
</script>

<template>
  <!-- Packing keeps long-press-to-edit until stage 2 replaces it with dragging. -->
  <ListItemRow
    :checked="item.packed"
    :name="item.name"
    edit-on-long-press
    @toggle="emit('toggle')"
    @edit="emit('edit')"
  >
    <template #trailing>
      <div v-if="item.quantity > 1" class="pack-stepper">
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
    </template>
  </ListItemRow>
</template>

<style scoped>
/* Die Zählanzeige zwischen den Knöpfen hält sie weit genug auseinander,
   dass sich die erweiterten Trefferflächen nicht überlappen. */
.pack-stepper {
  display: flex;
  align-items: center;
  gap: 4px;
}
/* 34×34 sichtbar, 40×40 treffbar — dasselbe Pseudo-Element-Muster wie bei den
   übrigen Icon-Knöpfen, damit die Zeile bei 40px bleibt. */
.step-btn {
  position: relative;
  width: 34px;
  height: 34px;
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
.step-btn::after {
  content: '';
  position: absolute;
  inset: -4px;
}
.step-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.step-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.step-count {
  min-width: 32px;
  text-align: center;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
