<script setup lang="ts">
import { ref } from 'vue'

type TaskCategory = 'daily' | 'recurring' | 'project' | 'completed'
const STORAGE_KEY = 'putzplan_selected_category'

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

// Emit initial value
emit('update:category', selectedCategory.value)
</script>

<template>
  <nav class="category-nav-container">
    <div class="container-fluid p-0">
      <div class="category-nav-wrapper">
        <button
          @click="selectCategory('daily')"
          :class="['category-tab', selectedCategory === 'daily' && 'active']"
        >
          <i class="bi bi-lightning-fill"></i>
          <span class="tab-label">Alltag</span>
        </button>
        <button
          @click="selectCategory('recurring')"
          :class="['category-tab', selectedCategory === 'recurring' && 'active']"
        >
          <i class="bi bi-arrow-repeat"></i>
          <span class="tab-label">Putzen</span>
        </button>
        <button
          @click="selectCategory('project')"
          :class="['category-tab', selectedCategory === 'project' && 'active']"
        >
          <i class="bi bi-kanban"></i>
          <span class="tab-label">Projekte</span>
        </button>
        <button
          @click="selectCategory('completed')"
          :class="['category-tab', selectedCategory === 'completed' && 'active']"
        >
          <i class="bi bi-check-circle"></i>
          <span class="tab-label">Erledigt</span>
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.category-nav-container {
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
}

.category-nav-wrapper {
  display: flex;
  gap: 0;
}

.category-tab {
  flex: 1;
  padding: 0.375rem 0.5rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary);
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  cursor: pointer;
}

.category-tab:hover {
  background: var(--color-background-muted);
  color: var(--color-text-primary);
}

.category-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
  background: var(--color-background-elevated);
}

.category-tab i {
  font-size: 1.25rem;
}

.tab-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  line-height: 1;
}

/* Very small screens: smaller icons */
@media (max-width: 360px) {
  .category-tab i {
    font-size: 1.125rem;
  }

  .tab-label {
    font-size: 0.5625rem;
  }
}
</style>
