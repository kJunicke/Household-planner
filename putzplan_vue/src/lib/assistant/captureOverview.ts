/**
 * Holt die Übersicht für eine Frage aus den Stores (siehe overview.ts) und
 * lädt vorher, was noch keine Seite geladen hat: der Chat kann auf jeder Seite
 * geöffnet werden.
 */
import { useAuthStore } from '@/stores/authStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { useNotesStore } from '@/stores/notesStore'
import { usePackingStore } from '@/stores/packingStore'
import { usePotStore } from '@/stores/potStore'
import { useShoppingStore } from '@/stores/shoppingStore'
import { useTodoStore } from '@/stores/todoStore'
import { buildOverview } from './overview'
import { ensureShoppingLoaded } from './shoppingTools'

/** Ein leerer Bereich wird bei jeder Frage neu geladen; das kostet eine kleine Abfrage. */
export async function captureOverview(): Promise<string> {
  const shopping = useShoppingStore()
  const packing = usePackingStore()
  const todo = useTodoStore()
  const notes = useNotesStore()
  // Der Topf-Store lädt sich selbst, sobald es ihn gibt.
  const pots = usePotStore()
  await Promise.all([
    ensureShoppingLoaded(shopping),
    packing.lists.length ? null : packing.loadLists(),
    todo.lists.length ? null : todo.loadLists(),
    notes.notes.length ? null : notes.loadNotes(),
  ])
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return buildOverview({
    today,
    askingUserId: useAuthStore().user?.id ?? '',
    members: useHouseholdStore().householdMembers,
    shoppingLists: shopping.lists,
    packingLists: packing.lists,
    todoLists: todo.lists,
    notes: notes.sortedNotes,
    pots: pots.pots,
  })
}
