<script setup lang="ts">
import { ref } from 'vue'
import { categoryColor } from '@/lib/categoryColor'

const props = defineProps<{
  category: string
  itemCount: number
}>()

const emit = defineEmits<{
  rename: [oldName: string, newName: string]
  delete: [category: string]
  close: []
}>()

const editName = ref(props.category)
const showDeleteConfirm = ref(false)

const handleRename = () => {
  const name = editName.value.trim()
  if (!name) return
  emit('rename', props.category, name)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">
            <span class="cat-dot" :style="{ background: categoryColor(category) }"></span>
            Kategorie bearbeiten
          </h5>
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
              autofocus
            />
          </div>
        </div>

        <div class="modal-footer">
          <button
            v-if="!showDeleteConfirm"
            class="btn btn-outline-danger me-auto"
            @click="showDeleteConfirm = true"
          >
            <i class="bi bi-trash me-1"></i> Löschen
          </button>

          <div v-if="showDeleteConfirm" class="delete-confirm me-auto">
            <span class="text-danger me-2">
              {{ itemCount > 0 ? `Kategorie + ${itemCount} ${itemCount === 1 ? 'Item' : 'Items'} löschen?` : 'Kategorie löschen?' }}
            </span>
            <button class="btn btn-sm btn-danger me-1" @click="emit('delete', category)">Ja</button>
            <button class="btn btn-sm btn-secondary" @click="showDeleteConfirm = false">Abbrechen</button>
          </div>

          <button class="btn btn-secondary" @click="emit('close')">Abbrechen</button>
          <button
            class="btn btn-primary"
            @click="handleRename"
            :disabled="!editName.trim() || editName.trim() === category"
          >
            <i class="bi bi-check-lg me-1"></i> Speichern
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cat-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  flex-shrink: 0;
}
.delete-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
