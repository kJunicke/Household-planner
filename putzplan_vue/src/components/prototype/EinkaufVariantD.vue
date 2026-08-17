<script setup lang="ts">
/**
 * WEGWERF-PROTOTYP — Variante D: „Kassenbon".
 *
 * Radikal typografisch: ein schmaler Bon, Zickzack an beiden Enden,
 * durchgehend Monospace. Kategorien sind zentrierte Trennzeilen
 * (`--- OBST ---`), die Menge sitzt rechtsbuendig am Punktfuehrer.
 * Abgehaktes bleibt an Ort und Stelle stehen und bekommt einen
 * Tinten-Stempel — man sieht dem Bon an, wie weit man im Laden ist.
 * Listenwechsel = ein anderer Markt im Bonkopf.
 */
import { computed, ref } from 'vue'
import type { PSection, PItem, PList } from './types'

const props = defineProps<{
  sections: PSection[]
  bought: PItem[]
  lists: PList[]
  currentListId: string | null
}>()
const emit = defineEmits<{
  toggle: [id: string]
  add: [name: string, category: string | null, qty: number]
  selectList: [id: string]
}>()

/** Der Bon zeigt alles in einem Fluss — gekauft wie offen, in Kategorie-Bloecken. */
const blocks = computed(() =>
  props.sections.map(sec => ({
    ...sec,
    all: [
      ...sec.items,
      ...props.bought.filter(b => (b.category ?? null) === sec.category),
    ],
  })).filter(b => b.all.length > 0)
)

const openCount = computed(() => props.sections.reduce((n, s) => n + s.items.length, 0))
const doneCount = computed(() => props.bought.length)

const draft = ref('')
const cat = ref('')
const submit = () => {
  if (!draft.value.trim()) return
  emit('add', draft.value, cat.value.trim() || null, 1)
  draft.value = ''
}
</script>

<template>
  <div class="vD-wall">
    <div class="vD-slip">
      <div class="vD-edge vD-edge--top"></div>

      <div class="vD-inner">
        <p class="vD-brand">E I N K A U F</p>
        <div class="vD-markets">
          <button
            v-for="l in lists"
            :key="l.id"
            class="vD-market"
            :class="{ on: l.id === currentListId }"
            @click="emit('selectList', l.id)"
          >
            {{ l.id === currentListId ? '▶ ' : '  ' }}{{ l.name.toUpperCase() }}
          </button>
        </div>
        <p class="vD-rule">================================</p>

        <template v-for="b in blocks" :key="b.key">
          <p class="vD-cat">--- {{ b.label.toUpperCase() }} ---</p>
          <button
            v-for="it in b.all"
            :key="it.id"
            class="vD-line"
            :class="{ done: it.purchased }"
            @click="emit('toggle', it.id)"
          >
            <span class="vD-mark">{{ it.purchased ? '[x]' : '[ ]' }}</span>
            <span class="vD-art">{{ it.priority ? '*' : '' }}{{ it.name }}</span>
            <span class="vD-dots"></span>
            <span class="vD-num">{{ it.qty > 1 ? it.qty + ' ST' : '' }}</span>
          </button>
        </template>

        <p class="vD-rule">--------------------------------</p>
        <p class="vD-sum"><span>OFFEN</span><span class="vD-dots"></span><span>{{ openCount }}</span></p>
        <p class="vD-sum"><span>ERLEDIGT</span><span class="vD-dots"></span><span>{{ doneCount }}</span></p>
        <p class="vD-rule">================================</p>

        <div class="vD-entry">
          <span class="vD-mark">&gt;</span>
          <input
            v-model="draft"
            class="vD-input"
            type="text"
            placeholder="ARTIKEL ERFASSEN"
            @keyup.enter="submit"
          />
        </div>
        <div class="vD-entry">
          <span class="vD-mark">#</span>
          <input
            v-model="cat"
            class="vD-input"
            type="text"
            placeholder="KATEGORIE (OPTIONAL)"
            @keyup.enter="submit"
          />
        </div>
        <button class="vD-enter" @click="submit">ENTER</button>

        <p class="vD-foot">* * * VIELEN DANK * * *</p>
      </div>

      <div class="vD-edge vD-edge--bottom"></div>
    </div>
  </div>
</template>

<style scoped>
.vD-wall {
  background-color: var(--pw-cork, #e7dcc8);
  min-height: 100vh;
  padding: 16px 8px 48px;
  display: flex;
  justify-content: center;
}

.vD-slip {
  width: 100%;
  max-width: 380px;
  filter: drop-shadow(3px 3px 0 var(--pw-line, #241f1a));
}
.vD-inner {
  background: #fffdf6;
  border-left: 2px solid var(--pw-line, #241f1a);
  border-right: 2px solid var(--pw-line, #241f1a);
  padding: 12px 14px 16px;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  color: var(--pw-ink, #241f1a);
  font-size: 13px;
  line-height: 1.5;
}
/* Zackenkante oben und unten */
.vD-edge {
  height: 10px;
  background:
    linear-gradient(135deg, #fffdf6 50%, transparent 50%) 0 0 / 12px 10px repeat-x,
    linear-gradient(-135deg, #fffdf6 50%, transparent 50%) 6px 0 / 12px 10px repeat-x;
}
.vD-edge--top { transform: scaleY(-1); }

.vD-brand {
  margin: 0 0 6px;
  text-align: center;
  font-weight: 800;
  font-size: 16px;
  letter-spacing: 0.1em;
}
.vD-markets { display: flex; flex-direction: column; align-items: center; }
.vD-market {
  min-height: 32px;
  border: none;
  background: none;
  font: inherit;
  color: var(--pw-ink-soft, #544a3e);
  cursor: pointer;
  white-space: pre;
}
.vD-market.on { color: var(--pw-ink, #241f1a); font-weight: 800; }

.vD-rule { margin: 6px 0; overflow: hidden; white-space: nowrap; text-align: center; opacity: 0.8; }
.vD-cat {
  margin: 10px 0 2px;
  text-align: center;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.vD-line {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 40px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--pw-ink, #241f1a);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.vD-mark { flex-shrink: 0; font-weight: 800; }
.vD-art { flex-shrink: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
/* Punktfuehrer zur Mengenspalte */
.vD-dots {
  flex: 1;
  min-width: 12px;
  border-bottom: 2px dotted rgba(36, 31, 26, 0.45);
  transform: translateY(-3px);
}
.vD-num { flex-shrink: 0; font-weight: 800; font-variant-numeric: tabular-nums; }
.vD-line.done { color: var(--pw-ink-soft, #544a3e); }
.vD-line.done .vD-art { text-decoration: line-through 2px var(--pw-line, #241f1a); }

.vD-sum { display: flex; align-items: center; gap: 6px; margin: 2px 0; font-weight: 800; }

.vD-entry { display: flex; align-items: center; gap: 6px; min-height: 40px; }
.vD-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  border: none;
  border-bottom: 2px solid var(--pw-line, #241f1a);
  background: none;
  font: inherit;
  font-size: 14px;
  color: var(--pw-ink, #241f1a);
  padding: 0 2px;
}
.vD-input:focus { outline: none; background: rgba(233, 212, 138, 0.4); }
.vD-enter {
  width: 100%;
  min-height: 42px;
  margin-top: 8px;
  border: 2px solid var(--pw-line, #241f1a);
  background: var(--pw-ink, #241f1a);
  color: #fffdf6;
  font: inherit;
  font-weight: 800;
  letter-spacing: 0.2em;
  cursor: pointer;
}
.vD-foot { margin: 14px 0 0; text-align: center; letter-spacing: 0.1em; opacity: 0.75; }
</style>
