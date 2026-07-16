<script setup lang="ts">
import { ref, computed } from 'vue'
import { categoryColor } from '@/lib/categoryColor'

export interface CategoryCandidate {
  sourceListId: string
  sourceListName: string
  category: string
  itemCount: number
}

export interface CategoryPreviewItem {
  key: string
  name: string
  quantity: number
}

const props = withDefaults(defineProps<{
  /** true → offer importing the source items; false → reuse the NAME only. */
  importItems?: boolean
  /** Category labels already in the current list (block duplicate create). */
  existingLabels: string[]
  /** All reuse/import options across the household's other lists (unfiltered). */
  candidates: CategoryCandidate[]
  /** Import mode: items that would be copied from a candidate (for the preview). */
  previewItems?: (c: CategoryCandidate) => CategoryPreviewItem[]
  /** Import mode: names already in the target category → shown greyed, skipped. */
  targetDupeNames?: (c: CategoryCandidate) => Set<string>
}>(), {
  importItems: true,
  previewItems: () => [],
  targetDupeNames: () => new Set<string>(),
})

const emit = defineEmits<{
  /** Create/reuse a category by name in the current list. */
  create: [name: string]
  /** Import a candidate's items (only fired when importItems=true). */
  import: [candidate: CategoryCandidate]
  close: []
}>()

const query = ref('')
const confirming = ref<CategoryCandidate | null>(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const matches = q
    ? props.candidates.filter(c => c.category.toLowerCase().includes(q))
    : props.candidates
  if (props.importItems) return matches
  // Name-only reuse: collapse to distinct category names across all lists.
  const seen = new Set<string>()
  const out: CategoryCandidate[] = []
  for (const c of matches) {
    const key = c.category.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
})

const canCreate = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return false
  return !props.existingLabels.some(l => l.trim().toLowerCase() === q)
})

const previewList = computed(() =>
  confirming.value ? props.previewItems(confirming.value) : []
)

const dupeNames = computed(() =>
  confirming.value ? props.targetDupeNames(confirming.value) : new Set<string>()
)

const handleCreate = () => {
  const name = query.value.trim()
  if (!name) return
  emit('create', name)
  emit('close')
}

// Reuse an existing category's name without copying its items.
const reuseName = (c: CategoryCandidate) => {
  emit('create', c.category)
  emit('close')
}

const onCandidate = (c: CategoryCandidate) => {
  if (props.importItems) confirming.value = c
  else reuseName(c)
}

const confirmImport = () => {
  if (!confirming.value) return
  emit('import', confirming.value)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content" @click.stop>
        <!-- Import confirmation step (importItems only) -->
        <template v-if="confirming">
          <div class="modal-header">
            <button class="btn-icon back-btn" @click="confirming = null" title="Zurück">
              <i class="bi bi-arrow-left"></i>
            </button>
            <h5 class="modal-title">
              <span class="cat-dot" :style="{ background: categoryColor(confirming.category) }"></span>
              {{ confirming.category }}
            </h5>
            <button class="btn-close" @click="emit('close')"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted preview-hint">
              Aus „{{ confirming.sourceListName }}" — diese Items werden übernommen:
            </p>
            <ul class="preview-list">
              <li
                v-for="it in previewList"
                :key="it.key"
                :class="{ 'preview-dupe': dupeNames.has(it.name.trim().toLowerCase()) }"
              >
                <span class="preview-name">{{ it.name }}</span>
                <span v-if="it.quantity > 1" class="preview-qty">×{{ it.quantity }}</span>
                <span
                  v-if="dupeNames.has(it.name.trim().toLowerCase())"
                  class="preview-badge"
                >bereits vorhanden</span>
              </li>
            </ul>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="confirming = null">Zurück</button>
            <button class="btn btn-primary" @click="confirmImport">
              <i class="bi bi-box-arrow-in-down me-1"></i> Übernehmen
            </button>
          </div>
        </template>

        <!-- Search / create step -->
        <template v-else>
          <div class="modal-header">
            <h5 class="modal-title">Kategorie hinzufügen</h5>
            <button class="btn-close" @click="emit('close')"></button>
          </div>
          <div class="modal-body">
            <div class="search-box">
              <i class="bi bi-search search-icon"></i>
              <input
                v-model="query"
                type="text"
                class="form-control search-input"
                placeholder="Kategorie suchen oder erstellen…"
                maxlength="100"
                @keyup.enter="canCreate && handleCreate()"
                autofocus
              />
            </div>

            <div class="result-list">
              <button v-if="canCreate" class="result-row create-row" @click="handleCreate">
                <span class="result-icon"><i class="bi bi-plus-circle-fill"></i></span>
                <span class="result-text">
                  „<strong>{{ query.trim() }}</strong>" — Neu erstellen
                </span>
              </button>

              <button
                v-for="cand in filtered"
                :key="`${cand.sourceListId}::${cand.category}`"
                class="result-row"
                @click="onCandidate(cand)"
              >
                <span class="result-icon">
                  <i :class="importItems ? 'bi bi-box-seam' : 'bi bi-tag'"></i>
                </span>
                <span class="result-text">
                  <span class="cat-dot" :style="{ background: categoryColor(cand.category) }"></span>
                  <strong>{{ cand.category }}</strong>
                  <template v-if="importItems">
                    <span class="result-source">· aus {{ cand.sourceListName }}</span>
                    <span class="result-count">({{ cand.itemCount }})</span>
                  </template>
                </span>
                <i class="bi bi-chevron-right result-chevron"></i>
              </button>

              <p v-if="!canCreate && filtered.length === 0" class="empty-hint text-muted">
                {{ query.trim() ? 'Kategorie existiert bereits in dieser Liste.' : 'Tippe, um eine Kategorie zu erstellen oder aus einer anderen Liste zu übernehmen.' }}
              </p>
            </div>
          </div>
        </template>
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

.back-btn {
  margin-right: var(--spacing-sm);
}

.search-box {
  position: relative;
  margin-bottom: var(--spacing-md);
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
}

.search-input {
  padding-left: 36px;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 50vh;
  overflow-y: auto;
}

.result-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: var(--font-base);
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
  min-height: var(--touch-target-min);
}

.result-row:hover {
  border-color: var(--color-primary);
  background: var(--color-background-elevated);
}

.create-row .result-icon {
  color: var(--color-primary);
}

.result-icon {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
}

.result-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.result-source {
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
}

.result-count {
  color: var(--color-text-muted);
  font-size: var(--font-sm);
}

.result-chevron {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.empty-hint {
  padding: var(--spacing-md);
  text-align: center;
  font-size: var(--font-sm);
}

.preview-hint {
  font-size: var(--font-sm);
  margin-bottom: var(--spacing-sm);
}

.preview-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 45vh;
  overflow-y: auto;
}

.preview-list li {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background);
  border-radius: var(--radius-sm);
  font-size: var(--font-base);
}

.preview-dupe {
  opacity: 0.5;
}

.preview-name {
  flex: 1;
  min-width: 0;
}

.preview-qty {
  color: var(--color-text-secondary);
  font-weight: 600;
  font-size: var(--font-sm);
}

.preview-badge {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  font-style: italic;
}
</style>
