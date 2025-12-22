<script setup lang="ts">
import { ref, onMounted } from 'vue'

export type TaskCategory = 'daily' | 'recurring' | 'project' | 'completed'
const STORAGE_KEY = 'putzplan_selected_categories'

const categories: { value: TaskCategory; icon: string; label: string }[] = [
  { value: 'daily', icon: 'bi-lightning-fill', label: 'Alltag' },
  { value: 'recurring', icon: 'bi-arrow-repeat', label: 'Putzen' },
  { value: 'project', icon: 'bi-kanban', label: 'Projekte' },
  { value: 'completed', icon: 'bi-check-circle', label: 'Erledigt' }
]

// Load from localStorage or default to all categories active
const loadCategories = (): Set<TaskCategory> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as TaskCategory[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return new Set(parsed)
      }
    }
  } catch {
    // Invalid JSON, use default
  }
  // Default: all categories active
  return new Set<TaskCategory>(['daily', 'recurring', 'project', 'completed'])
}

const selectedCategories = ref<Set<TaskCategory>>(loadCategories())

// Emit to parent
const emit = defineEmits<{
  'update:categories': [categories: TaskCategory[]]
}>()

// Save to localStorage and emit
const saveAndEmit = () => {
  const arr = [...selectedCategories.value]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
  emit('update:categories', arr)
}

// Toggle category (multi-select, at least one must be active)
const toggleCategory = (category: TaskCategory) => {
  if (selectedCategories.value.has(category)) {
    // Prevent deselecting all - must have at least one active
    if (selectedCategories.value.size > 1) {
      selectedCategories.value.delete(category)
      // Trigger reactivity
      selectedCategories.value = new Set(selectedCategories.value)
    }
  } else {
    selectedCategories.value.add(category)
    // Trigger reactivity
    selectedCategories.value = new Set(selectedCategories.value)
  }
  saveAndEmit()
}

// Check if category is active
const isActive = (category: TaskCategory): boolean => {
  return selectedCategories.value.has(category)
}

// Emit initial value
onMounted(() => {
  emit('update:categories', [...selectedCategories.value])
})
</script>

<template>
  <nav class="category-nav-container">
    <div class="chip-container">
      <button
        v-for="cat in categories"
        :key="cat.value"
        @click="toggleCategory(cat.value)"
        :class="['chip', isActive(cat.value) && 'active']"
      >
        <i :class="cat.icon"></i>
        <span>{{ cat.label }}</span>
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
</style>
