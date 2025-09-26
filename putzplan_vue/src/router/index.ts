import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/authStore'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue')
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
    }
  ]
})

// Route Guards - Damit User nur auf Seiten kommen die Sinn machen
router.beforeEach((to) => {
  const authStore = useAuthStore()

  // Wenn nicht eingeloggt → zu /login
  //to.name - Route zu der der User navigieren will
  if (!authStore.user && to.name !== 'login' && to.name !== 'register') {
    return '/login'
  }

  // Wenn eingeloggt und auf /login → zu /home
  if (authStore.user && to.name === 'login') {
    return '/'
  }
})

export default router