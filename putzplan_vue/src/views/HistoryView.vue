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

const isLoading = ref(true)

// Live-Filter, kein Suchmodus: kein Enter, kein Overlay — die Liste folgt dem Tippen.
const searchTerm = ref('')

// Bezugszeitpunkt für „Heute"/„Gestern" — einmal beim Betreten der Ansicht gesetzt,
// damit die Tagesgrenzen während des Renderns stabil bleiben.
const now = ref(new Date())

// Anreicherung, Tagesgruppierung, Labels und Sortierung liegen im Composable.
const { entries: completions, dayGroups: groupedCompletions, isFiltering } = useHistoryGroups(
  () => taskStore.completions,
  () => householdStore.householdMembers,
  now,
  () => taskStore.tasks,
  searchTerm
)

// Keine Rückfrage: der Wisch legt das Löschen erst frei, das ist die Absicht.
const deleteCompletion = async (completion: HistoryEntry) => {
  swipeOpenId.value = null
  await taskStore.deleteCompletion(completion.completion_id)
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

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
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
      <div class="history-header mb-4">
        <h2 class="page-title mb-0">Verlauf</h2>
        <!-- Dauerhaft sichtbares Suchfeld — der frühere Optionen-Knopf saß hier. -->
        <div class="history-search">
          <i class="bi bi-search"></i>
          <input
            v-model="searchTerm"
            type="search"
            class="history-search-input"
            placeholder="Aufgabe, Person, Notiz…"
            aria-label="Verlauf durchsuchen"
          />
          <button
            v-if="searchTerm"
            type="button"
            class="history-search-clear"
            aria-label="Suche zurücksetzen"
            @click="searchTerm = ''"
          >
            <i class="bi bi-x-lg"></i>
          </button>
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

      <!-- Eigener Leerzustand: es gibt Einträge, nur keinen Treffer. -->
      <div v-else-if="groupedCompletions.length === 0 && isFiltering" class="empty-state">
        <i class="bi bi-search"></i>
        <p>Keine Treffer für „{{ searchTerm }}"</p>
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="searchTerm = ''">
          Suche zurücksetzen
        </button>
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

  </main>
</template>

<style scoped>
/* Component-specific styles only */

/* Seitenrand 8px statt Bootstrap-Gutter (12px) — wie im Einkauf. */
.container-fluid {
  padding-left: 8px;
  padding-right: 8px;
}

/* 8px zwischen Tagesgruppen. */
.completions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Kartenstapel statt einzeln schwebender Karten.
   Rechnung, warum kein Zwischenraum: 59 Zeilen à 40px + 18 Kopfzeilen à 30px +
   17 Sektionsabstände à 8px sind bereits 3036px — mehr als die 2992,7px der
   alten Ansicht. Zeilenhöhe, Kopfzeilenhöhe und Sektionsabstand sind aus
   Etappe 2 gesetzt, also muss der Rest kommen: die Karten sitzen ohne Lücke
   aufeinander und teilen sich ihre Trennlinie (-1px). Der Kartenlook bleibt —
   erhöhter Hintergrund, Rahmen, gerundete Enden je Tagesgruppe. */
.completion-group {
  display: flex;
  flex-direction: column;
}

.completion-group > * + * {
  margin-top: -1px;
}

/* Innen bündig, nur die Enden der Tagesgruppe werden gerundet. */
.completion-group :deep(.row-swipe),
.completion-group :deep(.row-note),
.completion-group .fold-row {
  border-radius: 0;
}

.completion-group > *:nth-child(2) :deep(.row-swipe),
.completion-group > .fold-row:nth-child(2) {
  border-top-left-radius: var(--radius-sm);
  border-top-right-radius: var(--radius-sm);
}

/* Nur der unterste sichtbare Kasten der Gruppe wird unten gerundet — bei
   offener Notiz ist das die Notiz, sonst die Zeile selbst. */
.completion-group > *:last-child :deep(.row-swipe:last-child),
.completion-group > .fold-row:last-child,
.completion-group > *:last-child :deep(.row-note) {
  border-bottom-left-radius: var(--radius-sm);
  border-bottom-right-radius: var(--radius-sm);
}

/* Tages-Kopfzeile im Kopfzeilen-Maß aus Etappe 2: 30px Mindesthöhe, keine Box,
   kein Rahmen, keine eigene Färbung — sie sitzt auf dem Seitenhintergrund wie
   die Kategorie-Kopfzeile im Einkauf. Sie klebt weiterhin oben; der
   Hintergrund ist exakt der Seitenhintergrund, damit die Karten im geklebten
   Zustand nicht durchscheinen, die Kopfzeile aber trotzdem keine Box bildet. */
.date-header {
  position: sticky;
  /* Unter der sticky App-Kopfleiste einrasten, nicht dahinter verschwinden —
     die Leiste meldet ihre Höhe als --app-header-height. */
  top: var(--app-header-height, 56px);
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
  min-height: 30px;
  font-size: var(--font-sm);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  background: var(--color-background);
  padding: 0 4px 0 2px;
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

/* Kopfzeile: Titel links, dauerhaft sichtbares Suchfeld rechts daneben. */
.history-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.history-search {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.5rem;
  min-height: 40px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  background: var(--color-background-soft, transparent);
}

.history-search > i {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.history-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--font-md, 1rem);
  color: var(--color-text-primary);
}

/* Browser-eigenes Kreuz von type=search unterdrücken — wir haben einen eigenen Knopf. */
.history-search-input::-webkit-search-cancel-button {
  display: none;
}

/* Sichtbar 32px, damit die Suchleiste ihre Höhe behält; die Trefferfläche wird per
   Pseudo-Element auf 48px erweitert — dasselbe Muster wie an der Kategorie-Kopfzeile. */
.history-search-clear {
  position: relative;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
}

.history-search-clear::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--touch-target-min, 48px);
  height: var(--touch-target-min, 48px);
  transform: translate(-50%, -50%);
}

.history-search-clear:hover {
  color: var(--bs-danger);
}
</style>
