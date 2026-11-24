import { useRouter } from 'vue-router'
import { createGoToPage, settingsSidebarOpen, type GoToPage } from '@/lib/appNavigation'
import { usePackingStore } from '@/stores/packingStore'
import { useShoppingStore } from '@/stores/shoppingStore'
import { useTodoStore } from '@/stores/todoStore'

/** `createGoToPage` mit dem Router und den Listen-Stores der App verdrahtet. */
export function useGoToPage(): GoToPage {
  const router = useRouter()
  const lists = { shopping: useShoppingStore(), packing: usePackingStore(), todo: useTodoStore() }
  return createGoToPage({
    push: (to) => router.push(to),
    setSettingsOpen: (open) => (settingsSidebarOpen.value = open),
    selectList: (area, listId) => (lists[area].currentListId = listId),
  })
}
