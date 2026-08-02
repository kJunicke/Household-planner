<script setup lang="ts">
import { ref } from 'vue'
import { categoryColor } from '@/lib/categoryColor'

const props = withDefaults(
  defineProps<{
    category: string
    itemCount: number
    /**
     * Einkaufsliste: beide Löschvarianten anbieten und eine leere Kategorie
     * ohne Rückfrage löschen. Die Packliste kennt die Varianten noch nicht und
     * bleibt bis Etappe 2 beim einfachen „Ja/Abbrechen".
     */
    variants?: boolean
  }>(),
  { variants: false }
)

const emit = defineEmits<{
  rename: [oldName: string, newName: string]
  /** withItems nur im Varianten-Modus gesetzt. */
  delete: [category: string, withItems: boolean]
  close: []
}>()

const editName = ref(props.category)
const showDeleteConfirm = ref(false)

const handleRename = () => {
  const name = editName.value.trim()
  if (!name) return
  emit('rename', props.category, name)
}

/** Leer heißt: nichts zu verlieren — dann ist die Rückfrage nur im Weg. */
const onDeleteClick = () => {
  if (props.variants && props.itemCount === 0) emit('delete', props.category, false)
  else showDeleteConfirm.value = true
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
            @click="onDeleteClick"
          >
            <i class="bi bi-trash me-1"></i> Löschen
          </button>

          <!-- Varianten-Modus: beide Wege ausdrücklich benannt, mit konkreter Zahl. -->
          <div v-else-if="variants" class="delete-variants me-auto">
            <button class="btn btn-sm btn-outline-danger" @click="emit('delete', category, false)">
              Nur Kategorie löschen
              <small class="d-block text-muted">
                {{ itemCount }} {{ itemCount === 1 ? 'Produkt wandert' : 'Produkte wandern' }}
                nach „Unkategorisiert"
              </small>
            </button>
            <button class="btn btn-sm btn-danger" @click="emit('delete', category, true)">
              Kategorie + {{ itemCount }} {{ itemCount === 1 ? 'Produkt' : 'Produkte' }} löschen
            </button>
            <button class="btn btn-sm btn-secondary" @click="showDeleteConfirm = false">
              Abbrechen
            </button>
          </div>

          <div v-else class="delete-confirm me-auto">
            <span class="text-danger me-2">
              {{ itemCount > 0 ? `Kategorie + ${itemCount} ${itemCount === 1 ? 'Item' : 'Items'} löschen?` : 'Kategorie löschen?' }}
            </span>
            <button class="btn btn-sm btn-danger me-1" @click="emit('delete', category, true)">Ja</button>
            <button class="btn btn-sm btn-secondary" @click="showDeleteConfirm = false">Abbrechen</button>
          </div>

          <!-- Während der Löschfrage keine zweite Entscheidung danebenstellen. -->
          <template v-if="!(variants && showDeleteConfirm)">
            <button class="btn btn-secondary" @click="emit('close')">Abbrechen</button>
            <button
              class="btn btn-primary"
              @click="handleRename"
              :disabled="!editName.trim() || editName.trim() === category"
            >
              <i class="bi bi-check-lg me-1"></i> Speichern
            </button>
          </template>
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
.delete-variants {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  width: 100%;
}
.delete-variants .btn {
  min-height: var(--touch-target-min);
  text-align: left;
}
.delete-variants small {
  font-size: var(--font-xs);
}
.delete-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
