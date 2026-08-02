<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { categoryColor } from '@/lib/categoryColor'
import type { CategoryOption } from '@/types/CategoryOption'

const props = withDefaults(
  defineProps<{
    modelValue: string
    /** Kategorien des Haushalts; die der aktuellen Liste zuerst. */
    options: CategoryOption[]
    placeholder?: string
    /** Schmale einzeilige Variante für die obere Leiste. */
    compact?: boolean
  }>(),
  { placeholder: 'Kategorie…', compact: false }
)

const emit = defineEmits<{
  'update:modelValue': [string]
  /** Enter ohne offenen Vorschlag — der Aufrufer darf abschicken. */
  submit: []
}>()

const norm = (s: string) => s.trim().toLowerCase()

const open = ref(false)
const highlight = ref(-1)

const query = computed(() => props.modelValue.trim())

const matches = computed(() => {
  const q = norm(props.modelValue)
  const hits = q ? props.options.filter(o => norm(o.name).includes(q)) : props.options
  return hits.slice(0, 8)
})

/**
 * Der Neu-anlegen-Eintrag entfällt nur, wenn die Eingabe eine Kategorie *dieser*
 * Liste trifft. Ein Treffer aus einer fremden Liste bleibt anlegbar — übernommen
 * wird dabei nur der Name, nie deren Produkte.
 */
const newEntry = computed(() => {
  const q = norm(props.modelValue)
  if (!q) return null
  const inThisList = props.options.some(o => !o.sourceListName && norm(o.name) === q)
  return inThisList ? null : query.value
})

const rowCount = computed(() => matches.value.length + (newEntry.value ? 1 : 0))

// Eine gewanderte Auswahl darf nicht auf einer Zeile stehen bleiben, die es nach
// dem nächsten Tastendruck nicht mehr gibt.
watch(rowCount, () => { highlight.value = -1 })

const setValue = (value: string) => emit('update:modelValue', value)

const choose = (name: string) => {
  setValue(name)
  open.value = false
  highlight.value = -1
}

const clear = () => {
  setValue('')
  open.value = false
}

const move = (delta: number) => {
  if (!rowCount.value) return
  open.value = true
  const next = highlight.value + delta
  highlight.value = next < 0 ? rowCount.value - 1 : next % rowCount.value
}

const onEnter = () => {
  if (open.value && highlight.value >= 0) {
    const picked = matches.value[highlight.value]
    choose(picked ? picked.name : (newEntry.value ?? ''))
    return
  }
  open.value = false
  emit('submit')
}
</script>

<template>
  <div class="cat-combo" :class="{ compact }">
    <div class="combo-field">
      <span class="combo-dot" :style="{ background: categoryColor(query || null) }"></span>
      <input
        class="combo-input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :value="modelValue"
        :placeholder="placeholder"
        maxlength="100"
        autocomplete="off"
        @input="setValue(($event.target as HTMLInputElement).value)"
        @focus="open = true"
        @blur="open = false"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="onEnter"
        @keydown.esc="open = false"
      />
      <button
        v-if="modelValue"
        class="combo-clear"
        type="button"
        title="Kategorie entfernen"
        @mousedown.prevent="clear"
      >
        <i class="bi bi-x-lg"></i>
      </button>
    </div>

    <!-- mousedown.prevent: sonst schluckt der Blur die Auswahl, bevor der Klick ankommt. -->
    <div v-if="open && rowCount > 0" class="combo-list">
      <button
        v-for="(opt, i) in matches"
        :key="opt.sourceListName ? `${opt.sourceListName}::${opt.name}` : opt.name"
        type="button"
        class="combo-row"
        :class="{ active: highlight === i }"
        @mousedown.prevent="choose(opt.name)"
      >
        <span class="combo-dot" :style="{ background: categoryColor(opt.name) }"></span>
        <span class="combo-label">{{ opt.name }}</span>
        <span v-if="opt.sourceListName" class="combo-source">aus {{ opt.sourceListName }}</span>
      </button>

      <template v-if="newEntry">
        <div class="combo-divider"><span>Neu anlegen</span></div>
        <button
          type="button"
          class="combo-row combo-new"
          :class="{ active: highlight === matches.length }"
          @mousedown.prevent="choose(newEntry)"
        >
          <i class="bi bi-plus-circle-fill combo-new-icon"></i>
          <span class="combo-label">„{{ newEntry }}" neu anlegen</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cat-combo { position: relative; min-width: 0; }

.combo-field {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  min-height: var(--touch-target-min);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.combo-field:focus-within { border-color: var(--color-primary); }

.compact .combo-field {
  min-height: 38px;
  padding: 0 6px;
  gap: 4px;
}

.combo-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.combo-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--font-base);
  padding: 8px 0;
}
.combo-input:focus { outline: none; }
.compact .combo-input { font-size: var(--font-sm); padding: 4px 0; }

.combo-clear {
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 4px;
  color: var(--color-text-muted);
  font-size: var(--font-xs);
  cursor: pointer;
  display: flex;
  align-items: center;
}
.combo-clear:hover { color: var(--color-text-primary); }

.combo-list {
  position: absolute;
  top: calc(100% + 4px);
  /* Nach links wachsen: in der oberen Leiste ist das Feld schmal, die Liste
     würde sonst rechts aus dem Bildschirm laufen. */
  right: 0;
  min-width: 100%;
  width: max-content;
  max-width: 78vw;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 1050;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.combo-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  min-height: var(--touch-target-min);
  padding: var(--spacing-sm);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--font-base);
  text-align: left;
  cursor: pointer;
}
.combo-row:hover, .combo-row.active { background: var(--color-background); }

.combo-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combo-source {
  flex-shrink: 0;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

/* Beschriftete Trennlinie: macht sichtbar, dass ab hier etwas Neues entsteht. */
.combo-divider {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 6px var(--spacing-sm) 2px;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.combo-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

.combo-new-icon { color: var(--color-primary); flex-shrink: 0; }
</style>
