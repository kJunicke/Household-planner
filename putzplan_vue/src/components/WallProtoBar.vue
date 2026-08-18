<script setup lang="ts">
/**
 * PROTOTYP — WEGWERFCODE. Nicht nach `main` mergen.
 *
 * Schwebende Leiste zum Durchblättern der Varianten: ← Name → , dazu die
 * Pfeiltasten. Sieht bewusst nicht nach Pinnwand aus, damit niemand sie für
 * Teil des Entwurfs hält. Im Produktions-Build rendert sie nichts.
 */
import { onMounted, onUnmounted, computed } from 'vue'
import { PROTO_VARIANTS, protoKey, setProtoKey } from '@/lib/wallProto'

const isDev = import.meta.env.DEV

const index = computed(() => Math.max(0, PROTO_VARIANTS.findIndex((v) => v.key === protoKey.value)))
const current = computed(() => PROTO_VARIANTS[index.value])

function cycle(step: number): void {
  const next = (index.value + step + PROTO_VARIANTS.length) % PROTO_VARIANTS.length
  setProtoKey(PROTO_VARIANTS[next].key)
}

function onKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target && (target.matches('input, textarea') || target.isContentEditable)) return
  if (event.key === 'ArrowLeft') cycle(-1)
  if (event.key === 'ArrowRight') cycle(1)
}

onMounted(() => isDev && window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="isDev" class="proto-bar">
    <button class="proto-btn" aria-label="Vorherige Variante" @click="cycle(-1)">‹</button>
    <span class="proto-label">{{ current.key }} — {{ current.name }}</span>
    <button class="proto-btn" aria-label="Nächste Variante" @click="cycle(1)">›</button>
  </div>
</template>

<style scoped>
.proto-bar {
  position: fixed;
  left: 50%;
  bottom: 72px;
  transform: translateX(-50%);
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 999px;
  background: #111;
  color: #fff;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  font-family: system-ui, sans-serif;
  font-size: 12px;
  white-space: nowrap;
}

.proto-label {
  padding: 0 6px;
}

.proto-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: #333;
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
</style>
