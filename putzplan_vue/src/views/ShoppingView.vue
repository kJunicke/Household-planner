<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import {
  useShoppingStore,
  categoryKey,
  compareCategoryGroups,
  type ShoppingCategoryGroup,
} from '@/stores/shoppingStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import { useGraceWindow } from '@/composables/useGraceWindow'
import { useCategoryRail } from '@/composables/useCategoryRail'
import { useCategoryDrag } from '@/composables/useCategoryDrag'
import { categoryColor } from '@/lib/categoryColor'
import type { ShoppingItem } from '@/types/ShoppingItem'
import ListEditModal from '@/components/ListEditModal.vue'
import ListItemRow from '@/components/ListItemRow.vue'
import ShoppingItemEditModal from '@/components/ShoppingItemEditModal.vue'
import CategoryRail from '@/components/CategoryRail.vue'
import ShoppingCategoryCreateModal from '@/components/ShoppingCategoryCreateModal.vue'
import CategoryEditModal from '@/components/CategoryEditModal.vue'
import CategoryCombobox from '@/components/CategoryCombobox.vue'

const shoppingStore = useShoppingStore()
const householdStore = useHouseholdStore()
const { isOnline } = useNetworkStatus()

// --- Top add-bar ------------------------------------------------------------
const searchInput = ref('')
const showSuggestions = ref(false)
const topCategory = ref('')
const topQty = ref(1)
const topQtyOpen = ref(false)
/** Sobald die Kategorie von Hand angefasst wurde, hält die Automatik still. */
const topCategoryTouched = ref(false)

// --- Modals -----------------------------------------------------------------
const showListEditModal = ref(false)
const showCreateListModal = ref(false)
const newListName = ref('')
const editingList = ref<{ list_id: string; name: string } | null>(null)
const editingItem = ref<ShoppingItem | null>(null)
const editingCategory = ref<{ name: string; count: number } | null>(null)
const showCategoryCreate = ref(false)

// --- Per-section UI state (session-only, reset on list switch) ---------------
const addDraft = ref<Record<string, string>>({})
const addQty = ref<Record<string, number>>({})
const qtyFieldOpen = ref<Set<string>>(new Set())
const sectionOverride = ref<Map<string, boolean>>(new Map())
const forcedAddOpen = ref<Set<string>>(new Set())
const suggestFocusKey = ref<string | null>(null)

const vFocus = { mounted: (el: HTMLElement) => el.focus() }

// --- Grace window (delayed move to the Gekauft block) -----------------------
const { graceIds, markGrace, clearGrace, clearAllGrace } = useGraceWindow(6000)

watch(
  () => shoppingStore.currentListId,
  () => {
    addDraft.value = {}
    addQty.value = {}
    qtyFieldOpen.value = new Set()
    sectionOverride.value = new Map()
    forcedAddOpen.value = new Set()
    suggestFocusKey.value = null
    clearAllGrace()
    // Auch die obere Leiste: eine stehengebliebene Zielkategorie gehört zur alten
    // Liste und würde hier sonst als neue Kategorie angelegt.
    resetTopBar()
  }
)

// Trigger sync when coming back online
watch(isOnline, async (online) => {
  if (online && shoppingStore.hasPendingMutations) {
    await shoppingStore.syncMutations()
  }
})

// --- Displayed category sections (grouping + grace overlay) ------------------
// Store groups the unpurchased items. Freshly-bought items linger struck-through
// in their section until their grace window elapses, then fall into the global
// Gekauft block — so we overlay in-grace purchased items back onto their group.
const displaySections = computed<ShoppingCategoryGroup[]>(() => {
  const base: ShoppingCategoryGroup[] = shoppingStore.itemsByCategory.map(g => ({
    ...g,
    items: [...g.items],
  }))
  const byKey = new Map(base.map(g => [g.key, g]))

  const inGrace = shoppingStore.currentListItems.filter(
    i => i.purchased && graceIds.value.has(i.shopping_item_id)
  )
  for (const it of inGrace) {
    const key = categoryKey(it.category)
    let group = byKey.get(key)
    if (!group) {
      group = {
        category: it.category,
        key,
        label: it.category ?? 'Unkategorisiert',
        items: [],
        total: 0,
        isUncategorized: !it.category,
        sortOrder: Number.MAX_SAFE_INTEGER,
      }
      byKey.set(key, group)
      base.push(group)
    }
    group.items.push(it)
    group.total++
  }

  // Erst jetzt sortieren: eine Sektion, die nur noch Produkte im Rückgängig-Fenster
  // hält, gilt als gefüllt und darf nicht schon ans Ende gerutscht sein.
  base.sort(compareCategoryGroups)
  return base
})

const gekauftItems = computed(() =>
  shoppingStore.purchasedItems.filter(i => !graceIds.value.has(i.shopping_item_id))
)

// --- Section collapse -------------------------------------------------------
/** Leere Kategorien starten eingeklappt — sie stehen ohnehin am Listenende. */
const isSectionOpen = (group: ShoppingCategoryGroup): boolean => {
  const override = sectionOverride.value.get(group.key)
  return override !== undefined ? override : group.items.length > 0
}
const toggleSection = (group: ShoppingCategoryGroup) => {
  sectionOverride.value.set(group.key, !isSectionOpen(group))
}

// --- Kontextuelle Add-Zeile -------------------------------------------------
/**
 * Sobald in einer Kategorie das erste Produkt gekauft ist, räumt sich ihre
 * Add-Zeile weg: beim Einkaufen zählt die Liste, nicht das Eintragen. Das Plus
 * in der Kopfzeile holt sie zurück (Muster aus der Packliste).
 */
const purchasedPerCategory = computed(() => {
  const counts = new Map<string, number>()
  for (const item of shoppingStore.currentListItems) {
    if (!item.purchased) continue
    const key = categoryKey(item.category)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
})

const isAddOpen = (group: ShoppingCategoryGroup): boolean =>
  forcedAddOpen.value.has(group.key) || !purchasedPerCategory.value.get(group.key)

const openAddLine = (group: ShoppingCategoryGroup) => {
  forcedAddOpen.value.add(group.key)
  sectionOverride.value.set(group.key, true)
}

// --- Top add-bar autocomplete ----------------------------------------------
const suggestions = computed(() => {
  if (!searchInput.value.trim()) return []
  const query = searchInput.value.toLowerCase()
  const matching = shoppingStore.items
    .filter(item => item.name.toLowerCase().includes(query))
    .map(item => item.name)
  return [...new Set(matching)].slice(0, 5)
})

// Automatische Zielkategorie aus der Kaufhistorie — überschreibt nie eine Wahl,
// die der Nutzer selbst getroffen hat.
watch(searchInput, (value) => {
  if (topCategoryTouched.value) return
  topCategory.value = shoppingStore.suggestCategoryFor(value) ?? ''
})

const onTopCategoryInput = (value: string) => {
  topCategoryTouched.value = true
  topCategory.value = value
}

const openTopQty = () => { topQtyOpen.value = true }
const closeTopQty = () => {
  topQty.value = Math.max(1, Math.floor(Number(topQty.value) || 1))
  topQtyOpen.value = false
}

const resetTopBar = () => {
  searchInput.value = ''
  showSuggestions.value = false
  topCategory.value = ''
  topCategoryTouched.value = false
  topQty.value = 1
  topQtyOpen.value = false
}

const handleAddItem = async () => {
  const value = searchInput.value.trim()
  if (!value) return

  const existingUnpurchased = shoppingStore.currentListItems.find(
    item => !item.purchased && item.name.toLowerCase() === value.toLowerCase()
  )
  if (existingUnpurchased) {
    resetTopBar()
    return
  }

  const existingPurchased = shoppingStore.currentListItems.find(
    item => item.purchased && item.name.toLowerCase() === value.toLowerCase()
  )
  if (existingPurchased) {
    resetTopBar()
    clearGrace(existingPurchased.shopping_item_id)
    await shoppingStore.markUnpurchased(existingPurchased.shopping_item_id)
    return
  }

  const qty = Math.max(1, Math.floor(Number(topQty.value) || 1))
  const category = await ensureCategory(topCategory.value)
  resetTopBar()
  await shoppingStore.createItem(value, category, qty)
}

const selectSuggestion = (suggestion: string) => {
  searchInput.value = suggestion
  showSuggestions.value = false
  handleAddItem()
}

const handleInputFocus = () => { showSuggestions.value = true }
const handleInputBlur = () => { setTimeout(() => { showSuggestions.value = false }, 200) }

// --- Per-section add line ----------------------------------------------------
const suggestionsFor = (group: ShoppingCategoryGroup): string[] => {
  const q = (addDraft.value[group.key] ?? '').trim().toLowerCase()
  if (!q) return []
  const inSection = new Set(group.items.map(i => i.name.trim().toLowerCase()))
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of shoppingStore.items) {
    const name = it.name.trim()
    const lower = name.toLowerCase()
    if (!lower.includes(q) || inSection.has(lower) || seen.has(lower)) continue
    seen.add(lower)
    out.push(name)
    if (out.length >= 5) break
  }
  return out
}

const onSectionAddFocus = (key: string) => { suggestFocusKey.value = key }
const onSectionAddBlur = () => { setTimeout(() => { suggestFocusKey.value = null }, 200) }

const openQtyField = (key: string) => {
  if (!addQty.value[key]) addQty.value[key] = 1
  qtyFieldOpen.value.add(key)
}
const closeQtyField = (key: string) => {
  const qty = Math.max(1, Math.floor(Number(addQty.value[key]) || 1))
  addQty.value[key] = qty
  qtyFieldOpen.value.delete(key)
}

const handleSectionAdd = async (group: ShoppingCategoryGroup) => {
  const name = (addDraft.value[group.key] ?? '').trim()
  if (!name) return
  const qty = Math.max(1, Math.floor(Number(addQty.value[group.key]) || 1))
  // Clear the input immediately (optimistic) rather than after the sync round-trip.
  addDraft.value[group.key] = ''
  addQty.value[group.key] = 1
  qtyFieldOpen.value.delete(group.key)
  await shoppingStore.createItem(name, group.category, qty)
}

const selectSectionSuggestion = (group: ShoppingCategoryGroup, name: string) => {
  addDraft.value[group.key] = name
  suggestFocusKey.value = null
  handleSectionAdd(group)
}

// --- Item interactions ------------------------------------------------------
const onItemToggle = (item: ShoppingItem) => {
  if (item.purchased) {
    // Still in its grace window → tap undoes the purchase.
    clearGrace(item.shopping_item_id)
    shoppingStore.markUnpurchased(item.shopping_item_id)
  } else {
    markGrace(item.shopping_item_id)
    shoppingStore.markPurchased(item.shopping_item_id)
  }
}

const onGekauftToggle = (item: ShoppingItem) => {
  shoppingStore.markUnpurchased(item.shopping_item_id)
}

const openItemEdit = (item: ShoppingItem) => { editingItem.value = item }

/**
 * Ein getippter Kategoriename, den es noch nicht gibt, wird beim Speichern
 * angelegt. Zurück kommt der kanonische Name der Zeile — so landet „kühlregal"
 * nicht als zweite Schreibweise neben „Kühlregal".
 */
const ensureCategory = async (name: string | null) => {
  if (!name?.trim()) return null
  return await shoppingStore.createCategory(name)
}

const handleItemSave = async (
  itemId: string,
  patch: { name: string; category: string | null; quantity: number }
) => {
  const category = await ensureCategory(patch.category)
  await shoppingStore.updateItem(itemId, { ...patch, category })
  editingItem.value = null
}

const handleItemDelete = async (itemId: string) => {
  clearGrace(itemId)
  await shoppingStore.deleteItem(itemId)
  editingItem.value = null
}

// --- Categories -------------------------------------------------------------
/** Anlegen und Umhängen in einem Zug — der Store schreibt beides gemeinsam. */
const handleCreateCategory = async (name: string, itemIds: string[]) => {
  await shoppingStore.createCategory(name, itemIds)
}

const openCategoryEdit = (group: ShoppingCategoryGroup) => {
  if (!group.category) return
  editingCategory.value = { name: group.category, count: group.total }
}
const handleCategoryRename = async (oldName: string, newName: string) => {
  await shoppingStore.renameCategory(oldName, newName)
  editingCategory.value = null
}
const handleCategoryDelete = async (name: string, withItems: boolean) => {
  await shoppingStore.deleteCategory(name, { withItems })
  editingCategory.value = null
}

// --- Ziehen zwischen Kategorien ---------------------------------------------
/**
 * Der Container trägt den Kategorienamen, nicht den Sektionsschlüssel: der
 * Schlüssel ist kleingeschrieben und taugt nicht als Wert für das Textfeld.
 */
const { bind: bindDrag } = useCategoryDrag({
  group: 'shopping-items',
  categoryOf: (el) => el.dataset.catName || null,
  onMove: (itemId, category) => shoppingStore.updateItem(itemId, { category }),
})

const setDropEl = (key: string, el: unknown) => {
  bindDrag(key, el instanceof HTMLElement ? el : null)
}

// --- Right-side category quick-nav rail --------------------------------------
const {
  activeKey: activeCatKey,
  showRail,
  railCollapsed,
  setRailCollapsed,
  setSectionEl,
  scrollToKey,
} = useCategoryRail({
  keys: () => displaySections.value.map(g => g.key),
  storageKey: 'putzplan_shopping_rail_collapsed',
})

// --- Purchase-history helpers (Gekauft block) -------------------------------
const getMemberName = (userId: string | null) => {
  if (!userId) return 'Unbekannt'
  const member = householdStore.householdMembers.find(m => m.user_id === userId)
  return member?.display_name || 'Unbekannt'
}
const formatDate = (dateString: string | null) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

// --- List CRUD --------------------------------------------------------------
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
  await shoppingStore.loadCategories()
  shoppingStore.subscribeToItems()
})

onUnmounted(() => {
  shoppingStore.unsubscribeFromItems()
})
</script>

<template>
  <div class="page-container">
    <div class="container-fluid">
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

      <template v-else-if="shoppingStore.currentListId">
        <!-- Obere Leiste: Produkt · Menge · Zielkategorie · Hinzufügen · Kategorie anlegen -->
        <div class="search-container mb-3">
          <div class="top-bar">
            <div class="top-name-wrap">
              <input
                v-model="searchInput"
                type="text"
                class="top-name-input"
                placeholder="Produkt hinzufügen…"
                maxlength="200"
                @keyup.enter="handleAddItem"
                @focus="handleInputFocus"
                @blur="handleInputBlur"
                :disabled="shoppingStore.isLoading"
              />
              <div v-if="showSuggestions && suggestions.length > 0" class="suggestions-dropdown">
                <div
                  v-for="suggestion in suggestions"
                  :key="suggestion"
                  class="suggestion-item"
                  @mousedown.prevent="selectSuggestion(suggestion)"
                >
                  <i class="bi bi-clock-history me-2"></i>
                  {{ suggestion }}
                </div>
              </div>
            </div>

            <input
              v-if="topQtyOpen"
              v-focus
              v-model.number="topQty"
              type="number"
              class="top-qty-input"
              min="1"
              max="999"
              @keyup.enter="handleAddItem"
              @blur="closeTopQty"
            />
            <button
              v-else
              class="top-qty-toggle"
              :class="{ active: topQty > 1 }"
              @click="openTopQty"
              title="Anzahl festlegen"
            >
              ×{{ topQty }}
            </button>

            <CategoryCombobox
              class="top-combo"
              compact
              :model-value="topCategory"
              :options="shoppingStore.categorySuggestions"
              placeholder="Kategorie"
              @update:model-value="onTopCategoryInput"
              @submit="handleAddItem"
            />

            <button
              class="top-btn top-add"
              @click="handleAddItem"
              :disabled="!searchInput.trim() || shoppingStore.isLoading"
              title="Hinzufügen"
            >
              <i class="bi bi-plus-lg"></i>
            </button>
            <button
              class="top-btn top-new-cat"
              @click="showCategoryCreate = true"
              title="Kategorie anlegen"
            >
              <i class="bi bi-tag"></i>
            </button>
          </div>
        </div>

        <!-- Loading Skeleton -->
        <div v-if="shoppingStore.isLoading && shoppingStore.items.length === 0" class="skeleton-loading">
          <div class="skeleton-card" style="height: 60px;"></div>
          <div class="skeleton-card" style="height: 60px;"></div>
        </div>

        <template v-else>
          <div class="shopping-body" :class="{ 'rail-open': showRail && !railCollapsed }">
            <div class="cat-column">
              <!-- Zu kaufen: Kategorie-Sektionen -->
              <div
                v-for="group in displaySections"
                :key="group.key"
                :ref="(el) => setSectionEl(group.key, el)"
                class="cat-section"
                :class="{ 'cat-uncategorized': group.isUncategorized }"
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
                    <span class="cat-count" v-if="group.total > 0">{{ group.total }}</span>
                    <button
                      v-if="!isAddOpen(group)"
                      class="cat-icon-btn"
                      @click.stop="openAddLine(group)"
                      title="Produkt hinzufügen"
                    >
                      <i class="bi bi-plus-lg"></i>
                    </button>
                    <button
                      v-if="!group.isUncategorized"
                      class="cat-icon-btn"
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

                <div
                  v-if="isSectionOpen(group)"
                  :ref="(el) => setDropEl(group.key, el)"
                  :data-cat-name="group.category ?? ''"
                  class="cat-body"
                >
                  <ListItemRow
                    v-for="item in group.items"
                    :key="item.shopping_item_id"
                    :data-item-id="item.shopping_item_id"
                    :checked="item.purchased"
                    :name="item.name"
                    :class="{ 'row-priority': item.is_priority && !item.purchased }"
                    @toggle="onItemToggle(item)"
                    @edit="openItemEdit(item)"
                  >
                    <template #trailing>
                      <span v-if="item.quantity > 1" class="qty-badge">×{{ item.quantity }}</span>
                      <button
                        v-if="!item.purchased"
                        class="star-btn"
                        :class="{ active: item.is_priority }"
                        @click="shoppingStore.togglePriority(item.shopping_item_id)"
                        :title="item.is_priority ? 'Priorität entfernen' : 'Als prioritär markieren'"
                      >
                        <i :class="item.is_priority ? 'bi bi-star-fill' : 'bi bi-star'"></i>
                      </button>
                    </template>
                  </ListItemRow>

                  <!-- Per-Sektion Add-Zeile, kontextuell -->
                  <div v-if="isAddOpen(group)" class="add-line">
                    <div class="add-input-wrap">
                      <input
                        v-model="addDraft[group.key]"
                        type="text"
                        class="add-input"
                        :placeholder="group.isUncategorized ? '+ hinzufügen…' : `+ zu ${group.label}…`"
                        maxlength="200"
                        @focus="onSectionAddFocus(group.key)"
                        @blur="onSectionAddBlur"
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
                          @mousedown.prevent="selectSectionSuggestion(group, s)"
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
                </div>

                <!-- Eingeklappt: schmale Ablagefläche, damit auch leere
                     Kategorien ein Ziel zum Hineinziehen haben. -->
                <div
                  v-else
                  :ref="(el) => setDropEl(group.key, el)"
                  :data-cat-name="group.category ?? ''"
                  class="cat-dropzone"
                ></div>
              </div>

              <!-- Gekauft (globaler Block, mit Kauf-Historie) -->
              <div class="gekauft-section" v-if="gekauftItems.length > 0">
                <h3 class="gekauft-title">
                  <i class="bi bi-check-circle"></i> Gekauft ({{ gekauftItems.length }})
                </h3>
                <div class="gekauft-list">
                  <div
                    v-for="item in gekauftItems"
                    :key="item.shopping_item_id"
                    class="gekauft-item"
                  >
                    <div class="form-check">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        :checked="true"
                        @change="onGekauftToggle(item)"
                        :id="'bought-' + item.shopping_item_id"
                      />
                      <label
                        class="form-check-label text-muted text-decoration-line-through"
                        :for="'bought-' + item.shopping_item_id"
                      >
                        {{ item.name }}<span v-if="item.quantity > 1"> ×{{ item.quantity }}</span>
                      </label>
                    </div>
                    <div class="item-info">
                      <small class="text-muted">
                        {{ item.times_purchased }}x gekauft
                        <span v-if="item.last_purchased_at">· {{ formatDate(item.last_purchased_at) }}</span>
                        <span v-if="item.last_purchased_by">· {{ getMemberName(item.last_purchased_by) }}</span>
                      </small>
                      <button
                        class="btn btn-sm btn-delete-ghost ms-2"
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

            <!-- Rechte Kategorie-Schnellnav -->
            <CategoryRail
              v-if="showRail"
              :groups="displaySections"
              :active-key="activeCatKey"
              :collapsed="railCollapsed"
              @select="scrollToKey"
              @update:collapsed="setRailCollapsed"
            />
          </div>
        </template>
      </template>
    </div>
  </div>

  <!-- Artikel bearbeiten Modal (Long-Press / Rechtsklick) -->
  <ShoppingItemEditModal
    v-if="editingItem"
    :item="editingItem"
    :category-options="shoppingStore.categorySuggestions"
    @save="handleItemSave"
    @delete="handleItemDelete"
    @close="editingItem = null"
  />

  <!-- Kategorie anlegen samt Produktzuordnung -->
  <ShoppingCategoryCreateModal
    v-if="showCategoryCreate"
    :items="shoppingStore.currentListItems"
    :category-options="shoppingStore.categorySuggestions"
    @create="handleCreateCategory"
    @close="showCategoryCreate = false"
  />

  <!-- Kategorie bearbeiten / löschen -->
  <CategoryEditModal
    v-if="editingCategory"
    :category="editingCategory.name"
    :item-count="editingCategory.count"
    variants
    @rename="handleCategoryRename"
    @delete="handleCategoryDelete"
    @close="editingCategory = null"
  />

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
            placeholder="z.B. Edeka, Asia Markt, Bestellen…"
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
/* ---- List Chip Bar ---- */
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

/* ---- Top add-bar ---- */
.search-container { position: relative; }

/* Einzeilig bis hinunter zu 360 px: die festen Knöpfe behalten ihre Trefferfläche,
   Produktfeld und Kategorie teilen sich den Rest — die Kategorie gibt zuerst nach. */
.top-bar {
  display: flex;
  align-items: center;
  gap: 4px;
}
.top-name-wrap { position: relative; flex: 1 1 40%; min-width: 0; }
.top-name-input {
  width: 100%;
  height: 38px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: var(--font-base);
}
.top-name-input:focus { outline: none; border-color: var(--color-primary); }
.top-combo { flex: 1 1 30%; min-width: 64px; }

.top-qty-toggle {
  flex-shrink: 0;
  min-width: 34px;
  height: 38px;
  padding: 0 4px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.top-qty-toggle.active { border-color: var(--color-primary); color: var(--color-primary); }
.top-qty-input {
  flex-shrink: 0;
  width: 48px;
  height: 38px;
  text-align: center;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}
.top-qty-input:focus { outline: none; }

.top-btn {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.top-add { border: none; background: var(--color-primary); color: #fff; }
.top-add:disabled { opacity: 0.4; cursor: not-allowed; }
.top-new-cat {
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text-secondary);
}
.top-new-cat:hover { border-color: var(--color-primary); color: var(--color-primary); }
.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
}
.suggestion-item {
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid var(--color-border);
  background: none;
  border-left: none;
  border-right: none;
  border-top: none;
  text-align: left;
  font-size: var(--font-base);
  color: var(--color-text-primary);
}
.suggestion-item:last-child { border-bottom: none; }
.suggestion-item:hover { background-color: var(--color-background); }

/* ---- Body + rail reserve ---- */
.shopping-body { position: relative; }
.cat-column { min-width: 0; }
.shopping-body.rail-open .cat-column {
  padding-right: calc(20vw + 12px);
  max-width: 100%;
}
@media (min-width: 480px) {
  .shopping-body.rail-open .cat-column { padding-right: 96px; }
}

/* ---- Category Section ---- */
.cat-section {
  background: var(--color-background-elevated);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-sm);
  scroll-margin-top: 72px;
}
.cat-uncategorized { opacity: 0.92; }
/* Schlanker Kopf (~34 px statt 48): die volle Breite bleibt Trefferfläche zum
   Auf- und Zuklappen, damit die 48-px-Regel sinngemäß gewahrt bleibt. */
.cat-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px var(--spacing-md);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--color-text-primary);
  min-height: 34px;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.cat-header:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.cat-header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.cat-icon-btn {
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: var(--color-text-muted);
  opacity: 0.6;
  display: flex;
  align-items: center;
  font-size: var(--font-sm);
  border-radius: var(--radius-sm);
}
.cat-icon-btn:hover { opacity: 1; color: var(--color-primary); }
.cat-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cat-name { font-weight: 600; font-size: var(--font-sm); }
.cat-uncategorized .cat-name { color: var(--color-text-muted); font-weight: 500; }
/* Anzahl als dezentes Badge statt als zweite Überschrift. */
.cat-count {
  font-size: var(--font-xs);
  color: var(--color-text-secondary);
  background: var(--color-background);
  border-radius: 999px;
  padding: 1px 7px;
  margin-right: 2px;
}
.cat-chevron { color: var(--color-text-muted); font-size: var(--font-sm); }
.cat-body {
  padding: 0 var(--spacing-sm) var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* Unsichtbar, solange nichts gezogen wird — sie kostet nur die paar Pixel,
   die eine eingeklappte Sektion als Ziel braucht. */
.cat-dropzone { min-height: 10px; }

/* Ziehen: die Vorschau bleibt blass an der alten Stelle, das aufgenommene
   Produkt hebt sich ab. */
.drag-ghost { opacity: 0.35; }
.drag-chosen { border-color: var(--color-primary); }

/* Priority highlight (no re-sorting — pure visual cue). */
.row-priority { border-color: var(--color-warning) !important; }

/* ---- Trailing controls (star + ×N) ---- */
.qty-badge {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 26px;
  text-align: right;
}
.star-btn {
  width: 32px;
  height: 32px;
  border: 1.5px solid var(--color-border);
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--transition-base);
}
.star-btn:hover { border-color: var(--color-warning); color: var(--color-warning); }
.star-btn.active { border-color: var(--color-warning); background: var(--color-warning); color: #fff; }

/* ---- Add line ---- */
.add-line {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 2px 0;
}
.add-input-wrap { position: relative; flex: 1; min-width: 0; }
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
.add-qty-toggle.active { border-style: solid; border-color: var(--color-primary); color: var(--color-primary); }
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

/* ---- Gekauft block ---- */
.gekauft-section {
  background: var(--color-background-elevated);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}
.gekauft-title {
  margin-bottom: var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-base);
  color: var(--color-text-secondary);
}
.gekauft-list { display: flex; flex-direction: column; gap: var(--spacing-sm); }
.gekauft-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  gap: var(--spacing-sm);
  opacity: 0.75;
  flex-wrap: wrap;
}
.form-check { flex: 1; margin: 0; min-width: 0; }
.form-check-input { cursor: pointer; width: 1.25rem; height: 1.25rem; }
.form-check-label { cursor: pointer; font-size: 1rem; margin-left: var(--spacing-sm); }
.item-info {
  flex: 0 0 100%;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-xs);
  padding-left: 2rem;
}
</style>
