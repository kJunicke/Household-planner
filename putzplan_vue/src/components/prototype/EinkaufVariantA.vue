<script setup lang="ts">
/**
 * WEGWERF-PROTOTYP — Variante A: „Der lange Zettel".
 *
 * Die ganze Liste ist EIN Blatt Papier, das an der Wand haengt: oben und unten
 * abgerissen, links und rechts harte Tintenkante. Kategorien sind keine Boxen,
 * sondern Ueberschriften mit doppelter Tintenlinie. Kein Produkt hat einen
 * eigenen Rahmen — die Zeilen liegen auf dem Blatt wie geschrieben.
 * Die Menge steht als Randvermerk in einer schmalen Marginalspalte.
 */
import { ref } from 'vue'
import type { PSection, PItem, PList } from './types'

defineProps<{
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

const draft = ref<Record<string, string>>({})
const submit = (sec: PSection) => {
  const v = (draft.value[sec.key] ?? '').trim()
  if (!v) return
  emit('add', v, sec.category, 1)
  draft.value[sec.key] = ''
}
const boughtOpen = ref(false)
</script>

<template>
  <div class="vA-wall">
    <!-- Listenwechsel: Klebestreifen ueber der Blattkante -->
    <div class="vA-tabs">
      <button
        v-for="l in lists"
        :key="l.id"
        class="vA-tab"
        :class="{ on: l.id === currentListId }"
        @click="emit('selectList', l.id)"
      >
        {{ l.name }}
      </button>
    </div>

    <div class="vA-sheet">
      <section v-for="sec in sections" :key="sec.key" class="vA-sec">
        <h2 class="vA-head">
          <span class="vA-head-text">{{ sec.label }}</span>
          <span class="vA-head-count">{{ sec.items.length }}</span>
        </h2>

        <p v-if="sec.items.length === 0" class="vA-empty">— nichts notiert —</p>

        <button
          v-for="it in sec.items"
          :key="it.id"
          class="vA-line"
          :class="{ prio: it.priority }"
          @click="emit('toggle', it.id)"
        >
          <span class="vA-margin">{{ it.qty > 1 ? it.qty + '×' : '' }}</span>
          <span class="vA-box"><span v-if="it.purchased" class="vA-x">✕</span></span>
          <span class="vA-name">{{ it.name }}</span>
          <span v-if="it.priority" class="vA-bang">!</span>
        </button>

        <div class="vA-write">
          <span class="vA-margin"></span>
          <span class="vA-box vA-box--ghost"></span>
          <input
            v-model="draft[sec.key]"
            class="vA-write-input"
            type="text"
            placeholder="weiterschreiben…"
            @keyup.enter="submit(sec)"
          />
        </div>
      </section>

      <!-- Abgehaktes: bleibt auf demselben Blatt, nur durchgestrichen -->
      <section v-if="bought.length" class="vA-sec vA-sec--done">
        <button class="vA-head vA-head--btn" @click="boughtOpen = !boughtOpen">
          <span class="vA-head-text">erledigt</span>
          <span class="vA-head-count">{{ bought.length }}</span>
        </button>
        <template v-if="boughtOpen">
          <button
            v-for="it in bought"
            :key="it.id"
            class="vA-line vA-line--done"
            @click="emit('toggle', it.id)"
          >
            <span class="vA-margin">{{ it.qty > 1 ? it.qty + '×' : '' }}</span>
            <span class="vA-box"><span class="vA-x">✕</span></span>
            <span class="vA-name">{{ it.name }}</span>
          </button>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.vA-wall {
  background-color: var(--pw-cork, #e7dcc8);
  background-image:
    radial-gradient(circle at 12% 22%, rgba(138, 127, 109, 0.22) 0 1.5px, transparent 2px),
    radial-gradient(circle at 63% 8%, rgba(138, 127, 109, 0.18) 0 2px, transparent 2.5px),
    radial-gradient(circle at 34% 71%, rgba(138, 127, 109, 0.2) 0 1.5px, transparent 2px);
  background-size: 47px 43px, 71px 67px, 59px 53px;
  min-height: 100vh;
  padding: 10px 8px 40px;
}

/* Klebestreifen-Reiter */
.vA-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 0 4px 0;
  margin-bottom: -6px;
  position: relative;
  z-index: 2;
}
.vA-tabs::-webkit-scrollbar { display: none; }
.vA-tab {
  flex-shrink: 0;
  min-height: 34px;
  padding: 6px 14px 10px;
  border: 2px solid var(--pw-line, #241f1a);
  border-bottom: none;
  background: var(--pw-tape, #e9d48a);
  color: var(--pw-ink, #241f1a);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transform: rotate(-0.6deg);
}
.vA-tab.on {
  background: var(--pw-paper, #fffdf6);
  transform: rotate(0deg) translateY(2px);
}

/* Das Blatt: abgerissene Ober- und Unterkante, harte Seitenkanten */
.vA-sheet {
  position: relative;
  background: var(--pw-paper, #fffdf6);
  border-left: 2px solid var(--pw-line, #241f1a);
  border-right: 2px solid var(--pw-line, #241f1a);
  box-shadow: 3px 3px 0 var(--pw-line, #241f1a);
  padding: 14px 10px 18px;
}
.vA-sheet::before,
.vA-sheet::after {
  content: '';
  position: absolute;
  left: -2px;
  right: -2px;
  height: 10px;
  /* Abrisskante: Papierzacken auf einer um 2px versetzten Tintenzacke. */
  background:
    linear-gradient(135deg, var(--pw-paper, #fffdf6) 50%, transparent 50%) 0 0 / 14px 10px repeat-x,
    linear-gradient(-135deg, var(--pw-paper, #fffdf6) 50%, transparent 50%) 7px 0 / 14px 10px repeat-x,
    linear-gradient(135deg, var(--pw-line, #241f1a) 50%, transparent 50%) 0 2px / 14px 10px repeat-x,
    linear-gradient(-135deg, var(--pw-line, #241f1a) 50%, transparent 50%) 7px 2px / 14px 10px repeat-x;
}
.vA-sheet::before { top: -10px; transform: scaleY(-1); }
.vA-sheet::after { bottom: -10px; }

.vA-sec { margin-bottom: 18px; }
.vA-sec:last-child { margin-bottom: 0; }

/* Kategorie = Ueberschrift mit doppelter Tintenlinie, keine Box */
.vA-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  margin: 0 0 4px;
  padding: 0 0 3px;
  border: none;
  border-bottom: 3px double var(--pw-line, #241f1a);
  background: none;
  text-align: left;
  color: var(--pw-ink, #241f1a);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  min-height: 34px;
  cursor: default;
}
.vA-head--btn { cursor: pointer; }
.vA-head-text { flex: 1; min-width: 0; }
.vA-head-count {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}
.vA-empty {
  margin: 2px 0 0 44px;
  color: var(--pw-ink-soft, #544a3e);
  font-size: 13px;
  font-style: italic;
}

/* Produktzeile: kein Rahmen, kein Hintergrund — nur Schrift auf Papier */
.vA-line {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 42px;
  padding: 0;
  border: none;
  border-bottom: 1px solid rgba(36, 31, 26, 0.16);
  background: none;
  text-align: left;
  color: var(--pw-ink, #241f1a);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.vA-line:active { background: rgba(36, 31, 26, 0.06); }
.vA-margin {
  flex-shrink: 0;
  width: 28px;
  text-align: right;
  font-size: 13px;
  font-weight: 700;
  color: #b03a28;
  font-variant-numeric: tabular-nums;
}
.vA-box {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 2px solid var(--pw-line, #241f1a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
}
.vA-box--ghost { border-style: dashed; opacity: 0.45; }
.vA-x { transform: translateY(-1px); }
.vA-name { flex: 1; min-width: 0; font-size: 16px; overflow-wrap: anywhere; }
.vA-bang { font-weight: 900; color: #b03a28; font-size: 18px; padding-right: 4px; }
.vA-line.prio .vA-name { text-decoration: underline 2px #b03a28; text-underline-offset: 3px; }
.vA-line--done .vA-name {
  text-decoration: line-through 2px var(--pw-ink, #241f1a);
  color: var(--pw-ink-soft, #544a3e);
}

/* Naechste freie Zeile statt Formularfeld */
.vA-write { display: flex; align-items: center; gap: 8px; min-height: 42px; }
.vA-write-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  border: none;
  border-bottom: 1px dashed rgba(36, 31, 26, 0.45);
  background: none;
  color: var(--pw-ink, #241f1a);
  font-size: 16px;
  padding: 0;
}
.vA-write-input:focus { outline: none; border-bottom-color: var(--pw-line, #241f1a); }
.vA-write-input::placeholder { color: var(--pw-ink-soft, #544a3e); opacity: 0.75; }
</style>
