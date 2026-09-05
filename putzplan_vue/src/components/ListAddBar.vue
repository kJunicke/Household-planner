<script setup lang="ts">
/**
 * Obere Leiste einer Liste: Name · Menge · Zielkategorie · Hinzufügen ·
 * Kategorie anlegen.
 *
 * Wort für Wort aus `ShoppingView.vue` herausgelöst (Template, Logik und die
 * `.top-*`-Styles samt Pinnwand-Regeln), damit Einkauf, Packliste und To-do
 * dieselbe Leiste tragen. Die Komponente entscheidet nichts über den Eintrag:
 * sie sammelt Name, Menge und Kategorie ein, meldet sie per `add` und setzt
 * sich danach selbst zurück. Ob daraus ein neuer Eintrag wird oder ein
 * erledigter wieder aufwacht, bleibt Sache der Ansicht.
 */
import { computed, ref, watch } from 'vue'
import CategoryCombobox from '@/components/CategoryCombobox.vue'
import type { CategoryOption } from '@/types/CategoryOption'

const props = withDefaults(
  defineProps<{
    /** Listenwechsel → Leiste zurücksetzen; ein halb getippter Eintrag gehört nicht in die neue Liste. */
    listId: string | null
    /** Kategorien des Haushalts für die Combobox. */
    categoryOptions: CategoryOption[]
    /** Namensvorschläge aus der Historie — die Ansicht liefert höchstens fünf. */
    nameSuggestions: (query: string) => string[]
    /** Automatische Zielkategorie aus früherer Verwendung; nie über eine Handwahl. */
    suggestCategory: (name: string) => string | null
    placeholder: string
    disabled?: boolean
  }>(),
  { disabled: false }
)

const emit = defineEmits<{
  add: [name: string, quantity: number, category: string]
  'create-category': []
}>()

const vFocus = { mounted: (el: HTMLElement) => el.focus() }

const name = ref('')
const showSuggestions = ref(false)
const category = ref('')
const qty = ref(1)
const qtyOpen = ref(false)
/** Sobald die Kategorie von Hand angefasst wurde, hält die Automatik still. */
const categoryTouched = ref(false)

const suggestions = computed(() => {
  const query = name.value.trim()
  if (!query) return []
  return props.nameSuggestions(query)
})

// Automatische Zielkategorie aus der Historie — überschreibt nie eine Wahl,
// die der Nutzer selbst getroffen hat. Von Watcher UND Vorschlagsklick genutzt
// (letzterer ruft `handleAdd()` synchron, bevor ein Watcher feuern würde).
const applyAutoCategory = (value: string) => {
  if (categoryTouched.value) return
  category.value = props.suggestCategory(value) ?? ''
}

watch(name, applyAutoCategory)

const onCategoryInput = (value: string) => {
  categoryTouched.value = true
  category.value = value
}

const openQty = () => { qtyOpen.value = true }
const closeQty = () => {
  qty.value = Math.max(1, Math.floor(Number(qty.value) || 1))
  qtyOpen.value = false
}

const reset = () => {
  name.value = ''
  showSuggestions.value = false
  category.value = ''
  categoryTouched.value = false
  qty.value = 1
  qtyOpen.value = false
}

watch(() => props.listId, reset)

const handleAdd = () => {
  const value = name.value.trim()
  if (!value) return
  const quantity = Math.max(1, Math.floor(Number(qty.value) || 1))
  const target = category.value
  reset()
  emit('add', value, quantity, target)
}

const selectSuggestion = (suggestion: string) => {
  name.value = suggestion
  applyAutoCategory(suggestion)
  showSuggestions.value = false
  handleAdd()
}

const handleInputFocus = () => { showSuggestions.value = true }
// Der Klick auf einen Vorschlag kommt nach dem Blur — deshalb erst verzögert
// schließen (der Vorschlag selbst fängt zusätzlich per @mousedown.prevent ab).
const handleInputBlur = () => { setTimeout(() => { showSuggestions.value = false }, 200) }
</script>

<template>
  <div class="search-container">
    <div class="top-bar">
      <div class="top-name-wrap">
        <input
          v-model="name"
          type="text"
          class="top-name-input"
          :placeholder="placeholder"
          maxlength="200"
          :disabled="disabled"
          @keyup.enter="handleAdd"
          @focus="handleInputFocus"
          @blur="handleInputBlur"
        />
        <div v-if="showSuggestions && suggestions.length > 0" class="suggestions-dropdown">
          <div
            v-for="suggestion in suggestions"
            :key="suggestion"
            class="suggestion-item"
            @mousedown.prevent="selectSuggestion(suggestion)"
          >
            <i class="bi bi-clock-history me-2"></i>
            {{ suggestion }}
          </div>
        </div>
      </div>

      <input
        v-if="qtyOpen"
        v-focus
        v-model.number="qty"
        type="number"
        class="top-qty-input"
        min="1"
        max="999"
        @keyup.enter="handleAdd"
        @blur="closeQty"
      />
      <button
        v-else
        class="top-qty-toggle"
        :class="{ active: qty > 1 }"
        title="Anzahl festlegen"
        @click="openQty"
      >
        ×{{ qty }}
      </button>

      <CategoryCombobox
        class="top-combo"
        compact
        :model-value="category"
        :options="categoryOptions"
        placeholder="Kategorie"
        @update:model-value="onCategoryInput"
        @submit="handleAdd"
      />

      <button
        class="top-btn top-add"
        :disabled="!name.trim() || disabled"
        title="Hinzufügen"
        @click="handleAdd"
      >
        <i class="bi bi-plus-lg"></i>
      </button>
      <button
        class="top-btn top-new-cat"
        title="Kategorie anlegen"
        @click="emit('create-category')"
      >
        <i class="bi bi-tag"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-container { position: relative; margin-bottom: 1rem; }

/* Einzeilig bis hinunter zu 360 px: die festen Knöpfe behalten ihre Trefferfläche,
   Namensfeld und Kategorie teilen sich den Rest — die Kategorie gibt zuerst nach. */
.top-bar {
  display: flex;
  align-items: center;
  gap: 4px;
}
.top-name-wrap { position: relative; flex: 1 1 40%; min-width: 0; }
.top-name-input {
  width: 100%;
  height: 38px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: var(--font-base);
}
.top-name-input:focus { outline: none; border-color: var(--color-primary); }
.top-combo { flex: 1 1 30%; min-width: 64px; }

.top-qty-toggle {
  flex-shrink: 0;
  min-width: 34px;
  height: 38px;
  padding: 0 4px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.top-qty-toggle.active { border-color: var(--color-primary); color: var(--color-primary); }
.top-qty-input {
  flex-shrink: 0;
  width: 48px;
  height: 38px;
  text-align: center;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}
.top-qty-input:focus { outline: none; }

.top-btn {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.top-add { border: none; background: var(--color-primary); color: #fff; }
.top-add:disabled { opacity: 0.4; cursor: not-allowed; }
.top-new-cat {
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text-secondary);
}
.top-new-cat:hover { border-color: var(--color-primary); color: var(--color-primary); }

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
}
.suggestion-item {
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid var(--color-border);
  background: none;
  border-left: none;
  border-right: none;
  border-top: none;
  text-align: left;
  font-size: var(--font-base);
  color: var(--color-text-primary);
}
.suggestion-item:last-child { border-bottom: none; }
.suggestion-item:hover { background-color: var(--color-background); }

/* ==========================================================================
   Pinnwand-Aussehen — wörtlich aus `ShoppingView.vue` mitgenommen, damit die
   Leiste in beiden Designs gleich aussieht, egal welche Ansicht sie einbaut.
   ========================================================================== */
:root[data-design='pinnwand'] .search-container {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed rgba(36, 31, 26, 0.35);
}
:root[data-design='pinnwand'] .top-bar { gap: 6px; }
:root[data-design='pinnwand'] .top-name-input {
  height: 44px;
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-paper);
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .top-qty-toggle,
:root[data-design='pinnwand'] .top-qty-input {
  position: relative;
  height: 44px;
  min-width: 44px;
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-tape);
  color: var(--pw-ink);
  font-weight: 800;
}
:root[data-design='pinnwand'] .top-qty-toggle.active {
  border-color: var(--pw-line);
  color: var(--pw-ink);
}
/* 44px sichtbar, 48px treffbar — wie die Knoepfe daneben. */
:root[data-design='pinnwand'] .top-qty-toggle::after {
  content: '';
  position: absolute;
  inset: -2px;
}
/* 44px sichtbar, 48px treffbar. Nicht 48px sichtbar, weil die Leiste einzeilig
   bleibt und die drei festen Knoepfe sich die Breite mit Namensfeld und
   Kategorie teilen.
   Gemessen (Container kuenstlich verengt, Media Queries feuern dabei nicht):
   bei 320px laeuft nichts ueber; die Kategorie-Kopfzeile beginnt ab rund 308px
   zu ueberlaufen, bei 220px die obere Leiste um 44px und das Blatt um 48px.
   Echte Geraete gehen nicht unter 320px — die Zahlen stehen hier als
   gemessener Rand, nicht als gerechneter. */
:root[data-design='pinnwand'] .top-btn {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 2px;
  border: 2px solid var(--pw-line);
  box-shadow: 2px 2px 0 var(--pw-line);
}
:root[data-design='pinnwand'] .top-btn::after {
  content: '';
  position: absolute;
  inset: -2px;
}
:root[data-design='pinnwand'] .top-btn:active {
  transform: translate(2px, 2px);
  box-shadow: 0 0 0 var(--pw-line);
}
:root[data-design='pinnwand'] .top-add {
  background: var(--pw-accent);
  color: var(--pw-paper);
}
:root[data-design='pinnwand'] .top-new-cat {
  background: var(--pw-paper);
  color: var(--pw-ink);
}
/* Deaktiviert heisst nicht unsichtbar. Das klassische `opacity: 0.4` drueckte
   das weisse Plus auf dem blauen Grund auf 1,35:1 — man sah nicht mehr, dass da
   ueberhaupt ein Knopf ist. Statt zu blenden wird umgefaerbt: Packpapier mit
   gedaempfter Tinte, volle Deckkraft, ~5:1. */
:root[data-design='pinnwand'] .top-add:disabled {
  opacity: 1;
  background: var(--pw-cork-deep);
  color: var(--pw-ink-soft);
}
:root[data-design='pinnwand'] .top-new-cat:hover {
  background: var(--pw-tape);
  border-color: var(--pw-line);
  color: var(--pw-ink);
}
/* Das Kategoriefeld traegt seinen Rahmen am Wrapper, nicht am `input`. */
:root[data-design='pinnwand'] .top-combo :deep(.combo-field) {
  min-height: 44px;
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-paper);
}
/* Ohne diese Regel hatte das Feld hier ueberhaupt keinen Fokuszustand:
   `.combo-field:focus-within` aus `CategoryCombobox.vue` ist (0,3,0), die Regel
   direkt darueber ist (0,5,0) und ueberschreibt die Rahmenfarbe in beiden
   Zustaenden. */
:root[data-design='pinnwand'] .top-combo :deep(.combo-field:focus-within) {
  border-color: var(--pw-accent);
  box-shadow: 0 0 0 3px rgba(43, 74, 143, 0.15);
}
:root[data-design='pinnwand'] .top-combo :deep(.combo-dot) {
  border-radius: 0;
  border: 1.5px solid var(--pw-line);
  width: 11px;
  height: 11px;
}
:root[data-design='pinnwand'] .top-combo :deep(.combo-clear) {
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .top-combo :deep(.combo-list),
:root[data-design='pinnwand'] .suggestions-dropdown {
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-paper);
  box-shadow: var(--pw-shadow);
}
:root[data-design='pinnwand'] .suggestion-item {
  color: var(--pw-ink);
  border-bottom-color: rgba(36, 31, 26, 0.2);
  min-height: var(--touch-target-min);
}
</style>
