<script setup lang="ts">
/** Packliste = shared Checkliste screen + packing store instance + wording. */
import { usePackingStore } from '@/stores/packingStore'
import ChecklistView, { type ChecklistLabels } from '@/components/ChecklistView.vue'

const packingStore = usePackingStore()

const labels: ChecklistLabels = {
  createListTitle: 'Neue Packliste',
  createListChipTitle: 'Neue Packliste erstellen',
  createListNamePlaceholder: 'z.B. Wochenend-Trip, Urlaub, Wandern…',
  emptyIcon: 'bi-bag-x',
  emptyText: 'Noch keine Packliste vorhanden',
  progressVerb: 'gepackt',
  notesIcon: 'bi-journal-text',
  notesTitle: 'Reise-Notizen',
  notesPlaceholder: 'z.B. Wird warm (25°C), 5 Tage, Wanderschuhe nicht vergessen…',
  resetConfirmBody: 'Alle Items werden als ungepackt markiert (inkl. Zähler).',
}
</script>

<template>
  <ChecklistView
    :store="packingStore"
    :labels="labels"
    rail-storage-key="putzplan_packing_rail_collapsed"
  />
</template>
