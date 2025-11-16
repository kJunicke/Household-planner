<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { useShoppingStore } from '@/stores/shoppingStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const shoppingStore = useShoppingStore()
const householdStore = useHouseholdStore()
const { isOnline } = useNetworkStatus()

const searchInput = ref('')
const showSuggestions = ref(false)

// Trigger sync when coming back online
watch(isOnline, async (online) => {
  if (online && shoppingStore.hasPendingMutations) {
    console.log('🌐 Back online - triggering sync...')
    await shoppingStore.syncMutations()
  }
})

// Autocomplete: Filtere existierende Item-Namen basierend auf Input
const suggestions = computed(() => {
  if (!searchInput.value.trim()) return []

  const query = searchInput.value.toLowerCase()

  // Finde alle items die den Suchbegriff enthalten
  const matchingItems = shoppingStore.items
    .filter(item => item.name.toLowerCase().includes(query))
    .map(item => item.name)

  // Entferne Duplikate
  return [...new Set(matchingItems)].slice(0, 5) // Max 5 Vorschläge
})

const handleAddItem = async () => {
  if (!searchInput.value.trim()) return

  // Prüfe ob Item schon in unpurchased list existiert
  const existingUnpurchased = shoppingStore.unpurchasedItems.find(
    item => item.name.toLowerCase() === searchInput.value.trim().toLowerCase()
  )

  if (existingUnpurchased) {
    console.log('Item already in shopping list')
    searchInput.value = ''
    showSuggestions.value = false
    return
  }

  // Prüfe ob Item in purchased list existiert → dann markiere als unpurchased
  const existingPurchased = shoppingStore.purchasedItems.find(
    item => item.name.toLowerCase() === searchInput.value.trim().toLowerCase()
  )

  if (existingPurchased) {
    await shoppingStore.markUnpurchased(existingPurchased.shopping_item_id)
    searchInput.value = ''
    showSuggestions.value = false
    return
  }

  // Sonst: neues Item erstellen
  await shoppingStore.createItem(searchInput.value.trim())
  searchInput.value = ''
  showSuggestions.value = false
}

const selectSuggestion = (suggestion: string) => {
  searchInput.value = suggestion
  showSuggestions.value = false
  handleAddItem()
}

const handleInputFocus = () => {
  showSuggestions.value = true
}

const handleInputBlur = () => {
  // Delay um Click auf Suggestion zu ermöglichen
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

const togglePurchased = async (itemId: string, currentlyPurchased: boolean) => {
  if (currentlyPurchased) {
    await shoppingStore.markUnpurchased(itemId)
  } else {
    await shoppingStore.markPurchased(itemId)
  }
}

const getMemberName = (userId: string | null) => {
  if (!userId) return 'Unbekannt'
  const member = householdStore.householdMembers.find(m => m.user_id === userId)
  return member?.display_name || 'Unbekannt'
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(async () => {
  // Lädt Items aus Supabase - WARTE bis fertig geladen
  await shoppingStore.loadItems()
  // Startet Realtime Subscriptions für Live-Updates (erst NACH initialem Load)
  shoppingStore.subscribeToItems()
})

onUnmounted(() => {
  shoppingStore.unsubscribeFromItems()
})
</script>

<template>
  <div class="page-container">
    <div class="container-fluid">
      <div class="section-title">
        <i class="bi bi-cart3"></i> Einkaufsliste
      </div>

    <!-- Offline/Sync Status Banner -->
    <div v-if="!isOnline" class="alert alert-warning mb-3" role="alert">
      <i class="bi bi-wifi-off me-2"></i>
      <strong>Offline-Modus</strong> - Änderungen werden automatisch synchronisiert sobald die Verbindung wiederhergestellt ist.
    </div>

    <div v-else-if="shoppingStore.hasPendingMutations || shoppingStore.isSyncing" class="alert alert-info mb-3" role="alert">
      <span class="spinner-border spinner-border-sm me-2"></span>
      <strong>Synchronisiere...</strong>
    </div>

    <!-- Suchleiste mit Autocomplete -->
    <div class="search-container mb-4">
      <div class="input-group">
        <input
          v-model="searchInput"
          type="text"
          class="form-control"
          placeholder="Produkt hinzufügen..."
          @keyup.enter="handleAddItem"
          @focus="handleInputFocus"
          @blur="handleInputBlur"
          :disabled="shoppingStore.isLoading"
        />
        <button
          class="btn btn-primary"
          @click="handleAddItem"
          :disabled="!searchInput.trim() || shoppingStore.isLoading"
        >
          <span v-if="!shoppingStore.isLoading">
            <i class="bi bi-plus-lg"></i> Hinzufügen
          </span>
          <span v-else>
            <span class="spinner-border spinner-border-sm me-2"></span>
            Lädt...
          </span>
        </button>
      </div>

      <!-- Autocomplete Suggestions -->
      <div v-if="showSuggestions && suggestions.length > 0" class="suggestions-dropdown">
        <div
          v-for="suggestion in suggestions"
          :key="suggestion"
          class="suggestion-item"
          @click="selectSuggestion(suggestion)"
        >
          <i class="bi bi-clock-history me-2"></i>
          {{ suggestion }}
        </div>
      </div>
    </div>

    <!-- Loading Skeleton (nur beim initialen Load) -->
    <div v-if="shoppingStore.isLoading && shoppingStore.items.length === 0" class="skeleton-loading">
      <div class="skeleton-card" style="height: 80px;"></div>
      <div class="skeleton-card" style="height: 80px;"></div>
      <div class="skeleton-card" style="height: 80px;"></div>
    </div>

    <!-- Liste 1: Zu kaufen (unpurchased) -->
    <div v-else class="shopping-section mb-4">
      <h5 class="shopping-list-title">
        <i class="bi bi-cart-dash"></i> Zu kaufen ({{ shoppingStore.unpurchasedItems.length }})
      </h5>

      <div v-if="shoppingStore.unpurchasedItems.length === 0" class="empty-state">
        <i class="bi bi-check-circle"></i>
        <p>Keine Produkte auf der Liste</p>
      </div>

      <div v-else class="shopping-list">
        <div
          v-for="item in shoppingStore.unpurchasedItems"
          :key="item.shopping_item_id"
          class="shopping-item"
          :class="{ 'priority': item.is_priority }"
        >
          <div class="form-check">
            <input
              class="form-check-input"
              type="checkbox"
              :checked="item.purchased"
              @change="togglePurchased(item.shopping_item_id, item.purchased)"
              :id="'item-' + item.shopping_item_id"
            />
            <label class="form-check-label" :for="'item-' + item.shopping_item_id">
              {{ item.name }}
            </label>
          </div>
          <div class="item-actions">
            <button
              class="btn btn-sm"
              :class="item.is_priority ? 'btn-warning' : 'btn-outline-secondary'"
              @click="shoppingStore.togglePriority(item.shopping_item_id)"
              :title="item.is_priority ? 'Priorität entfernen' : 'Als prioritär markieren'"
            >
              <i class="bi bi-star-fill"></i>
            </button>
            <button
              class="btn btn-sm btn-outline-danger"
              @click="shoppingStore.deleteItem(item.shopping_item_id)"
              title="Löschen"
            >
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Liste 2: Gekauft (purchased) -->
    <div class="shopping-section">
      <h5 class="shopping-list-title">
        <i class="bi bi-check-circle"></i> Gekauft ({{ shoppingStore.purchasedItems.length }})
      </h5>

      <div v-if="shoppingStore.purchasedItems.length === 0" class="empty-state">
        <i class="bi bi-cart-x"></i>
        <p>Noch nichts eingekauft</p>
      </div>

      <div v-else class="shopping-list">
        <div
          v-for="item in shoppingStore.purchasedItems"
          :key="item.shopping_item_id"
          class="shopping-item purchased"
        >
          <div class="form-check">
            <input
              class="form-check-input"
              type="checkbox"
              :checked="item.purchased"
              @change="togglePurchased(item.shopping_item_id, item.purchased)"
              :id="'item-purchased-' + item.shopping_item_id"
            />
            <label class="form-check-label text-muted text-decoration-line-through" :for="'item-purchased-' + item.shopping_item_id">
              {{ item.name }}
            </label>
          </div>
          <div class="item-info">
            <small class="text-muted">
              {{ item.times_purchased }}x gekauft
              <span v-if="item.last_purchased_at">
                · {{ formatDate(item.last_purchased_at) }}
              </span>
              <span v-if="item.last_purchased_by">
                · {{ getMemberName(item.last_purchased_by) }}
              </span>
            </small>
            <button
              class="btn btn-sm btn-outline-danger ms-2"
              @click="shoppingStore.deleteItem(item.shopping_item_id)"
              title="Löschen"
            >
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.search-container {
  position: relative;
}

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
}

.suggestion-item {
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid var(--color-border);
}

.suggestion-item:last-child {
  border-bottom: none;
}

.suggestion-item:hover {
  background-color: var(--color-background);
}

.shopping-section {
  background: var(--color-background-elevated);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-sm);
}

.shopping-list-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.shopping-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.shopping-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  background: var(--color-background);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  transition: all 0.2s;
  gap: var(--spacing-sm);
}

.shopping-item:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.shopping-item.priority {
  background: linear-gradient(135deg, #fff3cd 0%, #ffe69c 100%);
  border-color: #ffc107;
  border-width: 2px;
}

.shopping-item.priority:hover {
  border-color: #ff9800;
  box-shadow: 0 4px 8px rgba(255, 152, 0, 0.2);
}

.shopping-item.purchased {
  opacity: 0.7;
  flex-wrap: wrap;
}

.form-check {
  flex: 1;
  margin: 0;
  min-width: 0;
}

.item-actions {
  display: flex;
  gap: var(--spacing-xs);
}

.form-check-input {
  cursor: pointer;
  width: 1.25rem;
  height: 1.25rem;
}

.form-check-label {
  cursor: pointer;
  font-size: 1rem;
  margin-left: var(--spacing-sm);
}

.item-info {
  flex: 0 0 100%;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-xs);
  padding-left: 2rem;
}

/* Mobile Optimierung */
@media (max-width: 480px) {
  .shopping-item {
    padding: var(--spacing-sm);
  }

  .form-check-label {
    font-size: 0.9rem;
  }

  .item-info {
    padding-left: 1.75rem;
  }

  .item-info small {
    font-size: 0.75rem;
  }

  .btn-sm {
    padding: 0.25rem 0.4rem;
    font-size: 0.75rem;
  }
}
</style>
