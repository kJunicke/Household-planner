<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { usePackingStore, type CategoryGroup } from '@/stores/packingStore'
import { categoryColor } from '@/lib/categoryColor'
import type { PackingItem } from '@/types/PackingItem'
import ListEditModal from '@/components/ListEditModal.vue'
import PackingItemEditModal from '@/components/PackingItemEditModal.vue'
import CategorySearchModal from '@/components/CategorySearchModal.vue'

const packingStore = usePackingStore()

// --- Modals -----------------------------------------------------------------
const showCreateListModal = ref(false)
const newListName = ref('')
const copySourceId = ref('') // '' = empty list
const showListEditModal = ref(false)
const editingList = ref<{ list_id: string; name: string } | null>(null)
const showResetConfirm = ref(false)
const showCategorySearch = ref(false)
const editingItem = ref<PackingItem | null>(null)

// --- Per-section UI state (session-only, reset on list switch) ---------------
const addDraft = ref<Record<string, string>>({})
const forcedAddOpen = ref<Set<string>>(new Set())
const sectionOverride = ref<Map<string, boolean>>(new Map())

// --- Notes ------------------------------------------------------------------
const notesOpen = ref(false)
const notesDraft = ref('')
const notesFocused = ref(false)

watch(
  () => packingStore.currentListId,
  () => {
    addDraft.value = {}
    forcedAddOpen.value = new Set()
    sectionOverride.value = new Map()
    notesDraft.value = packingStore.currentList?.notes ?? ''
    notesOpen.value = false
  }
)

watch(
  () => packingStore.currentList?.notes,
  (notes) => {
    // Don't stomp on the user's in-progress edit when a realtime update arrives.
    if (notesFocused.value) return
    notesDraft.value = notes ?? ''
  }
)

const categoryLabels = computed(() =>
  packingStore.itemsByCategory.filter(g => !g.isUncategorized).map(g => g.label)
)

// --- Section open/collapse --------------------------------------------------
const isSectionOpen = (group: CategoryGroup): boolean => {
  const override = sectionOverride.value.get(group.key)
  return override !== undefined ? override : !group.isComplete
}

const toggleSection = (group: CategoryGroup) => {
  sectionOverride.value.set(group.key, !isSectionOpen(group))
}

// --- Contextual add line ----------------------------------------------------
const isAddOpen = (group: CategoryGroup): boolean =>
  forcedAddOpen.value.has(group.key) || group.packedCount === 0

const openAddLine = (group: CategoryGroup) => {
  forcedAddOpen.value.add(group.key)
}

const handleSectionAdd = async (group: CategoryGroup) => {
  const name = (addDraft.value[group.key] ?? '').trim()
  if (!name) return
  await packingStore.addItem(name, group.category)
  addDraft.value[group.key] = ''
}

// --- Item interactions ------------------------------------------------------
const onItemClick = (item: PackingItem) => {
  if (longPressFired) { longPressFired = false; return }
  packingStore.togglePacked(item.item_id)
}

const openItemEdit = (item: PackingItem) => {
  editingItem.value = item
}

const handleItemSave = async (
  itemId: string,
  patch: { name: string; category: string | null; quantity: number }
) => {
  await packingStore.updateItem(itemId, patch)
  editingItem.value = null
}

const handleItemDelete = async (itemId: string) => {
  await packingStore.removeItem(itemId)
  editingItem.value = null
}

// --- Long-press gesture (touch) + right-click (desktop) ---------------------
const LONG_PRESS_MS = 480
const MOVE_TOLERANCE = 10
let pressTimer: number | null = null
let pressStartX = 0
let pressStartY = 0
let longPressArmed = false // threshold elapsed → open on release
let longPressFired = false // opened → swallow the trailing click
let pressedItem: PackingItem | null = null

const isControl = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('.pack-stepper, button')

const clearPress = () => {
  if (pressTimer !== null) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

const onItemTouchStart = (e: TouchEvent, item: PackingItem) => {
  if (isControl(e.target)) return
  longPressArmed = false
  longPressFired = false
  pressedItem = item
  const t = e.touches[0]
  pressStartX = t.clientX
  pressStartY = t.clientY
  clearPress()
  // Only ARM here — the modal opens on touchend so it never appears under
  // the still-pressed finger (and can't eat a backdrop tap).
  pressTimer = window.setTimeout(() => { longPressArmed = true }, LONG_PRESS_MS)
}

const onItemTouchMove = (e: TouchEvent) => {
  const t = e.touches[0]
  if (
    Math.abs(t.clientX - pressStartX) > MOVE_TOLERANCE ||
    Math.abs(t.clientY - pressStartY) > MOVE_TOLERANCE
  ) {
    clearPress()
    longPressArmed = false
  }
}

const onItemTouchEnd = (e: TouchEvent) => {
  clearPress()
  if (longPressArmed && pressedItem) {
    // Suppress the synthetic click so it neither toggles nor hits the modal.
    e.preventDefault()
    longPressFired = true
    openItemEdit(pressedItem)
  }
  longPressArmed = false
}

const onItemContextMenu = (e: Event, item: PackingItem) => {
  if (isControl(e.target)) return
  e.preventDefault()
  openItemEdit(item)
}

// --- List CRUD --------------------------------------------------------------
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

const openCreateList = () => {
  newListName.value = ''
  copySourceId.value = ''
  showCreateListModal.value = true
}

const handleCreateList = async () => {
  const name = newListName.value.trim()
  if (!name) return
  if (copySourceId.value) {
    await packingStore.copyList(copySourceId.value, name)
  } else {
    await packingStore.createList(name)
  }
  newListName.value = ''
  copySourceId.value = ''
  showCreateListModal.value = false
}

const handleReset = async () => {
  if (!packingStore.currentListId) return
  await packingStore.resetAllUnpacked(packingStore.currentListId)
  showResetConfirm.value = false
}

const handleCreateCategory = (name: string) => {
  packingStore.addCategory(name)
}

// --- Notes ------------------------------------------------------------------
const saveNotes = () => {
  notesFocused.value = false
  if (!packingStore.currentListId) return
  if ((packingStore.currentList?.notes ?? '') === notesDraft.value.trim()) return
  packingStore.updateNotes(packingStore.currentListId, notesDraft.value)
}

// Reset is reachable whenever ANY progress exists — including partial stepper
// counts on items that never reached "packed" (packed_count decoupled from packed).
const hasPacked = computed(() =>
  packingStore.currentListItems.some(i => i.packed || i.packed_count > 0)
)

onMounted(async () => {
  await packingStore.loadLists()
  await packingStore.loadItems()
  notesDraft.value = packingStore.currentList?.notes ?? ''
  packingStore.subscribe()
})

onUnmounted(() => {
  packingStore.unsubscribe()
})
</script>

<template>
  <div class="page-container">
    <div class="container-fluid">
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
            @click="openCreateList"
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
        <button class="btn btn-primary" @click="openCreateList">
          <i class="bi bi-plus-lg me-1"></i> Liste erstellen
        </button>
      </div>

      <template v-else-if="packingStore.currentListId">
        <!-- Gesamt-Fortschritt -->
        <div v-if="packingStore.currentListItems.length > 0" class="progress-header">
          <div class="progress-label">
            <span class="progress-list-name">{{ packingStore.currentList?.name }}</span>
            <span class="progress-count">
              {{ packingStore.overallProgress.packed }}/{{ packingStore.overallProgress.total }} gepackt
            </span>
            <button
              v-if="hasPacked"
              class="reset-inline-btn"
              @click="showResetConfirm = true"
              title="Alle zurücksetzen"
            >
              <i class="bi bi-arrow-counterclockwise"></i>
            </button>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: packingStore.overallProgress.percent + '%' }"></div>
          </div>
        </div>

        <!-- Reise-Notizen -->
        <div class="notes-block">
          <button class="notes-toggle" @click="notesOpen = !notesOpen">
            <i class="bi bi-journal-text me-1"></i>
            <span class="notes-title">Reise-Notizen</span>
            <span v-if="!notesOpen && notesDraft.trim()" class="notes-preview">
              {{ notesDraft.trim() }}
            </span>
            <i class="bi ms-auto" :class="notesOpen ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
          </button>
          <div v-if="notesOpen" class="notes-body">
            <textarea
              v-model="notesDraft"
              class="form-control"
              rows="3"
              maxlength="5000"
              placeholder="z.B. Wird warm (25°C), 5 Tage, Wanderschuhe nicht vergessen…"
              @focus="notesFocused = true"
              @blur="saveNotes"
            ></textarea>
          </div>
        </div>

        <!-- Loading Skeleton -->
        <div v-if="packingStore.isLoading && packingStore.items.length === 0" class="skeleton-loading">
          <div class="skeleton-card" style="height: 60px;"></div>
          <div class="skeleton-card" style="height: 60px;"></div>
        </div>

        <!-- Kategorie-Sektionen -->
        <template v-else>
          <div
            v-for="group in packingStore.itemsByCategory"
            :key="group.key"
            class="cat-section"
            :class="{ 'cat-uncategorized': group.isUncategorized, 'cat-complete': group.isComplete }"
          >
            <button class="cat-header" @click="toggleSection(group)">
              <span class="cat-dot" :style="{ background: categoryColor(group.category) }"></span>
              <span class="cat-name">{{ group.label }}</span>
              <span class="cat-count" v-if="group.total > 0">
                <i v-if="group.isComplete" class="bi bi-check-circle-fill cat-complete-icon"></i>
                {{ group.packedCount }}/{{ group.total }}
              </span>
              <i
                class="bi cat-chevron ms-auto"
                :class="isSectionOpen(group) ? 'bi-chevron-up' : 'bi-chevron-down'"
              ></i>
            </button>

            <div v-if="isSectionOpen(group)" class="cat-body">
              <div
                v-for="item in group.items"
                :key="item.item_id"
                class="pack-row"
                :class="{ packed: item.packed }"
                role="checkbox"
                :aria-checked="item.packed"
                tabindex="0"
                @click="onItemClick(item)"
                @keydown.enter.prevent="packingStore.togglePacked(item.item_id)"
                @keydown.space.prevent="packingStore.togglePacked(item.item_id)"
                @touchstart.passive="onItemTouchStart($event, item)"
                @touchmove.passive="onItemTouchMove($event)"
                @touchend="onItemTouchEnd($event)"
                @touchcancel="clearPress"
                @contextmenu="onItemContextMenu($event, item)"
              >
                <span class="pack-check" :class="{ on: item.packed }">
                  <i v-if="item.packed" class="bi bi-check-lg"></i>
                </span>
                <span class="pack-name">{{ item.name }}</span>

                <div v-if="item.quantity > 1" class="pack-stepper" @click.stop>
                  <button
                    class="step-btn"
                    @click="packingStore.decrementPacked(item.item_id)"
                    :disabled="item.packed_count <= 0"
                    title="Weniger"
                  >
                    <i class="bi bi-dash"></i>
                  </button>
                  <span class="step-count">{{ item.packed_count }}/{{ item.quantity }}</span>
                  <button
                    class="step-btn"
                    @click="packingStore.incrementPacked(item.item_id)"
                    :disabled="item.packed_count >= item.quantity"
                    title="Mehr"
                  >
                    <i class="bi bi-plus"></i>
                  </button>
                </div>
              </div>

              <!-- Kontextuelle Add-Zeile -->
              <div v-if="isAddOpen(group)" class="add-line">
                <input
                  v-model="addDraft[group.key]"
                  type="text"
                  class="add-input"
                  :placeholder="group.isUncategorized ? '+ hinzufügen…' : `+ zu ${group.label}…`"
                  maxlength="200"
                  @keyup.enter="handleSectionAdd(group)"
                />
                <button
                  class="add-confirm"
                  @click="handleSectionAdd(group)"
                  :disabled="!(addDraft[group.key] || '').trim()"
                  title="Hinzufügen"
                >
                  <i class="bi bi-plus-lg"></i>
                </button>
              </div>
              <button v-else class="add-reopen" @click="openAddLine(group)">
                <i class="bi bi-plus-lg me-1"></i> hinzufügen
              </button>
            </div>
          </div>

          <!-- + Kategorie -->
          <button class="add-category-btn" @click="showCategorySearch = true">
            <i class="bi bi-plus-lg me-1"></i> Kategorie
          </button>
        </template>
      </template>
    </div>
  </div>

  <!-- Item bearbeiten Modal (Long-Press / Rechtsklick) -->
  <PackingItemEditModal
    v-if="editingItem"
    :item="editingItem"
    :existing-categories="categoryLabels"
    @save="handleItemSave"
    @delete="handleItemDelete"
    @close="editingItem = null"
  />

  <!-- Kategorie-Suche / Import -->
  <CategorySearchModal
    v-if="showCategorySearch"
    @create="handleCreateCategory"
    @close="showCategorySearch = false"
  />

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
    <div v-if="showCreateListModal" class="modal-overlay" @click.self="showCreateListModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">Neue Packliste</h5>
          <button class="btn-close" @click="showCreateListModal = false"></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input
              v-model="newListName"
              type="text"
              class="form-control"
              placeholder="z.B. Wochenend-Trip, Urlaub, Wandern…"
              maxlength="100"
              @keyup.enter="handleCreateList"
              autofocus
            />
          </div>
          <div class="form-group" v-if="packingStore.lists.length > 0">
            <label class="form-label">Inhalt</label>
            <select v-model="copySourceId" class="form-select">
              <option value="">Leere Liste</option>
              <option v-for="l in packingStore.lists" :key="l.list_id" :value="l.list_id">
                Kopieren von: {{ l.name }}
              </option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showCreateListModal = false">Abbrechen</button>
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
          <p class="text-muted mb-0">Alle Items werden als ungepackt markiert (inkl. Zähler).</p>
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
/* ---- List Chip Bar (unchanged pattern) ---- */
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

.list-chip-container::-webkit-scrollbar { display: none; }

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

.list-chip:hover { border-color: var(--color-primary); color: var(--color-text-primary); }
.list-chip.active { background: var(--color-primary); border-color: var(--color-primary); color: white; font-weight: 600; }
.list-chip.add-chip { color: var(--color-text-secondary); padding: 6px 12px; }
.list-chip.add-chip:hover { background: var(--color-primary); border-color: var(--color-primary); color: white; }

.chip-edit-btn {
  background: none; border: none; padding: 0; margin-left: 2px;
  cursor: pointer; color: inherit; opacity: 0.6; font-size: 0.75rem;
  line-height: 1; display: flex; align-items: center;
}
.chip-edit-btn:hover { opacity: 1; }

/* ---- Progress Header ---- */
.progress-header { margin-bottom: var(--spacing-md); }

.progress-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: 6px;
  font-size: var(--font-sm);
}

.progress-list-name { font-weight: 600; color: var(--color-text-primary); }
.progress-count { color: var(--color-text-secondary); }

.reset-inline-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
}
.reset-inline-btn:hover { color: var(--color-warning-dark); background: var(--color-warning-light); }

.progress-track {
  height: 6px;
  background: var(--color-border);
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--color-success);
  border-radius: 3px;
  transition: width 0.3s ease;
}

/* ---- Notes ---- */
.notes-block {
  background: var(--color-background-elevated);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-md);
  overflow: hidden;
}
.notes-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  cursor: pointer;
  text-align: left;
}
.notes-title { font-weight: 600; flex-shrink: 0; }
.notes-preview {
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.notes-body { padding: 0 var(--spacing-md) var(--spacing-md); }

/* ---- Category Section ---- */
.cat-section {
  background: var(--color-background-elevated);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-sm);
  overflow: hidden;
}
.cat-uncategorized { opacity: 0.92; }
.cat-complete .cat-header { opacity: 0.7; }

.cat-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--color-text-primary);
  min-height: var(--touch-target-min);
}
.cat-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cat-name { font-weight: 600; font-size: var(--font-base); }
.cat-uncategorized .cat-name { color: var(--color-text-muted); font-weight: 500; }
.cat-count {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.cat-complete-icon { color: var(--color-success); }
.cat-chevron { color: var(--color-text-muted); }

.cat-body {
  padding: 0 var(--spacing-sm) var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ---- Item Row ---- */
.pack-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-sm);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  min-height: 44px;
  transition: background 0.15s, opacity 0.15s;
}
.pack-row:hover { border-color: var(--color-border-hover); }
.pack-row:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.pack-row.packed { opacity: 0.55; }
.pack-row.packed .pack-name { text-decoration: line-through; color: var(--color-text-muted); }

.pack-check {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 2px solid var(--color-border-hover);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
}
.pack-check.on { background: var(--color-success); border-color: var(--color-success); }

.pack-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-base);
  overflow-wrap: anywhere;
}

/* ---- Stepper ---- */
.pack-stepper {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.step-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  background: var(--color-background-elevated);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: var(--font-base);
}
.step-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.step-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.step-count {
  min-width: 40px;
  text-align: center;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ---- Add line ---- */
.add-line {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 2px 0;
}
.add-input {
  flex: 1;
  min-width: 0;
  border: 1px dashed var(--color-border-hover);
  background: transparent;
  border-radius: var(--radius-sm);
  padding: 8px var(--spacing-sm);
  font-size: var(--font-base);
  color: var(--color-text-primary);
}
.add-input:focus { outline: none; border-color: var(--color-primary); border-style: solid; }
.add-confirm {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.add-confirm:disabled { opacity: 0.4; cursor: not-allowed; }

.add-reopen {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: var(--font-sm);
  cursor: pointer;
  padding: 6px 4px;
}
.add-reopen:hover { color: var(--color-primary); }

/* ---- + Kategorie ---- */
.add-category-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--spacing-sm);
  margin-top: var(--spacing-xs);
  background: none;
  border: 1px dashed var(--color-border-hover);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  font-weight: 500;
  cursor: pointer;
  min-height: var(--touch-target-min);
}
.add-category-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
</style>
