<script setup lang="ts">
/**
 * PROTOTYP — WEGWERFCODE. Nicht Teil der App, nicht warten, nicht kopieren.
 *
 * Frage: Wie fühlt sich der Richtungskranz an, wenn er kein enger Chip-Kranz um
 * die Karte mehr ist, sondern ein ätherisches Vollbild-Overlay mit Kreisbögen an
 * den vier Bildschirmrändern?
 *
 * Aufruf:  /proto-kranz?v=bogen | kranz | nebel | strahl
 * Die Leiste unten schaltet Variante, Ziehschwelle und Rand-Streuung um.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type Dir = 'up' | 'down' | 'left' | 'right'

const route = useRoute()
const router = useRouter()

const VARIANTS = [
  { key: 'bogen', label: 'Bögen am Rand' },
  { key: 'kranz', label: 'Kreis, am Rand platt' },
  { key: 'nebel', label: 'Randnebel' },
  { key: 'strahl', label: 'Bögen + Strahl' }
] as const

const variant = computed(() => {
  const v = String(route.query.v ?? 'bogen')
  return VARIANTS.some(x => x.key === v) ? v : 'bogen'
})
const setVariant = (v: string) => router.replace({ query: { ...route.query, v } })

// --- Stellschrauben ---------------------------------------------------------
const commit = ref(48)      // Ziehstrecke bis eine Richtung anliegt
const scatter = ref(true)   // Randabstand der Karten links/rechts streuen
const onlyDown = ref(false) // Projekte-Fall: nur die Grundrichtung

const LABELS: Record<Dir, string> = {
  down: 'erledigen',
  up: 'verschieben',
  left: 'zuweisen',
  right: 'Aufwand anpassen'
}
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
const tip = ref<{ x: number; y: number } | null>(null)
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
  open.value = false; dir.value = null; anchor.value = null; tip.value = null
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
    tip.value = { x: sx, y: sy }
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
  tip.value = { x: e.clientX, y: e.clientY }
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

// --- Geometrie des Overlays -------------------------------------------------
const vw = ref(0)
const vh = ref(0)
const sync = () => {
  vw.value = document.documentElement.clientWidth
  vh.value = document.documentElement.clientHeight
}
onMounted(() => { sync(); window.addEventListener('resize', sync) })
onUnmounted(() => { window.removeEventListener('resize', sync); reset() })

const PAD = 26     // Abstand des Bogenendes zur Ecke
const BULGE = 74   // wie weit der Bogen in den Bildschirm hineinwölbt

/**
 * Ein Bogen je Richtung, als quadratische Kurve entlang der jeweiligen Kante.
 * Variante `kranz` zieht den Scheitel zur Karte hin — solange Platz ist; sonst
 * drückt ihn der Rand platt. Genau der Effekt, um den es geht.
 */
const arc = (d: Dir) => {
  const w = vw.value, h = vh.value
  const a = anchor.value
  const R = 150
  let bulge = BULGE
  if (variant.value === 'kranz' && a) {
    const room =
      d === 'down' ? h - a.y : d === 'up' ? a.y : d === 'left' ? a.x : w - a.x
    bulge = Math.max(28, Math.min(BULGE, room - (R - BULGE) < 0 ? BULGE : room - R + BULGE))
  }
  const inset = 34
  if (d === 'down') return { path: `M ${PAD} ${h - inset - 26} Q ${w / 2} ${h - inset - 26 - bulge} ${w - PAD} ${h - inset - 26}`, mid: { x: w / 2, y: h - inset - 26 - bulge * 0.5 } }
  if (d === 'up') return { path: `M ${PAD} ${inset} Q ${w / 2} ${inset + bulge} ${w - PAD} ${inset}`, mid: { x: w / 2, y: inset + bulge * 0.5 } }
  if (d === 'left') return { path: `M ${inset} ${PAD} Q ${inset + bulge} ${h / 2} ${inset} ${h - PAD}`, mid: { x: inset + bulge * 0.5, y: h / 2 } }
  return { path: `M ${w - inset} ${PAD} Q ${w - inset - bulge} ${h / 2} ${w - inset} ${h - PAD}`, mid: { x: w - inset - bulge * 0.5, y: h / 2 } }
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

    <!-- Das Overlay: absolut über allem, unabhängig von der View -->
    <Teleport to="body">
      <svg v-if="open" class="ov" :viewBox="`0 0 ${vw} ${vh}`" preserveAspectRatio="none">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="fog">
            <stop offset="0%" stop-color="#cfe4ff" stop-opacity="0.55" />
            <stop offset="100%" stop-color="#cfe4ff" stop-opacity="0" />
          </radialGradient>
        </defs>

        <!-- Schleier: ohne ihn hat das aetherische Leuchten keinen Grund -->
        <rect x="0" y="0" :width="vw" :height="vh" fill="rgba(18,24,38,0.38)" />

        <template v-for="d in dirs" :key="d">
          <!-- Randnebel-Variante: weicher Schein statt Linie -->
          <ellipse
            v-if="variant === 'nebel'"
            :cx="arc(d).mid.x" :cy="arc(d).mid.y"
            :rx="d === 'left' || d === 'right' ? 90 : vw * 0.6"
            :ry="d === 'left' || d === 'right' ? vh * 0.6 : 90"
            fill="url(#fog)"
            :opacity="dir === d ? 1 : 0.35"
          />
          <path
            v-else
            :id="`arc-${d}`"
            :d="arc(d).path"
            fill="none"
            :stroke="dir === d ? '#ffffff' : '#cfe4ff'"
            :stroke-width="dir === d ? 3 : 1.5"
            :opacity="dir === d ? 1 : 0.4"
            stroke-linecap="round"
            filter="url(#glow)"
          />
          <path :id="`p-${d}`" :d="arc(d).path" fill="none" stroke="none" />
          <text
            class="lab"
            :class="{ on: dir === d }"
            :x="arc(d).mid.x" :y="arc(d).mid.y"
            text-anchor="middle"
            dominant-baseline="middle"
          >{{ LABELS[d] }}</text>
        </template>

        <!-- Strahl von der Karte zur anliegenden Richtung -->
        <line
          v-if="variant === 'strahl' && anchor && dir"
          :x1="anchor.x" :y1="anchor.y"
          :x2="arc(dir).mid.x" :y2="arc(dir).mid.y"
          stroke="#ffffff" stroke-width="2" opacity="0.8" filter="url(#glow)"
        />
        <circle v-if="anchor" :cx="anchor.x" :cy="anchor.y" r="5" fill="#ffffff" opacity="0.9" />
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
.ov .lab {
  fill: #eaf3ff; font-size: 13px; font-weight: 700; opacity: 0.55;
  letter-spacing: 0.5px; paint-order: stroke; stroke: rgba(20,26,40,.6); stroke-width: 3px;
}
.ov .lab.on { fill: #fff; opacity: 1; font-size: 15px; }
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
