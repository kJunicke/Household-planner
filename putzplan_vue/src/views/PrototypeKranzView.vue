<script setup lang="ts">
/**
 * PROTOTYP — WEGWERFCODE. Nicht Teil der App, nicht warten, nicht kopieren.
 *
 * Entschieden ist die **Mechanik**: Vollbild-Overlay, Nebel am Rand der
 * gewählten Richtung, kurzer Pfeil an der Karte. Offen ist die **Handschrift** —
 * generisch-ätherisch oder etwas, das nach dieser App aussieht.
 *
 * Aufruf:  /proto-kranz?v=aether | tafel | skizze | kork
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type Dir = 'up' | 'down' | 'left' | 'right'
type Style = 'aether' | 'tafel' | 'skizze' | 'kork'

const route = useRoute()
const router = useRouter()

const VARIANTS: Array<{ key: Style; label: string }> = [
  { key: 'aether', label: 'Ätherisch' },
  { key: 'tafel', label: 'Kreidetafel' },
  { key: 'skizze', label: 'Tuschskizze' },
  { key: 'kork', label: 'Pinnwand' }
]

const variant = computed<Style>(() => {
  const v = String(route.query.v ?? 'aether') as Style
  return VARIANTS.some(x => x.key === v) ? v : 'aether'
})
const setVariant = (v: Style) => router.replace({ query: { ...route.query, v } })

/** Was jede Handschrift anders macht. Alles andere ist identisch. */
const SKIN: Record<Style, {
  veil: string      // Schleier über der App
  fog: string       // Farbe des Randnebels
  ink: string       // Pfeil und Schrift
  glow: boolean     // Weichzeichner an?
}> = {
  aether: { veil: 'rgba(18,24,38,0.38)', fog: '#cfe4ff', ink: '#ffffff', glow: true },
  tafel:  { veil: 'rgba(26,46,38,0.82)', fog: '#eaf6ec', ink: '#f4fbf5', glow: true },
  skizze: { veil: 'rgba(253,241,201,0.80)', fog: '#241f1a', ink: '#241f1a', glow: false },
  kork:   { veil: 'rgba(36,31,26,0.55)', fog: '#e9d48a', ink: '#241f1a', glow: false }
}
const skin = computed(() => SKIN[variant.value])
const filt = computed(() => (skin.value.glow ? 'url(#glow)' : undefined))

// --- Stellschrauben ---------------------------------------------------------
const commit = ref(48)
const scatter = ref(true)
const onlyDown = ref(false)

const LABELS: Record<Dir, string> = {
  down: 'erledigen',
  up: 'verschieben',
  left: 'zuweisen',
  right: 'Aufwand anpassen'
}

/**
 * Zweizeilig statt einzeilig: „Aufwand anpassen" passt am rechten Rand nicht
 * in eine Zeile, ohne aus dem Fenster zu laufen. Umbrechen loest das, ohne
 * dass der Text gedreht oder gekuerzt werden muss.
 */
const LINES: Record<Dir, string[]> = {
  down: ['erledigen'],
  up: ['verschieben'],
  left: ['zuweisen'],
  right: ['Aufwand', 'anpassen']
}
const LINE_H = 17
const dirs = computed<Dir[]>(() => (onlyDown.value ? ['down'] : ['down', 'up', 'left', 'right']))

// --- Fake-Zettel ------------------------------------------------------------
const rnd = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
const notes = Array.from({ length: 9 }, (_, i) => ({
  id: i,
  title: ['Bad putzen', 'Müll raus', 'Küche wischen', 'Staubsaugen', 'Wäsche', 'Spülmaschine',
          'Fenster', 'Balkon fegen', 'Kühlschrank'][i],
  rot: (rnd(i + 1) - 0.5) * 6,
  jitter: rnd(i + 7)
}))
const MIN_EDGE = 8
const MAX_EDGE = 34
const edgeOf = (n: { jitter: number }) =>
  scatter.value ? MIN_EDGE + n.jitter * (MAX_EDGE - MIN_EDGE) : MIN_EDGE

// --- Geste ------------------------------------------------------------------
const open = ref(false)
const dir = ref<Dir | null>(null)
const anchor = ref<{ x: number; y: number } | null>(null)
const toast = ref('')

let timer: number | null = null
let el: HTMLElement | null = null
let pid = -1
let active = false
let sx = 0
let sy = 0

const reset = () => {
  if (timer !== null) { clearTimeout(timer); timer = null }
  if (open.value && el?.hasPointerCapture?.(pid)) el.releasePointerCapture(pid)
  active = false; el = null; pid = -1
  open.value = false; dir.value = null; anchor.value = null
}

const onDown = (e: PointerEvent) => {
  if (active) return
  active = true
  el = e.currentTarget as HTMLElement
  pid = e.pointerId
  sx = e.clientX; sy = e.clientY
  timer = window.setTimeout(() => {
    timer = null
    if (!active) return
    const r = el!.getBoundingClientRect()
    anchor.value = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    open.value = true
    try { el?.setPointerCapture?.(pid) } catch { /* egal */ }
  }, 420)
}

const pick = (dx: number, dy: number): Dir | null => {
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (Math.hypot(dx, dy) < commit.value) return null
  const d: Dir | null =
    ay >= ax * 1.25 ? (dy > 0 ? 'down' : 'up')
    : ax >= ay * 1.25 ? (dx > 0 ? 'right' : 'left')
    : null
  return d && dirs.value.includes(d) ? d : null
}

const onMove = (e: PointerEvent) => {
  if (!active || e.pointerId !== pid) return
  const dx = e.clientX - sx, dy = e.clientY - sy
  if (!open.value) {
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) reset()
    return
  }
  dir.value = pick(dx, dy)
  e.preventDefault()
}

const onUp = (e: PointerEvent) => {
  if (!active || e.pointerId !== pid) return
  const chosen = open.value ? dir.value : null
  reset()
  if (chosen) {
    toast.value = LABELS[chosen]
    window.setTimeout(() => { toast.value = '' }, 900)
  }
}

const onTouchMove = (e: TouchEvent) => {
  if (open.value && e.cancelable) e.preventDefault()
}

// --- Geometrie --------------------------------------------------------------
const vw = ref(0)
const vh = ref(0)
const sync = () => {
  vw.value = document.documentElement.clientWidth
  vh.value = document.documentElement.clientHeight
}
onMounted(() => { sync(); window.addEventListener('resize', sync) })
onUnmounted(() => { window.removeEventListener('resize', sync); reset() })

const waagerecht = (d: Dir) => d === 'left' || d === 'right'

/** Mitte des Randbereichs je Richtung — dort sitzt Nebel und Beschriftung. */
const edgePoint = (d: Dir) => {
  const w = vw.value, h = vh.value
  const IN = 56
  if (d === 'down') return { x: w / 2, y: h - IN - 24 }
  if (d === 'up') return { x: w / 2, y: IN }
  if (d === 'left') return { x: IN, y: h / 2 }
  return { x: w - IN, y: h / 2 }
}

/** Die Randbahn als Rechteck — für die stilisierten Fassungen (kork). */
const band = (d: Dir) => {
  const w = vw.value, h = vh.value
  const T = 46
  if (d === 'down') return { x: 0, y: h - T - 46, w, h: T }
  if (d === 'up') return { x: 0, y: 0, w, h: T }
  if (d === 'left') return { x: 0, y: 0, w: T, h }
  return { x: w - T, y: 0, w: T, h }
}

const ARROW_GAP = 30
const ARROW_LEN = 64
const ARROW_HEAD = 15

const arrow = (a: { x: number; y: number }, d: Dir) => {
  const ux = d === 'left' ? -1 : d === 'right' ? 1 : 0
  const uy = d === 'up' ? -1 : d === 'down' ? 1 : 0
  const x1 = a.x + ux * ARROW_GAP
  const y1 = a.y + uy * ARROW_GAP
  const x2 = a.x + ux * (ARROW_GAP + ARROW_LEN)
  const y2 = a.y + uy * (ARROW_GAP + ARROW_LEN)
  const px = -uy, py = ux
  const bx = x2 - ux * ARROW_HEAD, by = y2 - uy * ARROW_HEAD
  const wingA = { x: bx + px * ARROW_HEAD * 0.7, y: by + py * ARROW_HEAD * 0.7 }
  const wingB = { x: bx - px * ARROW_HEAD * 0.7, y: by - py * ARROW_HEAD * 0.7 }
  return {
    line: `M ${x1} ${y1} L ${x2} ${y2}`,
    // leicht verzogene Zweitlinie — nur die Skizze nutzt sie
    line2: `M ${x1 + px * 1.5} ${y1 + py * 1.5} L ${x2 - px * 2} ${y2 - py * 2}`,
    head: `M ${x2} ${y2} L ${wingA.x} ${wingA.y} L ${wingB.x} ${wingB.y} Z`,
    // offene Spitze, wie mit zwei Strichen gezeichnet
    headOpen: `M ${wingA.x} ${wingA.y} L ${x2} ${y2} L ${wingB.x} ${wingB.y}`
  }
}
</script>

<template>
  <div class="proto">
    <p class="hint">PROTOTYP · lange auf einen Zettel drücken, dann ziehen</p>

    <div class="board">
      <div
        v-for="n in notes"
        :key="n.id"
        class="note"
        :style="{
          transform: `rotate(${n.rot}deg)`,
          marginLeft: `${edgeOf(n)}px`,
          marginRight: `${edgeOf(n)}px`
        }"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @touchmove="onTouchMove"
      >
        {{ n.title }}
      </div>
    </div>

    <Teleport to="body">
      <svg v-if="open" class="ov" :class="`ov--${variant}`" :viewBox="`0 0 ${vw} ${vh}`">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <!-- Kreidestaub: grob gekörnter Schein -->
          <filter id="chalk" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.9" numOctaves="3" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
            <feGaussianBlur stdDeviation="0.4" />
          </filter>
          <radialGradient id="fog">
            <stop offset="0%" :stop-color="skin.fog" stop-opacity="0.6" />
            <stop offset="100%" :stop-color="skin.fog" stop-opacity="0" />
          </radialGradient>
          <!-- Schraffur statt Nebel, für die Tuschfassung -->
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#241f1a" stroke-width="1.4" />
          </pattern>
        </defs>

        <rect x="0" y="0" :width="vw" :height="vh" :fill="skin.veil" />

        <template v-for="d in dirs" :key="d">
          <!-- Randbereich: je Handschrift anders gemalt -->
          <rect
            v-if="variant === 'kork'"
            :x="band(d).x" :y="band(d).y" :width="band(d).w" :height="band(d).h"
            :fill="skin.fog"
            :opacity="dir === d ? 1 : 0.25"
            :stroke="dir === d ? '#241f1a' : 'none'"
            stroke-width="2"
          />
          <rect
            v-else-if="variant === 'skizze'"
            :x="band(d).x" :y="band(d).y" :width="band(d).w" :height="band(d).h"
            fill="url(#hatch)"
            :opacity="dir === d ? 0.55 : 0.14"
          />
          <ellipse
            v-else
            :cx="edgePoint(d).x" :cy="edgePoint(d).y"
            :rx="waagerecht(d) ? 96 : vw * 0.62"
            :ry="waagerecht(d) ? vh * 0.62 : 96"
            fill="url(#fog)"
            :opacity="dir === d ? 1 : 0.3"
            :filter="variant === 'tafel' ? 'url(#chalk)' : undefined"
          />

          <text
            class="lab"
            :class="{ on: dir === d }"
            :fill="skin.ink"
            :x="edgePoint(d).x"
            :y="edgePoint(d).y - ((LINES[d].length - 1) * LINE_H) / 2"
            text-anchor="middle"
            dominant-baseline="middle"
          ><tspan
              v-for="(line, i) in LINES[d]"
              :key="line"
              :x="edgePoint(d).x"
              :dy="i === 0 ? 0 : LINE_H"
            >{{ line }}</tspan></text>
        </template>

        <!-- Der kurze Pfeil an der Karte -->
        <template v-if="anchor && dir">
          <template v-if="variant === 'skizze'">
            <path :d="arrow(anchor, dir).line" :stroke="skin.ink" stroke-width="2.4"
                  stroke-linecap="round" fill="none" />
            <path :d="arrow(anchor, dir).line2" :stroke="skin.ink" stroke-width="1.2"
                  stroke-linecap="round" fill="none" opacity="0.6" />
            <path :d="arrow(anchor, dir).headOpen" :stroke="skin.ink" stroke-width="2.4"
                  stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </template>
          <!-- Kreidepfeil: kraeftiger Schaft plus Spitze, koernig gefiltert -->
          <template v-else-if="variant === 'tafel'">
            <g filter="url(#chalk)" opacity="0.92">
              <path :d="arrow(anchor, dir).line" :stroke="skin.ink" stroke-width="6"
                    stroke-linecap="round" fill="none" />
              <path :d="arrow(anchor, dir).head" :fill="skin.ink" />
            </g>
          </template>
          <template v-else>
            <path :d="arrow(anchor, dir).line" :stroke="skin.ink" stroke-width="3"
                  stroke-linecap="round" fill="none" :filter="filt" />
            <path :d="arrow(anchor, dir).head" :fill="skin.ink" :filter="filt" />
          </template>
        </template>

        <circle v-if="anchor" :cx="anchor.x" :cy="anchor.y" r="4" :fill="skin.ink" opacity="0.85" />
      </svg>

      <div v-if="toast" class="toast">{{ toast }}</div>

      <div class="bar">
        <button
          v-for="v in VARIANTS" :key="v.key"
          :class="{ on: variant === v.key }"
          @click="setVariant(v.key)"
        >{{ v.label }}</button>
        <label>Schwelle {{ commit }}px<input v-model.number="commit" type="range" min="0" max="90" /></label>
        <label><input v-model="scatter" type="checkbox" /> Rand-Streuung</label>
        <label><input v-model="onlyDown" type="checkbox" /> nur „unten"</label>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.proto { min-height: 100vh; background: var(--pw-cork, #e7dcc8); padding-bottom: 150px; }
.hint { text-align: center; font-size: 12px; padding: 8px; color: #544a3e; margin: 0; }
.board { display: flex; flex-direction: column; gap: 14px; padding: 8px 0; }
.note {
  background: var(--pw-paper, #fffdf6);
  border: 2px solid #241f1a;
  box-shadow: 3px 3px 0 #241f1a;
  padding: 18px 12px;
  font-weight: 800;
  touch-action: pan-y;
  user-select: none;
}
</style>

<style>
.ov { position: fixed; inset: 0; z-index: 2000; pointer-events: none; }
.ov .lab { font-size: 14px; font-weight: 700; opacity: 0.6; letter-spacing: 0.5px; }
.ov .lab.on { opacity: 1; font-size: 16px; }

/* Ätherisch: Schrift schwebt, dunkel umrandet damit sie auf hellem Nebel hält */
.ov--aether .lab { paint-order: stroke; stroke: rgba(20,26,40,.55); stroke-width: 3px; }

/* Kreidetafel: die KREIDE steckt im Pfeil, nicht in der Schrift —
   handschriftliche Beschriftung war schlicht schlecht zu lesen. */
.ov--tafel .lab {
  font-weight: 800;
  letter-spacing: 0.2px;
  paint-order: stroke;
  stroke: rgba(14,28,22,.85);
  stroke-width: 3.5px;
}

/* Tuschskizze: Tinte auf Papier, alles handschriftlich */
.ov--skizze .lab {
  font-family: 'Comic Sans MS', 'Segoe Print', cursive;
  font-weight: 700;
}

/* Pinnwand: dieselbe Typo wie die Zettel, harte Kante statt Schein */
.ov--kork .lab { font-weight: 800; letter-spacing: -0.2px; }

.toast {
  position: fixed; left: 50%; top: 12%; transform: translateX(-50%);
  background: #241f1a; color: #fff; padding: 8px 14px; border-radius: 4px;
  z-index: 2100; font-weight: 700;
}
.bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 2200;
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  padding: 8px; background: #241f1aee; color: #fff; font-size: 12px;
}
.bar button { border: 1px solid #fff6; background: transparent; color: #fff; padding: 4px 8px; border-radius: 3px; }
.bar button.on { background: #2b4a8f; border-color: #2b4a8f; }
.bar label { display: flex; align-items: center; gap: 4px; }
.bar input[type=range] { width: 90px; }
</style>
