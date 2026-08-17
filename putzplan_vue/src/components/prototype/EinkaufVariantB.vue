<script setup lang="ts">
/**
 * WEGWERF-PROTOTYP — Variante B: „Karierter Abrissblock".
 *
 * Ein Block mit Perforation oben. Das Blatt ist kariert, und das Karo ist das
 * Layout: jede Produktzeile ist exakt zwei Karos hoch und sitzt auf der Linie.
 * Kategorien sind gestempelte Reiter am linken Rand, nicht Ueberschriften.
 * Abgehaktes wird abgerissen und sammelt sich als schiefer Stapel unter dem
 * Block — nicht als weitere Liste.
 */
import { ref } from 'vue'
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

/** Ein Block zeigt eine Kategorie als aktives Blatt — Reiter wechseln das Blatt. */
const activeKey = ref<string | null>(null)
const current = () =>
  props.sections.find(s => s.key === activeKey.value) ?? props.sections[0] ?? null

const draft = ref('')
const qty = ref(1)
const submit = () => {
  const sec = current()
  if (!draft.value.trim()) return
  emit('add', draft.value, sec?.category ?? null, qty.value)
  draft.value = ''
  qty.value = 1
}
</script>

<template>
  <div class="vB-wall">
    <!-- Listenwahl: Blockdeckel-Aufdruck -->
    <div class="vB-listbar">
      <button
        v-for="l in lists"
        :key="l.id"
        class="vB-listbtn"
        :class="{ on: l.id === currentListId }"
        @click="emit('selectList', l.id)"
      >
        {{ l.name }}
      </button>
    </div>

    <div class="vB-block">
      <div class="vB-perf"></div>

      <div class="vB-body">
        <!-- Kategorie-Reiter am linken Rand -->
        <nav class="vB-tabs">
          <button
            v-for="sec in sections"
            :key="sec.key"
            class="vB-tab"
            :class="{ on: (current()?.key ?? '') === sec.key }"
            :style="{ '--tab-color': sec.color }"
            @click="activeKey = sec.key"
          >
            <span class="vB-tab-name">{{ sec.label }}</span>
            <span class="vB-tab-n">{{ sec.items.length }}</span>
          </button>
        </nav>

        <div class="vB-sheet">
          <h2 class="vB-stamp">{{ current()?.label ?? '—' }}</h2>

          <p v-if="!current() || current()!.items.length === 0" class="vB-empty">
            Blatt leer
          </p>

          <button
            v-for="it in current()?.items ?? []"
            :key="it.id"
            class="vB-row"
            @click="emit('toggle', it.id)"
          >
            <span class="vB-tick">{{ it.purchased ? '✓' : '' }}</span>
            <span class="vB-name">{{ it.name }}</span>
            <span v-if="it.priority" class="vB-prio">!</span>
            <span v-if="it.qty > 1" class="vB-qty">{{ it.qty }}×</span>
          </button>

          <div class="vB-addrow">
            <span class="vB-tick vB-tick--ghost">+</span>
            <input
              v-model="draft"
              class="vB-addinput"
              type="text"
              :placeholder="`auf ${current()?.label ?? 'Blatt'} schreiben…`"
              @keyup.enter="submit"
            />
            <input v-model.number="qty" class="vB-addqty" type="number" min="1" max="99" />
          </div>
        </div>
      </div>
    </div>

    <!-- Abrissstapel -->
    <div v-if="bought.length" class="vB-stack">
      <p class="vB-stack-title">abgerissen ({{ bought.length }})</p>
      <button
        v-for="(it, i) in bought"
        :key="it.id"
        class="vB-scrap"
        :style="{ '--rot': ((i % 5) - 2) * 0.9 + 'deg' }"
        @click="emit('toggle', it.id)"
      >
        <span class="vB-scrap-name">{{ it.name }}</span>
        <span v-if="it.qty > 1" class="vB-qty">{{ it.qty }}×</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.vB-wall {
  background-color: var(--pw-cork, #e7dcc8);
  min-height: 100vh;
  padding: 10px 8px 40px;
}

.vB-listbar { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin-bottom: 10px; }
.vB-listbar::-webkit-scrollbar { display: none; }
.vB-listbtn {
  flex-shrink: 0;
  min-height: 36px;
  padding: 6px 12px;
  border: 2px solid var(--pw-line, #241f1a);
  background: var(--pw-cork-deep, #d8c9ad);
  color: var(--pw-ink, #241f1a);
  font-weight: 700;
  font-size: 13px;
  box-shadow: 2px 2px 0 var(--pw-line, #241f1a);
  cursor: pointer;
}
.vB-listbtn.on { background: var(--pw-tape, #e9d48a); box-shadow: 0 0 0 var(--pw-line, #241f1a); transform: translate(2px, 2px); }

/* Der Block */
.vB-block {
  border: 2px solid var(--pw-line, #241f1a);
  background: var(--pw-paper, #fffdf6);
  box-shadow: 3px 3px 0 var(--pw-line, #241f1a), 7px 7px 0 rgba(36, 31, 26, 0.25);
}
/* Perforation: Lochreihe auf Packpapierstreifen */
.vB-perf {
  height: 22px;
  border-bottom: 2px dashed var(--pw-line, #241f1a);
  background:
    radial-gradient(circle at 11px 11px, var(--pw-cork, #e7dcc8) 0 4px, transparent 5px) 0 0 / 22px 22px repeat-x,
    var(--pw-paper-proj, #dcc39c);
}

.vB-body { display: flex; align-items: stretch; }

/* Kategorie-Reiter: vertikal am linken Rand */
.vB-tabs {
  flex-shrink: 0;
  width: 78px;
  border-right: 2px solid var(--pw-line, #241f1a);
  background: var(--pw-cork-deep, #d8c9ad);
  display: flex;
  flex-direction: column;
}
.vB-tab {
  min-height: 46px;
  padding: 6px 6px;
  border: none;
  border-bottom: 1px solid rgba(36, 31, 26, 0.35);
  background: none;
  color: var(--pw-ink, #241f1a);
  text-align: left;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-left: 6px solid var(--tab-color, #999);
}
.vB-tab.on { background: var(--pw-paper, #fffdf6); margin-right: -2px; border-right: 2px solid var(--pw-paper, #fffdf6); }
.vB-tab-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vB-tab-n { font-size: 11px; font-weight: 800; opacity: 0.7; }

/* Kariertes Blatt — 22px Karo, Zeilen sind 44px = 2 Karos */
.vB-sheet {
  flex: 1;
  min-width: 0;
  padding: 8px 8px 12px;
  background-image:
    linear-gradient(rgba(43, 74, 143, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(43, 74, 143, 0.16) 1px, transparent 1px);
  background-size: 22px 22px, 22px 22px;
}
.vB-stamp {
  display: inline-block;
  margin: 0 0 6px;
  padding: 2px 8px;
  border: 2px solid var(--pw-line, #241f1a);
  color: var(--pw-ink, #241f1a);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transform: rotate(-1.5deg);
  background: rgba(255, 253, 246, 0.8);
}
.vB-empty { color: var(--pw-ink-soft, #544a3e); font-size: 13px; font-style: italic; }

.vB-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 44px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  color: var(--pw-ink, #241f1a);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.vB-tick {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 2px solid var(--pw-line, #241f1a);
  background: var(--pw-paper, #fffdf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
}
.vB-tick--ghost { border-style: dashed; opacity: 0.5; }
.vB-name { flex: 1; min-width: 0; font-size: 16px; overflow-wrap: anywhere; }
.vB-prio { color: #b03a28; font-weight: 900; font-size: 18px; }
.vB-qty {
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  padding: 1px 5px;
  border: 1.5px solid var(--pw-line, #241f1a);
  background: var(--pw-tape, #e9d48a);
}

.vB-addrow { display: flex; align-items: center; gap: 8px; height: 44px; }
.vB-addinput {
  flex: 1;
  min-width: 0;
  height: 32px;
  border: none;
  border-bottom: 2px solid var(--pw-line, #241f1a);
  background: none;
  font-size: 16px;
  color: var(--pw-ink, #241f1a);
  padding: 0 2px;
}
.vB-addinput:focus { outline: none; background: rgba(233, 212, 138, 0.35); }
.vB-addqty {
  width: 46px;
  height: 32px;
  text-align: center;
  border: 2px solid var(--pw-line, #241f1a);
  background: var(--pw-paper, #fffdf6);
  font-size: 14px;
  color: var(--pw-ink, #241f1a);
}

/* Abrissstapel unter dem Block */
.vB-stack { margin-top: 18px; display: flex; flex-direction: column; gap: 4px; }
.vB-stack-title {
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pw-ink-soft, #544a3e);
}
.vB-scrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 4px 10px;
  border: 2px solid var(--pw-line, #241f1a);
  background: var(--pw-paper, #fffdf6);
  box-shadow: 2px 2px 0 var(--pw-line, #241f1a);
  transform: rotate(var(--rot, 0deg));
  cursor: pointer;
  text-align: left;
}
.vB-scrap-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: var(--pw-ink-soft, #544a3e);
  text-decoration: line-through 2px var(--pw-line, #241f1a);
  overflow-wrap: anywhere;
}
</style>
