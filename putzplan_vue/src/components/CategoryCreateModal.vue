<script setup lang="ts">
/**
 * Kategorie anlegen — für Einkauf, Packliste und To-do dieselbe Maske.
 *
 * Verallgemeinerung von `ShoppingCategoryCreateModal.vue`: Aufbau, Styles und
 * die 48-px-Trefferflächen sind übernommen, die Wortwahl kommt über `itemNoun`.
 * Neu ist der Block „Einträge übernehmen aus": er löst das alte
 * `CategorySearchModal` ab. Standard bleibt „nur den Namen übernehmen"
 * (Radio „keine"); das Kopieren fremder Einträge ist eine ausdrückliche
 * Zusatzentscheidung und keine Nebenwirkung der Namenswahl.
 */
import { computed, ref, watch } from 'vue'
import { categoryColor } from '@/lib/categoryColor'
import { normalizeCategoryName } from '@/lib/categoryOrder'
import CategoryCombobox from '@/components/CategoryCombobox.vue'
import type { CategoryOption } from '@/types/CategoryOption'
import type { ImportSource } from '@/types/CategoryImport'

/** Eintrag einer Liste, so wie diese Maske ihn braucht — listentypunabhängig. */
export interface PickableItem {
  id: string
  name: string
  quantity: number
  category: string | null
  done: boolean
}

const props = defineProps<{
  /** Alle Einträge der aktuellen Liste — die erledigten eingeschlossen. */
  items: PickableItem[]
  /** Kategorien des Haushalts für die Combobox. */
  categoryOptions: CategoryOption[]
  /** Wortwahl: „Produkte, die hineingehören…" vs. „Einträge, die hineingehören…". */
  itemNoun: { one: string; many: string }
  /** Fremde Listen mit gleichnamiger Kategorie. Fehlt → kein Import-Bereich. */
  importSourcesFor?: (name: string) => ImportSource[]
  /** Einträge, die aus einer Quelle übernommen würden (Vorschau). */
  importPreview?: (source: ImportSource, name: string) => PickableItem[]
}>()

const emit = defineEmits<{
  create: [name: string, itemIds: string[], importFrom: ImportSource | null]
  close: []
}>()

const name = ref('')
const selected = ref<Set<string>>(new Set())
const importFrom = ref<ImportSource | null>(null)

/**
 * Offene Einträge zuerst, erledigte darunter: umgehängt werden dürfen beide —
 * ein erledigter Eintrag trägt seine Kategorie mit und käme beim Zurücksetzen
 * sonst in der alten Sektion wieder hoch.
 */
const rows = computed(() =>
  [...props.items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.name.localeCompare(b.name)
  })
)

const toggle = (itemId: string) => {
  const next = new Set(selected.value)
  if (next.has(itemId)) next.delete(itemId)
  else next.add(itemId)
  selected.value = next
}

// --- Import ----------------------------------------------------------------

const importSources = computed<ImportSource[]>(() => {
  const q = name.value.trim()
  if (!q || !props.importSourcesFor) return []
  return props.importSourcesFor(q)
})

// Eine Quelle, die zum getippten Namen nicht mehr passt, darf nicht ausgewählt
// bleiben — sonst übernimmt der Bestätigen-Knopf Einträge aus einer Liste, die
// gar nicht mehr angeboten wird.
watch(importSources, (sources) => {
  if (!importFrom.value) return
  if (!sources.some(s => s.listId === importFrom.value?.listId)) importFrom.value = null
})

const previewItems = computed<PickableItem[]>(() => {
  const source = importFrom.value
  if (!source || !props.importPreview) return []
  return props.importPreview(source, name.value.trim())
})

/**
 * Dubletten sind Namen, die in der Zielkategorie schon landen, bevor der
 * Import läuft: Einträge, die schon dort sind, *und* die gerade angekreuzten
 * — `createCategory` hängt `itemIds` erst um und importiert danach, der
 * Store überspringt Namensdubletten. Der Vergleich läuft über den
 * getrimmten Kleinbuchstaben-Namen, wie dort auch.
 */
const dupeNames = computed(() => {
  const target = normalizeCategoryName(name.value)
  const existing = props.items
    .filter(i => normalizeCategoryName(i.category ?? '') === target)
    .map(i => normalizeCategoryName(i.name))
  const picked = props.items
    .filter(i => selected.value.has(i.id))
    .map(i => normalizeCategoryName(i.name))
  return new Set([...existing, ...picked])
})

const isDupe = (item: PickableItem) => dupeNames.value.has(normalizeCategoryName(item.name))

/** Wie viele Einträge wirklich ankommen — Dubletten zählen nicht mit. */
const importCount = computed(() => {
  if (!importFrom.value) return 0
  if (!props.importPreview) return importFrom.value.count
  return previewItems.value.filter(i => !isDupe(i)).length
})

const canSubmit = computed(() => name.value.trim().length > 0)

/** „Anlegen (2 + 8 übernommen)" — beide Zahlen stehen für getrennte Entscheidungen. */
const countLabel = computed(() => {
  const picked = selected.value.size
  const imported = importCount.value
  if (picked && imported) return ` (${picked} + ${imported} übernommen)`
  if (picked) return ` (${picked})`
  if (imported) return ` (${imported} übernommen)`
  return ''
})

const submit = () => {
  if (!canSubmit.value) return
  emit('create', name.value.trim(), [...selected.value], importFrom.value)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h5 class="modal-title">Kategorie anlegen</h5>
          <button class="btn-close" @click="emit('close')"></button>
        </div>

        <div class="modal-body">
          <CategoryCombobox
            v-model="name"
            :options="categoryOptions"
            placeholder="Name der Kategorie…"
            @submit="submit"
          />

          <p class="pick-hint text-muted">
            {{ itemNoun.many }}, die hineingehören — bereits zugeordnete dürfen wechseln.
          </p>

          <div v-if="rows.length" class="pick-list">
            <button
              v-for="item in rows"
              :key="item.id"
              type="button"
              class="pick-row"
              :class="{ picked: selected.has(item.id) }"
              @click="toggle(item.id)"
            >
              <i
                class="pick-box bi"
                :class="selected.has(item.id) ? 'bi-check-square-fill' : 'bi-square'"
              ></i>
              <span class="pick-name" :class="{ done: item.done }">{{ item.name }}</span>
              <span v-if="item.quantity > 1" class="pick-qty">×{{ item.quantity }}</span>
              <span v-if="item.category" class="pick-current">
                <span class="pick-dot" :style="{ background: categoryColor(item.category) }"></span>
                {{ item.category }}
              </span>
            </button>
          </div>
          <p v-else class="empty-hint text-muted">
            Diese Liste hat noch keine {{ itemNoun.many }}.
          </p>

          <!-- Übernehmen aus einer fremden Liste: nur sichtbar, wenn es zum
               getippten Namen überhaupt eine Quelle gibt. -->
          <template v-if="importSources.length">
            <p class="pick-hint text-muted">{{ itemNoun.many }} übernehmen aus</p>
            <div class="src-list">
              <button
                type="button"
                class="src-row"
                :class="{ picked: !importFrom }"
                @click="importFrom = null"
              >
                <i class="src-box bi" :class="!importFrom ? 'bi-record-circle' : 'bi-circle'"></i>
                <span class="src-name">keine — nur den Namen anlegen</span>
              </button>
              <button
                v-for="source in importSources"
                :key="source.listId"
                type="button"
                class="src-row"
                :class="{ picked: importFrom?.listId === source.listId }"
                @click="importFrom = source"
              >
                <i
                  class="src-box bi"
                  :class="importFrom?.listId === source.listId ? 'bi-record-circle' : 'bi-circle'"
                ></i>
                <span class="src-name">{{ source.listName }}</span>
                <span class="src-count">({{ source.count }})</span>
              </button>
            </div>

            <ul v-if="importFrom && previewItems.length" class="preview-list">
              <li
                v-for="item in previewItems"
                :key="item.id"
                :class="{ 'preview-dupe': isDupe(item) }"
              >
                <span class="preview-name">{{ item.name }}</span>
                <span v-if="item.quantity > 1" class="preview-qty">×{{ item.quantity }}</span>
                <span v-if="isDupe(item)" class="preview-badge">bereits vorhanden</span>
              </li>
            </ul>
          </template>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="emit('close')">Abbrechen</button>
          <button class="btn btn-primary" :disabled="!canSubmit" @click="submit">
            Anlegen<span v-if="countLabel">{{ countLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pick-hint {
  font-size: var(--font-sm);
  margin: var(--spacing-md) 0 var(--spacing-sm);
}

.pick-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 45vh;
  overflow-y: auto;
}

.pick-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  min-height: var(--touch-target-min);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: var(--font-base);
  text-align: left;
  cursor: pointer;
}
.pick-row.picked {
  border-color: var(--color-primary);
  background: var(--color-background-elevated);
}

.pick-box {
  flex-shrink: 0;
  color: var(--color-text-muted);
}
.pick-row.picked .pick-box { color: var(--color-primary); }

.pick-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick-name.done {
  text-decoration: line-through;
  color: var(--color-text-muted);
}

.pick-qty {
  flex-shrink: 0;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
}

/* Aktuelle Zugehörigkeit: dezent, aber sichtbar — sie ist der Grund, warum man
   hier umsortiert statt nur ergänzt. */
.pick-current {
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.pick-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

.empty-hint {
  padding: var(--spacing-md);
  text-align: center;
  font-size: var(--font-sm);
}

/* ---- Import ---- */
.src-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Radio-Zeilen tragen dieselbe Trefferfläche wie die Ankreuzliste darüber. */
.src-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  min-height: var(--touch-target-min);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: var(--font-base);
  text-align: left;
  cursor: pointer;
}
.src-row.picked {
  border-color: var(--color-primary);
  background: var(--color-background-elevated);
}

.src-box {
  flex-shrink: 0;
  color: var(--color-text-muted);
}
.src-row.picked .src-box { color: var(--color-primary); }

.src-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.src-count {
  flex-shrink: 0;
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.preview-list {
  list-style: none;
  margin: var(--spacing-sm) 0 0;
  padding: 0;
  max-height: 30vh;
  overflow-y: auto;
}
.preview-list li {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 6px var(--spacing-md);
  font-size: var(--font-sm);
  border-bottom: 1px solid var(--color-border);
}
.preview-list li:last-child { border-bottom: none; }

.preview-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-qty {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* Ausgegraut heißt hier „wird übersprungen" — der Store überspringt genau
   diese Namen beim Kopieren. */
.preview-dupe .preview-name {
  color: var(--color-text-muted);
  text-decoration: line-through;
}

.preview-badge {
  flex-shrink: 0;
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}
</style>
