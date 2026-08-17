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
const editingCategory = ref<{ name: string; count: number; purchasedCount: number } | null>(null)
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
 * Sobald in der Liste das erste Produkt gekauft ist, räumen sich ALLE
 * Add-Zeilen weg — nicht nur die der betroffenen Kategorie. Abhaken heißt, dass
 * der Einkauf läuft; dann zählt die Liste und nicht das Eintragen, und acht
 * Schreibzeilen zwischen den Produktzeilen sind genau die Unruhe, die dabei
 * stört. Das Plus in der Kopfzeile holt eine einzelne Zeile gezielt zurück
 * (Muster aus der Packliste), die obere Leiste bleibt ohnehin sichtbar.
 *
 * Der Zustand hängt an `purchasedItems` und damit an `currentListItems` — er
 * ist auf die aktuelle Liste beschränkt und löst sich von selbst wieder, sobald
 * nichts mehr gekauft ist (Rückgängig im Grace-Fenster, geleerter
 * Gekauft-Block, Listenwechsel).
 *
 * ENTSCHEIDUNG DES NUTZERS — bitte nicht „reparieren":
 *
 * 1. Die Schreibzeilen bleiben weg, bis jemand das Plus im Kategoriekopf
 *    drückt — über Neuladen und über Tage hinweg. Das ist gewollt und kein
 *    vergessener Reset. Weil der Zustand aus den Daten abgeleitet ist, hält er
 *    ohne Speicherung: solange in der Liste etwas als gekauft steht, sind die
 *    Zeilen fort. `forcedAddOpen` ist bewusst nur für die Sitzung — ein per
 *    Plus zurückgeholtes Feld ist eine einmalige Ausnahme, kein neuer
 *    Dauerzustand. Also KEIN Zurücksetzen beim Laden einbauen.
 *
 * 2. Die Regel gilt in BEIDEN Aussehen. Sie beschreibt den Ablauf beim
 *    Einkaufen, nicht das Aussehen, und steht deshalb absichtlich hier in
 *    TypeScript ohne jede Kopplung an `data-design`. Das „klassische Aussehen
 *    bleibt unverändert" aus Ticket 01 gilt ab hier nur noch optisch — auch das
 *    ist bewusst so entschieden.
 */
const purchasedPerCategory = computed(() => shoppingStore.purchasedPerCategory)
const anythingPurchased = computed(() => shoppingStore.purchasedItems.length > 0)

const isAddOpen = (group: ShoppingCategoryGroup): boolean =>
  forcedAddOpen.value.has(group.key) || !anythingPurchased.value

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
  // Die gekauften Produkte zählen mit: sie tragen die Kategorie weiter und
  // verlieren beim Löschen ihre Zuordnung. Eine Kategorie mit gekauften
  // Produkten ist also nicht „leer" und darf nicht ohne Rückfrage weg.
  editingCategory.value = {
    name: group.category,
    count: group.total,
    purchasedCount: purchasedPerCategory.value.get(group.key) ?? 0,
  }
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
/** Kurz nach dem Ablegen hervorgehoben, damit der Sprung an den alphabetischen
 *  Platz nachvollziehbar bleibt. */
const justMovedId = ref<string | null>(null)
let moveHighlightTimer: number | null = null

const { bind: bindDrag } = useCategoryDrag({
  group: 'shopping-items',
  categoryOf: (el) => el.dataset.catName || null,
  onMove: (itemId, category) => {
    justMovedId.value = itemId
    if (moveHighlightTimer !== null) clearTimeout(moveHighlightTimer)
    moveHighlightTimer = window.setTimeout(() => { justMovedId.value = null }, 600)
    shoppingStore.updateItem(itemId, { category })
  },
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
/** Aufgeklappte Kauf-Historie im Gekauft-Block (eine zur Zeit). */
const historyOpenId = ref<string | null>(null)
const toggleHistory = (itemId: string) => {
  historyOpenId.value = historyOpenId.value === itemId ? null : itemId
}

/** Kauf-Historie — aufgeklappt unter der Zeile, zusätzlich als Tooltip. */
const purchaseHistory = (item: ShoppingItem) => {
  const parts = [`${item.times_purchased}x gekauft`]
  if (item.last_purchased_at) parts.push(formatDate(item.last_purchased_at))
  if (item.last_purchased_by) parts.push(getMemberName(item.last_purchased_by))
  return parts.join(' · ')
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
      <div class="list-chip-bar">
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

      <!-- Kein Sync-Banner im Seiteninhalt: es schob beim Abhaken alles darunter
           nach unten. Der Zustand steht jetzt im Header (SyncIndicator). -->

      <!-- Keine Listen vorhanden -->
      <div v-if="shoppingStore.lists.length === 0 && !shoppingStore.isLoading" class="empty-state">
        <i class="bi bi-cart-x"></i>
        <p>Noch keine Einkaufsliste vorhanden</p>
        <button class="btn btn-primary" @click="showCreateListModal = true">
          <i class="bi bi-plus-lg me-1"></i> Liste erstellen
        </button>
      </div>

      <template v-else-if="shoppingStore.currentListId">
        <!-- `.sheet` ist im klassischen Aussehen ein reiner Gruppierungs-Container
             ohne einen einzigen Style. Im Pinnwand-Aussehen wird daraus das eine
             Blatt Papier, auf dem die ganze Liste steht. -->
        <div class="sheet">
        <!-- Obere Leiste: Produkt · Menge · Zielkategorie · Hinzufügen · Kategorie anlegen -->
        <div class="search-container">
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
                <!-- Die Kopfzeile ist selbst Ablageziel: eine eingeklappte
                     Kategorie hat sonst keine Fläche zum Hineinziehen. -->
                <div
                  class="cat-header"
                  :ref="(el) => setDropEl(`${group.key}::head`, el)"
                  :data-cat-name="group.category ?? ''"
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
                    :data-item-id="item.purchased ? null : item.shopping_item_id"
                    :checked="item.purchased"
                    :name="item.name"
                    :class="{
                      'row-priority': item.is_priority && !item.purchased,
                      'row-moved': item.shopping_item_id === justMovedId,
                    }"
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
                    <!-- Leeres Kaestchen: haelt die Schreibzeile im Pinnwand-Aussehen
                         in derselben Spur wie die Produktzeilen darueber. Im
                         klassischen Aussehen `display: none`. -->
                    <span class="add-ghost-box" aria-hidden="true"></span>
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

              </div>

              <!-- Gekauft (globaler Block) — dieselbe kompakte Zeile wie oben.
                   Der Zähler ist ein Knopf: er klappt die Kauf-Historie unter der
                   Zeile auf. Ein Tooltip allein wäre auf dem Handy unerreichbar —
                   es gibt kein Hover, Long-Press ist im Einkauf belegt und ein Tap
                   auf die Zeile holt das Produkt zurück. -->
              <div class="gekauft-section" v-if="gekauftItems.length > 0">
                <h3 class="gekauft-title">
                  <i class="bi bi-check-circle"></i> Gekauft ({{ gekauftItems.length }})
                </h3>
                <div class="gekauft-list">
                  <div
                    v-for="item in gekauftItems"
                    :key="item.shopping_item_id"
                    class="bought-entry"
                  >
                    <ListItemRow
                      :checked="true"
                      :name="item.name"
                      :title="purchaseHistory(item)"
                      @toggle="onGekauftToggle(item)"
                      @edit="openItemEdit(item)"
                    >
                      <template #trailing>
                        <span v-if="item.quantity > 1" class="qty-badge">×{{ item.quantity }}</span>
                        <button
                          class="bought-count-btn"
                          :class="{ open: historyOpenId === item.shopping_item_id }"
                          :title="purchaseHistory(item)"
                          :aria-expanded="historyOpenId === item.shopping_item_id"
                          @click="toggleHistory(item.shopping_item_id)"
                        >
                          {{ item.times_purchased }}×
                        </button>
                        <button
                          class="bought-delete-btn"
                          title="Löschen"
                          aria-label="Löschen"
                          @click="shoppingStore.deleteItem(item.shopping_item_id)"
                        >
                          <i class="bi bi-trash"></i>
                        </button>
                      </template>
                    </ListItemRow>
                    <p v-if="historyOpenId === item.shopping_item_id" class="bought-history">
                      {{ purchaseHistory(item) }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Leere Liste: bisher stand hier nur die eingeklappte Kopfzeile
                   „Unkategorisiert" (der Store haelt diesen Eimer immer vor) und
                   sonst nichts. Im klassischen Aussehen bleibt das so
                   (`display: none`), im Pinnwand-Aussehen zeigt das Blatt seinen
                   leeren Zustand an. -->
              <p v-if="shoppingStore.currentListItems.length === 0" class="list-empty">
                — nichts notiert —
              </p>
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
        </div>
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
    :purchased-count="editingCategory.purchasedCount"
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
/* `margin-bottom` steht hier statt als Bootstraps `.mb-3` im Template: `.mb-3`
   ist bei Bootstrap `!important` und liesse sich vom Pinnwand-Aussehen nicht
   mehr auf null ziehen. Der Wert ist identisch mit `.mb-3` (1rem). */
.list-chip-bar {
  background: var(--color-background-elevated);
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm);
  margin-bottom: 1rem;
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
.search-container { position: relative; margin-bottom: 1rem; }

/* Nur im Pinnwand-Aussehen sichtbar (siehe unten). */
.add-ghost-box { display: none; }
.list-empty { display: none; }

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

/* ---- Seitenrand: 8px statt Bootstrap-Gutter (12px) ---- */
.container-fluid {
  padding-left: 8px;
  padding-right: 8px;
}

/* ---- Category Section ----
   Etappe 2: die Sektions-Box entfällt vollständig — kein Rahmen, kein
   Hintergrund, kein Innenabstand. Die Kategorie wird nur noch durch ihre
   Kopfzeile auf dem Seitenhintergrund und den größeren Abstand nach unten
   gegen die nächste abgegrenzt. */
.cat-section {
  margin-bottom: 8px;
  scroll-margin-top: 72px;
}
.cat-uncategorized { opacity: 0.92; }
/* Kopfzeile ohne Box: 30px Mindesthöhe, die volle Breite bleibt Trefferfläche
   zum Auf- und Zuklappen. */
.cat-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  width: 100%;
  padding: 0 4px 0 2px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--color-text-primary);
  min-height: 30px;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.cat-header:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.cat-header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
/* 12px Abstand ist Bedingung, keine Optik: jede Trefferfläche wächst um 5px
   zur Seite. Bei weniger Abstand überlappen sie sich und der Griff aufs Plus
   landet auf „Kategorie bearbeiten". */
.cat-icon-btn {
  position: relative;
  background: none;
  border: none;
  padding: 0;
  width: 30px;
  height: 28px;
  cursor: pointer;
  color: var(--color-text-muted);
  opacity: 0.6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-md);
  border-radius: var(--radius-sm);
}
/* Die Trefferfläche wächst über den Knopf hinaus auf --touch-target-dense,
   ohne die schlanke Kopfzeile wieder auseinanderzuziehen. */
.cat-icon-btn::after {
  content: '';
  position: absolute;
  inset: -6px -5px;
}
.cat-icon-btn:hover { opacity: 1; color: var(--color-primary); }
.cat-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
/* Frisch verschobenes Produkt kurz hervorheben: es springt nach dem Loslassen
   an seinen alphabetischen Platz, der Sprung soll nachvollziehbar bleiben. */
.row-moved { animation: row-moved 600ms ease-out; }
@keyframes row-moved {
  from { background: var(--color-primary-subtle, rgba(99, 102, 241, 0.18)); }
  to { background: transparent; }
}
.cat-name { font-weight: 600; font-size: var(--font-base); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-uncategorized .cat-name { color: var(--color-text-muted); font-weight: 500; }
/* Anzahl als dezentes Badge statt als zweite Überschrift. */
.cat-count {
  font-size: var(--font-xs);
  color: var(--color-text-secondary);
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0 6px;
  margin-right: 6px;
}
.cat-chevron { color: var(--color-text-muted); font-size: var(--font-sm); }
.cat-body {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
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
/* 30×30 sichtbar, 40×40 treffbar. Der Chip-Look bleibt: der Prioritätszustand
   soll als gefüllte Fläche ablesbar sein, nicht nur als gelbes Icon. */
.star-btn {
  position: relative;
  width: 30px;
  height: 30px;
  border: 1.5px solid var(--color-border);
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: var(--font-sm);
  transition: all var(--transition-base);
}
.star-btn::after {
  content: '';
  position: absolute;
  inset: -6px;
}
.star-btn:hover { border-color: var(--color-warning); color: var(--color-warning); }
.star-btn.active { border-color: var(--color-warning); background: var(--color-warning); color: #fff; }

/* ---- Add line ---- */
.add-line {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
}
.add-input-wrap { position: relative; flex: 1; min-width: 0; }
.add-input {
  width: 100%;
  height: 34px;
  border: 1px dashed var(--color-border-hover);
  background: transparent;
  border-radius: var(--radius-sm);
  padding: 0 10px;
  font-size: var(--font-base);
  color: var(--color-text-primary);
}
.add-input:focus { outline: none; border-color: var(--color-primary); border-style: solid; }
.add-qty-toggle {
  flex-shrink: 0;
  min-width: 32px;
  height: 34px;
  padding: 0 6px;
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
  width: 48px;
  height: 34px;
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
  width: 34px;
  height: 34px;
  border: none;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.add-confirm:disabled { opacity: 0.4; cursor: not-allowed; }

/* ---- Gekauft block ---- */
.gekauft-section {
  margin-top: 8px;
}
.gekauft-title {
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-base);
  color: var(--color-text-secondary);
  min-height: 30px;
}
.gekauft-list { display: flex; flex-direction: column; gap: 4px; }
.bought-entry { display: flex; flex-direction: column; }

/* Zähler als Aufklapp-Knopf: 30×30 sichtbar, 42×42 treffbar. */
.bought-count-btn {
  position: relative;
  min-width: 30px;
  height: 30px;
  padding: 0 4px;
  border: 1.5px solid var(--color-border);
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.bought-count-btn::after {
  content: '';
  position: absolute;
  inset: -6px;
}
.bought-count-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
.bought-count-btn.open {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

/* Direkter Papierkorb: ein Tap zum Löschen, 30×38 sichtbar, 40×40 treffbar. */
.bought-delete-btn {
  position: relative;
  width: 30px;
  height: 38px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: var(--font-md);
}
.bought-delete-btn::after {
  content: '';
  position: absolute;
  inset: -1px -5px;
}
.bought-delete-btn:hover { color: var(--color-danger); }

.bought-history {
  margin: 2px 0 0;
  padding: 0 10px;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
}

/* ==========================================================================
   PINNWAND-AUSSEHEN — „Der lange Zettel" (Vorlage: Prototyp-Variante A)
   --------------------------------------------------------------------------
   Alles ab hier haengt an `:root[data-design='pinnwand']`. Ohne das Attribut
   greift keine einzige Regel — das klassische Aussehen oben bleibt Wort fuer
   Wort der Normalfall.

   ADDITIV, NICHT UMGEBAUT: die geteilten Bausteine (`ListItemRow`,
   `CategoryCombobox`) werden ausschliesslich ueber `:deep()` unterhalb von
   `.sheet` angefasst. `.sheet` gibt es nur in dieser View, also kann keine
   dieser Regeln die Packliste oder das To-do erreichen — die benutzen dieselben
   Komponenten ueber `ChecklistView.vue` und bleiben unveraendert, bis sie ihre
   eigenen Tickets (02/03) bekommen.

   Die einzige geteilte Datei, die dieses Ticket wirklich umbaut, ist
   `pinnwand.css` (Eingabefeld-Selektoren, Rail-Kontrast) — dort steht jeweils
   die Begruendung.
   ========================================================================== */

/* ---- Listenwechsel: Klebestreifen-Reiter an der Blattkante ---------------- */
:root[data-design='pinnwand'] .list-chip-bar {
  background: none;
  border-radius: 0;
  padding: 0 4px;
  /* Die Reiter kleben auf der Oberkante des Blattes. */
  margin-bottom: -6px;
  position: relative;
  z-index: 2;
}
:root[data-design='pinnwand'] .list-chip-container {
  gap: 6px;
  padding: 0;
  align-items: flex-end;
}
:root[data-design='pinnwand'] .list-chip {
  min-height: var(--touch-target-min);
  padding: 4px 12px 10px;
  border: 2px solid var(--pw-line);
  border-bottom: none;
  border-radius: 0;
  background: var(--pw-tape);
  color: var(--pw-ink);
  font-weight: 700;
  transform: rotate(-0.6deg);
  transition: none;
}
:root[data-design='pinnwand'] .list-chip:hover {
  border-color: var(--pw-line);
  color: var(--pw-ink);
}
/* Aktiv = derselbe Papierton wie das Blatt darunter, zwei Pixel tiefer gesetzt
   und fetter: der Reiter geht in das Blatt ueber, statt darauf zu liegen. */
:root[data-design='pinnwand'] .list-chip.active {
  background: var(--pw-paper);
  color: var(--pw-ink);
  font-weight: 800;
  transform: translateY(2px);
  padding-bottom: 12px;
}
:root[data-design='pinnwand'] .list-chip.add-chip {
  background: var(--pw-cork-deep);
  color: var(--pw-ink);
  padding: 4px 12px 10px;
}
:root[data-design='pinnwand'] .list-chip.add-chip:hover {
  background: var(--pw-tape);
  color: var(--pw-ink);
}
/* Der Stift im Reiter mass 12×12px. Sichtbar bleibt er klein, treffbar wird er
   ueber das Pseudo-Element — 28 + 2×10 = 48px in beiden Richtungen. */
:root[data-design='pinnwand'] .chip-edit-btn {
  position: relative;
  width: 28px;
  height: 28px;
  justify-content: center;
  margin-left: 4px;
  opacity: 1;
  color: var(--pw-ink);
  font-size: var(--font-sm);
}
:root[data-design='pinnwand'] .chip-edit-btn::after {
  content: '';
  position: absolute;
  inset: -10px;
}

/* ---- Das Blatt ----------------------------------------------------------
   Der Kontrast entsteht nicht mehr aus einer Fuellung gegen Kork, sondern aus
   einer Papierflaeche mit harter Tintenkante. Seiten hart geschnitten, oben und
   unten abgerissen. */
:root[data-design='pinnwand'] .sheet {
  position: relative;
  background: var(--pw-paper);
  border-left: 2px solid var(--pw-line);
  border-right: 2px solid var(--pw-line);
  box-shadow: 3px 3px 0 var(--pw-line);
  padding: 14px 8px 18px;
  margin-top: 10px;
  margin-bottom: 14px;
}
/* Abrisskante: Papierzacken auf einer um 2px versetzten Tintenzacke. */
:root[data-design='pinnwand'] .sheet::before,
:root[data-design='pinnwand'] .sheet::after {
  content: '';
  position: absolute;
  left: -2px;
  right: -2px;
  height: 10px;
  background:
    linear-gradient(135deg, var(--pw-paper) 50%, transparent 50%) 0 0 / 14px 10px repeat-x,
    linear-gradient(-135deg, var(--pw-paper) 50%, transparent 50%) 7px 0 / 14px 10px repeat-x,
    linear-gradient(135deg, var(--pw-line) 50%, transparent 50%) 0 2px / 14px 10px repeat-x,
    linear-gradient(-135deg, var(--pw-line) 50%, transparent 50%) 7px 2px / 14px 10px repeat-x;
  pointer-events: none;
}
:root[data-design='pinnwand'] .sheet::before { top: -10px; transform: scaleY(-1); }
:root[data-design='pinnwand'] .sheet::after { bottom: -10px; }

/* ---- Obere Leiste auf dem Blatt ------------------------------------------ */
:root[data-design='pinnwand'] .search-container {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed rgba(36, 31, 26, 0.35);
}
:root[data-design='pinnwand'] .top-bar { gap: 6px; }
:root[data-design='pinnwand'] .top-name-input {
  height: 44px;
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-paper);
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .top-qty-toggle,
:root[data-design='pinnwand'] .top-qty-input {
  position: relative;
  height: 44px;
  min-width: 44px;
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-tape);
  color: var(--pw-ink);
  font-weight: 800;
}
:root[data-design='pinnwand'] .top-qty-toggle.active {
  border-color: var(--pw-line);
  color: var(--pw-ink);
}
/* 44px sichtbar, 48px treffbar — wie die Knoepfe daneben. */
:root[data-design='pinnwand'] .top-qty-toggle::after {
  content: '';
  position: absolute;
  inset: -2px;
}
/* 44px sichtbar, 48px treffbar. Nicht 48px sichtbar, weil die Leiste einzeilig
   bleibt und die drei festen Knoepfe sich die Breite mit Produktfeld und
   Kategorie teilen.
   Gemessen (Container kuenstlich verengt, Media Queries feuern dabei nicht):
   bei 320px laeuft nichts ueber; die Kategorie-Kopfzeile beginnt ab rund 308px
   zu ueberlaufen, bei 220px die obere Leiste um 44px und das Blatt um 48px.
   Echte Geraete gehen nicht unter 320px — die Zahlen stehen hier als
   gemessener Rand, nicht als gerechneter. */
:root[data-design='pinnwand'] .top-btn {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 2px;
  border: 2px solid var(--pw-line);
  box-shadow: 2px 2px 0 var(--pw-line);
}
:root[data-design='pinnwand'] .top-btn::after {
  content: '';
  position: absolute;
  inset: -2px;
}
:root[data-design='pinnwand'] .top-btn:active {
  transform: translate(2px, 2px);
  box-shadow: 0 0 0 var(--pw-line);
}
:root[data-design='pinnwand'] .top-add {
  background: var(--pw-accent);
  color: var(--pw-paper);
}
:root[data-design='pinnwand'] .top-new-cat {
  background: var(--pw-paper);
  color: var(--pw-ink);
}
/* Deaktiviert heisst nicht unsichtbar. Das klassische `opacity: 0.4` drueckte
   das weisse Plus auf dem blauen Grund auf 1,35:1 — man sah nicht mehr, dass da
   ueberhaupt ein Knopf ist. Statt zu blenden wird umgefaerbt: Packpapier mit
   gedaempfter Tinte, volle Deckkraft, ~5:1. Die blaue Fuellung faellt weg, der
   Knopf wirkt dadurch klar inaktiv und bleibt trotzdem erkennbar. */
:root[data-design='pinnwand'] .top-add:disabled,
:root[data-design='pinnwand'] .add-confirm:disabled {
  opacity: 1;
  background: var(--pw-cork-deep);
  color: var(--pw-ink-soft);
}
:root[data-design='pinnwand'] .top-new-cat:hover {
  background: var(--pw-tape);
  border-color: var(--pw-line);
  color: var(--pw-ink);
}
/* Das Kategoriefeld traegt seinen Rahmen am Wrapper, nicht am `input`. */
:root[data-design='pinnwand'] .top-combo :deep(.combo-field) {
  min-height: 44px;
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-paper);
}
/* Ohne diese Regel hatte das Feld hier ueberhaupt keinen Fokuszustand:
   `.combo-field:focus-within` aus `CategoryCombobox.vue` ist (0,3,0), die Regel
   direkt darueber ist (0,5,0) und ueberschreibt die Rahmenfarbe in beiden
   Zustaenden. Ueberall sonst — im Modal und im klassischen Aussehen — traegt
   `:focus-within` den Zustand weiterhin allein; nur an dieser einen Stelle hat
   meine eigene, spezifischere Regel sie geschlagen. Deshalb der Ausgleich
   genau hier, in derselben Optik wie die Felder daneben. */
:root[data-design='pinnwand'] .top-combo :deep(.combo-field:focus-within) {
  border-color: var(--pw-accent);
  box-shadow: 0 0 0 3px rgba(43, 74, 143, 0.15);
}
:root[data-design='pinnwand'] .top-combo :deep(.combo-dot) {
  border-radius: 0;
  border: 1.5px solid var(--pw-line);
  width: 11px;
  height: 11px;
}
:root[data-design='pinnwand'] .top-combo :deep(.combo-clear) {
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .sheet :deep(.combo-list),
:root[data-design='pinnwand'] .sheet .suggestions-dropdown {
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-paper);
  box-shadow: var(--pw-shadow);
}
:root[data-design='pinnwand'] .sheet .suggestion-item {
  color: var(--pw-ink);
  border-bottom-color: rgba(36, 31, 26, 0.2);
  min-height: var(--touch-target-min);
}

/* ---- Kategorie = Ueberschrift mit doppelter Tintenlinie, keine Box -------- */
:root[data-design='pinnwand'] .cat-section { margin-bottom: 18px; }
/* Das klassische `opacity: 0.92` verduennt jeden Kontrast in der Sektion. */
:root[data-design='pinnwand'] .cat-uncategorized { opacity: 1; }
:root[data-design='pinnwand'] .cat-header {
  min-height: 40px;
  margin-bottom: 4px;
  padding: 0 2px 3px;
  border-bottom: 3px double var(--pw-line);
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .cat-name {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .cat-uncategorized .cat-name {
  color: var(--pw-ink-soft);
  font-weight: 700;
}
/* Die Kategoriefarbe bleibt als kleine gestempelte Marke erhalten — sie traegt
   keinen Text und ist damit nicht kontrastpflichtig, aber sie haelt die
   Farbkodierung, die die Rail rechts weiterfuehrt. Bewusste Abweichung von der
   Vorlage A, die den Punkt ganz strich. */
:root[data-design='pinnwand'] .cat-dot {
  width: 11px;
  height: 11px;
  border-radius: 0;
  border: 1.5px solid var(--pw-line);
}
:root[data-design='pinnwand'] .cat-count {
  background: none;
  border: none;
  border-radius: 0;
  padding: 0;
  color: var(--pw-ink);
  font-size: var(--font-sm);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
:root[data-design='pinnwand'] .cat-chevron { color: var(--pw-ink); }
/* 18px Abstand + 9px seitliche Erweiterung = 48×48px Trefferflaeche, die sich
   gerade beruehrt statt zu ueberlappen. Im klassischen Aussehen bleiben es 12px
   Abstand und 40×40. */
:root[data-design='pinnwand'] .cat-header-right { gap: 18px; }
:root[data-design='pinnwand'] .cat-icon-btn {
  color: var(--pw-ink);
  opacity: 1;
}
:root[data-design='pinnwand'] .cat-icon-btn::after { inset: -10px -9px; }

/* ---- Produktzeile: kein Rahmen, kein Hintergrund — Schrift auf Papier ----- */
:root[data-design='pinnwand'] .cat-body { gap: 0; }
:root[data-design='pinnwand'] .sheet :deep(.list-row) {
  min-height: var(--touch-target-min);
  padding: 0 2px;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(36, 31, 26, 0.16);
  border-radius: 0;
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .sheet :deep(.list-row:hover) {
  background: rgba(36, 31, 26, 0.04);
}
/* Ein abgehakter Artikel bleibt lesbar: durchgestrichen und eine Spur leiser,
   aber nicht auf 55 % heruntergeblendet. */
:root[data-design='pinnwand'] .sheet :deep(.list-row.checked) { opacity: 1; }
:root[data-design='pinnwand'] .sheet :deep(.list-row.checked .list-name) {
  color: var(--pw-ink-soft);
  text-decoration: line-through 2px var(--pw-line);
}
:root[data-design='pinnwand'] .sheet :deep(.list-check) {
  width: 22px;
  height: 22px;
  border: 2px solid var(--pw-line);
  border-radius: 0;
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .sheet :deep(.list-check.on) {
  background: none;
  border-color: var(--pw-line);
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .sheet :deep(.row-trailing) { gap: 18px; }
:root[data-design='pinnwand'] .sheet :deep(.row-edit-btn) {
  width: 30px;
  height: 30px;
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .sheet :deep(.row-edit-btn)::after { inset: -9px; }
/* Prioritaet ohne Rahmen: die Zeile hat keinen mehr. Rot unterstrichen wie im
   Original — der Text bleibt Tinte, das Rot traegt keine Information allein
   (das Sternchen daneben tut es). */
:root[data-design='pinnwand'] .sheet :deep(.row-priority .list-name) {
  text-decoration: underline 2px #b03a28;
  text-underline-offset: 3px;
}
/* Die Prioritaet stand doppelt: `.row-priority` weiter oben faerbt mit
   `!important` die Rahmenfarbe, und im Blatt ist der einzige Rahmen die
   Trennlinie unter der Zeile — die wurde also bernsteinfarben, zusaetzlich zur
   roten Unterstreichung. Gegen `!important` hilft nur `!important`; die
   Trennlinie bleibt Trennlinie, die Unterstreichung traegt das Signal. */
:root[data-design='pinnwand'] .sheet :deep(.list-row.row-priority) {
  border-bottom-color: rgba(36, 31, 26, 0.16) !important;
}

/* Menge: umrandeter Chip auf Klebebandgelb (uebernommen aus Variante C — er hat
   eine echte Flaeche und ist damit ablesbar, wo A nur einen roten Randvermerk
   hatte). */
:root[data-design='pinnwand'] .sheet .qty-badge {
  min-width: 0;
  padding: 2px 6px;
  border: 1.5px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-tape);
  color: var(--pw-ink);
  font-weight: 800;
  box-shadow: none;
}
/* 30px sichtbar, 48px treffbar. */
:root[data-design='pinnwand'] .sheet .star-btn {
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: none;
  color: var(--pw-ink);
  transition: none;
}
:root[data-design='pinnwand'] .sheet .star-btn::after { inset: -9px; }
:root[data-design='pinnwand'] .sheet .star-btn:hover,
:root[data-design='pinnwand'] .sheet .star-btn.active {
  border-color: var(--pw-line);
  background: var(--pw-tape);
  color: var(--pw-ink);
}

/* ---- Naechste freie Zeile statt Formularfeld ----------------------------- */
:root[data-design='pinnwand'] .add-line {
  gap: 8px;
  min-height: var(--touch-target-min);
}
:root[data-design='pinnwand'] .add-ghost-box {
  display: block;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 2px dashed var(--pw-line);
  opacity: 0.45;
}
:root[data-design='pinnwand'] .add-input {
  height: 40px;
  padding: 0 2px;
  border: none;
  border-bottom: 1px dashed rgba(36, 31, 26, 0.5);
  border-radius: 0;
  background: none;
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .add-input:focus {
  border-color: transparent;
  border-bottom: 2px solid var(--pw-line);
}
:root[data-design='pinnwand'] .add-qty-toggle,
:root[data-design='pinnwand'] .add-qty-input {
  position: relative;
  height: 40px;
  min-width: 40px;
  border: 1.5px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-tape);
  color: var(--pw-ink);
  font-weight: 800;
}
:root[data-design='pinnwand'] .add-qty-toggle::after {
  content: '';
  position: absolute;
  inset: -4px;
}
:root[data-design='pinnwand'] .add-qty-toggle:hover,
:root[data-design='pinnwand'] .add-qty-toggle.active {
  border-color: var(--pw-line);
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .add-confirm {
  position: relative;
  width: 44px;
  height: 44px;
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-accent);
  color: var(--pw-paper);
  box-shadow: 2px 2px 0 var(--pw-line);
}
:root[data-design='pinnwand'] .add-confirm::after {
  content: '';
  position: absolute;
  inset: -2px;
}

/* ---- Gekauftes: ruhiger Block auf demselben Blatt, kein Abrissstapel ------ */
:root[data-design='pinnwand'] .gekauft-section {
  margin-top: 20px;
}
:root[data-design='pinnwand'] .gekauft-title {
  min-height: 40px;
  padding-bottom: 3px;
  border-bottom: 3px double var(--pw-line);
  color: var(--pw-ink);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
:root[data-design='pinnwand'] .gekauft-list { gap: 0; }
:root[data-design='pinnwand'] .bought-count-btn {
  min-width: 34px;
  height: 30px;
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: none;
  color: var(--pw-ink);
  font-weight: 700;
}
:root[data-design='pinnwand'] .bought-count-btn::after { inset: -9px -7px; }
:root[data-design='pinnwand'] .bought-count-btn:hover,
:root[data-design='pinnwand'] .bought-count-btn.open {
  border-color: var(--pw-line);
  background: var(--pw-tape);
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .bought-delete-btn {
  width: 30px;
  height: 30px;
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .bought-delete-btn::after { inset: -9px; }
:root[data-design='pinnwand'] .bought-history { color: var(--pw-ink-soft); }

/* ---- Leeres Blatt -------------------------------------------------------- */
:root[data-design='pinnwand'] .list-empty {
  display: block;
  margin: 8px 0 0 30px;
  color: var(--pw-ink-soft);
  font-size: var(--font-md);
  font-style: italic;
}
</style>
