<script setup lang="ts">
import { computed } from 'vue'
import { categoryColor } from '@/lib/categoryColor'

interface RailGroup {
  key: string
  label: string
  category: string | null
  isUncategorized: boolean
}

const props = defineProps<{
  groups: RailGroup[]
  activeKey: string | null
  collapsed: boolean
  /** Ein Listeneintrag liegt in der Hand: Blasen werden zu Ablagezielen. */
  dragging?: boolean
  /** Blase unter dem Finger während des Ziehens. */
  dropKey?: string | null
}>()

const emit = defineEmits<{
  select: [key: string]
  'update:collapsed': [value: boolean]
}>()

// Short 4-letter label keeps bubbles compact and uniform; full name in title.
const shortLabel = (label: string) => label.trim().slice(0, 4)

// Adaptive density: shrink bubbles once the rail gets long so everything fits.
const dense = computed(() => props.groups.length > 8)

// Beim Ziehen klappt eine zugeklappte Leiste auf, nur für die Dauer des Zugs:
// der gespeicherte Zustand bleibt unberührt.
const open = computed(() => !props.collapsed || props.dragging)
</script>

<template>
  <nav
    class="cat-rail"
    :class="{ 'rail-collapsed': !open, dense, dragging }"
    aria-label="Kategorie-Schnellzugriff"
  >
    <!-- `data-drop-key` und `data-cat-name` liest `useCategoryDrag` beim Ziehen. -->
    <template v-if="open">
      <button
        v-for="group in groups"
        :key="group.key"
        class="rail-bubble"
        :class="{
          active: !dragging && activeKey === group.key,
          uncat: group.isUncategorized,
          'drop-target': dragging && dropKey === group.key,
        }"
        :style="{ '--bubble-color': categoryColor(group.category) }"
        :title="group.label"
        :aria-label="group.label"
        :data-drop-key="group.key"
        :data-cat-name="group.category ?? ''"
        @click="emit('select', group.key)"
      >
        <span class="bubble-label">{{ dragging ? group.label : shortLabel(group.label) }}</span>
      </button>
    </template>
    <button
      v-if="!dragging"
      class="rail-toggle"
      :title="collapsed ? 'Kategorien einblenden' : 'Ausblenden'"
      @click="emit('update:collapsed', !collapsed)"
    >
      <i class="bi" :class="collapsed ? 'bi-chevron-left' : 'bi-chevron-right'"></i>
    </button>
  </nav>
</template>

<style scoped>
.cat-rail {
  position: fixed;
  right: 8px;
  bottom: 76px; /* clear the bottom navigation */
  z-index: 900;
  width: 20vw;
  max-width: 72px;
  min-width: 56px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  max-height: calc(100vh - 150px);
  overflow-y: auto;
  scrollbar-width: none;
}
.cat-rail::-webkit-scrollbar {
  display: none;
}
.cat-rail.rail-collapsed {
  width: auto;
  min-width: 0;
  max-width: none;
}

.rail-toggle {
  align-self: flex-end;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  background: var(--color-background-elevated);
  border-radius: 50%;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  -webkit-tap-highlight-color: transparent;
  margin-top: 2px;
}
.rail-toggle:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

/* Taller, color-tinted bubbles: readable label + strong category cue. */
.rail-bubble {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 46px;
  padding: 6px 4px;
  background: color-mix(in srgb, var(--bubble-color) 14%, var(--color-background));
  border: 1.5px solid color-mix(in srgb, var(--bubble-color) 40%, transparent);
  border-left: 4px solid var(--bubble-color);
  border-radius: 14px;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.rail-bubble:hover {
  background: color-mix(in srgb, var(--bubble-color) 22%, var(--color-background));
}
.rail-bubble.active {
  background: color-mix(in srgb, var(--bubble-color) 30%, var(--color-background));
  border-color: var(--bubble-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--bubble-color) 30%, transparent);
}
.rail-bubble.uncat {
  opacity: 0.85;
}

.bubble-label {
  font-size: var(--font-sm);
  font-weight: 700;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* Ziehen: breitere Blasen mit vollem Namen. Statt zu scrollen schrumpfen sie
   in der Höhe, bis alle in die Leiste passen — eine Blase, die erst ins Bild
   gescrollt werden müsste, wäre als Ziel nicht erreichbar. */
.cat-rail.dragging {
  width: 44vw;
  max-width: 200px;
  overflow: hidden;
}
.cat-rail.dragging .rail-bubble {
  height: 52px;
  min-height: 0;
  flex-shrink: 1;
  justify-content: flex-start;
  padding: 2px 10px;
  box-shadow: var(--shadow-sm);
}
.cat-rail.dragging .bubble-label {
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: left;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.cat-rail.dragging .rail-bubble.drop-target {
  background: color-mix(in srgb, var(--bubble-color) 45%, var(--color-background));
  border-color: var(--bubble-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--bubble-color) 45%, transparent);
  transform: translateX(-6px);
}

/* Dense mode: many categories → shorter bubbles so the rail still fits. */
.cat-rail.dense {
  gap: 4px;
}
.cat-rail.dense .rail-bubble {
  min-height: 38px;
  border-radius: 11px;
}
.cat-rail.dense .bubble-label {
  font-size: var(--font-xs);
}
.cat-rail.dense.dragging .rail-bubble {
  min-height: 0;
}
</style>
