<script setup lang="ts">
// WEGWERF-PROTOTYP — schwebende Variantenleiste. In Produktion ausgeblendet.
import { onMounted, onUnmounted, computed } from 'vue'

const props = defineProps<{
  variants: { key: string; name: string }[]
  current: string
}>()
const emit = defineEmits<{ select: [key: string] }>()

const visible = import.meta.env.MODE !== 'production'

const index = computed(() => props.variants.findIndex(v => v.key === props.current))
const currentName = computed(() => props.variants[index.value]?.name ?? '')

const step = (delta: number) => {
  const n = props.variants.length
  const next = (index.value + delta + n) % n
  emit('select', props.variants[next].key)
}

const onKey = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  if (e.key === 'ArrowLeft') step(-1)
  if (e.key === 'ArrowRight') step(1)
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="visible" class="proto-switcher">
    <button @click="step(-1)" aria-label="Vorherige Variante">‹</button>
    <span class="proto-switcher-label">{{ current }} — {{ currentName }}</span>
    <button @click="step(1)" aria-label="Naechste Variante">›</button>
  </div>
</template>

<style scoped>
.proto-switcher {
  position: fixed;
  left: 50%;
  bottom: 74px;
  transform: translateX(-50%);
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: #111;
  color: #fff;
  border-radius: 999px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  font-family: ui-monospace, monospace;
  max-width: 94vw;
}
.proto-switcher button {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 999px;
  background: #333;
  color: #fff;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.proto-switcher-label {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 6px;
}
</style>
