import { createChecklistStore } from './createChecklistStore'

/**
 * Packliste = one instance of the shared Checkliste data layer.
 * All logic lives in `createChecklistStore`.
 */
export const usePackingStore = createChecklistStore({
  storeId: 'packing',
  listsTable: 'packing_lists',
  itemsTable: 'packing_items',
  categoriesTable: 'packing_categories',
  channelPrefix: 'packing',
  labels: {
    loadListsError: 'Fehler beim Laden der Packlisten',
    createListError: 'Fehler beim Erstellen der Packliste',
    loadItemsError: 'Fehler beim Laden der Packliste',
    resetSuccess: 'Alle als ungepackt markiert',
    syncSuccess: 'Packliste synchronisiert',
  },
})

export { UNCATEGORIZED } from '@/types/Checklist'
export type { CategoryGroup } from '@/types/Checklist'
