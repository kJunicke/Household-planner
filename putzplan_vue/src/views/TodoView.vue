<script setup lang="ts">
/** To-do = shared Checkliste screen + todo store instance + wording. */
import { useTodoStore } from '@/stores/todoStore'
import ChecklistView, { type ChecklistLabels } from '@/components/ChecklistView.vue'

const todoStore = useTodoStore()

const labels: ChecklistLabels = {
  createListTitle: 'Neue To-do-Liste',
  createListChipTitle: 'Neue To-do-Liste erstellen',
  createListNamePlaceholder: 'z.B. Putztag, Umzug, Wochenende…',
  emptyIcon: 'bi-check2-square',
  emptyText: 'Noch keine To-do-Liste vorhanden',
  progressVerb: 'erledigt',
  notesIcon: 'bi-journal-text',
  notesTitle: 'Notiz zur Liste',
  notesPlaceholder: 'z.B. Schlüssel bei Nachbarn abholen, Putzmittel sind alle…',
  resetConfirmBody: 'Alle Einträge werden wieder als offen markiert (inkl. Zähler).',
}
</script>

<template>
  <ChecklistView
    :store="todoStore"
    :labels="labels"
    rail-storage-key="putzplan_todo_rail_collapsed"
  />
</template>
