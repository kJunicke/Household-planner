<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useTaskStore } from '../stores/taskStore'
import { useHouseholdStore } from '../stores/householdStore'
import {
  useHistoryGroups,
  type HistoryEntry,
  type HistoryFoldRow
} from '@/composables/useHistoryGroups'
import HistoryRow from '@/components/HistoryRow.vue'

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()

const showDeleteAllModal = ref(false)
const showOptionsDropdown = ref(false)
const isLoading = ref(true)

// Bezugszeitpunkt für „Heute"/„Gestern" — einmal beim Betreten der Ansicht gesetzt,
// damit die Tagesgrenzen während des Renderns stabil bleiben.
const now = ref(new Date())

// Anreicherung, Tagesgruppierung, Labels und Sortierung liegen im Composable.
const { entries: completions, dayGroups: groupedCompletions } = useHistoryGroups(
  () => taskStore.completions,
  () => householdStore.householdMembers,
  now,
  () => taskStore.tasks
)

// Keine Rückfrage: der Wisch legt das Löschen erst frei, das ist die Absicht.
const deleteCompletion = async (completion: HistoryEntry) => {
  swipeOpenId.value = null
  await taskStore.deleteCompletion(completion.completion_id)
}

const openDeleteAllModal = () => {
  showDeleteAllModal.value = true
}

const closeDeleteAllModal = () => {
  showDeleteAllModal.value = false
}

const confirmDeleteAll = async () => {
  await taskStore.deleteAllCompletions()
  closeDeleteAllModal()
}

// Aufgeklappte Notizen und Faltgruppen sind reiner Ansichtszustand, nicht persistiert.
const expanded = ref<Set<string>>(new Set())

const toggleExpanded = (id: string) => {
  const open = new Set(expanded.value)
  if (!open.delete(id)) open.add(id)
  expanded.value = open
}

const toggleNote = (completion: HistoryEntry) => {
  if (!completion.completion_note) return
  toggleExpanded(completion.completion_id)
}

// Es ist immer nur eine Zeile aufgewischt.
const swipeOpenId = ref<string | null>(null)

// Faltzeilen geben nichts frei, dürfen aber genauso wenig auf einen horizontalen
// Zug hin auf- oder zuklappen.
let foldStartX = 0
let foldDragged = false

const onFoldPointerDown = (e: PointerEvent) => {
  foldStartX = e.clientX
  foldDragged = false
}

const onFoldPointerMove = (e: PointerEvent) => {
  if (Math.abs(e.clientX - foldStartX) > 12) foldDragged = true
}

const onFoldClick = (id: string) => {
  if (foldDragged) return
  toggleExpanded(id)
}

// Farbe allein darf die Beteiligten nicht tragen — Screenreader bekommen sie im Label nach.
const foldLabel = (row: HistoryFoldRow) =>
  `${row.parentTitle}, ${row.children.length} ${row.children.length === 1 ? 'Subtask' : 'Subtasks'} von ` +
  `${row.people.map(p => p.display_name).join(', ')}, ${row.points} Punkte`

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('.dropdown')) {
    showOptionsDropdown.value = false
  }
  // Ein Tap außerhalb schließt die aufgewischte Zeile. Der Klick nach einem Wisch
  // kommt hier nicht an — die Geste hält ihn zurück.
  if (!target.closest('.row-swipe-delete')) {
    swipeOpenId.value = null
  }
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside)

  // Load tasks and completions on mount (needed when navigating directly to /history or on page reload)
  try {
    await Promise.all([
      taskStore.loadTasks(),
      taskStore.fetchCompletions()
    ])
  } finally {
    isLoading.value = false
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <main class="page-container">
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2 class="page-title">Verlauf</h2>
        <div class="dropdown">
          <button
            class="btn btn-sm btn-outline-secondary dropdown-toggle"
            type="button"
            @click="showOptionsDropdown = !showOptionsDropdown"
            :disabled="completions.length === 0"
          >
            <i class="bi bi-three-dots-vertical"></i> Optionen
          </button>
          <ul class="dropdown-menu" :class="{ show: showOptionsDropdown }">
            <li>
              <button class="dropdown-item text-danger" @click="openDeleteAllModal(); showOptionsDropdown = false">
                <i class="bi bi-trash"></i> Alle löschen
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div v-if="isLoading" class="empty-state">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Laden...</span>
        </div>
        <p>Lade Verlauf...</p>
      </div>

      <div v-else-if="completions.length === 0" class="empty-state">
        <i class="bi bi-clock-history"></i>
        <p>Noch keine erledigten Tasks</p>
      </div>

      <div v-else class="completions-list">
        <div
          v-for="group in groupedCompletions"
          :key="group.key"
          class="completion-group"
        >
          <!-- Tages-Header: Überblick und zugleich Legende für die Farbpunkte der Zeilen -->
          <div class="date-header">
            <span class="date-label">{{ group.label }}</span>
            <span class="day-summary">
              <span
                v-for="person in group.people"
                :key="person.user_id"
                class="day-person"
              >
                <span class="user-dot" :style="{ background: person.user_color }"></span>
                {{ person.display_name }}
                <strong>{{ person.points }}</strong>
              </span>
            </span>
          </div>
          <template v-for="row in group.rows" :key="row.id">
            <!-- Einzelne Completion -->
            <HistoryRow
              v-if="row.kind === 'entry'"
              :completion="row.entry"
              :note-expanded="expanded.has(row.entry.completion_id)"
              :swipe-open-id="swipeOpenId"
              @toggle-note="toggleNote(row.entry)"
              @reveal="swipeOpenId = row.entry.completion_id"
              @delete="deleteCompletion(row.entry)"
            />
            <!-- Subtask-Completions eines Parent-Tasks, zu einer Zeile gefaltet -->
            <template v-else>
              <div
                class="fold-row"
                :aria-label="foldLabel(row)"
                :aria-expanded="expanded.has(row.id)"
                @pointerdown="onFoldPointerDown"
                @pointermove="onFoldPointerMove"
                @click="onFoldClick(row.id)"
              >
                <i
                  class="bi row-chevron"
                  :class="expanded.has(row.id) ? 'bi-chevron-down' : 'bi-chevron-right'"
                ></i>
                <span class="row-title">{{ row.parentTitle }}</span>
                <span class="fold-count">{{ row.children.length }}&times;</span>
                <span
                  v-for="person in row.people"
                  :key="person.user_id"
                  class="user-dot"
                  :style="{ background: person.user_color }"
                ></span>
                <span class="row-points">{{ row.points }}</span>
              </div>
              <HistoryRow
                v-for="child in expanded.has(row.id) ? row.children : []"
                :key="child.completion_id"
                :completion="child"
                :note-expanded="expanded.has(child.completion_id)"
                :swipe-open-id="swipeOpenId"
                indented
                @toggle-note="toggleNote(child)"
                @reveal="swipeOpenId = child.completion_id"
                @delete="deleteCompletion(child)"
              />
            </template>
          </template>
        </div>
      </div>
    </div>

    <!-- Delete All Modal -->
    <Teleport to="body">
      <div v-if="showDeleteAllModal" class="modal-overlay" @click="closeDeleteAllModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3 class="modal-title">Gesamten Verlauf löschen</h3>
            <button @click="closeDeleteAllModal" class="btn-close" aria-label="Schließen">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="modal-body">
            <p class="text-danger fw-bold">
              <i class="bi bi-exclamation-triangle-fill"></i>
              Achtung: Diese Aktion kann nicht rückgängig gemacht werden!
            </p>
            <p>
              Möchtest du wirklich den gesamten Verlauf für diesen Haushalt löschen?
            </p>
            <p class="text-muted mb-0">
              Es werden {{ completions.length }} Einträge gelöscht.
            </p>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteAllModal" class="btn btn-secondary">
              Abbrechen
            </button>
            <button @click="confirmDeleteAll" class="btn btn-danger">
              <i class="bi bi-trash"></i> Alle löschen
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
/* Component-specific styles only */

.completions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.completion-group {
  display: flex;
  flex-direction: column;
}

.date-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  background: var(--color-background);
  padding: 0.25rem 0.125rem 0.1875rem;
  border-bottom: 1px solid var(--color-border);
}

/* Tageszusammenfassung — zugleich die Legende für die Farbpunkte der Zeilen. */
.day-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.125rem 0.625rem;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
}

.day-person {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.day-person strong {
  color: var(--color-text-secondary);
}

.user-dot {
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

/* Faltzeile: Subtasks eines Parent-Tasks an einem Tag, auf Zeilenhöhe wie alle anderen. */
.fold-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 40px;
  padding: 0 0.125rem;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

.row-chevron {
  flex-shrink: 0;
  width: 1.25rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  color: var(--color-text-primary);
}

.fold-count {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}

.row-points {
  flex-shrink: 0;
  min-width: 1.25rem;
  text-align: right;
  font-size: 0.875rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
}

.dropdown {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 0.25rem;
  z-index: 1000;
}
</style>
