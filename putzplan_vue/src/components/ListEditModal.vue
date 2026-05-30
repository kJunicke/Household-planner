<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  list: { list_id: string; name: string }
  canDelete: boolean
}>()

const emit = defineEmits<{
  rename: [listId: string, name: string]
  delete: [listId: string]
  close: []
}>()

const editName = ref(props.list.name)
const showDeleteConfirm = ref(false)

const handleRename = () => {
  if (!editName.value.trim()) return
  emit('rename', props.list.list_id, editName.value.trim())
}

const handleDelete = () => {
  emit('delete', props.list.list_id)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-container">
        <div class="modal-header">
          <h5 class="modal-title">Liste bearbeiten</h5>
          <button class="btn-close" @click="emit('close')"></button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input
              v-model="editName"
              type="text"
              class="form-control"
              maxlength="100"
              @keyup.enter="handleRename"
            />
          </div>
        </div>

        <div class="modal-footer">
          <button
            v-if="canDelete && !showDeleteConfirm"
            class="btn btn-outline-danger me-auto"
            @click="showDeleteConfirm = true"
          >
            <i class="bi bi-trash me-1"></i> Löschen
          </button>

          <div v-if="showDeleteConfirm" class="delete-confirm me-auto">
            <span class="text-danger me-2">Liste wirklich löschen?</span>
            <button class="btn btn-sm btn-danger me-1" @click="handleDelete">Ja, löschen</button>
            <button class="btn btn-sm btn-secondary" @click="showDeleteConfirm = false">Abbrechen</button>
          </div>

          <button class="btn btn-secondary" @click="emit('close')">Abbrechen</button>
          <button
            class="btn btn-primary"
            @click="handleRename"
            :disabled="!editName.trim() || editName.trim() === list.name"
          >
            <i class="bi bi-check-lg me-1"></i> Speichern
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.delete-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
