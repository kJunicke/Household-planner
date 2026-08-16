import { createChecklistStore } from './createChecklistStore'

/**
 * To-do = one instance of the shared Checkliste data layer.
 * All logic lives in `createChecklistStore`.
 *
 * Wording: ein einzelnes Element heißt **Eintrag**. „Aufgabe" ist im
 * Glossar fest für die Tasks des Putzen-Tabs belegt und darf hier nicht
 * auftauchen.
 */
export const useTodoStore = createChecklistStore({
  storeId: 'todo',
  listsTable: 'todo_lists',
  itemsTable: 'todo_items',
  channelPrefix: 'todo',
  labels: {
    loadListsError: 'Fehler beim Laden der To-do-Listen',
    createListError: 'Fehler beim Erstellen der To-do-Liste',
    loadItemsError: 'Fehler beim Laden der To-do-Liste',
    resetSuccess: 'Alle Einträge zurückgesetzt',
  },
})
