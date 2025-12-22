import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { useHouseholdStore } from '../stores/householdStore'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/CleaningView.vue')
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('../views/HistoryView.vue')
    },
    {
      path: '/stats',
      name: 'stats',
      component: () => import('../views/StatsView.vue')
    },
    {
      path: '/shopping',
      name: 'shopping',
      component: () => import('../views/ShoppingView.vue')
    },
    {
      path: '/notes',
      name: 'notes',
      component: () => import('../views/NotesView.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue')
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue')
    },
    {
      path: '/household-setup',
      name: 'household-setup',
      component: () => import('../views/HouseholdSetupView.vue')
    }
  ]
})

// Route Guards - Damit User nur auf Seiten kommen die Sinn machen
router.beforeEach((to) => {
  const authStore = useAuthStore()
  const householdStore = useHouseholdStore()

  // 1. Wenn nicht eingeloggt → zu /login
  if (!authStore.user && to.name !== 'login' && to.name !== 'register') {
    return '/login'
  }

  // 2. Wenn eingeloggt und auf /login → zu /home
  if (authStore.user && to.name === 'login') {
    return '/'
  }

  // 3. Wenn eingeloggt ABER kein Household → zu /household-setup
  // Außer User ist schon auf household-setup (sonst infinite loop)
  if (authStore.user && !householdStore.currentHousehold && to.name !== 'household-setup') {
    return '/household-setup'
  }

  // 4. Wenn Household vorhanden und User will zu /household-setup → zu /home
  if (authStore.user && householdStore.currentHousehold && to.name === 'household-setup') {
    return '/'
  }
})


export default router