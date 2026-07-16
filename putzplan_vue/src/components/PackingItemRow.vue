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
  <ListItemRow :checked="item.packed" :name="item.name" @toggle="emit('toggle')" @edit="emit('edit')">
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
.pack-stepper {
  display: flex;
  align-items: center;
  gap: 2px;
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
