<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useTaskStore } from '../stores/taskStore'
import { useHouseholdStore } from '../stores/householdStore'
import { useHistoryGroups, type HistoryEntry } from '@/composables/useHistoryGroups'

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()

const showDeleteModal = ref(false)
const completionToDelete = ref<HistoryEntry | null>(null)
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
  now
)

// Only the time per row — the day is shown once in the group header below.
const formatTime = (dateString: string) => {
  return new Date(dateString).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const openDeleteModal = (completion: HistoryEntry) => {
  completionToDelete.value = completion
  showDeleteModal.value = true
}

const closeDeleteModal = () => {
  showDeleteModal.value = false
  completionToDelete.value = null
}

const confirmDelete = async () => {
  if (!completionToDelete.value) return

  await taskStore.deleteCompletion(completionToDelete.value.completion_id)
  closeDeleteModal()
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

// Notizen sind ausgeklappter Ansichtszustand, nicht persistiert.
const expandedNotes = ref<Set<string>>(new Set())

const toggleNote = (completion: HistoryEntry) => {
  if (!completion.completion_note) return
  const open = new Set(expandedNotes.value)
  if (!open.delete(completion.completion_id)) open.add(completion.completion_id)
  expandedNotes.value = open
}

// Farbe allein darf die Person nicht tragen — Screenreader bekommen sie im Label nach.
const rowLabel = (completion: HistoryEntry) =>
  `${completion.tasks?.title || 'Unbekannte Aufgabe'}, ${completion.household_members.display_name}, ` +
  `${formatTime(completion.completed_at)}, ${completion.points} Punkte`

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('.dropdown')) {
    showOptionsDropdown.value = false
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
          <div
            v-for="completion in group.items"
            :key="completion.completion_id"
            class="completion-row-wrapper"
          >
            <div
              class="completion-row"
              :class="{ 'is-expandable': !!completion.completion_note }"
              :aria-label="rowLabel(completion)"
              @click="toggleNote(completion)"
            >
              <span class="row-time">{{ formatTime(completion.completed_at) }}</span>
              <!-- Quick-Aufgaben tragen technisch auch deleted_at — sie sind aber kein
                   gelöschter Task, sondern werden am Blitz erkannt. -->
              <span
                class="row-title"
                :class="{ 'is-deleted': completion.isDeleted && !completion.isQuick }"
              >
                <i v-if="completion.isQuick" class="bi bi-lightning-charge-fill row-quick"></i>
                {{ completion.tasks?.title || 'Unbekannte Aufgabe' }}
              </span>
              <i v-if="completion.completion_note" class="bi bi-sticky row-note-icon"></i>
              <span
                class="user-dot"
                :style="{ background: completion.household_members.user_color }"
              ></span>
              <span class="row-points">{{ completion.points }}</span>
              <button
                @click.stop="openDeleteModal(completion)"
                class="btn btn-sm btn-delete-ghost row-delete"
                title="Eintrag löschen"
              >
                <i class="bi bi-trash"></i>
              </button>
            </div>
            <div
              v-if="completion.completion_note && expandedNotes.has(completion.completion_id)"
              class="row-note"
            >
              {{ completion.completion_note }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Single Entry Modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3 class="modal-title">Eintrag löschen</h3>
            <button @click="closeDeleteModal" class="btn-close" aria-label="Schließen">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="modal-body">
            <p>
              Möchtest du diesen Eintrag wirklich löschen?
            </p>
            <p class="text-muted mb-0">
              <strong>{{ completionToDelete?.tasks?.title }}</strong> von
              <strong>{{ completionToDelete?.household_members?.display_name }}</strong>
            </p>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              Abbrechen
            </button>
            <button @click="confirmDelete" class="btn btn-danger">
              <i class="bi bi-trash"></i> Löschen
            </button>
          </div>
        </div>
      </div>
    </Teleport>

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
  gap: 1.25rem;
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
  padding: 0.375rem 0.125rem 0.25rem;
  margin-bottom: 0.25rem;
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

/* Dichte Zeile: alles auf einer Höhe, damit die Liste scannbar bleibt. */
.completion-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 40px;
  padding: 0 0.125rem;
  border-bottom: 1px solid var(--color-border);
}

.completion-row.is-expandable {
  cursor: pointer;
}

.row-time {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
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

/* Gelöschter Task: abgeschwächt statt Badge. */
.row-title.is-deleted {
  color: var(--color-text-muted);
  font-style: italic;
}

.row-quick {
  color: var(--color-warning);
  font-size: 0.75rem;
}

.row-note-icon {
  flex-shrink: 0;
  font-size: 0.75rem;
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

.row-delete {
  flex-shrink: 0;
}

.row-note {
  padding: 0.5rem 0.125rem 0.625rem 3rem;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
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
