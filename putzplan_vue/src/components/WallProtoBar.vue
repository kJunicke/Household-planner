<script setup lang="ts">
/**
 * PROTOTYP — WEGWERFCODE. Nicht nach `main` mergen.
 *
 * Zweite Runde: der Entwurf steht, die Leiste hält nur noch die **offenen
 * Fragen** offen. Was entschieden ist (Stift unten neben dem Eselsohr, Titel
 * über die volle obere Kante, Fußzeile unten), steckt fest in `WallNote.vue`
 * und ist hier nicht mehr regelbar.
 *
 * Im Produktions-Build rendert die Leiste nichts.
 */
import { ref } from 'vue'
import { ENTWURF, IST, config } from '@/lib/wallProto'

const isDev = import.meta.env.DEV
const open = ref(true)

const SLIDERS = [
  {
    key: 'scale',
    label: 'Schrift',
    min: 1,
    max: 1.6,
    step: 0.05,
    note: '×1.3 → Titel 16,9 px (Material Body-Large 16 sp, Apple Body 17 pt)'
  },
  {
    key: 'minWidth',
    label: 'Mindestbreite',
    min: 96,
    max: 240,
    step: 2,
    note: 'zu klein = Titel bricht um, zu groß = keine zwei Zettel nebeneinander'
  },
  {
    key: 'hit',
    label: 'Griffe',
    min: 36,
    max: 64,
    step: 2,
    note: 'Stift und Eselsohr, gleich groß — Apple HIG 44 · Material Design 48'
  },
  {
    key: 'sticker',
    label: 'Punkte-Sticker',
    min: 24,
    max: 52,
    step: 2,
    note: 'Form trägt den Wert: Kreis 1 · Quadrat 2 · Sechseck 3 · Wappen 4 · Stern 5'
  },
  {
    key: 'indent',
    label: 'Einrückung',
    min: 0,
    max: 60,
    step: 2,
    note: 'zufällig, aber fest je Zettel — nur an der linken Kante'
  }
] as const
</script>

<template>
  <div v-if="isDev" class="proto-panel">
    <button class="proto-head" @click="open = !open">
      <span>PROTOTYP · Entwurf 2</span>
      <span>{{ open ? '▾' : '▴' }}</span>
    </button>

    <div v-if="open" class="proto-body">
      <div class="proto-presets">
        <button class="proto-chip" @click="Object.assign(config, IST)">Ist-Zustand</button>
        <button class="proto-chip" @click="Object.assign(config, ENTWURF)">Entwurf</button>
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
        <span class="proto-note">{{ slider.note }}</span>
      </label>

      <div class="proto-row proto-row--pos">
        <span class="proto-name">Dringlichkeit</span>
        <div class="proto-presets">
          <button
            v-for="mode in (['aus', 'zwecke', 'stempel', 'beides'] as const)"
            :key="mode"
            class="proto-chip"
            :class="{ 'proto-chip--on': config.due === mode }"
            @click="config.due = mode"
          >
            {{ mode }}
          </button>
        </div>
      </div>

      <div class="proto-row proto-row--pos">
        <span class="proto-name">Punkte</span>
        <div class="proto-presets">
          <button
            v-for="mode in (['auto', 'oben', 'unten'] as const)"
            :key="mode"
            class="proto-chip"
            :class="{ 'proto-chip--on': config.metaTop === mode }"
            :title="mode === 'auto' ? 'oben rechts nur, wenn die Fußzeile breiter als der Titel wäre' : ''"
            @click="config.metaTop = mode"
          >
            {{ mode }}
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
  padding: 5px 9px;
  border: 1px solid #555;
  border-radius: 999px;
  background: #262626;
  color: #ddd;
  font: inherit;
  cursor: pointer;
}

.proto-row--pos {
  grid-template-columns: 78px 1fr;
  align-items: start;
}

.proto-chip--on {
  border-color: #ffd479;
  background: #4a3a12;
  color: #ffd479;
}

.proto-check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  color: #ddd;
}

.proto-row {
  display: grid;
  grid-template-columns: 78px 1fr 34px;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
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

.proto-check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ddd;
}

input[type='range'] {
  width: 100%;
  accent-color: #ffd479;
}
</style>
