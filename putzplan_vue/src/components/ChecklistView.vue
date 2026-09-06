<script setup lang="ts">
/**
 * Shared **Checkliste** screen: list chips, progress, list note, category
 * sections with entries ("Einträge"), quick-nav rail and all modals.
 *
 * Everything list-type-specific arrives via props: the store instance (from
 * `createChecklistStore`) and the labels/icons. `PackingView` is a thin shell
 * around this; Etappe 5 Teil B docks the To-do view on the same seam.
 */
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import type { ChecklistStore } from '@/stores/createChecklistStore'
import type { CategoryGroup, ChecklistItem } from '@/types/Checklist'
import type { ImportSource } from '@/types/CategoryImport'
import { categoryColor } from '@/lib/categoryColor'
import { categoryRank, compareCategoryGroups, normalizeCategoryName } from '@/lib/categoryOrder'
import { useGraceWindow } from '@/composables/useGraceWindow'
import { useCategoryRail } from '@/composables/useCategoryRail'
import { useCategoryDrag } from '@/composables/useCategoryDrag'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import ListEditModal from '@/components/ListEditModal.vue'
import ChecklistItemEditModal from '@/components/ChecklistItemEditModal.vue'
import ChecklistItemRow from '@/components/ChecklistItemRow.vue'
import CategoryRail from '@/components/CategoryRail.vue'
import CategoryCreateModal from '@/components/CategoryCreateModal.vue'
import CategoryEditModal from '@/components/CategoryEditModal.vue'
import ListAddBar from '@/components/ListAddBar.vue'
import LongSheet from '@/components/LongSheet.vue'

export interface ChecklistLabels {
  /** Title of the "new list" modal, e.g. 'Neue Packliste'. */
  createListTitle: string
  /** Tooltip of the "+" chip, e.g. 'Neue Packliste erstellen'. */
  createListChipTitle: string
  /** Name-field placeholder in the "new list" modal. */
  createListNamePlaceholder: string
  /** Bootstrap icon class for the empty state, e.g. 'bi-bag-x'. */
  emptyIcon: string
  /** Empty-state text, e.g. 'Noch keine Packliste vorhanden'. */
  emptyText: string
  /** Word after the X/Y progress count, e.g. 'gepackt'. */
  progressVerb: string
  /** Placeholder der oberen Leiste, z. B. 'Gegenstand hinzufügen…'. */
  addPlaceholder: string
  /** Wortwahl eines Eintrags, z. B. { one: 'Gegenstand', many: 'Gegenstände' }. */
  itemNoun: { one: string; many: string }
  /** Beiwort der erledigten Einträge, Mehrzahl: 'gepackte' / 'erledigte'. */
  doneMany: string
  /** Dasselbe in der Einzahl: 'gepackter Gegenstand' / 'erledigter Eintrag'. */
  doneOne: string
  /** Bootstrap icon class of the list-note block. */
  notesIcon: string
  /** Title of the list-note block, e.g. 'Reise-Notizen'. */
  notesTitle: string
  /** Placeholder of the list-note textarea. */
  notesPlaceholder: string
  /** Body text of the reset confirmation modal. */
  resetConfirmBody: string
}

const props = defineProps<{
  /** Instance created via `createChecklistStore`. */
  store: ChecklistStore
  labels: ChecklistLabels
  /** localStorage key for the rail's collapsed state (one per list type). */
  railStorageKey: string
}>()

const store = props.store
const { isOnline } = useNetworkStatus()

// --- Modals -----------------------------------------------------------------
const showCreateListModal = ref(false)
const newListName = ref('')
const isCreatingList = ref(false)
const copySourceId = ref('') // '' = empty list
const showListEditModal = ref(false)
const editingList = ref<{ list_id: string; name: string } | null>(null)
const showResetConfirm = ref(false)
const showCategoryCreate = ref(false)
const editingItem = ref<ChecklistItem | null>(null)
const editingCategory = ref<{ name: string; count: number; doneCount: number } | null>(null)

// --- Per-section UI state (session-only, reset on list switch) ---------------
const addDraft = ref<Record<string, string>>({})
const addQty = ref<Record<string, number>>({})
const qtyFieldOpen = ref<Set<string>>(new Set())
const forcedAddOpen = ref<Set<string>>(new Set())
const sectionOverride = ref<Map<string, boolean>>(new Map())

// --- Gedämpfte (leere) Kategorien — Ticket 05 --------------------------------
// Abgeleiteter Zustand, nichts Gespeichertes: eine Kategorie ohne Einträge
// (`group.total === 0`) ist gedämpft, bis sie in dieser Sitzung angetippt
// wurde. `undampedCategories` hält NUR den Tipp fest — ob eine Kategorie noch
// leer ist, wird live geprüft, sonst würde eine später wieder geleerte
// Kategorie fälschlich normal groß hängen bleiben (siehe Watcher unten).
const undampedCategories = ref<Set<string>>(new Set())
const isCategoryEmpty = (group: CategoryGroup): boolean => group.total === 0
const isCategoryDamped = (group: CategoryGroup): boolean =>
  isCategoryEmpty(group) && !undampedCategories.value.has(group.key)
const touchCategory = (key: string) => {
  undampedCategories.value.add(key)
}

// Focus the number field the moment it appears.
const vFocus = { mounted: (el: HTMLElement) => el.focus() }

// --- Notes ------------------------------------------------------------------
const notesOpen = ref(false)
const notesDraft = ref('')
const notesFocused = ref(false)

watch(
  () => store.currentListId,
  () => {
    addDraft.value = {}
    addQty.value = {}
    qtyFieldOpen.value = new Set()
    suggestFocusKey.value = null
    forcedAddOpen.value = new Set()
    sectionOverride.value = new Map()
    doneOpen.value = new Set()
    undampedCategories.value = new Set()
    clearAllGrace()
    notesDraft.value = store.currentList?.notes ?? ''
    notesOpen.value = false
  },
)

watch(
  () => store.currentList?.notes,
  (notes) => {
    // Don't stomp on the user's in-progress edit when a realtime update arrives.
    if (notesFocused.value) return
    notesDraft.value = notes ?? ''
  },
)

// --- Grace window for freshly-checked items ---------------------------------
// Just-packed items stay visible (struck-through) for a moment so a mis-check
// can be undone quickly, before they fold into the collapsed "erledigt" group.
const { graceIds, markGrace, clearGrace, clearAllGrace } = useGraceWindow(6000)

// --- Angezeigte Sektionen (Gruppierung + Rückgängig-Fenster) -----------------
// Der Store zählt jeden abgehakten Eintrag sofort als erledigt. Solange ein
// Eintrag im Rückgängig-Fenster steht, ist er aber noch sichtbar offen — die
// Sektion darf deshalb weder als „vollständig" gelten noch schon ans Ende
// rutschen. Also `doneCount` hier neu bilden und *danach* mit derselben Regel
// wie der Einkauf sortieren, statt die Reihenfolge nachzubauen.
/**
 * `displaySections`-Eintrag: `doneCount` ist grace-korrigiert (für Sortierung,
 * Rang, Einklappen, Add-Zeile). `rawDoneCount` ist der ungefilterte Store-Wert
 * — die Kopfzeile zeigt ihn sofort an, sonst widerspricht sie 6s lang dem
 * Gesamtfortschritt (`store.overallProgress`), der ebenfalls roh zählt.
 */
export interface DisplayCategoryGroup extends CategoryGroup {
  rawDoneCount: number
}

const displaySections = computed<DisplayCategoryGroup[]>(() =>
  store.itemsByCategory
    .map((g) => {
      const doneCount = g.items.filter((i) => i.packed && !graceIds.value.has(i.item_id)).length
      return {
        ...g,
        doneCount,
        rawDoneCount: g.doneCount,
        isComplete: doneCount === g.total && g.total > 0,
      }
    })
    .sort(compareCategoryGroups),
)

/** Vollständig = keine sichtbar offenen Einträge mehr, aber auch nicht leer. */
const isCategoryComplete = (group: CategoryGroup): boolean => categoryRank(group) === 1

// Sobald eine Kategorie wieder Einträge trägt, verfällt ihr Tipp-Vermerk. Bleibt
// er stehen, würde eine später erneut geleerte Kategorie fälschlich normal groß
// bleiben — der Tipp darf nicht ewig nachwirken.
watch(displaySections, (groups) => {
  for (const group of groups) {
    if (!isCategoryEmpty(group)) undampedCategories.value.delete(group.key)
  }
})

// --- Section open/collapse --------------------------------------------------
// Standard: nur aktive Kategorien (Rang 0) stehen offen. Vollständige und leere
// klappen ein — die eine ist abgearbeitet, die andere hat nichts zu zeigen.
const isSectionOpen = (group: CategoryGroup): boolean => {
  const override = sectionOverride.value.get(group.key)
  return override !== undefined ? override : categoryRank(group) === 0
}

const toggleSection = (group: CategoryGroup) => {
  sectionOverride.value.set(group.key, !isSectionOpen(group))
}

// Ein Tipp auf eine GEDÄMPFTE Kategorie heißt „hier will ich etwas hineinlegen":
// entdämpfen, Abschnitt offen, Eingabezeile offen — über dieselben Session-Refs,
// die `toggleSection`/`isAddOpen` ohnehin schon lesen (`sectionOverride`,
// `forcedAddOpen`), nicht über eine neue Regel. Eine normale (gefüllte oder
// bereits entdämpfte) Kategorie klappt weiterhin ganz gewöhnlich über
// `toggleSection` auf und zu — dort ändert sich nichts.
const onCatHeaderClick = (group: CategoryGroup) => {
  if (isCategoryDamped(group)) {
    touchCategory(group.key)
    sectionOverride.value.set(group.key, true)
    forcedAddOpen.value.add(group.key)
    return
  }
  toggleSection(group)
}

// --- Contextual add line ----------------------------------------------------
// Kategorieweise, nicht listenweit (Entscheidung des Leads, E1): beim Packen
// wird man Kategorie für Kategorie fertig — solange in *dieser* Kategorie noch
// nichts erledigt ist, schreibt man vermutlich noch daran.
const isAddOpen = (group: CategoryGroup): boolean =>
  forcedAddOpen.value.has(group.key) || group.doneCount === 0

// Der Plus-Knopf in der Kopfzeile holt die Zeile auch dann zurück, wenn die
// Sektion gerade eingeklappt ist — sonst schreibt man ins Unsichtbare.
const openAddLine = (group: CategoryGroup) => {
  forcedAddOpen.value.add(group.key)
  sectionOverride.value.set(group.key, true)
}

// --- Name suggestions (from all items across the household's lists) ---------
const suggestFocusKey = ref<string | null>(null)

const suggestionsFor = (group: CategoryGroup): string[] => {
  const q = normalizeCategoryName(addDraft.value[group.key] ?? '')
  if (!q) return []
  const inSection = new Set(group.items.map((i) => normalizeCategoryName(i.name)))
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of store.items) {
    const name = it.name.trim()
    const lower = normalizeCategoryName(name)
    if (!lower.includes(q) || inSection.has(lower) || seen.has(lower)) continue
    seen.add(lower)
    out.push(name)
    if (out.length >= 5) break
  }
  return out
}

const onAddFocus = (key: string) => {
  suggestFocusKey.value = key
}
const onAddBlur = () => {
  setTimeout(() => {
    suggestFocusKey.value = null
  }, 200)
}

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
  await store.addItem(name, group.category, qty)
  addDraft.value[group.key] = ''
  addQty.value[group.key] = 1
  qtyFieldOpen.value.delete(group.key)
}

// --- Obere Leiste -----------------------------------------------------------
/** Namensvorschläge aus allen Listen des Haushalts, höchstens fünf. */
const topNameSuggestions = (query: string): string[] => {
  const q = normalizeCategoryName(query)
  if (!q) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of store.items) {
    const name = it.name.trim()
    const lower = normalizeCategoryName(name)
    if (!lower.includes(q) || seen.has(lower)) continue
    seen.add(lower)
    out.push(name)
    if (out.length >= 5) break
  }
  return out
}

/**
 * Ein getippter Kategoriename, den es noch nicht gibt, wird beim Speichern
 * angelegt. Zurück kommt der kanonische Name der Zeile — so landet „bad" nicht
 * als zweite Schreibweise neben „Bad".
 */
const ensureCategory = async (name: string | null) => {
  if (!name?.trim()) return null
  return await store.createCategory(name)
}

const onTopAdd = async (name: string, quantity: number, category: string) => {
  const target = await ensureCategory(category)
  await store.addItem(name, target, quantity)
}

// --- Item interactions ------------------------------------------------------
const openItemEdit = (item: ChecklistItem) => {
  editingItem.value = item
}

const handleItemSave = async (
  itemId: string,
  patch: { name: string; category: string | null; quantity: number },
) => {
  const category = await ensureCategory(patch.category)
  await store.updateItem(itemId, { ...patch, category })
  editingItem.value = null
}

const handleItemDelete = async (itemId: string) => {
  clearGrace(itemId)
  await store.removeItem(itemId)
  editingItem.value = null
}

const onItemToggle = (item: ChecklistItem) => {
  const willPack = !item.packed
  store.togglePacked(item.item_id)
  if (willPack) markGrace(item.item_id)
  else clearGrace(item.item_id)
}

const onItemIncrement = (item: ChecklistItem) => {
  const willComplete = !item.packed && item.packed_count + 1 >= item.quantity
  store.incrementPacked(item.item_id)
  if (willComplete) markGrace(item.item_id)
}

const onItemDecrement = (item: ChecklistItem) => {
  const wasPacked = item.packed
  store.decrementPacked(item.item_id)
  if (wasPacked) clearGrace(item.item_id)
}

// --- Per-category done grouping ---------------------------------------------
// Rows shown in the open part: unpacked ones plus those still in their undo
// window. Die Zeilen im Rückgängig-Fenster stehen dabei GENAU DA, wo sie als
// offene stünden (nach `created_at`) — nicht hinten angehängt. Hängt man sie an,
// springt die eben angetippte Zeile sofort weg, die nächste rutscht unter den
// Finger und ein nervöser Doppeltipp hakt zwei Einträge ab (Befund F7). Erst
// wenn das Fenster abläuft, wandert die Zeile in den erledigt-Block.
// Reihenfolge wie im Store, nur ohne das Kriterium `packed`: `created_at`, bei
// gleichem Zeitstempel die Reihenfolge der Liste. Der zweite Teil ist nicht
// Zierde — in kopierten und eingespielten Listen tragen viele Einträge
// DENSELBEN Zeitstempel; ohne ihn fällt die Sortierung auf die Reihenfolge von
// `group.items` zurück, und die stellt die erledigten wieder hinten an.
const itemOrder = computed(() => new Map(store.currentListItems.map((i, idx) => [i.item_id, idx])))
const openRows = (group: CategoryGroup): ChecklistItem[] =>
  group.items
    .filter((i) => !i.packed || graceIds.value.has(i.item_id))
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) ||
        (itemOrder.value.get(a.item_id) ?? 0) - (itemOrder.value.get(b.item_id) ?? 0),
    )
// Packed items past their grace window → collapsed into the "erledigt" group.
const doneRows = (group: CategoryGroup): ChecklistItem[] =>
  group.items.filter((i) => i.packed && !graceIds.value.has(i.item_id))

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
  await store.renameList(listId, name)
  showListEditModal.value = false
  editingList.value = null
}

const handleDeleteList = async (listId: string) => {
  await store.deleteList(listId)
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
  // Ohne Guard legt ein Doppeltipp zwei Listen an: der Button ist nur bei leerem
  // Namen gesperrt, und das await auf den Insert laesst den zweiten Klick durch.
  if (isCreatingList.value) return
  isCreatingList.value = true
  try {
    if (copySourceId.value) {
      await store.copyList(copySourceId.value, name)
    } else {
      await store.createList(name)
    }
  } finally {
    isCreatingList.value = false
  }
  newListName.value = ''
  copySourceId.value = ''
  showCreateListModal.value = false
}

const handleReset = async () => {
  if (!store.currentListId) return
  clearAllGrace()
  await store.resetAllUnpacked(store.currentListId)
  showResetConfirm.value = false
}

// --- Kategorien -------------------------------------------------------------
/** Anlegen, Umhängen und Übernehmen in einem Zug — der Store schreibt alles. */
const handleCreateCategory = async (
  name: string,
  itemIds: string[],
  importFrom: ImportSource | null,
) => {
  await store.createCategory(name, itemIds, { importFrom: importFrom ?? undefined })
  showCategoryCreate.value = false
}

/** Einträge der aktuellen Liste in der Gestalt, die die Erstell-Maske braucht. */
const pickableItems = computed(() =>
  store.currentListItems.map((i) => ({
    id: i.item_id,
    name: i.name,
    quantity: i.quantity,
    category: i.category,
    done: i.packed,
  })),
)

const importPreviewFor = (source: ImportSource, name: string) =>
  store.importPreview(source.listId, name).map((i) => ({
    id: i.item_id,
    name: i.name,
    quantity: i.quantity,
    category: i.category,
    done: i.packed,
  }))

const openCategoryEdit = (group: DisplayCategoryGroup) => {
  if (!group.category) return
  // Erledigte zählen getrennt: die zweite Löschvariante nimmt sie mit (E2),
  // und eine Kategorie mit erledigten Einträgen ist nicht „leer". Aus
  // `rawDoneCount` (ungefiltert), nicht dem grace-korrigierten `doneCount` —
  // sonst widerspricht der Hinweistext im Modal bis zu 6 s dem sichtbaren
  // Zustand (ein gerade abgehakter, noch im Rückgängig-Fenster stehender
  // Eintrag zählt hier also schon als erledigt).
  editingCategory.value = {
    name: group.category,
    count: group.total - group.rawDoneCount,
    doneCount: group.rawDoneCount,
  }
}

const handleCategoryRename = async (oldName: string, newName: string) => {
  await store.renameCategory(oldName, newName)
  editingCategory.value = null
}

const handleCategoryDelete = async (name: string, withItems: boolean) => {
  await store.deleteCategory(name, { withItems })
  editingCategory.value = null
}

// --- Ziehen zwischen Kategorien ---------------------------------------------
/** Kurz nach dem Ablegen hervorgehoben, damit der Sprung nachvollziehbar bleibt. */
const justMovedId = ref<string | null>(null)
let moveHighlightTimer: number | null = null

const { bind: bindDrag } = useCategoryDrag({
  // Eigener Gruppenname je Listentyp: Packliste und To-do dürfen einander
  // nichts abgeben, auch wenn beide gleichzeitig im Baum hängen.
  group: `${props.railStorageKey}-items`,
  categoryOf: (el) => el.dataset.catName || null,
  onMove: (itemId, category) => {
    justMovedId.value = itemId
    if (moveHighlightTimer !== null) clearTimeout(moveHighlightTimer)
    moveHighlightTimer = window.setTimeout(() => {
      justMovedId.value = null
    }, 600)
    store.moveItemToCategory(itemId, category)
  },
})

const setDropEl = (key: string, el: unknown) => {
  bindDrag(key, el instanceof HTMLElement ? el : null)
}

// --- Notes ------------------------------------------------------------------
const saveNotes = () => {
  notesFocused.value = false
  if (!store.currentListId) return
  if ((store.currentList?.notes ?? '') === notesDraft.value.trim()) return
  store.updateNotes(store.currentListId, notesDraft.value)
}

// Reset is reachable whenever ANY progress exists — including partial stepper
// counts on items that never reached "packed" (packed_count decoupled from packed).
const hasPacked = computed(() => store.currentListItems.some((i) => i.packed || i.packed_count > 0))

// --- Right-side category quick-nav rail --------------------------------------
const {
  activeKey: activeCatKey,
  showRail,
  railCollapsed,
  setRailCollapsed,
  setSectionEl,
  scrollToKey: scrollToCategory,
} = useCategoryRail({
  keys: () => displaySections.value.map((g) => g.key),
  storageKey: props.railStorageKey,
})

// Zurück im Netz: die offline gesammelten Kategorie-Mutationen nachschicken.
watch(isOnline, async (online) => {
  if (online && store.hasPendingMutations) await store.syncMutations()
})

onMounted(async () => {
  await store.loadLists()
  await store.loadItems()
  await store.loadCategories()
  notesDraft.value = store.currentList?.notes ?? ''
  store.subscribe()
})

onUnmounted(() => {
  store.unsubscribe()
})
</script>

<template>
  <div class="page-container">
    <div class="container-fluid">
      <!-- Der lange Zettel (Ticket 07/pinnwand-ausbau): dieselbe Papierhuelle
           wie im Einkauf, geteilt ueber `LongSheet`. Die Chip-Leiste rendert
           unconditional (wie vorher), das Blatt selbst nur, wenn es eine
           aktuelle Liste gibt. -->
      <LongSheet :has-content="!!store.currentListId">
        <template #tabs>
          <!-- Listen Chip-Leiste -->
          <div class="list-chip-bar">
            <div class="list-chip-container">
              <button
                v-for="list in store.lists"
                :key="list.list_id"
                :class="['list-chip', store.currentListId === list.list_id && 'active']"
                @click="store.currentListId = list.list_id"
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
                :title="labels.createListChipTitle"
              >
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>
          </div>
        </template>

        <template v-if="store.currentListId">
          <!-- Obere Leiste: Name · Menge · Zielkategorie · Hinzufügen · Kategorie anlegen -->
          <ListAddBar
            :list-id="store.currentListId"
            :category-options="store.categorySuggestions"
            :name-suggestions="topNameSuggestions"
            :suggest-category="store.suggestCategoryFor"
            :placeholder="labels.addPlaceholder"
            :disabled="store.isLoading"
            @add="onTopAdd"
            @create-category="showCategoryCreate = true"
          />

          <!-- Gesamt-Fortschritt -->
          <div v-if="store.currentListItems.length > 0" class="progress-header">
            <div class="progress-label">
              <span class="progress-list-name">{{ store.currentList?.name }}</span>
              <span class="progress-count">
                {{ store.overallProgress.packed }}/{{ store.overallProgress.total }}
                {{ labels.progressVerb }}
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
              <div
                class="progress-fill"
                :style="{ width: store.overallProgress.percent + '%' }"
              ></div>
            </div>
          </div>

          <!-- Listen-Notiz -->
          <div class="notes-block">
            <button class="notes-toggle" @click="notesOpen = !notesOpen">
              <i class="bi me-1" :class="labels.notesIcon"></i>
              <span class="notes-title">{{ labels.notesTitle }}</span>
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
                :placeholder="labels.notesPlaceholder"
                @focus="notesFocused = true"
                @blur="saveNotes"
              ></textarea>
            </div>
          </div>

          <!-- Loading Skeleton -->
          <div v-if="store.isLoading && store.items.length === 0" class="skeleton-loading">
            <div class="skeleton-card" style="height: 60px"></div>
            <div class="skeleton-card" style="height: 60px"></div>
          </div>

          <!-- Kategorie-Sektionen + rechte Schnellnav -->
          <template v-else>
            <div class="checklist-body" :class="{ 'rail-open': showRail && !railCollapsed }">
              <div class="cat-column">
                <div
                  v-for="group in displaySections"
                  :key="group.key"
                  :ref="(el) => setSectionEl(group.key, el)"
                  :data-cat-key="group.key"
                  class="cat-section"
                  :class="{
                    'cat-uncategorized': group.isUncategorized,
                    'cat-complete': isCategoryComplete(group),
                    'cat-damped': isCategoryDamped(group),
                  }"
                >
                  <!-- Die Kopfzeile ist selbst Ablageziel: eine eingeklappte
                 Kategorie hat sonst keine Fläche zum Hineinziehen. -->
                  <div
                    class="cat-header"
                    :ref="(el) => setDropEl(`${group.key}::head`, el)"
                    :data-cat-name="group.category ?? ''"
                    role="button"
                    tabindex="0"
                    @click="onCatHeaderClick(group)"
                    @keydown.enter.prevent="onCatHeaderClick(group)"
                    @keydown.space.prevent="onCatHeaderClick(group)"
                  >
                    <span
                      class="cat-dot"
                      :style="{ background: categoryColor(group.category) }"
                    ></span>
                    <span class="cat-name">{{ group.label }}</span>
                    <div class="cat-header-right">
                      <span class="cat-count" v-if="group.total > 0">
                        <i
                          v-if="isCategoryComplete(group)"
                          class="bi bi-check-circle-fill cat-complete-icon"
                        ></i>
                        {{ group.rawDoneCount }}/{{ group.total }}
                      </span>
                      <!-- Auch bei eingeklappter Sektion sichtbar: sonst hat eine
                     leere, eingeklappte Kategorie keinen sichtbaren Weg,
                     etwas hineinzulegen (Befund F1). `openAddLine` klappt auf
                     und öffnet die Zeile in einem Zug. -->
                      <button
                        v-if="!isAddOpen(group) || !isSectionOpen(group)"
                        class="cat-icon-btn"
                        @click.stop="openAddLine(group)"
                        :title="`${labels.itemNoun.one} hinzufügen`"
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
                    <!-- Offen: noch nicht erledigt + gerade abgehakt (Grace) -->
                    <!-- Gepackte Zeilen tragen keine `data-item-id` und sind damit
                   nicht ziehbar — auch die im Rückgängig-Fenster. Ziehen in und
                   aus „erledigt" bleibt wie im Einkauf außerhalb. Sie stehen
                   dabei MITTEN zwischen den ziehbaren; `useCategoryDrag` merkt
                   sich zum Zurückrollen den Nachbarknoten, nicht den Index,
                   und kommt damit ohne eine Reihenfolge-Bedingung aus. -->
                    <ChecklistItemRow
                      v-for="item in openRows(group)"
                      :key="item.item_id"
                      :item="item"
                      :data-item-id="item.packed ? null : item.item_id"
                      :class="{ 'row-moved': item.item_id === justMovedId }"
                      @toggle="onItemToggle(item)"
                      @increment="onItemIncrement(item)"
                      @decrement="onItemDecrement(item)"
                      @edit="openItemEdit(item)"
                    />

                    <!-- Erledigt (einklappbar) -->
                    <template v-if="doneRows(group).length > 0">
                      <button class="done-toggle" @click="toggleDone(group.key)">
                        <i class="bi bi-check2-circle done-check"></i>
                        <span>{{ doneRows(group).length }} {{ labels.progressVerb }}</span>
                        <i
                          class="bi ms-auto"
                          :class="isDoneOpen(group.key) ? 'bi-chevron-up' : 'bi-chevron-down'"
                        ></i>
                      </button>
                      <template v-if="isDoneOpen(group.key)">
                        <ChecklistItemRow
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
                      <!-- Leeres Kaestchen: haelt die Schreibzeile im Pinnwand-Aussehen
                     in derselben Spur wie die Eintragsnamen darueber (wie im
                     Einkauf). Im klassischen Aussehen `display: none`. -->
                      <span class="add-ghost-box" aria-hidden="true"></span>
                      <div class="add-input-wrap">
                        <input
                          v-model="addDraft[group.key]"
                          type="text"
                          class="add-input"
                          :placeholder="
                            group.isUncategorized ? '+ hinzufügen…' : `+ zu ${group.label}…`
                          "
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
              </div>

              <!-- Rechte Kategorie-Schnellnav (einklappbar) -->
              <CategoryRail
                v-if="showRail"
                :groups="displaySections"
                :active-key="activeCatKey"
                :collapsed="railCollapsed"
                @select="scrollToCategory"
                @update:collapsed="setRailCollapsed"
              />
            </div>
          </template>
        </template>
      </LongSheet>

      <!-- Keine Listen vorhanden -->
      <div v-if="store.lists.length === 0 && !store.isLoading" class="empty-state">
        <i class="bi" :class="labels.emptyIcon"></i>
        <p>{{ labels.emptyText }}</p>
        <button class="btn btn-primary" @click="openCreateList">
          <i class="bi bi-plus-lg me-1"></i> Liste erstellen
        </button>
      </div>
    </div>
  </div>

  <!-- Eintrag bearbeiten Modal (✎-Knopf der Zeile) -->
  <ChecklistItemEditModal
    v-if="editingItem"
    :item="editingItem"
    :category-options="store.categorySuggestions"
    @save="handleItemSave"
    @delete="handleItemDelete"
    @close="editingItem = null"
  />

  <!-- Kategorie anlegen (Name · Zuordnung · Einträge übernehmen) -->
  <CategoryCreateModal
    v-if="showCategoryCreate"
    :items="pickableItems"
    :category-options="store.categorySuggestions"
    :item-noun="labels.itemNoun"
    :import-sources-for="store.importSourcesFor"
    :import-preview="importPreviewFor"
    @create="handleCreateCategory"
    @close="showCategoryCreate = false"
  />

  <!-- Kategorie bearbeiten / löschen -->
  <CategoryEditModal
    v-if="editingCategory"
    variants
    :category="editingCategory.name"
    :item-count="editingCategory.count"
    :purchased-count="editingCategory.doneCount"
    :wording="{
      itemOne: labels.itemNoun.one,
      itemMany: labels.itemNoun.many,
      doneMany: labels.doneMany,
      doneOne: labels.doneOne,
      deleteDoneToo: true,
    }"
    @rename="handleCategoryRename"
    @delete="handleCategoryDelete"
    @close="editingCategory = null"
  />

  <!-- Liste bearbeiten Modal -->
  <ListEditModal
    v-if="showListEditModal && editingList"
    :list="editingList"
    :can-delete="store.lists.length > 1"
    @rename="handleRenameList"
    @delete="handleDeleteList"
    @close="
      showListEditModal = false
      editingList = null
    "
  />

  <!-- Neue Liste erstellen Modal -->
  <Teleport to="body">
    <div v-if="showCreateListModal" class="modal-overlay" @click.self="showCreateListModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">{{ labels.createListTitle }}</h5>
          <button class="btn-close" @click="showCreateListModal = false"></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input
              v-model="newListName"
              type="text"
              class="form-control"
              :placeholder="labels.createListNamePlaceholder"
              maxlength="100"
              @keyup.enter="handleCreateList"
              autofocus
            />
          </div>
          <div class="form-group" v-if="store.lists.length > 0">
            <label class="form-label">Inhalt</label>
            <select v-model="copySourceId" class="form-select">
              <option value="">Leere Liste</option>
              <option v-for="l in store.lists" :key="l.list_id" :value="l.list_id">
                Kopieren von: {{ l.name }}
              </option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showCreateListModal = false">Abbrechen</button>
          <button
            class="btn btn-primary"
            @click="handleCreateList"
            :disabled="!newListName.trim() || isCreatingList"
          >
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
          <p class="text-muted mb-0">{{ labels.resetConfirmBody }}</p>
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
/* ---- List Chip Bar ---- */
/* `margin-bottom` steht hier statt als Bootstraps `.mb-3` im Template (das
   Template trug es bisher direkt): `.mb-3` ist bei Bootstrap `!important` und
   liesse sich vom Pinnwand-Aussehen (LongSheet, Ticket 07) nicht mehr auf
   -6px ziehen. Wert identisch mit dem bisherigen `.mb-3` (1rem). Genau das
   Problem, das ShoppingView fuer sich selbst schon so geloest hatte. */
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

/* ---- Progress Header ---- */
.progress-header {
  margin-bottom: var(--spacing-md);
}

.progress-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: 6px;
  font-size: var(--font-sm);
}

.progress-list-name {
  font-weight: 600;
  color: var(--color-text-primary);
}
.progress-count {
  color: var(--color-text-secondary);
}

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
.reset-inline-btn:hover {
  color: var(--color-warning-dark);
  background: var(--color-warning-light);
}

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
.notes-title {
  font-weight: 600;
  flex-shrink: 0;
}
.notes-preview {
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.notes-body {
  padding: 0 var(--spacing-md) var(--spacing-md);
}

/* ---- Body + fixed bottom-right quick-nav rail ---- */
.checklist-body {
  position: relative;
}
.cat-column {
  min-width: 0;
}
/* Reserve space so cards never slide under the fixed rail while it's open. */
.checklist-body.rail-open .cat-column {
  padding-right: calc(20vw + 12px);
  max-width: 100%;
}
@media (min-width: 480px) {
  .checklist-body.rail-open .cat-column {
    padding-right: 96px;
  }
}

/* ---- Seitenrand: 8px statt Bootstrap-Gutter (12px) ---- */
.container-fluid {
  padding-left: 8px;
  padding-right: 8px;
}

/* ---- Category Section ----
   Etappe 2: dieselbe Verdichtung wie im Einkauf — die Sektions-Box entfällt,
   die Kopfzeile sitzt ohne Rahmen auf dem Seitenhintergrund. */
.cat-section {
  margin-bottom: 8px;
  scroll-margin-top: 72px;
}
.cat-uncategorized {
  opacity: 0.92;
}
.cat-complete .cat-header {
  opacity: 0.7;
}

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
.cat-header:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.cat-header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* 30×28 sichtbar, 40×40 treffbar. Die 12px Abstand oben sind Bedingung, keine
   Optik: jede Trefferfläche wächst um 5px zur Seite. Bei weniger Abstand
   überlappen sie sich und der Griff aufs Plus landet auf „bearbeiten". */
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
.cat-icon-btn::after {
  content: '';
  position: absolute;
  inset: -6px -5px;
}
.cat-icon-btn:hover {
  opacity: 1;
  color: var(--color-primary);
}
.cat-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cat-name {
  font-weight: 600;
  font-size: var(--font-base);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cat-uncategorized .cat-name {
  color: var(--color-text-muted);
  font-weight: 500;
}
/* Fortschritt als dezentes Badge statt als zweite Überschrift — wie im Einkauf,
   dort steht nur eine Zahl, hier gepackt/gesamt. */
.cat-count {
  font-size: var(--font-xs);
  color: var(--color-text-secondary);
  background: var(--color-background-elevated);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0 6px;
  margin-right: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cat-complete-icon {
  color: var(--color-success);
}
.cat-chevron {
  color: var(--color-text-muted);
  font-size: var(--font-sm);
}

/* Ziehen: die Vorschau bleibt blass an der alten Stelle, der aufgenommene
   Eintrag hebt sich ab. */
.drag-ghost {
  opacity: 0.35;
}
.drag-chosen {
  border-color: var(--color-primary);
}
/* Frisch verschobener Eintrag kurz hervorheben: er springt nach dem Loslassen
   an seinen Platz in der Zielsektion, der Sprung soll nachvollziehbar bleiben. */
.row-moved {
  animation: row-moved 600ms ease-out;
}
@keyframes row-moved {
  from {
    background: var(--color-primary-subtle, rgba(99, 102, 241, 0.18));
  }
  to {
    background: transparent;
  }
}

/* ---- Gedämpfte (leere) Kategorien — Ticket 05 -----------------------------
   Verhalten (leer ⇒ gedämpft, Antippen hebt es für die Sitzung auf) sitzt in
   <script setup> und gilt in beiden Aussehen. Hier nur die Optik; die
   Kopfzeile behält ihre Mindesthöhe/Trefferfläche unverändert (Touch-Target),
   nur Schriftgröße und Deckkraft gehen zurück. */
.cat-section.cat-damped {
  margin-bottom: 4px;
}
.cat-section.cat-damped .cat-header {
  opacity: 0.5;
}
.cat-section.cat-damped .cat-name {
  font-size: var(--font-sm);
  font-weight: 500;
}
.cat-section.cat-damped .cat-dot {
  width: 6px;
  height: 6px;
}

.cat-body {
  padding: 0;
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
.done-toggle:hover {
  color: var(--color-text-secondary);
}
.done-check {
  color: var(--color-success);
}

/* ---- Add line ---- */
.add-line {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
}
.add-ghost-box {
  display: none;
}
.add-input-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}
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
.add-input:focus {
  outline: none;
  border-color: var(--color-primary);
  border-style: solid;
}

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
.suggestion-item:last-child {
  border-bottom: none;
}
.suggestion-item:hover {
  background: var(--color-background);
}
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
.add-qty-toggle:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.add-qty-toggle.active {
  border-style: solid;
  border-color: var(--color-primary);
  color: var(--color-primary);
}

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
.add-qty-input:focus {
  outline: none;
}

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
.add-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-reopen {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: var(--font-sm);
  cursor: pointer;
  padding: 6px 4px;
}
.add-reopen:hover {
  color: var(--color-primary);
}

/* ==========================================================================
   PINNWAND-AUSSEHEN — „Der lange Zettel" auf Packliste und To-do
   --------------------------------------------------------------------------
   Alles ab hier haengt an `:root[data-design='pinnwand']`. Ohne das Attribut
   greift keine einzige Regel — das klassische Aussehen oben bleibt Wort fuer
   Wort der Normalfall.

   Die Papierhuelle selbst (Kante, Kopfzeile) kommt aus `LongSheet.vue`
   (Ticket 07) und wird dort einmal gepflegt. Was hier steht, ist der Rest
   des Blatts — Kategorie-Ueberschriften, Zeilen, Eingabezeilen — in eigenem
   Besitz dieser View, nach demselben Muster wie `ShoppingView.vue`, aber nur
   fuer das, was es hier wirklich gibt: kein `.qty-badge`, kein `.star-btn`,
   keine `.row-priority` — Packliste/To-do kennen weder Prioritaet noch den
   Einkaufs-Mengen-Chip. Umgekehrt hat die Checkliste Elemente, die der
   Einkauf nicht hat (`.pack-stepper`, `.done-toggle`, `.add-reopen`) — die
   bekommen hier ihre eigene Behandlung in derselben Bildsprache (dieselben
   `--pw-*`-Tokens), keine Kopie.

   `ListItemRow`/`ChecklistItemRow` werden ueber `:deep()` unterhalb von
   `.cat-column` angefasst — aus demselben Grund wie in ShoppingView: die
   Zeile gehoert einer Kind-Komponente, nicht dieser View. Alles andere hier
   ist natives Markup dieser View und braucht kein `:deep()`.
   ========================================================================== */

/* ---- Fortschrittsbalken & Notiz-Vorschau: die zwei Fremdkoerper auf dem
   Papier, gefunden im QC-Review. Notizblock und Beschriftungszeile brauchen
   keine eigene Regel: die alten Tokens sind unter Pinnwand bereits auf
   `--pw-*` umgelegt, `.notes-block` liest also von selbst in Blattfarbe. Der
   Balken tut das nicht — er ist rund, randlos, schattenlos und animiert,
   das einzige Element mit dieser Form auf dem ganzen Blatt. */
/* QC-Befund: Rahmen oben+unten frisst von den klassischen 6px zwei weg,
   die Fuellung blieb bei 2px zwischen zwei 2px-Linien optisch begraben statt
   sichtbar. Spurhoehe unter Pinnwand auf 10px angehoben, nur hier (nicht in
   der Basisregel oben, die bleibt bei 6px): 10px − 2px oben − 2px unten =
   6px Fuellung, wieder so kraeftig wie im klassischen Aussehen. */
:root[data-design='pinnwand'] .progress-track {
  height: 10px;
  background: transparent;
  border: 2px solid var(--pw-line);
  border-radius: 0;
}
:root[data-design='pinnwand'] .progress-fill {
  border-radius: 0;
}
/* `--color-text-muted` ist unter Pinnwand auf `--pw-free` umgelegt — auf
   Papier nur ~3,3:1 (siehe `pinnwand.css`, Platzhalter-Regel). Derselbe
   Tausch wie dort: `--pw-ink-soft` erreicht ~8,9:1. */
:root[data-design='pinnwand'] .notes-preview {
  color: var(--pw-ink-soft);
}
/* Derselbe Tausch, derselbe Befund: `.reset-inline-btn` erbt sonst ebenfalls
   `--color-text-muted` (= `--pw-free`), auf Papier nur ~3,6:1. */
:root[data-design='pinnwand'] .reset-inline-btn {
  color: var(--pw-ink-soft);
}

/* ---- Kategorie = Ueberschrift mit doppelter Tintenlinie, keine Box -------- */
:root[data-design='pinnwand'] .cat-section {
  margin-bottom: 18px;
}
/* Das klassische `opacity: 0.92` verduennt jeden Kontrast in der Sektion. */
:root[data-design='pinnwand'] .cat-uncategorized {
  opacity: 1;
}
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
/* Die Kategoriefarbe bleibt als kleine gestempelte Marke erhalten, wie im
   Einkauf — sie traegt keinen Text und ist damit nicht kontrastpflichtig. */
:root[data-design='pinnwand'] .cat-dot {
  width: 11px;
  height: 11px;
  border-radius: 0;
  border: 1.5px solid var(--pw-line);
}
/* Auf Papier gibt es keine Badges: das Rund und die Fuellung fallen weg, die
   Zahl bleibt als Tinte stehen — derselbe Tausch wie im Einkauf. */
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
:root[data-design='pinnwand'] .cat-chevron {
  color: var(--pw-ink);
}
/* Ein gefuelltes gruenes Rund neben einem ungefuellten Tinten-Kaestchen
   waeren zwei Sprachen fuer "erledigt". Dieselbe Tinte wie das Haekchen
   in `.list-check.on`. */
:root[data-design='pinnwand'] .cat-complete-icon {
  color: var(--pw-ink);
}
/* 18px Abstand + erweiterte Trefferflaeche = 48×48px, die sich beruehren
   statt zu ueberlappen — dieselbe Rechnung wie im Einkauf. */
:root[data-design='pinnwand'] .cat-header-right {
  gap: 18px;
}
:root[data-design='pinnwand'] .cat-icon-btn {
  color: var(--pw-ink);
  opacity: 1;
}
:root[data-design='pinnwand'] .cat-icon-btn::after {
  inset: -10px -9px;
}

/* ---- Gedämpfte (leere) Kategorien — eigene Optik fürs Pinnwand-Papier -----
   Höhere Spezifität als die Basisregeln oben (`:root[data-design] .cat-name`
   & Co.), damit die Dämpfung trotz gleicher Selektorlänge gewinnt statt von
   der spaeter im Stylesheet stehenden Papier-Regel überschrieben zu werden.
   Die Trefferfläche der Kopfzeile bleibt unangetastet. */
:root[data-design='pinnwand'] .cat-section.cat-damped .cat-header {
  opacity: 0.55;
  border-bottom-style: solid;
  border-bottom-width: 1px;
}
:root[data-design='pinnwand'] .cat-section.cat-damped .cat-name {
  font-size: var(--font-sm);
  letter-spacing: normal;
}
:root[data-design='pinnwand'] .cat-section.cat-damped .cat-dot {
  width: 7px;
  height: 7px;
}

/* ---- Zeile: kein Rahmen, kein Hintergrund — Schrift auf Papier -----------
   `ListItemRow` ist dieselbe Komponente wie im Einkauf (ueber
   `ChecklistItemRow`), deshalb identische Optik. */
:root[data-design='pinnwand'] .cat-body {
  gap: 0;
}
:root[data-design='pinnwand'] .cat-column :deep(.list-row) {
  min-height: var(--touch-target-min);
  padding: 0 2px;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(36, 31, 26, 0.16);
  border-radius: 0;
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .cat-column :deep(.list-row:hover) {
  background: rgba(36, 31, 26, 0.04);
}
/* Ein abgehakter Eintrag bleibt lesbar: durchgestrichen und eine Spur
   leiser, aber nicht auf 55 % heruntergeblendet. */
:root[data-design='pinnwand'] .cat-column :deep(.list-row.checked) {
  opacity: 1;
}
:root[data-design='pinnwand'] .cat-column :deep(.list-row.checked .list-name) {
  color: var(--pw-ink-soft);
  text-decoration: line-through 2px var(--pw-line);
}
:root[data-design='pinnwand'] .cat-column :deep(.list-check) {
  width: 22px;
  height: 22px;
  border: 2px solid var(--pw-line);
  border-radius: 0;
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .cat-column :deep(.list-check.on) {
  background: none;
  border-color: var(--pw-line);
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .cat-column :deep(.row-trailing) {
  gap: 18px;
}
:root[data-design='pinnwand'] .cat-column :deep(.row-edit-btn) {
  width: 30px;
  height: 30px;
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .cat-column :deep(.row-edit-btn)::after {
  inset: -9px;
}

/* ---- Mengen-Stepper: die einzige Zeilen-Ergaenzung, die der Einkauf nicht
   hat (Packliste zaehlt gepackt/gesamt statt nur an-/abzuhaken). Dieselbe
   Zurueckhaltung wie beim Einkaufs-`.star-btn`: Rahmen statt Flaeche, Tinte
   statt Farbe — kein Bootstrap-Blau, das auf Papier fremd wirkt. */
:root[data-design='pinnwand'] .cat-column :deep(.step-btn) {
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: none;
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .cat-column :deep(.step-btn:hover:not(:disabled)) {
  border-color: var(--pw-line);
  background: var(--pw-tape);
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .cat-column :deep(.step-btn:disabled) {
  opacity: 0.35;
  border-color: rgba(36, 31, 26, 0.35);
  color: var(--pw-ink-soft);
}
:root[data-design='pinnwand'] .cat-column :deep(.step-count) {
  color: var(--pw-ink);
}

/* ---- „N erledigt" (einklappbar) — kennt nur die Checkliste, keine
   Entsprechung im Einkauf (dort gibt es den globalen Gekauft-Block). */
:root[data-design='pinnwand'] .done-toggle {
  color: var(--pw-ink-soft);
}
:root[data-design='pinnwand'] .done-toggle:hover {
  color: var(--pw-ink);
}
:root[data-design='pinnwand'] .done-check {
  color: var(--pw-ink);
}

/* ---- Naechste freie Zeile statt Formularfeld ------------------------------
   Das leere Kaestchen (`.add-ghost-box`) fehlte hier zunaechst — ohne Papier
   fiel die 32px-Verschiebung gegenueber den Eintragsnamen nicht auf, mit
   Papier schon (QC-Befund). Dieselbe Regel wie im Einkauf. */
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
:root[data-design='pinnwand'] .suggestions-dropdown {
  border: 2px solid var(--pw-line);
  border-radius: 2px;
  background: var(--pw-paper);
  box-shadow: var(--pw-shadow);
}
:root[data-design='pinnwand'] .suggestion-item {
  color: var(--pw-ink);
  border-bottom-color: rgba(36, 31, 26, 0.2);
  min-height: var(--touch-target-min);
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
/* Deaktiviert heisst nicht unsichtbar — dieselbe Begruendung wie im Einkauf:
   volle Deckkraft, umgefaerbt statt ausgeblendet. */
:root[data-design='pinnwand'] .add-confirm:disabled {
  opacity: 1;
  background: var(--pw-cork-deep);
  color: var(--pw-ink-soft);
}
/* Checklisten-eigen (kein Einkaufs-Gegenstueck): der Link, der eine wieder
   eingeklappte Eingabezeile zurueckholt. */
:root[data-design='pinnwand'] .add-reopen {
  color: var(--pw-ink-soft);
}
:root[data-design='pinnwand'] .add-reopen:hover {
  color: var(--pw-ink);
}
</style>
