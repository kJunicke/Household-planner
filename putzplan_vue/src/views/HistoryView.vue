<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useTaskStore } from '../stores/taskStore'
import { useHouseholdStore } from '../stores/householdStore'
import {
  useHistoryGroups,
  type HistoryEntry
} from '@/composables/useHistoryGroups'
import HistoryRow from '@/components/HistoryRow.vue'
import HistoryFoldRow from '@/components/HistoryFoldRow.vue'

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

// Die Zeile meldet ihr Zurückschnappen — nur die aktuell offene darf zumachen.
const closeSwipe = (id: string) => {
  if (swipeOpenId.value === id) swipeOpenId.value = null
}

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
              @swipe-start="swipeOpenId = row.entry.completion_id"
              @swipe-end="closeSwipe(row.entry.completion_id)"
              @delete="deleteCompletion(row.entry)"
            />
            <!-- Subtask-Completions eines Parent-Tasks, zu einer Zeile gefaltet -->
            <template v-else>
              <HistoryFoldRow
                :row="row"
                :expanded="expanded.has(row.id)"
                @toggle="toggleExpanded(row.id)"
              />
              <HistoryRow
                v-for="child in expanded.has(row.id) ? row.children : []"
                :key="child.completion_id"
                :completion="child"
                :note-expanded="expanded.has(child.completion_id)"
                :swipe-open-id="swipeOpenId"
                indented
                @toggle-note="toggleNote(child)"
                @swipe-start="swipeOpenId = child.completion_id"
                @swipe-end="closeSwipe(child.completion_id)"
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
  font-size: var(--font-sm);
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
