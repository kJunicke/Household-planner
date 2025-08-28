# Vue 3 Development Guide - Best Practices 2025

## Inhaltsverzeichnis

1. [Einführung](#einführung)
2. [Projekt Setup & Tooling](#projekt-setup--tooling)
3. [Composition API Fundamentals](#composition-api-fundamentals)
4. [TypeScript Integration](#typescript-integration)
5. [Reaktivität Best Practices](#reaktivität-best-practices)
6. [Component Architektur](#component-architektur)
7. [State Management mit Pinia](#state-management-mit-pinia)
8. [Performance Optimierung](#performance-optimierung)
9. [Testing Strategien](#testing-strategien)
10. [Code Organisation](#code-organisation)
11. [Häufige Antipatterns](#häufige-antipatterns)

## Einführung

Vue 3 bringt fundamentale Verbesserungen für moderne Webentwicklung. Dieser Guide basiert auf den aktuellsten Best Practices für 2025 und fokussiert sich auf die Composition API, TypeScript-Integration und optimale Performance-Patterns.

### Warum Vue 3?

- **Bessere Performance**: Kleinere Bundle-Größen und verbesserte Rendering-Performance
- **TypeScript-First**: Natürliche TypeScript-Integration ohne komplexe Konfiguration
- **Composition API**: Bessere Code-Organisation und Wiederverwendbarkeit
- **Tree-Shaking**: Nur genutzte Features werden in den finalen Build eingeschlossen

## Projekt Setup & Tooling

### Empfohlene Tool-Chain 2025

```bash
# Vite als Build-Tool (empfohlen über Vue CLI)
npm create vue@latest my-project
cd my-project
npm install
```

### Essentielle Dependencies

```json
{
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.0",
    "pinia": "^2.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vue-tsc": "^1.8.0"
  }
}
```

### Vite Konfiguration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    target: 'es2015',
    sourcemap: true
  }
})
```

## Composition API Fundamentals

### Script Setup Syntax (Empfohlen)

```vue
<template>
  <div>
    <h1>{{ title }}</h1>
    <button @click="increment">Count: {{ count }}</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// Props definieren
interface Props {
  initialCount?: number
  title: string
}
const props = withDefaults(defineProps<Props>(), {
  initialCount: 0
})

// Emits definieren
const emit = defineEmits<{
  updated: [count: number]
}>()

// Reaktive Variablen
const count = ref(props.initialCount)

// Computed Properties
const doubleCount = computed(() => count.value * 2)

// Methods
const increment = () => {
  count.value++
  emit('updated', count.value)
}

// Expose für Template Refs (optional)
defineExpose({ increment })
</script>
```

### Warum Script Setup?

- **Kompakter Code**: Weniger Boilerplate als Options API
- **Bessere Performance**: Inline-Kompilierung für optimierte Bundle-Größe
- **TypeScript-freundlich**: Automatische Type-Inference
- **Bessere IDE-Unterstützung**: IntelliSense und Auto-Completion

## TypeScript Integration

### Component Props mit TypeScript

```typescript
// Basis Props Interface
interface UserProps {
  id: number
  name: string
  email?: string
  isActive?: boolean
}

// Generic Props für wiederverwendbare Components
interface ListProps<T> {
  items: T[]
  keyField: keyof T
  renderItem: (item: T) => string
}

// Verwendung mit Script Setup
const props = defineProps<ListProps<User>>()
```

### Refs und Reactive mit Types

```typescript
// Typisierte Refs
const count = ref<number>(0)
const user = ref<User | null>(null)
const users = ref<User[]>([])

// Reactive Objects
interface AppState {
  loading: boolean
  error: string | null
  data: any[]
}

const state = reactive<AppState>({
  loading: false,
  error: null,
  data: []
})

// Template Refs (Vue 3.5+)
const inputRef = useTemplateRef<HTMLInputElement>('input')
```

### Composables mit TypeScript

```typescript
// useApi.ts
interface ApiResponse<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApi<T>(url: string): ApiResponse<T> {
  const data = ref<T | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchData = async () => {
    loading.value = true
    error.value = null
    
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(response.statusText)
      data.value = await response.json()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  return { data: readonly(data), loading: readonly(loading), error: readonly(error), fetchData }
}
```

## Reaktivität Best Practices

### Ref vs Reactive - Wann was verwenden?

```typescript
// ✅ Ref für primitive Werte
const count = ref(0)
const message = ref('')
const isLoading = ref(false)

// ✅ Ref für Objekte die ersetzt werden können
const user = ref<User | null>(null)

// ✅ Reactive für Objekte die erweitert werden
const form = reactive({
  name: '',
  email: '',
  errors: {}
})

// ❌ Vermeide reactive für primitive Werte
// const count = reactive(0) // Funktioniert nicht!
```

### Shallow Reactivity für Performance

```typescript
// Für große Datenstrukturen ohne tiefe Reaktivität
const bigData = shallowRef(largePaginatedDataset)

// Shallow Reactive für Forms mit vielen Feldern
const complexForm = shallowReactive({
  personalInfo: { /* viele Felder */ },
  preferences: { /* viele Felder */ },
  settings: { /* viele Felder */ }
})
```

### Computed Properties optimieren

```typescript
// ✅ Computed cacht automatisch (Vue 3.4+)
const filteredItems = computed(() => {
  return items.value.filter(item => item.active)
})

// ✅ Für komplexe Berechnungen: Manuelles Caching
const expensiveComputation = computed(() => {
  const result = performExpensiveOperation(data.value)
  
  // Vergleiche mit vorherigem Wert
  if (JSON.stringify(result) === JSON.stringify(previousResult)) {
    return previousResult // Referenz beibehalten
  }
  
  previousResult = result
  return result
})
```

### Watchers richtig verwenden

```typescript
// ✅ Immediate und Deep Watching
watch(
  () => form.user,
  (newUser) => {
    console.log('User changed:', newUser)
  },
  { immediate: true, deep: true }
)

// ✅ Multiple Sources
watch(
  [count, message],
  ([newCount, newMessage], [oldCount, oldMessage]) => {
    // Handle changes
  }
)

// ✅ Conditional Watching
const stopWatcher = watch(
  source,
  callback,
  { flush: 'post' } // nach DOM Update
)

// Stoppe Watcher bei Bedarf
if (someCondition) {
  stopWatcher()
}

// ❌ Vermeide übermäßiges Watching
// Nutze computed stattdessen wo möglich
```

## Component Architektur

### Single Responsibility Principle

```vue
<!-- ✅ UserAvatar.vue - Eine klare Verantwortung -->
<template>
  <img
    :src="avatarUrl"
    :alt="`Avatar of ${user.name}`"
    :class="sizeClass"
    @error="handleImageError"
  />
</template>

<script setup lang="ts">
interface Props {
  user: User
  size?: 'small' | 'medium' | 'large'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium'
})

const avatarUrl = computed(() => 
  props.user.avatar || '/default-avatar.svg'
)

const sizeClass = computed(() => `avatar-${props.size}`)

const handleImageError = (event: Event) => {
  (event.target as HTMLImageElement).src = '/default-avatar.svg'
}
</script>
```

### Slot Patterns für Flexibilität

```vue
<!-- BaseCard.vue -->
<template>
  <div class="card" :class="variants">
    <header v-if="$slots.header" class="card-header">
      <slot name="header" />
    </header>
    
    <main class="card-content">
      <slot />
    </main>
    
    <footer v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </footer>
    
    <!-- Scoped Slots für dynamischen Content -->
    <slot name="dynamic" :data="internalData" :actions="cardActions" />
  </div>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'default' | 'elevated' | 'outlined'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
})

const variants = computed(() => `card--${props.variant}`)

// Daten für Scoped Slots
const internalData = ref({ /* card specific data */ })
const cardActions = { /* card specific methods */ }
</script>
```

### Composables für Logic Reuse

```typescript
// useLocalStorage.ts
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options: {
    serializer?: {
      read: (value: string) => T
      write: (value: T) => string
    }
  } = {}
) {
  const {
    serializer = {
      read: JSON.parse,
      write: JSON.stringify
    }
  } = options

  const storedValue = localStorage.getItem(key)
  
  const state = ref<T>(
    storedValue !== null 
      ? serializer.read(storedValue)
      : defaultValue
  )

  const setValue = (value: T | ((current: T) => T)) => {
    const newValue = typeof value === 'function' 
      ? (value as (current: T) => T)(state.value)
      : value
      
    state.value = newValue
    localStorage.setItem(key, serializer.write(newValue))
  }

  return [readonly(state), setValue] as const
}

// Verwendung in Component
const [theme, setTheme] = useLocalStorage('theme', 'light')
```

### Provider/Inject Pattern

```typescript
// theme-provider.ts
const ThemeSymbol = Symbol('theme')

export interface ThemeContext {
  theme: Ref<'light' | 'dark'>
  toggleTheme: () => void
}

export const useThemeProvider = (): ThemeContext => {
  const theme = ref<'light' | 'dark'>('light')
  
  const toggleTheme = () => {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  provide(ThemeSymbol, { theme: readonly(theme), toggleTheme })
  
  return { theme, toggleTheme }
}

export const useTheme = (): ThemeContext => {
  const context = inject(ThemeSymbol)
  if (!context) {
    throw new Error('useTheme must be called within ThemeProvider')
  }
  return context
}
```

## State Management mit Pinia

### Store Definition (Composition API Style)

```typescript
// stores/useUserStore.ts
import { defineStore } from 'pinia'

interface User {
  id: number
  name: string
  email: string
}

interface UserState {
  users: User[]
  currentUser: User | null
  loading: boolean
  error: string | null
}

export const useUserStore = defineStore('user', () => {
  // State
  const state = reactive<UserState>({
    users: [],
    currentUser: null,
    loading: false,
    error: null
  })

  // Getters (computed)
  const activeUsers = computed(() => 
    state.users.filter(user => user.active)
  )
  
  const isLoggedIn = computed(() => 
    state.currentUser !== null
  )

  // Actions
  const fetchUsers = async () => {
    state.loading = true
    state.error = null
    
    try {
      const response = await api.getUsers()
      state.users = response.data
    } catch (error) {
      state.error = error.message
    } finally {
      state.loading = false
    }
  }

  const setCurrentUser = (user: User | null) => {
    state.currentUser = user
  }

  const addUser = (user: User) => {
    state.users.push(user)
  }

  return {
    // State
    ...toRefs(state),
    
    // Getters
    activeUsers,
    isLoggedIn,
    
    // Actions
    fetchUsers,
    setCurrentUser,
    addUser
  }
})
```

### Store Composition

```typescript
// stores/useAppStore.ts - Kombiniert mehrere Stores
export const useAppStore = defineStore('app', () => {
  const userStore = useUserStore()
  const settingsStore = useSettingsStore()
  
  // App-spezifische State
  const isInitialized = ref(false)
  
  // Kombinierte Getters
  const canAccessAdminPanel = computed(() => 
    userStore.isLoggedIn && 
    userStore.currentUser?.role === 'admin'
  )
  
  // App Initialization
  const initializeApp = async () => {
    await Promise.all([
      userStore.loadCurrentUser(),
      settingsStore.loadSettings()
    ])
    isInitialized.value = true
  }
  
  return {
    isInitialized: readonly(isInitialized),
    canAccessAdminPanel,
    initializeApp
  }
})
```

## Performance Optimierung

### Component Lazy Loading

```typescript
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue') // Lazy loaded
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/AdminView.vue'),
    meta: { requiresAuth: true }
  }
]
```

### Virtual Scrolling für große Listen

```vue
<!-- VirtualList.vue -->
<template>
  <div ref="container" class="virtual-list" @scroll="handleScroll">
    <div :style="{ height: totalHeight + 'px' }" class="virtual-list-phantom">
      <div
        :style="{
          transform: `translateY(${offsetY}px)`
        }"
        class="virtual-list-content"
      >
        <div
          v-for="item in visibleItems"
          :key="item.id"
          :style="{ height: itemHeight + 'px' }"
          class="virtual-list-item"
        >
          <slot :item="item" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  items: any[]
  itemHeight: number
  containerHeight: number
}

const props = defineProps<Props>()

const container = ref<HTMLElement>()
const scrollTop = ref(0)

const totalHeight = computed(() => props.items.length * props.itemHeight)
const visibleCount = computed(() => Math.ceil(props.containerHeight / props.itemHeight) + 2)

const startIndex = computed(() => 
  Math.max(0, Math.floor(scrollTop.value / props.itemHeight) - 1)
)

const endIndex = computed(() => 
  Math.min(props.items.length, startIndex.value + visibleCount.value)
)

const visibleItems = computed(() => 
  props.items.slice(startIndex.value, endIndex.value)
)

const offsetY = computed(() => startIndex.value * props.itemHeight)

const handleScroll = (e: Event) => {
  scrollTop.value = (e.target as HTMLElement).scrollTop
}
</script>
```

### Memory Leak Prevention

```typescript
// useEventListener.ts - Auto-cleanup
export function useEventListener(
  target: EventTarget | Ref<EventTarget | null>,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions
) {
  const cleanup = () => {
    const element = unref(target)
    if (element) {
      element.removeEventListener(event, handler, options)
    }
  }

  const setup = () => {
    const element = unref(target)
    if (element) {
      element.addEventListener(event, handler, options)
    }
  }

  // Setup beim ersten Aufruf
  setup()

  // Cleanup bei Component Unmount
  onBeforeUnmount(cleanup)

  // Re-setup wenn target sich ändert
  if (isRef(target)) {
    watch(target, () => {
      cleanup()
      setup()
    })
  }

  return cleanup
}
```

## Testing Strategien

### Vitest Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts']
  }
})
```

### Component Testing

```typescript
// components/__tests__/UserCard.test.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import UserCard from '../UserCard.vue'

describe('UserCard', () => {
  const mockUser = {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com'
  }

  it('renders user information correctly', () => {
    const wrapper = mount(UserCard, {
      props: { user: mockUser }
    })

    expect(wrapper.text()).toContain(mockUser.name)
    expect(wrapper.text()).toContain(mockUser.email)
  })

  it('emits edit event when edit button is clicked', async () => {
    const wrapper = mount(UserCard, {
      props: { user: mockUser }
    })

    await wrapper.find('[data-testid="edit-button"]').trigger('click')
    
    expect(wrapper.emitted('edit')).toBeTruthy()
    expect(wrapper.emitted('edit')![0]).toEqual([mockUser.id])
  })
})
```

### Composable Testing

```typescript
// composables/__tests__/useCounter.test.ts
import { describe, it, expect } from 'vitest'
import { useCounter } from '../useCounter'

describe('useCounter', () => {
  it('initializes with correct default value', () => {
    const { count, increment, decrement } = useCounter()
    expect(count.value).toBe(0)
  })

  it('increments count correctly', () => {
    const { count, increment } = useCounter()
    increment()
    expect(count.value).toBe(1)
  })

  it('accepts initial value', () => {
    const { count } = useCounter(10)
    expect(count.value).toBe(10)
  })
})
```

## Code Organisation

### Ordnerstruktur für Skalierbarkeit

```
src/
├── components/           # Wiederverwendbare UI Components
│   ├── base/            # Base Components (Button, Input, etc.)
│   ├── common/          # Common Business Components
│   └── feature/         # Feature-spezifische Components
├── composables/         # Wiederverwendbare Logic
├── stores/              # Pinia Stores
├── views/               # Route-Level Components
├── router/              # Vue Router Konfiguration
├── services/            # API Services
├── types/               # TypeScript Type Definitionen
├── utils/               # Utility Functions
├── assets/              # Statische Assets
└── styles/              # Globale Styles
```

### Import/Export Conventions

```typescript
// types/index.ts - Zentrale Type Exports
export interface User {
  id: number
  name: string
  email: string
}

export interface ApiResponse<T> {
  data: T
  message: string
  status: number
}

// utils/index.ts - Utility Re-exports
export { formatDate, parseDate } from './date'
export { validateEmail, validatePassword } from './validation'
export { debounce, throttle } from './performance'

// services/index.ts - Service Layer
export { userService } from './user'
export { authService } from './auth'
export type { ApiClient } from './api'
```

### Naming Conventions

```typescript
// ✅ Gute Naming Conventions

// Components: PascalCase
const UserCard = defineComponent({ /* ... */ })
const BaseButton = defineComponent({ /* ... */ })

// Composables: camelCase mit "use" Prefix
const useLocalStorage = () => { /* ... */ }
const useUserPermissions = () => { /* ... */ }

// Stores: camelCase mit "use" Prefix und "Store" Suffix
const useUserStore = defineStore('user', () => { /* ... */ })

// Constants: SCREAMING_SNAKE_CASE
const API_BASE_URL = 'https://api.example.com'
const DEFAULT_PAGE_SIZE = 20

// File Names: kebab-case oder PascalCase (konsistent bleiben)
// user-card.vue oder UserCard.vue
```

## Häufige Antipatterns

### ❌ Was man vermeiden sollte

```typescript
// ❌ Mutating Props direkt
const props = defineProps<{ user: User }>()
props.user.name = 'New Name' // Niemals!

// ✅ Korrekt: Emit Event oder lokale Kopie
const emit = defineEmits<{ updateUser: [user: User] }>()
const updateUserName = (name: string) => {
  emit('updateUser', { ...props.user, name })
}

// ❌ Reactive Destructuring ohne toRefs
const { count, increment } = useCounterStore() // count verliert Reaktivität!

// ✅ Korrekt: Mit toRefs
const counterStore = useCounterStore()
const { count } = toRefs(counterStore)

// ❌ Overusing Watchers
watch(data, () => {
  filteredData.value = data.value.filter(item => item.active)
})

// ✅ Korrekt: Computed verwenden
const filteredData = computed(() => 
  data.value.filter(item => item.active)
)

// ❌ Memory Leaks durch fehlende Cleanup
const interval = setInterval(() => {
  // Some recurring task
}, 1000)
// Vergessen: clearInterval bei unmount!

// ✅ Korrekt: Mit onBeforeUnmount
const interval = setInterval(() => {
  // Some recurring task
}, 1000)

onBeforeUnmount(() => {
  clearInterval(interval)
})
```

### Performance Anti-Patterns

```typescript
// ❌ Nicht optimierte Event Handler
<template>
  <div 
    v-for="item in items" 
    :key="item.id"
    @click="() => handleClick(item)" // Neue Funktion bei jedem Render!
  >
    {{ item.name }}
  </div>
</template>

// ✅ Optimiert mit Event Delegation
<template>
  <div @click="handleContainerClick">
    <div 
      v-for="item in items" 
      :key="item.id"
      :data-item-id="item.id"
    >
      {{ item.name }}
    </div>
  </div>
</template>

<script setup>
const handleContainerClick = (event: MouseEvent) => {
  const itemId = (event.target as HTMLElement).dataset.itemId
  if (itemId) {
    // Handle click for specific item
  }
}
</script>

// ❌ Unnötige Reaktivität
const bigDataSet = reactive({
  items: new Array(10000).fill(null).map((_, i) => ({ id: i, data: generateData() }))
})

// ✅ Shallow Reactivity für große Datensätze
const bigDataSet = shallowReactive({
  items: new Array(10000).fill(null).map((_, i) => ({ id: i, data: generateData() }))
})
```

## Fazit

Vue 3 mit TypeScript und der Composition API bietet eine moderne, performante und skalierbare Basis für Webanwendungen. Die wichtigsten Takeaways:

1. **Script Setup verwenden** für bessere Performance und DX
2. **TypeScript-First Approach** für bessere Code-Qualität
3. **Composables über Mixins** für bessere Wiederverwendbarkeit
4. **Performance im Blick behalten** mit Lazy Loading und Shallow Reactivity
5. **Testing nicht vergessen** für langfristige Wartbarkeit
6. **Konsistente Code-Organisation** für Team-Entwicklung

Dieser Guide sollte als Referenz und Lernressource dienen, um moderne Vue 3 Anwendungen zu entwickeln, die skalierbar, wartbar und performant sind.