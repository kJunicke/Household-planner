<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useNotesStore } from '@/stores/notesStore'
import { useHouseholdStore } from '@/stores/householdStore'
import type { Note } from '@/types/Note'

const notesStore = useNotesStore()
const householdStore = useHouseholdStore()

const newNoteContent = ref('')
const editingNote = ref<Note | null>(null)
const editContent = ref('')
const showDeleteModal = ref(false)
const noteToDelete = ref<Note | null>(null)

const handleCreateNote = async () => {
  if (!newNoteContent.value.trim()) return

  await notesStore.createNote(newNoteContent.value)
  newNoteContent.value = ''
}

const startEditing = (note: Note) => {
  editingNote.value = note
  editContent.value = note.content
}

const cancelEditing = () => {
  editingNote.value = null
  editContent.value = ''
}

const saveEdit = async () => {
  if (!editingNote.value) return

  const success = await notesStore.updateNote(editingNote.value.note_id, editContent.value)
  if (success) {
    cancelEditing()
  }
}

const openDeleteModal = (note: Note) => {
  noteToDelete.value = note
  showDeleteModal.value = true
}

const closeDeleteModal = () => {
  showDeleteModal.value = false
  noteToDelete.value = null
}

const confirmDelete = async () => {
  if (!noteToDelete.value) return

  await notesStore.deleteNote(noteToDelete.value.note_id)
  closeDeleteModal()
}

const getMemberName = (userId: string) => {
  const member = householdStore.householdMembers.find(m => m.user_id === userId)
  return member?.display_name || 'Unbekannt'
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(async () => {
  await notesStore.loadNotes()
  notesStore.subscribeToNotes()
})

onUnmounted(() => {
  notesStore.unsubscribeFromNotes()
})
</script>

<template>
  <div class="page-container">
    <div class="container-fluid">
      <h2 class="page-title">
        <i class="bi bi-sticky"></i> Notizen
      </h2>

      <!-- Create Note Form -->
      <div class="note-create-section mb-4">
        <div class="input-group">
          <textarea
            v-model="newNoteContent"
            class="form-control"
            placeholder="Neue Notiz schreiben..."
            rows="2"
            @keydown.ctrl.enter="handleCreateNote"
            :disabled="notesStore.isLoading"
          ></textarea>
        </div>
        <button
          class="btn btn-primary mt-2"
          @click="handleCreateNote"
          :disabled="!newNoteContent.trim() || notesStore.isLoading"
        >
          <i class="bi bi-plus-lg"></i> Notiz erstellen
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="notesStore.isLoading && notesStore.notes.length === 0" class="skeleton-loading">
        <div class="skeleton-card" style="height: 100px;"></div>
        <div class="skeleton-card" style="height: 100px;"></div>
      </div>

      <!-- Empty State -->
      <div v-else-if="notesStore.sortedNotes.length === 0" class="empty-state">
        <i class="bi bi-sticky"></i>
        <p>Noch keine Notizen vorhanden</p>
      </div>

      <!-- Notes List -->
      <div v-else class="notes-list">
        <div
          v-for="note in notesStore.sortedNotes"
          :key="note.note_id"
          class="note-item"
        >
          <!-- View Mode -->
          <template v-if="editingNote?.note_id !== note.note_id">
            <div class="note-content">
              <p class="note-text">{{ note.content }}</p>
              <div class="note-meta">
                <span class="note-author">
                  <i class="bi bi-person-fill"></i>
                  {{ getMemberName(note.created_by) }}
                </span>
                <span class="note-date">
                  <i class="bi bi-clock"></i>
                  {{ formatDate(note.created_at) }}
                </span>
                <span v-if="note.updated_at !== note.created_at" class="note-edited">
                  (bearbeitet)
                </span>
              </div>
            </div>
            <div class="note-actions">
              <button
                class="btn btn-sm btn-outline-secondary"
                @click="startEditing(note)"
                title="Bearbeiten"
              >
                <i class="bi bi-pencil"></i>
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                @click="openDeleteModal(note)"
                title="Löschen"
              >
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </template>

          <!-- Edit Mode -->
          <template v-else>
            <div class="note-edit">
              <textarea
                v-model="editContent"
                class="form-control"
                rows="3"
              ></textarea>
              <div class="edit-actions mt-2">
                <button class="btn btn-sm btn-secondary" @click="cancelEditing">
                  Abbrechen
                </button>
                <button
                  class="btn btn-sm btn-primary"
                  @click="saveEdit"
                  :disabled="!editContent.trim()"
                >
                  Speichern
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3 class="modal-title">Notiz loeschen</h3>
            <button @click="closeDeleteModal" class="btn-close" aria-label="Schliessen">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="modal-body">
            <p>Moechtest du diese Notiz wirklich loeschen?</p>
            <p class="text-muted note-preview">
              "{{ noteToDelete?.content?.substring(0, 100) }}{{ (noteToDelete?.content?.length || 0) > 100 ? '...' : '' }}"
            </p>
          </div>
          <div class="modal-footer">
            <button @click="closeDeleteModal" class="btn btn-secondary">
              Abbrechen
            </button>
            <button @click="confirmDelete" class="btn btn-danger">
              <i class="bi bi-trash"></i> Loeschen
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.note-create-section {
  background: var(--color-background-elevated);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-sm);
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.note-item {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-background-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  transition: all 0.2s;
}

.note-item:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.note-content {
  flex: 1;
  min-width: 0;
}

.note-text {
  margin: 0 0 var(--spacing-sm) 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.note-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.note-author,
.note-date {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.note-author i,
.note-date i {
  font-size: 0.75rem;
}

.note-edited {
  font-style: italic;
}

.note-actions {
  display: flex;
  gap: var(--spacing-xs);
  align-items: flex-start;
}

.note-edit {
  flex: 1;
}

.edit-actions {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: flex-end;
}

.note-preview {
  font-style: italic;
  border-left: 3px solid var(--color-border);
  padding-left: var(--spacing-sm);
}

/* Mobile Optimization */
@media (max-width: 480px) {
  .note-item {
    flex-direction: column;
  }

  .note-actions {
    justify-content: flex-end;
  }
}
</style>
