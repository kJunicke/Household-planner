<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

type TaskCategory = 'daily' | 'recurring' | 'project' | 'completed'
const STORAGE_KEY = 'putzplan_selected_category'

const categories: { value: TaskCategory; icon: string; label: string }[] = [
  { value: 'daily', icon: 'bi-lightning-fill', label: 'Alltag' },
  { value: 'recurring', icon: 'bi-arrow-repeat', label: 'Putzen' },
  { value: 'project', icon: 'bi-kanban', label: 'Projekte' },
  { value: 'completed', icon: 'bi-check-circle', label: 'Erledigt' }
]

// Load from localStorage or default to 'daily'
const selectedCategory = ref<TaskCategory>(
  (localStorage.getItem(STORAGE_KEY) as TaskCategory) || 'daily'
)

// Emit to parent
const emit = defineEmits<{
  'update:category': [category: TaskCategory]
}>()

// Save to localStorage when category changes and emit
const selectCategory = (category: TaskCategory) => {
  selectedCategory.value = category
  localStorage.setItem(STORAGE_KEY, category)
  emit('update:category', category)
}

// Swipe gesture handling
let touchStartX = 0
let touchEndX = 0
const chipContainer = ref<HTMLElement | null>(null)

const handleTouchStart = (e: TouchEvent) => {
  touchStartX = e.changedTouches[0].screenX
}

const handleTouchEnd = (e: TouchEvent) => {
  touchEndX = e.changedTouches[0].screenX
  handleSwipeGesture()
}

const handleSwipeGesture = () => {
  const swipeThreshold = 50 // Minimum distance for swipe
  const diff = touchStartX - touchEndX

  if (Math.abs(diff) < swipeThreshold) return

  const currentIndex = categories.findIndex(c => c.value === selectedCategory.value)

  if (diff > 0 && currentIndex < categories.length - 1) {
    // Swipe left → next category
    selectCategory(categories[currentIndex + 1].value)
  } else if (diff < 0 && currentIndex > 0) {
    // Swipe right → previous category
    selectCategory(categories[currentIndex - 1].value)
  }
}

onMounted(() => {
  if (chipContainer.value) {
    chipContainer.value.addEventListener('touchstart', handleTouchStart)
    chipContainer.value.addEventListener('touchend', handleTouchEnd)
  }
})

onUnmounted(() => {
  if (chipContainer.value) {
    chipContainer.value.removeEventListener('touchstart', handleTouchStart)
    chipContainer.value.removeEventListener('touchend', handleTouchEnd)
  }
})

// Emit initial value
emit('update:category', selectedCategory.value)
</script>

<template>
  <nav class="category-nav-container">
    <div
      ref="chipContainer"
      class="chip-container"
    >
      <button
        v-for="cat in categories"
        :key="cat.value"
        @click="selectCategory(cat.value)"
        :class="['chip', selectedCategory === cat.value && 'active']"
      >
        <i :class="cat.icon"></i>
        <span>{{ cat.label }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.category-nav-container {
  position: fixed;
  bottom: 64px;
  left: 0;
  right: 0;
  background: var(--color-background-elevated);
  border-top: 1px solid var(--color-border);
  padding: 8px 0;
  z-index: 850;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
  padding-bottom: env(safe-area-inset-bottom);
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
