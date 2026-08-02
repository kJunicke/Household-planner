<script setup lang="ts">
import { computed, ref } from 'vue'
import { categoryColor } from '@/lib/categoryColor'
import CategoryCombobox from '@/components/CategoryCombobox.vue'
import type { CategoryOption } from '@/types/CategoryOption'
import type { ShoppingItem } from '@/types/ShoppingItem'

const props = defineProps<{
  /** Alle Produkte der aktuellen Liste — auch die schon gekauften. */
  items: ShoppingItem[]
  /** Kategorien des Haushalts für die Combobox. */
  categoryOptions: CategoryOption[]
}>()

const emit = defineEmits<{
  create: [name: string, itemIds: string[]]
  close: []
}>()

const name = ref('')
const selected = ref<Set<string>>(new Set())

/**
 * Offene Produkte zuerst, gekaufte darunter: umgehängt werden dürfen beide —
 * ein gekauftes Produkt trägt seine Kategorie mit und käme beim Zurücksetzen
 * sonst in der alten Sektion wieder hoch.
 */
const rows = computed(() =>
  [...props.items].sort((a, b) => {
    if (a.purchased !== b.purchased) return a.purchased ? 1 : -1
    return a.name.localeCompare(b.name)
  })
)

const toggle = (itemId: string) => {
  const next = new Set(selected.value)
  if (next.has(itemId)) next.delete(itemId)
  else next.add(itemId)
  selected.value = next
}

const canSubmit = computed(() => name.value.trim().length > 0)

const submit = () => {
  if (!canSubmit.value) return
  emit('create', name.value.trim(), [...selected.value])
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
            Produkte, die hineingehören — bereits zugeordnete dürfen wechseln.
          </p>

          <div v-if="rows.length" class="pick-list">
            <button
              v-for="item in rows"
              :key="item.shopping_item_id"
              type="button"
              class="pick-row"
              :class="{ picked: selected.has(item.shopping_item_id) }"
              @click="toggle(item.shopping_item_id)"
            >
              <i
                class="pick-box bi"
                :class="selected.has(item.shopping_item_id) ? 'bi-check-square-fill' : 'bi-square'"
              ></i>
              <span class="pick-name" :class="{ bought: item.purchased }">{{ item.name }}</span>
              <span v-if="item.quantity > 1" class="pick-qty">×{{ item.quantity }}</span>
              <span v-if="item.category" class="pick-current">
                <span class="pick-dot" :style="{ background: categoryColor(item.category) }"></span>
                {{ item.category }}
              </span>
            </button>
          </div>
          <p v-else class="empty-hint text-muted">Diese Liste hat noch keine Produkte.</p>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="emit('close')">Abbrechen</button>
          <button class="btn btn-primary" :disabled="!canSubmit" @click="submit">
            Anlegen<span v-if="selected.size"> ({{ selected.size }})</span>
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
.pick-name.bought {
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
</style>
