<script setup lang="ts">
// Shared brand mark: house icon in an indigo rounded square + "Putzplan"
// wordmark. Used in the header (compact) and on the auth screens (large,
// stacked). Keeps the brand identity in one place.
withDefaults(
  defineProps<{
    size?: 'sm' | 'lg'
    wordmark?: boolean
  }>(),
  { size: 'sm', wordmark: true }
)
</script>

<template>
  <div class="brand" :class="[`brand-${size}`, { 'brand-stacked': size === 'lg' }]">
    <span class="brand-mark" aria-hidden="true">
      <i class="bi bi-house-heart-fill"></i>
    </span>
    <span v-if="wordmark" class="brand-name">Putzplan</span>
  </div>
</template>

<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.brand-stacked {
  flex-direction: column;
  gap: 0.625rem;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--radius-md);
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.brand-name {
  font-weight: 700;
  color: var(--color-text-primary);
  white-space: nowrap;
}

/* Compact (header) */
.brand-sm .brand-mark {
  width: 32px;
  height: 32px;
  font-size: 1.05rem;
}

.brand-sm .brand-name {
  font-size: 1.25rem;
}

/* Large (auth screens) */
.brand-lg .brand-mark {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  font-size: 1.75rem;
}

.brand-lg .brand-name {
  font-size: 1.5rem;
}

@media (min-width: 768px) {
  .brand-sm .brand-name {
    font-size: 1.5rem;
  }
}
</style>
