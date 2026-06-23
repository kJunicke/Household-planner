<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { usePackingStore } from '@/stores/packingStore'
import ListEditModal from '@/components/ListEditModal.vue'

const packingStore = usePackingStore()

const newItemName = ref('')
const showCreateListModal = ref(false)
const newListName = ref('')
const showListEditModal = ref(false)
const editingList = ref<{ list_id: string; name: string } | null>(null)
const showResetConfirm = ref(false)

const handleAddItem = async () => {
  if (!newItemName.value.trim()) return
  await packingStore.addItem(newItemName.value.trim())
  newItemName.value = ''
}

const openEditModal = (list: { list_id: string; name: string }) => {
  editingList.value = { ...list }
  showListEditModal.value = true
}

const handleRenameList = async (listId: string, name: string) => {
  await packingStore.renameList(listId, name)
  showListEditModal.value = false
  editingList.value = null
}

const handleDeleteList = async (listId: string) => {
  await packingStore.deleteList(listId)
  showListEditModal.value = false
  editingList.value = null
}

const handleCreateList = async () => {
  const name = newListName.value.trim()
  if (!name) return
  await packingStore.createList(name)
  newListName.value = ''
  showCreateListModal.value = false
}

const handleReset = async () => {
  if (!packingStore.currentListId) return
  await packingStore.resetAllUnpacked(packingStore.currentListId)
  showResetConfirm.value = false
}

onMounted(async () => {
  await packingStore.loadLists()
  await packingStore.loadItems()
  packingStore.subscribe()
})

onUnmounted(() => {
  packingStore.unsubscribe()
})
</script>

<template>
  <div class="page-container">
    <div class="container-fluid">
      <!-- Titel kommt vom Tab darüber (Einkauf/Packlisten) -->
      <div
        v-if="packingStore.currentListId && packingStore.packedItems.length > 0"
        class="page-header-row"
      >
        <button
          class="btn btn-outline-secondary btn-sm reset-btn"
          @click="showResetConfirm = true"
          title="Alle als ungepackt markieren"
        >
          <i class="bi bi-arrow-counterclockwise me-1"></i> Zurücksetzen
        </button>
      </div>

      <!-- Listen Chip-Leiste -->
      <div class="list-chip-bar mb-3">
        <div class="list-chip-container">
          <button
            v-for="list in packingStore.lists"
            :key="list.list_id"
            :class="['list-chip', packingStore.currentListId === list.list_id && 'active']"
            @click="packingStore.currentListId = list.list_id"
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
            title="Neue Packliste erstellen"
          >
            <i class="bi bi-plus-lg"></i>
          </button>
        </div>
      </div>

      <!-- Keine Listen vorhanden -->
      <div v-if="packingStore.lists.length === 0 && !packingStore.isLoading" class="empty-state">
        <i class="bi bi-bag-x"></i>
        <p>Noch keine Packliste vorhanden</p>
        <button class="btn btn-primary" @click="showCreateListModal = true">
          <i class="bi bi-plus-lg me-1"></i> Liste erstellen
        </button>
      </div>

      <template v-else-if="packingStore.currentListId">
        <!-- Hinzufügen -->
        <div class="input-group mb-4">
          <input
            v-model="newItemName"
            type="text"
            class="form-control"
            placeholder="Item hinzufügen..."
            maxlength="200"
            @keyup.enter="handleAddItem"
          />
          <button
            class="btn btn-primary"
            @click="handleAddItem"
            :disabled="!newItemName.trim()"
          >
            <i class="bi bi-plus-lg"></i> Hinzufügen
          </button>
        </div>

        <!-- Loading Skeleton -->
        <div v-if="packingStore.isLoading && packingStore.items.length === 0" class="skeleton-loading">
          <div class="skeleton-card" style="height: 60px;"></div>
          <div class="skeleton-card" style="height: 60px;"></div>
          <div class="skeleton-card" style="height: 60px;"></div>
        </div>

        <template v-else>
          <!-- Noch nicht gepackt -->
          <div class="packing-section mb-4">
            <h3 class="section-title">
              <i class="bi bi-box"></i> Noch einpacken ({{ packingStore.unpackedItems.length }})
            </h3>

            <div v-if="packingStore.unpackedItems.length === 0" class="empty-state">
              <i class="bi bi-check-all"></i>
              <p>Alles eingepackt!</p>
            </div>

            <div v-else class="packing-list">
              <div
                v-for="item in packingStore.unpackedItems"
                :key="item.item_id"
                class="packing-item"
              >
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    :checked="item.packed"
                    @change="packingStore.togglePacked(item.item_id)"
                    :id="'pack-' + item.item_id"
                  />
                  <label class="form-check-label" :for="'pack-' + item.item_id">
                    {{ item.name }}
                  </label>
                </div>
                <button
                  class="btn btn-sm btn-outline-danger"
                  @click="packingStore.removeItem(item.item_id)"
                  title="Löschen"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Eingepackt -->
          <div v-if="packingStore.packedItems.length > 0" class="packing-section">
            <h3 class="section-title">
              <i class="bi bi-check-circle"></i> Eingepackt ({{ packingStore.packedItems.length }})
            </h3>

            <div class="packing-list">
              <div
                v-for="item in packingStore.packedItems"
                :key="item.item_id"
                class="packing-item packed"
              >
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    :checked="item.packed"
                    @change="packingStore.togglePacked(item.item_id)"
                    :id="'pack-' + item.item_id"
                  />
                  <label class="form-check-label text-muted text-decoration-line-through" :for="'pack-' + item.item_id">
                    {{ item.name }}
                  </label>
                </div>
                <button
                  class="btn btn-sm btn-outline-danger"
                  @click="packingStore.removeItem(item.item_id)"
                  title="Löschen"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>

  <!-- Liste bearbeiten Modal -->
  <ListEditModal
    v-if="showListEditModal && editingList"
    :list="editingList"
    :can-delete="packingStore.lists.length > 1"
    @rename="handleRenameList"
    @delete="handleDeleteList"
    @close="showListEditModal = false; editingList = null"
  />

  <!-- Neue Liste erstellen Modal -->
  <Teleport to="body">
    <div v-if="showCreateListModal" class="modal-overlay" @click.self="showCreateListModal = false; newListName = ''">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">Neue Packliste</h5>
          <button class="btn-close" @click="showCreateListModal = false; newListName = ''"></button>
        </div>
        <div class="modal-body">
          <input
            v-model="newListName"
            type="text"
            class="form-control"
            placeholder="z.B. Wochenend-Trip, Urlaub, Wandern..."
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

  <!-- Reset-Bestätigung Modal -->
  <Teleport to="body">
    <div v-if="showResetConfirm" class="modal-overlay" @click.self="showResetConfirm = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">Alle zurücksetzen?</h5>
          <button class="btn-close" @click="showResetConfirm = false"></button>
        </div>
        <div class="modal-body">
          <p class="text-muted mb-0">Alle eingepackten Items werden als ungepackt markiert.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showResetConfirm = false">Abbrechen</button>
          <button class="btn btn-warning" @click="handleReset">
            <i class="bi bi-arrow-counterclockwise me-1"></i> Zurücksetzen
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page-header-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.page-header-row .page-title {
  margin-bottom: 0;
}

/* List Chip Bar — same pattern as ShoppingView */
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

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.packing-section {
  background: var(--color-background-elevated);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-sm);
}

.packing-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.packing-item {
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

.packing-item:hover {
  border-color: var(--color-primary);
}

.packing-item.packed {
  opacity: 0.65;
}

.form-check {
  flex: 1;
  margin: 0;
  min-width: 0;
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

.reset-btn {
  flex-shrink: 0;
}
</style>
