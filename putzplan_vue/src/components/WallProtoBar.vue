<script setup lang="ts">
/**
 * PROTOTYP — WEGWERFCODE. Nicht nach `main` mergen.
 *
 * Schwebendes Bedienfeld: Regler für Schrift, Innenabstand, Mindestbreite und
 * den Bearbeiten-Stift, dazu fünf Presets als Sprungmarken. Alles wirkt sofort
 * auf die echte Wand darunter.
 *
 * Sieht bewusst nicht nach Pinnwand aus, damit niemand es für Teil des
 * Entwurfs hält. Im Produktions-Build rendert es nichts.
 *
 * Die Stift-Positionen stehen in einem GLOBALEN Style-Block: sie hängen an
 * `data-proto-edit` am `<html>`-Element und müssen `.edit` in `WallNote.vue`
 * erreichen, was aus einem scoped Block heraus nicht ginge.
 */
import { ref, computed } from 'vue'
import {
  EDIT_POS_LABELS,
  PRESETS,
  applyPreset,
  config,
  matchingPreset,
  type EditPos,
  type ProtoPreset
} from '@/lib/wallProto'

const isDev = import.meta.env.DEV
const open = ref(true)

const active = computed<ProtoPreset | null>(() => matchingPreset())

const SLIDERS = [
  { key: 'title', label: 'Titel', min: 11, max: 22, step: 0.5, note: '16 px ≈ Material Body-Large' },
  { key: 'foot', label: 'Fußzeile', min: 8, max: 16, step: 0.5, note: 'unter 11 px grenzwertig' },
  { key: 'sub', label: 'Unteraufgaben', min: 10, max: 20, step: 0.5, note: '' },
  { key: 'pad', label: 'Innenabstand', min: 3, max: 16, step: 1, note: '' },
  { key: 'minWidth', label: 'Mindestbreite', min: 96, max: 220, step: 2, note: 'hält die Paar-Packung' },
  { key: 'editGlyph', label: 'Stift sichtbar', min: 10, max: 28, step: 1, note: '' },
  { key: 'editHit', label: 'Stift Trefferfläche', min: 32, max: 60, step: 2, note: 'HIG 44 · Material 48' }
] as const

const positions = Object.keys(EDIT_POS_LABELS) as EditPos[]
</script>

<template>
  <div v-if="isDev" class="proto-panel" :class="{ 'proto-panel--closed': !open }">
    <button class="proto-head" @click="open = !open">
      <span>PROTOTYP · {{ active ? `${active.key} ${active.name}` : 'eigene Einstellung' }}</span>
      <span>{{ open ? '▾' : '▴' }}</span>
    </button>

    <div v-if="open" class="proto-body">
      <div class="proto-presets">
        <button
          v-for="preset in PRESETS"
          :key="preset.key"
          class="proto-chip"
          :class="{ 'proto-chip--on': active?.key === preset.key }"
          :title="preset.hint"
          @click="applyPreset(preset)"
        >
          {{ preset.key }} · {{ preset.name }}
        </button>
      </div>

      <label v-for="slider in SLIDERS" :key="slider.key" class="proto-row">
        <span class="proto-name">{{ slider.label }}</span>
        <input
          v-model.number="config[slider.key]"
          type="range"
          :min="slider.min"
          :max="slider.max"
          :step="slider.step"
        />
        <span class="proto-value">{{ config[slider.key] }}</span>
        <span v-if="slider.note" class="proto-note">{{ slider.note }}</span>
      </label>

      <div class="proto-row proto-row--pos">
        <span class="proto-name">Stift sitzt</span>
        <div class="proto-presets">
          <button
            v-for="pos in positions"
            :key="pos"
            class="proto-chip"
            :class="{ 'proto-chip--on': config.editPos === pos }"
            @click="config.editPos = pos"
          >
            {{ EDIT_POS_LABELS[pos] }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.proto-panel {
  position: fixed;
  left: 8px;
  right: 8px;
  bottom: 66px;
  z-index: 3000;
  border-radius: 10px;
  background: rgba(17, 17, 17, 0.95);
  color: #fff;
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.5);
  font-family: system-ui, sans-serif;
  font-size: 11px;
}

.proto-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 10px;
  background: none;
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.proto-body {
  max-height: 46vh;
  overflow-y: auto;
  padding: 0 10px 10px;
}

.proto-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.proto-chip {
  padding: 5px 7px;
  border: 1px solid #555;
  border-radius: 999px;
  background: #262626;
  color: #ddd;
  font: inherit;
  cursor: pointer;
}

.proto-chip--on {
  border-color: #ffd479;
  background: #4a3a12;
  color: #ffd479;
}

.proto-row {
  display: grid;
  grid-template-columns: 82px 1fr 34px;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.proto-row--pos {
  grid-template-columns: 82px 1fr;
  align-items: start;
}

.proto-name {
  color: #bbb;
}

.proto-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.proto-note {
  grid-column: 2 / -1;
  margin-top: -2px;
  color: #888;
  font-size: 10px;
}

input[type='range'] {
  width: 100%;
  accent-color: #ffd479;
}
</style>

<!-- GLOBAL: greift auf `.edit` in WallNote.vue durch. -->
<style>
.zettel .edit {
  width: var(--proto-edit-hit, 40px);
  height: var(--proto-edit-hit, 40px);
  font-size: var(--proto-edit-glyph, 12px);
}

[data-proto-edit='tl'] .zettel .edit,
[data-proto-edit='bl'] .zettel .edit,
[data-proto-edit='flow'] .zettel .edit {
  padding: 0;
  place-items: center center;
}

[data-proto-edit='tl'] .zettel .edit {
  right: auto;
  left: 0;
}

[data-proto-edit='bl'] .zettel .edit {
  top: auto;
  right: auto;
  bottom: 0;
  left: 0;
}

/* In der Fußzeile: der Stift steht im Fluss unter dem Text, über die volle
   Zettelbreite links — weit weg vom Eselsohr in der rechten unteren Ecke. */
[data-proto-edit='flow'] .zettel .edit {
  position: static;
  margin-top: 2px;
  justify-self: start;
  place-items: center start;
}
</style>
