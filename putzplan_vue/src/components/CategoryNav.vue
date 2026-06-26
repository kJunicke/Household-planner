<script setup lang="ts">
import { ref, onMounted } from 'vue'

export type TaskCategory = 'daily' | 'recurring' | 'project' | 'completed'
const STORAGE_KEY = 'putzplan_active_category'

const categories: { value: TaskCategory; icon: string; label: string }[] = [
  { value: 'daily', icon: 'bi-lightning-fill', label: 'Alltag' },
  { value: 'recurring', icon: 'bi-arrow-repeat', label: 'Putzen' },
  { value: 'project', icon: 'bi-kanban', label: 'Projekte' },
  { value: 'completed', icon: 'bi-check-circle', label: 'Erledigt' }
]

// Reihenfolge der "alle anzeigen"-Ansicht (kein Filter aktiv)
const ALL_CATEGORIES: TaskCategory[] = ['daily', 'recurring', 'project', 'completed']

// Single-Select-Filter: null = kein Filter aktiv → alle Kategorien anzeigen.
// Ein Chip filtert exklusiv; erneuter Klick auf den aktiven Chip setzt zurück.
const loadActive = (): TaskCategory | null => {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && categories.some(c => c.value === stored)) {
    return stored as TaskCategory
  }
  return null
}

const activeCategory = ref<TaskCategory | null>(loadActive())

const emit = defineEmits<{
  'update:categories': [categories: TaskCategory[]]
}>()

const saveAndEmit = () => {
  if (activeCategory.value) {
    localStorage.setItem(STORAGE_KEY, activeCategory.value)
    emit('update:categories', [activeCategory.value])
  } else {
    localStorage.removeItem(STORAGE_KEY)
    emit('update:categories', [...ALL_CATEGORIES])
  }
}

// Klick: aktiven Chip abwählen (→ alle), sonst exklusiv auswählen
const selectCategory = (category: TaskCategory) => {
  activeCategory.value = activeCategory.value === category ? null : category
  saveAndEmit()
}

const isActive = (category: TaskCategory): boolean => {
  return activeCategory.value === category
}

// Initialen Zustand emittieren
onMounted(() => {
  saveAndEmit()
})
</script>

<template>
  <nav class="category-nav-container">
    <div class="chip-container">
      <button
        v-for="cat in categories"
        :key="cat.value"
        @click="selectCategory(cat.value)"
        :class="['chip', isActive(cat.value) && 'active']"
        :title="isActive(cat.value) ? 'Filter aufheben' : undefined"
      >
        <i :class="cat.icon"></i>
        <span>{{ cat.label }}</span>
        <i v-if="isActive(cat.value)" class="bi bi-x-lg chip-clear"></i>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.category-nav-container {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  background: var(--color-background-elevated);
  border-bottom: 1px solid var(--color-border);
  padding: 8px 0;
  z-index: 850;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.chip-container {
  display: flex;
  gap: 8px;
  padding: 0 16px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none; /* Firefox */
  -webkit-overflow-scrolling: touch; /* iOS smooth scrolling */
}

/* Hide scrollbar in Webkit browsers */
.chip-container::-webkit-scrollbar {
  display: none;
}

.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.chip:hover {
  border-color: var(--color-primary);
  color: var(--color-text-primary);
}

.chip.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
  font-weight: 600;
}

.chip i {
  font-size: 1rem;
}

/* X auf dem aktiven Chip: signalisiert "Klick hebt den Filter auf" */
.chip-clear {
  font-size: 0.7rem !important;
  margin-left: 2px;
  margin-right: -2px;
  padding: 2px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  line-height: 1;
}
</style>
