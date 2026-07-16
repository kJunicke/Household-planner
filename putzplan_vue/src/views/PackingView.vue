<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { usePackingStore, type CategoryGroup } from '@/stores/packingStore'
import { categoryColor } from '@/lib/categoryColor'
import { useGraceWindow } from '@/composables/useGraceWindow'
import { useCategoryRail } from '@/composables/useCategoryRail'
import type { PackingItem } from '@/types/PackingItem'
import ListEditModal from '@/components/ListEditModal.vue'
import PackingItemEditModal from '@/components/PackingItemEditModal.vue'
import PackingItemRow from '@/components/PackingItemRow.vue'
import CategoryRail from '@/components/CategoryRail.vue'
import CategorySearchModal, { type CategoryCandidate } from '@/components/CategorySearchModal.vue'
import CategoryEditModal from '@/components/CategoryEditModal.vue'

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
const editingCategory = ref<{ name: string; count: number } | null>(null)

// --- Per-section UI state (session-only, reset on list switch) ---------------
const addDraft = ref<Record<string, string>>({})
const addQty = ref<Record<string, number>>({})
const qtyFieldOpen = ref<Set<string>>(new Set())
const forcedAddOpen = ref<Set<string>>(new Set())
const sectionOverride = ref<Map<string, boolean>>(new Map())

// Focus the number field the moment it appears.
const vFocus = { mounted: (el: HTMLElement) => el.focus() }

// --- Notes ------------------------------------------------------------------
const notesOpen = ref(false)
const notesDraft = ref('')
const notesFocused = ref(false)

watch(
  () => packingStore.currentListId,
  () => {
    addDraft.value = {}
    addQty.value = {}
    qtyFieldOpen.value = new Set()
    suggestFocusKey.value = null
    forcedAddOpen.value = new Set()
    sectionOverride.value = new Map()
    doneOpen.value = new Set()
    clearAllGrace()
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

// --- Name suggestions (from all items across the household's lists) ---------
const suggestFocusKey = ref<string | null>(null)

const suggestionsFor = (group: CategoryGroup): string[] => {
  const q = (addDraft.value[group.key] ?? '').trim().toLowerCase()
  if (!q) return []
  const inSection = new Set(group.items.map(i => i.name.trim().toLowerCase()))
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of packingStore.items) {
    const name = it.name.trim()
    const lower = name.toLowerCase()
    if (!lower.includes(q) || inSection.has(lower) || seen.has(lower)) continue
    seen.add(lower)
    out.push(name)
    if (out.length >= 5) break
  }
  return out
}

const onAddFocus = (key: string) => { suggestFocusKey.value = key }
const onAddBlur = () => { setTimeout(() => { suggestFocusKey.value = null }, 200) }

const selectSuggestion = (group: CategoryGroup, name: string) => {
  addDraft.value[group.key] = name
  suggestFocusKey.value = null
  handleSectionAdd(group)
}

const openQtyField = (key: string) => {
  if (!addQty.value[key]) addQty.value[key] = 1
  qtyFieldOpen.value.add(key)
}

const closeQtyField = (key: string) => {
  const qty = Math.max(1, Math.floor(Number(addQty.value[key]) || 1))
  addQty.value[key] = qty
  qtyFieldOpen.value.delete(key)
}

const handleSectionAdd = async (group: CategoryGroup) => {
  const name = (addDraft.value[group.key] ?? '').trim()
  if (!name) return
  const qty = Math.max(1, Math.floor(Number(addQty.value[group.key]) || 1))
  await packingStore.addItem(name, group.category, qty)
  addDraft.value[group.key] = ''
  addQty.value[group.key] = 1
  qtyFieldOpen.value.delete(group.key)
}

// --- Item interactions ------------------------------------------------------
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
  clearGrace(itemId)
  await packingStore.removeItem(itemId)
  editingItem.value = null
}

// --- Grace window for freshly-checked items ---------------------------------
// Just-packed items stay visible (struck-through) for a moment so a mis-check
// can be undone quickly, before they fold into the collapsed "erledigt" group.
const { graceIds, markGrace, clearGrace, clearAllGrace } = useGraceWindow(6000)

const onItemToggle = (item: PackingItem) => {
  const willPack = !item.packed
  packingStore.togglePacked(item.item_id)
  if (willPack) markGrace(item.item_id)
  else clearGrace(item.item_id)
}

const onItemIncrement = (item: PackingItem) => {
  const willComplete = !item.packed && item.packed_count + 1 >= item.quantity
  packingStore.incrementPacked(item.item_id)
  if (willComplete) markGrace(item.item_id)
}

const onItemDecrement = (item: PackingItem) => {
  const wasPacked = item.packed
  packingStore.decrementPacked(item.item_id)
  if (wasPacked) clearGrace(item.item_id)
}

// --- Per-category done grouping ---------------------------------------------
// Rows shown in the open part: unpacked first, then still-in-grace packed ones.
const openRows = (group: CategoryGroup): PackingItem[] => [
  ...group.items.filter(i => !i.packed),
  ...group.items.filter(i => i.packed && graceIds.value.has(i.item_id))
]
// Packed items past their grace window → collapsed into the "erledigt" group.
const doneRows = (group: CategoryGroup): PackingItem[] =>
  group.items.filter(i => i.packed && !graceIds.value.has(i.item_id))

const doneOpen = ref<Set<string>>(new Set())
const isDoneOpen = (key: string) => doneOpen.value.has(key)
const toggleDone = (key: string) => {
  if (doneOpen.value.has(key)) doneOpen.value.delete(key)
  else doneOpen.value.add(key)
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
  clearAllGrace()
  await packingStore.resetAllUnpacked(packingStore.currentListId)
  showResetConfirm.value = false
}

const handleCreateCategory = (name: string) => {
  packingStore.addCategory(name)
}

// Data for the shared CategorySearchModal (import mode: copies source items).
const importCandidates = computed(() => packingStore.categoryImportCandidates(''))
const importPreviewItems = (c: CategoryCandidate) =>
  packingStore.importPreview(c.sourceListId, c.category)
    .map(i => ({ key: i.item_id, name: i.name, quantity: i.quantity }))
const importDupeNames = (c: CategoryCandidate) =>
  new Set(
    packingStore.currentListItems
      .filter(i => (i.category ?? '').toLowerCase() === c.category.toLowerCase())
      .map(i => i.name.trim().toLowerCase())
  )
const handleCategoryImport = (c: CategoryCandidate) => {
  packingStore.importCategory(c.sourceListId, c.category)
}

const openCategoryEdit = (group: CategoryGroup) => {
  if (!group.category) return
  editingCategory.value = { name: group.category, count: group.total }
}

const handleCategoryRename = async (oldName: string, newName: string) => {
  await packingStore.renameCategory(oldName, newName)
  editingCategory.value = null
}

const handleCategoryDelete = async (name: string) => {
  await packingStore.deleteCategory(name)
  editingCategory.value = null
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

// --- Right-side category quick-nav rail --------------------------------------
const {
  activeKey: activeCatKey,
  showRail,
  railCollapsed,
  setRailCollapsed,
  setSectionEl,
  scrollToKey: scrollToCategory,
} = useCategoryRail({
  keys: () => packingStore.itemsByCategory.map(g => g.key),
  storageKey: 'putzplan_packing_rail_collapsed',
})

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

        <!-- Kategorie-Sektionen + rechte Schnellnav -->
        <template v-else>
        <div class="packing-body" :class="{ 'rail-open': showRail && !railCollapsed }">
          <div class="cat-column">
          <div
            v-for="group in packingStore.itemsByCategory"
            :key="group.key"
            :ref="(el) => setSectionEl(group.key, el)"
            :data-cat-key="group.key"
            class="cat-section"
            :class="{ 'cat-uncategorized': group.isUncategorized, 'cat-complete': group.isComplete }"
          >
            <div
              class="cat-header"
              role="button"
              tabindex="0"
              @click="toggleSection(group)"
              @keydown.enter.prevent="toggleSection(group)"
              @keydown.space.prevent="toggleSection(group)"
            >
              <span class="cat-dot" :style="{ background: categoryColor(group.category) }"></span>
              <span class="cat-name">{{ group.label }}</span>
              <div class="cat-header-right">
                <span class="cat-count" v-if="group.total > 0">
                  <i v-if="group.isComplete" class="bi bi-check-circle-fill cat-complete-icon"></i>
                  {{ group.packedCount }}/{{ group.total }}
                </span>
                <button
                  v-if="!group.isUncategorized"
                  class="cat-edit-btn"
                  @click.stop="openCategoryEdit(group)"
                  title="Kategorie bearbeiten"
                >
                  <i class="bi bi-pencil"></i>
                </button>
                <i
                  class="bi cat-chevron"
                  :class="isSectionOpen(group) ? 'bi-chevron-up' : 'bi-chevron-down'"
                ></i>
              </div>
            </div>

            <div v-if="isSectionOpen(group)" class="cat-body">
              <!-- Offen: noch nicht gepackt + gerade abgehakt (Grace) -->
              <PackingItemRow
                v-for="item in openRows(group)"
                :key="item.item_id"
                :item="item"
                @toggle="onItemToggle(item)"
                @increment="onItemIncrement(item)"
                @decrement="onItemDecrement(item)"
                @edit="openItemEdit(item)"
              />

              <!-- Erledigt (einklappbar) -->
              <template v-if="doneRows(group).length > 0">
                <button class="done-toggle" @click="toggleDone(group.key)">
                  <i class="bi bi-check2-circle done-check"></i>
                  <span>{{ doneRows(group).length }} erledigt</span>
                  <i
                    class="bi ms-auto"
                    :class="isDoneOpen(group.key) ? 'bi-chevron-up' : 'bi-chevron-down'"
                  ></i>
                </button>
                <template v-if="isDoneOpen(group.key)">
                  <PackingItemRow
                    v-for="item in doneRows(group)"
                    :key="item.item_id"
                    :item="item"
                    @toggle="onItemToggle(item)"
                    @increment="onItemIncrement(item)"
                    @decrement="onItemDecrement(item)"
                    @edit="openItemEdit(item)"
                  />
                </template>
              </template>

              <!-- Kontextuelle Add-Zeile -->
              <div v-if="isAddOpen(group)" class="add-line">
                <div class="add-input-wrap">
                  <input
                    v-model="addDraft[group.key]"
                    type="text"
                    class="add-input"
                    :placeholder="group.isUncategorized ? '+ hinzufügen…' : `+ zu ${group.label}…`"
                    maxlength="200"
                    @focus="onAddFocus(group.key)"
                    @blur="onAddBlur"
                    @keyup.enter="handleSectionAdd(group)"
                  />
                  <div
                    v-if="suggestFocusKey === group.key && suggestionsFor(group).length > 0"
                    class="suggestions-dropdown"
                  >
                    <button
                      v-for="s in suggestionsFor(group)"
                      :key="s"
                      class="suggestion-item"
                      @mousedown.prevent="selectSuggestion(group, s)"
                    >
                      {{ s }}
                    </button>
                  </div>
                </div>
                <input
                  v-if="qtyFieldOpen.has(group.key)"
                  v-focus
                  v-model.number="addQty[group.key]"
                  type="number"
                  class="add-qty-input"
                  min="1"
                  max="999"
                  @keyup.enter="handleSectionAdd(group)"
                  @blur="closeQtyField(group.key)"
                />
                <button
                  v-else
                  class="add-qty-toggle"
                  :class="{ active: (addQty[group.key] || 1) > 1 }"
                  @click="openQtyField(group.key)"
                  title="Anzahl festlegen"
                >
                  ×{{ addQty[group.key] || 1 }}
                </button>
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
          </div>

          <!-- Rechte Kategorie-Schnellnav (einklappbar) -->
          <CategoryRail
            v-if="showRail"
            :groups="packingStore.itemsByCategory"
            :active-key="activeCatKey"
            :collapsed="railCollapsed"
            @select="scrollToCategory"
            @update:collapsed="setRailCollapsed"
          />
        </div>
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
    :existing-labels="categoryLabels"
    :candidates="importCandidates"
    :preview-items="importPreviewItems"
    :target-dupe-names="importDupeNames"
    @create="handleCreateCategory"
    @import="handleCategoryImport"
    @close="showCategorySearch = false"
  />

  <!-- Kategorie bearbeiten / löschen -->
  <CategoryEditModal
    v-if="editingCategory"
    :category="editingCategory.name"
    :item-count="editingCategory.count"
    @rename="handleCategoryRename"
    @delete="handleCategoryDelete"
    @close="editingCategory = null"
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

/* ---- Body + fixed bottom-right quick-nav rail ---- */
.packing-body {
  position: relative;
}
.cat-column {
  min-width: 0;
}
/* Reserve space so cards never slide under the fixed rail while it's open. */
.packing-body.rail-open .cat-column {
  padding-right: calc(20vw + 12px);
  max-width: 100%;
}
@media (min-width: 480px) {
  .packing-body.rail-open .cat-column { padding-right: 96px; }
}

/* ---- Category Section ---- */
.cat-section {
  background: var(--color-background-elevated);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-sm);
  scroll-margin-top: 72px;
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
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.cat-header:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }

.cat-header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-shrink: 0;
}

.cat-edit-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--color-text-muted);
  opacity: 0.6;
  display: flex;
  align-items: center;
  font-size: var(--font-sm);
  border-radius: var(--radius-sm);
}
.cat-edit-btn:hover { opacity: 1; color: var(--color-primary); }
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
/* ---- "erledigt" collapse toggle ---- */
.done-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px var(--spacing-sm);
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: var(--font-sm);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}
.done-toggle:hover { color: var(--color-text-secondary); }
.done-check { color: var(--color-success); }

/* ---- Add line ---- */
.add-line {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 2px 0;
}
.add-input-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}
.add-input {
  width: 100%;
  border: 1px dashed var(--color-border-hover);
  background: transparent;
  border-radius: var(--radius-sm);
  padding: 8px var(--spacing-sm);
  font-size: var(--font-base);
  color: var(--color-text-primary);
}
.add-input:focus { outline: none; border-color: var(--color-primary); border-style: solid; }

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.suggestion-item {
  padding: var(--spacing-sm) var(--spacing-md);
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  font-size: var(--font-base);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color 0.15s;
}
.suggestion-item:last-child { border-bottom: none; }
.suggestion-item:hover { background: var(--color-background); }
.add-qty-toggle {
  flex-shrink: 0;
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  border: 1px dashed var(--color-border-hover);
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.add-qty-toggle:hover { border-color: var(--color-primary); color: var(--color-primary); }
.add-qty-toggle.active {
  border-style: solid;
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.add-qty-input {
  flex-shrink: 0;
  width: 56px;
  height: 36px;
  text-align: center;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: var(--font-base);
  font-variant-numeric: tabular-nums;
}
.add-qty-input:focus { outline: none; }

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
