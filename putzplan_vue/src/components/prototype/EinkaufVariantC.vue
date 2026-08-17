<script setup lang="ts">
/**
 * WEGWERF-PROTOTYP — Variante C: „Gebuendelte Kategorie-Zettel".
 *
 * Konsequente Fortsetzung der Wand: jede Kategorie ist ein eigener Zettel, mit
 * Klebeband angepappt und leicht aus der Achse gekippt. Zwischen den Zetteln
 * bleibt Kork sichtbar — die Gliederung entsteht durch Papierkanten, nicht
 * durch Ueberschriften. Ein Zettel laesst sich zusammenfalten (eingeklappt).
 * Gekauftes wandert auf einen Packpapier-Zettel ganz unten.
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

const folded = ref<Set<string>>(new Set())
const isFolded = (k: string) => folded.value.has(k)
const toggleFold = (k: string) => {
  const n = new Set(folded.value)
  if (n.has(k)) n.delete(k)
  else n.add(k)
  folded.value = n
}

const draft = ref<Record<string, string>>({})
const submit = (sec: PSection) => {
  const v = (draft.value[sec.key] ?? '').trim()
  if (!v) return
  emit('add', v, sec.category, 1)
  draft.value[sec.key] = ''
}
</script>

<template>
  <div class="vC-wall">
    <!-- Listenwechsel: Reissnaegel-Reihe oben -->
    <div class="vC-lists">
      <button
        v-for="l in lists"
        :key="l.id"
        class="vC-listpin"
        :class="{ on: l.id === currentListId }"
        @click="emit('selectList', l.id)"
      >
        <span class="vC-pinhead"></span>{{ l.name }}
      </button>
    </div>

    <div
      v-for="(sec, i) in sections"
      :key="sec.key"
      class="vC-note"
      :class="{ folded: isFolded(sec.key), uncat: sec.isUncategorized }"
      :style="{ '--rot': ((i % 3) - 1) * 0.7 + 'deg', '--cat': sec.color }"
    >
      <span class="vC-tape" :class="i % 2 ? 'right' : 'left'"></span>

      <button class="vC-note-head" @click="toggleFold(sec.key)">
        <span class="vC-swatch"></span>
        <span class="vC-note-title">{{ sec.label }}</span>
        <span class="vC-note-n">{{ sec.items.length }}</span>
        <span class="vC-fold">{{ isFolded(sec.key) ? '▸' : '▾' }}</span>
      </button>

      <div v-if="!isFolded(sec.key)" class="vC-note-body">
        <p v-if="sec.items.length === 0" class="vC-empty">nichts drauf</p>
        <button
          v-for="it in sec.items"
          :key="it.id"
          class="vC-item"
          @click="emit('toggle', it.id)"
        >
          <span class="vC-box"><span v-if="it.purchased">✕</span></span>
          <span class="vC-item-name">{{ it.name }}</span>
          <span v-if="it.priority" class="vC-prio">!</span>
          <span v-if="it.qty > 1" class="vC-qty">{{ it.qty }}×</span>
        </button>

        <div class="vC-add">
          <input
            v-model="draft[sec.key]"
            class="vC-add-input"
            type="text"
            placeholder="dazu…"
            @keyup.enter="submit(sec)"
          />
          <button class="vC-add-btn" @click="submit(sec)">+</button>
        </div>
      </div>
    </div>

    <!-- Gekauftes: Packpapier-Zettel -->
    <div v-if="bought.length" class="vC-note vC-note--done" style="--rot: 0.8deg">
      <span class="vC-tape left"></span>
      <p class="vC-done-title">Im Wagen ({{ bought.length }})</p>
      <div class="vC-note-body">
        <button
          v-for="it in bought"
          :key="it.id"
          class="vC-item vC-item--done"
          @click="emit('toggle', it.id)"
        >
          <span class="vC-box"><span>✕</span></span>
          <span class="vC-item-name">{{ it.name }}</span>
          <span v-if="it.qty > 1" class="vC-qty">{{ it.qty }}×</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vC-wall {
  background-color: var(--pw-cork, #e7dcc8);
  background-image:
    radial-gradient(circle at 12% 22%, rgba(138, 127, 109, 0.22) 0 1.5px, transparent 2px),
    radial-gradient(circle at 63% 8%, rgba(138, 127, 109, 0.18) 0 2px, transparent 2.5px),
    radial-gradient(circle at 34% 71%, rgba(138, 127, 109, 0.2) 0 1.5px, transparent 2px),
    radial-gradient(circle at 86% 54%, rgba(138, 127, 109, 0.16) 0 2px, transparent 2.5px);
  background-size: 47px 43px, 71px 67px, 59px 53px, 83px 79px;
  min-height: 100vh;
  padding: 10px 10px 40px;
}

.vC-lists { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin-bottom: 16px; }
.vC-lists::-webkit-scrollbar { display: none; }
.vC-listpin {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 6px 12px;
  border: 2px solid var(--pw-line, #241f1a);
  background: var(--pw-paper, #fffdf6);
  box-shadow: 2px 2px 0 var(--pw-line, #241f1a);
  color: var(--pw-ink, #241f1a);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.vC-listpin.on { background: var(--pw-tape, #e9d48a); }
.vC-pinhead {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #b03a28;
  border: 1.5px solid var(--pw-line, #241f1a);
}

/* Der Kategorie-Zettel */
.vC-note {
  position: relative;
  margin-bottom: 22px;
  padding: 10px 10px 10px;
  border: 2px solid var(--pw-line, #241f1a);
  background: var(--pw-paper, #fffdf6);
  box-shadow: 3px 3px 0 var(--pw-line, #241f1a);
  transform: rotate(var(--rot, 0deg));
}
.vC-note.uncat { background: #f4ecdc; }
.vC-note--done { background: var(--pw-paper-proj, #dcc39c); }
.vC-note.folded { padding-bottom: 6px; }

.vC-tape {
  position: absolute;
  top: -11px;
  width: 62px;
  height: 20px;
  background: var(--pw-tape, #e9d48a);
  border: 1px solid rgba(36, 31, 26, 0.35);
  opacity: 0.92;
  pointer-events: none;
}
.vC-tape.left { left: 16px; transform: rotate(-7deg); }
.vC-tape.right { right: 16px; transform: rotate(6deg); }

.vC-note-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 0 0 6px;
  margin-bottom: 4px;
  border: none;
  border-bottom: 2px solid var(--pw-line, #241f1a);
  background: none;
  text-align: left;
  color: var(--pw-ink, #241f1a);
  cursor: pointer;
}
.vC-swatch {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  background: var(--cat, #999);
  border: 2px solid var(--pw-line, #241f1a);
}
.vC-note-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vC-note-n {
  font-size: 12px;
  font-weight: 800;
  padding: 1px 6px;
  border: 1.5px solid var(--pw-line, #241f1a);
  background: var(--pw-cork-deep, #d8c9ad);
}
.vC-fold { font-size: 14px; width: 18px; text-align: center; }

.vC-note-body { display: flex; flex-direction: column; }
.vC-empty { margin: 4px 0; font-size: 13px; font-style: italic; color: var(--pw-ink-soft, #544a3e); }

.vC-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 42px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  color: var(--pw-ink, #241f1a);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.vC-item + .vC-item { border-top: 1px dotted rgba(36, 31, 26, 0.3); }
.vC-box {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 2px solid var(--pw-line, #241f1a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
}
.vC-item-name { flex: 1; min-width: 0; font-size: 16px; overflow-wrap: anywhere; }
.vC-item--done .vC-item-name {
  text-decoration: line-through 2px var(--pw-line, #241f1a);
  color: var(--pw-ink-soft, #544a3e);
}
.vC-prio { color: #b03a28; font-weight: 900; font-size: 18px; }
.vC-qty {
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  padding: 1px 5px;
  border: 1.5px solid var(--pw-line, #241f1a);
  background: var(--pw-tape, #e9d48a);
}

.vC-add { display: flex; gap: 6px; margin-top: 6px; }
.vC-add-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  border: 2px dashed rgba(36, 31, 26, 0.5);
  background: transparent;
  padding: 0 8px;
  font-size: 15px;
  color: var(--pw-ink, #241f1a);
}
.vC-add-input:focus { outline: none; border-style: solid; }
.vC-add-btn {
  width: 40px;
  height: 38px;
  border: 2px solid var(--pw-line, #241f1a);
  background: var(--pw-accent, #2b4a8f);
  color: var(--pw-paper, #fffdf6);
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
  box-shadow: 2px 2px 0 var(--pw-line, #241f1a);
  cursor: pointer;
}
.vC-done-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-bottom: 2px solid var(--pw-line, #241f1a);
  padding-bottom: 6px;
  color: var(--pw-ink, #241f1a);
}
</style>
