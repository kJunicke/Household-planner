<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { useShoppingStore } from '@/stores/shoppingStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import ListEditModal from '@/components/ListEditModal.vue'

const shoppingStore = useShoppingStore()
const householdStore = useHouseholdStore()
const { isOnline } = useNetworkStatus()

const searchInput = ref('')
const showSuggestions = ref(false)

// List management state
const showListEditModal = ref(false)
const showCreateListModal = ref(false)
const newListName = ref('')
const editingList = ref<{ list_id: string; name: string } | null>(null)

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

  const matchingItems = shoppingStore.items
    .filter(item => item.name.toLowerCase().includes(query))
    .map(item => item.name)

  return [...new Set(matchingItems)].slice(0, 5)
})

const handleAddItem = async () => {
  if (!searchInput.value.trim()) return

  const existingUnpurchased = shoppingStore.unpurchasedItems.find(
    item => item.name.toLowerCase() === searchInput.value.trim().toLowerCase()
  )

  if (existingUnpurchased) {
    searchInput.value = ''
    showSuggestions.value = false
    return
  }

  const existingPurchased = shoppingStore.purchasedItems.find(
    item => item.name.toLowerCase() === searchInput.value.trim().toLowerCase()
  )

  if (existingPurchased) {
    await shoppingStore.markUnpurchased(existingPurchased.shopping_item_id)
    searchInput.value = ''
    showSuggestions.value = false
    return
  }

  await shoppingStore.createItem(searchInput.value.trim())
  searchInput.value = ''
  showSuggestions.value = false
}

const selectSuggestion = (suggestion: string) => {
  searchInput.value = suggestion
  showSuggestions.value = false
  handleAddItem()
}

const handleInputFocus = () => { showSuggestions.value = true }

const handleInputBlur = () => {
  setTimeout(() => { showSuggestions.value = false }, 200)
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

// List management
const openEditModal = (list: { list_id: string; name: string }) => {
  editingList.value = { ...list }
  showListEditModal.value = true
}

const handleRenameList = async (listId: string, name: string) => {
  await shoppingStore.renameList(listId, name)
  showListEditModal.value = false
  editingList.value = null
}

const handleDeleteList = async (listId: string) => {
  await shoppingStore.deleteList(listId)
  showListEditModal.value = false
  editingList.value = null
}

const handleCreateList = async () => {
  const name = newListName.value.trim()
  if (!name) return
  await shoppingStore.createList(name)
  newListName.value = ''
  showCreateListModal.value = false
}

onMounted(async () => {
  await shoppingStore.loadLists()
  await shoppingStore.loadItems()
  shoppingStore.subscribeToItems()
})

onUnmounted(() => {
  shoppingStore.unsubscribeFromItems()
})
</script>

<template>
  <div class="page-container">
    <div class="container-fluid">
      <!-- Titel kommt vom Tab darüber (Einkauf/Packlisten) -->

      <!-- Einkaufslisten Chip-Leiste -->
      <div class="list-chip-bar mb-3">
        <div class="list-chip-container">
          <button
            v-for="list in shoppingStore.lists"
            :key="list.list_id"
            :class="['list-chip', shoppingStore.currentListId === list.list_id && 'active']"
            @click="shoppingStore.currentListId = list.list_id"
          >
            <span>{{ list.name }}</span>
            <button
              class="chip-edit-btn"
              @click.stop="openEditModal(list)"
              :title="`'${list.name}' bearbeiten`"
            >
              <i class="bi bi-pencil"></i>
            </button>
          </button>
          <button
            class="list-chip add-chip"
            @click="showCreateListModal = true"
            title="Neue Liste erstellen"
          >
            <i class="bi bi-plus-lg"></i>
          </button>
        </div>
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

      <!-- Keine Listen vorhanden -->
      <div v-if="shoppingStore.lists.length === 0 && !shoppingStore.isLoading" class="empty-state">
        <i class="bi bi-cart-x"></i>
        <p>Noch keine Einkaufsliste vorhanden</p>
        <button class="btn btn-primary" @click="showCreateListModal = true">
          <i class="bi bi-plus-lg me-1"></i> Liste erstellen
        </button>
      </div>

      <template v-else>
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
              :disabled="shoppingStore.isLoading || !shoppingStore.currentListId"
            />
            <button
              class="btn btn-primary"
              @click="handleAddItem"
              :disabled="!searchInput.trim() || shoppingStore.isLoading || !shoppingStore.currentListId"
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

        <!-- Loading Skeleton -->
        <div v-if="shoppingStore.isLoading && shoppingStore.items.length === 0" class="skeleton-loading">
          <div class="skeleton-card" style="height: 80px;"></div>
          <div class="skeleton-card" style="height: 80px;"></div>
          <div class="skeleton-card" style="height: 80px;"></div>
        </div>

        <div v-else>
          <!-- Zu kaufen -->
          <div class="shopping-section mb-4">
            <h3 class="shopping-list-title">
              <i class="bi bi-cart-dash"></i> Zu kaufen ({{ shoppingStore.unpurchasedItems.length }})
            </h3>

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

          <!-- Gekauft -->
          <div class="shopping-section">
            <h3 class="shopping-list-title">
              <i class="bi bi-check-circle"></i> Gekauft ({{ shoppingStore.purchasedItems.length }})
            </h3>

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
      </template>
    </div>
  </div>

  <!-- Liste bearbeiten Modal -->
  <ListEditModal
    v-if="showListEditModal && editingList"
    :list="editingList"
    :can-delete="shoppingStore.lists.length > 1"
    @rename="handleRenameList"
    @delete="handleDeleteList"
    @close="showListEditModal = false; editingList = null"
  />

  <!-- Neue Liste erstellen Modal -->
  <Teleport to="body">
    <div v-if="showCreateListModal" class="modal-overlay" @click.self="showCreateListModal = false; newListName = ''">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">Neue Einkaufsliste</h5>
          <button class="btn-close" @click="showCreateListModal = false; newListName = ''"></button>
        </div>
        <div class="modal-body">
          <input
            v-model="newListName"
            type="text"
            class="form-control"
            placeholder="z.B. Edeka, Asia Markt, Bestellen..."
            maxlength="100"
            @keyup.enter="handleCreateList"
            autofocus
          />
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showCreateListModal = false; newListName = ''">Abbrechen</button>
          <button class="btn btn-primary" @click="handleCreateList" :disabled="!newListName.trim()">
            <i class="bi bi-plus-lg me-1"></i> Erstellen
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* List Chip Bar */
.list-chip-bar {
  background: var(--color-background-elevated);
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm);
}

.list-chip-container {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  padding: 2px;
}

.list-chip-container::-webkit-scrollbar {
  display: none;
}

.list-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-background);
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

.list-chip:hover {
  border-color: var(--color-primary);
  color: var(--color-text-primary);
}

.list-chip.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
  font-weight: 600;
}

.list-chip.add-chip {
  color: var(--color-text-secondary);
  padding: 6px 12px;
}

.list-chip.add-chip:hover {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.chip-edit-btn {
  background: none;
  border: none;
  padding: 0;
  margin-left: 2px;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  font-size: 0.75rem;
  line-height: 1;
  display: flex;
  align-items: center;
}

.chip-edit-btn:hover {
  opacity: 1;
}

/* Rest */
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
</style>
