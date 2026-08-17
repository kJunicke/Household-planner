<script setup lang="ts">
/**
 * WEGWERF-PROTOTYP — nicht in Produktion uebernehmen.
 *
 * Frage: Welche Formsprache bekommt die Einkaufsliste im Pinnwand-Aussehen?
 * Vier Varianten auf der Wegwerf-Route /prototype/einkauf, umschaltbar per
 * `?variant=A|B|C|D` und ueber die Leiste unten.
 *
 * Liest die echten Daten aus dem shoppingStore, schreibt aber NICHTS zurueck:
 * Abhaken und Hinzufuegen leben nur im Speicher dieser Seite.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useShoppingStore, categoryKey } from '@/stores/shoppingStore'
import { categoryColor } from '@/lib/categoryColor'
import type { PSection, PItem } from '@/components/prototype/types'
import PrototypeSwitcher from '@/components/prototype/PrototypeSwitcher.vue'
import EinkaufVariantA from '@/components/prototype/EinkaufVariantA.vue'
import EinkaufVariantB from '@/components/prototype/EinkaufVariantB.vue'
import EinkaufVariantC from '@/components/prototype/EinkaufVariantC.vue'
import EinkaufVariantD from '@/components/prototype/EinkaufVariantD.vue'

const route = useRoute()
const router = useRouter()
const shoppingStore = useShoppingStore()

const VARIANTS = [
  { key: 'A', name: 'Der lange Zettel' },
  { key: 'B', name: 'Karierter Abrissblock' },
  { key: 'C', name: 'Gebuendelte Kategorie-Zettel' },
  { key: 'D', name: 'Kassenbon' },
]

const variant = computed(() => {
  const v = String(route.query.variant ?? 'A').toUpperCase()
  return VARIANTS.some(x => x.key === v) ? v : 'A'
})
const setVariant = (v: string) => router.replace({ query: { ...route.query, variant: v } })

// --- lokaler, fluechtiger Zustand ------------------------------------------
/** Ueberschreibt den gekauft-Status rein lokal — kein Schreibzugriff auf die DB. */
const localToggled = ref<Set<string>>(new Set())
/** Nur im Speicher hinzugefuegte Produkte. */
const localAdded = ref<PItem[]>([])
let localSeq = 0

const isPurchased = (id: string, base: boolean) =>
  localToggled.value.has(id) ? !base : base

const onToggle = (id: string) => {
  const next = new Set(localToggled.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  localToggled.value = next
}

const onAdd = (name: string, category: string | null, qty: number) => {
  if (!name.trim()) return
  localAdded.value = [
    ...localAdded.value,
    {
      id: `proto_${localSeq++}`,
      name: name.trim(),
      qty: Math.max(1, Math.floor(qty || 1)),
      purchased: false,
      priority: false,
      category,
    },
  ]
}

// --- Daten aufbereiten ------------------------------------------------------
const allItems = computed<PItem[]>(() => {
  const fromStore = shoppingStore.currentListItems.map(i => ({
    id: i.shopping_item_id,
    name: i.name,
    qty: i.quantity,
    purchased: isPurchased(i.shopping_item_id, i.purchased),
    priority: !!i.is_priority,
    category: i.category ?? null,
  }))
  const added = localAdded.value.map(i => ({
    ...i,
    purchased: isPurchased(i.id, false),
  }))
  return [...fromStore, ...added]
})

const sections = computed<PSection[]>(() => {
  const map = new Map<string, PSection>()
  for (const it of allItems.value) {
    if (it.purchased) continue
    const key = categoryKey(it.category)
    let sec = map.get(key)
    if (!sec) {
      sec = {
        key,
        label: it.category ?? 'Ohne Kategorie',
        category: it.category,
        color: categoryColor(it.category),
        isUncategorized: !it.category,
        items: [],
      }
      map.set(key, sec)
    }
    sec.items.push(it)
  }
  // Kategorien fuer die Zielauswahl/Kopfzeilen auch dann zeigen, wenn leer.
  for (const c of shoppingStore.currentListCategories) {
    const key = categoryKey(c.name)
    if (map.has(key)) continue
    map.set(key, {
      key,
      label: c.name,
      category: c.name,
      color: categoryColor(c.name),
      isUncategorized: false,
      items: [],
    })
  }
  return [...map.values()].sort((a, b) => {
    if (a.isUncategorized !== b.isUncategorized) return a.isUncategorized ? 1 : -1
    if ((a.items.length > 0) !== (b.items.length > 0)) return a.items.length > 0 ? -1 : 1
    return a.label.localeCompare(b.label, 'de')
  })
})

const bought = computed<PItem[]>(() => allItems.value.filter(i => i.purchased))

const lists = computed(() =>
  shoppingStore.lists.map(l => ({ id: l.list_id, name: l.name }))
)

onMounted(async () => {
  await shoppingStore.loadLists()
  await shoppingStore.loadItems()
  await shoppingStore.loadCategories()
})
</script>

<template>
  <div class="proto-page">
    <p class="proto-banner">
      PROTOTYP — Wegwerf-Route. Abhaken und Hinzufuegen bleiben lokal.
    </p>

    <EinkaufVariantA
      v-if="variant === 'A'"
      :sections="sections"
      :bought="bought"
      :lists="lists"
      :current-list-id="shoppingStore.currentListId"
      @toggle="onToggle"
      @add="onAdd"
      @select-list="(id: string) => (shoppingStore.currentListId = id)"
    />
    <EinkaufVariantB
      v-else-if="variant === 'B'"
      :sections="sections"
      :bought="bought"
      :lists="lists"
      :current-list-id="shoppingStore.currentListId"
      @toggle="onToggle"
      @add="onAdd"
      @select-list="(id: string) => (shoppingStore.currentListId = id)"
    />
    <EinkaufVariantC
      v-else-if="variant === 'C'"
      :sections="sections"
      :bought="bought"
      :lists="lists"
      :current-list-id="shoppingStore.currentListId"
      @toggle="onToggle"
      @add="onAdd"
      @select-list="(id: string) => (shoppingStore.currentListId = id)"
    />
    <EinkaufVariantD
      v-else
      :sections="sections"
      :bought="bought"
      :lists="lists"
      :current-list-id="shoppingStore.currentListId"
      @toggle="onToggle"
      @add="onAdd"
      @select-list="(id: string) => (shoppingStore.currentListId = id)"
    />

    <PrototypeSwitcher :variants="VARIANTS" :current="variant" @select="setVariant" />
  </div>
</template>

<style scoped>
.proto-page {
  min-height: 100vh;
  padding-bottom: 96px;
}
.proto-banner {
  margin: 0;
  padding: 4px 8px;
  background: #ff3b30;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-align: center;
}
</style>
