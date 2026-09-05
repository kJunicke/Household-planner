<script setup lang="ts">
import { computed, ref } from 'vue'
import { categoryColor } from '@/lib/categoryColor'

/**
 * Wortwahl der Löschvarianten. Der Standard ist der Einkauf, weil er diese
 * Maske zuerst hatte; Packliste und To-do reichen ihre eigenen Wörter durch.
 */
export interface CategoryEditWording {
  /** Einzahl eines Eintrags: „Produkt" / „Gegenstand" / „Eintrag". */
  itemOne: string
  /** Mehrzahl: „Produkte" / „Gegenstände" / „Einträge". */
  itemMany: string
  /** Beiwort der erledigten, Mehrzahl: „gekaufte" / „gepackte" / „erledigte". */
  doneMany: string
  /**
   * Beiwort der erledigten, Einzahl — eigene Endung, weil Adjektiv und Nomen
   * unterschiedliches Geschlecht haben können: „gekauftes Produkt" (sächlich)
   * vs. „erledigter Eintrag" (männlich).
   */
  doneOne: string
  /**
   * true → die zweite Variante löscht auch die erledigten Einträge mit
   * (Checkliste, E2). false → sie bleiben und verlieren nur die Zuordnung,
   * weil sie im Einkauf Kaufhistorie tragen.
   */
  deleteDoneToo: boolean
}

const props = withDefaults(
  defineProps<{
    category: string
    /** Noch nicht gekaufte Produkte — sie werden gelöscht oder verschoben. */
    itemCount: number
    /**
     * Bereits gekaufte Produkte dieser Kategorie. Sie verlieren in beiden
     * Varianten ihre Zuordnung, zählen also gegen „leer".
     */
    purchasedCount?: number
    /**
     * Beide Löschvarianten anbieten und eine leere Kategorie ohne Rückfrage
     * löschen. Einkauf, Packliste und To-do setzen das seit Etappe 2 alle
     * gleich; der Standardwert `false` bleibt nur für Aufrufer ohne Angabe.
     */
    variants?: boolean
    /** Fehlt → heutige Einkaufs-Texte. */
    wording?: Partial<CategoryEditWording>
  }>(),
  { variants: false, purchasedCount: 0, wording: undefined }
)

const w = computed<CategoryEditWording>(() => ({
  itemOne: 'Produkt',
  itemMany: 'Produkte',
  doneMany: 'gekaufte',
  doneOne: 'gekauftes',
  deleteDoneToo: false,
  ...props.wording,
}))

const noun = (n: number) => (n === 1 ? w.value.itemOne : w.value.itemMany)
const doneWord = (n: number) => (n === 1 ? w.value.doneOne : w.value.doneMany)

/**
 * Zahl der zweiten Variante: In der Checkliste verschwinden die erledigten
 * Einträge mit, also müssen sie auch mitgezählt werden — sonst verspricht der
 * Knopf weniger, als er tut.
 */
const deleteCount = computed(() =>
  w.value.deleteDoneToo ? props.itemCount + props.purchasedCount : props.itemCount
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
  const isEmpty = props.itemCount === 0 && props.purchasedCount === 0
  if (props.variants && isEmpty) emit('delete', props.category, false)
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
                <template v-if="itemCount > 0">
                  {{ itemCount }} {{ noun(itemCount) }}
                  {{ itemCount === 1 ? 'wandert' : 'wandern' }}
                  nach „Unkategorisiert"
                </template>
                <template v-else>
                  {{ purchasedCount }} {{ doneWord(purchasedCount) }}
                  {{ noun(purchasedCount) }}
                  {{ purchasedCount === 1 ? 'verliert' : 'verlieren' }}
                  die Zuordnung
                </template>
              </small>
            </button>
            <button
              v-if="deleteCount > 0"
              class="btn btn-sm btn-danger"
              @click="emit('delete', category, true)"
            >
              Kategorie + {{ deleteCount }} {{ noun(deleteCount) }} löschen
              <small v-if="!w.deleteDoneToo && purchasedCount > 0" class="d-block">
                {{ purchasedCount }} {{ doneWord(purchasedCount) }} {{ noun(purchasedCount) }}
                {{ purchasedCount === 1 ? 'bleibt' : 'bleiben' }}, ohne Kategorie
              </small>
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
