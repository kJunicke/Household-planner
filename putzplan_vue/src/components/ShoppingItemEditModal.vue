<script setup lang="ts">
import { ref } from 'vue'
import type { ShoppingItem } from '@/types/ShoppingItem'
import type { CategoryOption } from '@/types/CategoryOption'
import CategoryCombobox from './CategoryCombobox.vue'

const props = defineProps<{
  item: ShoppingItem
  /** Kategorien des Haushalts für die Combobox (aktuelle Liste zuerst). */
  categoryOptions: CategoryOption[]
}>()

const emit = defineEmits<{
  save: [itemId: string, patch: { name: string; category: string | null; quantity: number }]
  delete: [itemId: string]
  close: []
}>()

const name = ref(props.item.name)
const category = ref(props.item.category ?? '')
const quantity = ref(props.item.quantity)
const showDeleteConfirm = ref(false)

const handleSave = () => {
  if (!name.value.trim()) return
  const qty = Math.max(1, Math.floor(Number(quantity.value)) || 1)
  emit('save', props.item.shopping_item_id, {
    name: name.value.trim(),
    category: category.value.trim() || null,
    quantity: qty
  })
}

const stepQty = (delta: number) => {
  quantity.value = Math.max(1, Math.floor(Number(quantity.value) || 1) + delta)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">Artikel bearbeiten</h5>
          <button class="btn-close" @click="emit('close')"></button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input
              v-model="name"
              type="text"
              class="form-control"
              maxlength="200"
              @keyup.enter="handleSave"
              autofocus
            />
          </div>

          <div class="form-group">
            <label class="form-label">Kategorie</label>
            <CategoryCombobox
              v-model="category"
              :options="categoryOptions"
              placeholder="Leer = Unkategorisiert"
              @submit="handleSave"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Menge</label>
            <div class="qty-edit">
              <button class="btn btn-outline-secondary qty-edit-btn" type="button" @click="stepQty(-1)" :disabled="quantity <= 1">
                <i class="bi bi-dash-lg"></i>
              </button>
              <input
                v-model.number="quantity"
                type="number"
                class="form-control qty-edit-input"
                min="1"
                max="999"
              />
              <button class="btn btn-outline-secondary qty-edit-btn" type="button" @click="stepQty(1)">
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>
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
            <span class="text-danger me-2">Wirklich löschen?</span>
            <button class="btn btn-sm btn-danger me-1" @click="emit('delete', item.shopping_item_id)">Ja</button>
            <button class="btn btn-sm btn-secondary" @click="showDeleteConfirm = false">Abbrechen</button>
          </div>

          <button class="btn btn-secondary" @click="emit('close')">Abbrechen</button>
          <button class="btn btn-primary" @click="handleSave" :disabled="!name.trim()">
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

.qty-edit {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.qty-edit-btn {
  flex-shrink: 0;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.qty-edit-input {
  text-align: center;
  max-width: 90px;
}
</style>
