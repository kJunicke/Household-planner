import type { User, Session } from '@supabase/supabase-js'
import { ref } from "vue"
import { supabase } from '@/lib/supabase'
import { defineStore } from 'pinia'
import { useToastStore } from './toastStore'

export const useAuthStore = defineStore('auth', () => {
    const user= ref<User | null>(null)
    const session = ref<Session | null>(null)

    async function login(email: string, password: string) {
        const toastStore = useToastStore()
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        })
        if (error) {
            console.error("Fehler beim Login:", error.message)
            toastStore.showToast(`Login fehlgeschlagen: ${error.message}`, 'error')
            return { success: false, error: error.message }
        }
        user.value = data.user
        session.value = data.session
        toastStore.showToast('Erfolgreich angemeldet', 'success', 3000)
        return { success: true}
    }
    async function logout() {
        const toastStore = useToastStore()
        const { error } = await supabase.auth.signOut()

        if (error) {
            console.error('Logout error:', error.message)
            toastStore.showToast(`Logout fehlgeschlagen: ${error.message}`, 'error')
            return
        }

        user.value = null
        session.value = null
        toastStore.showToast('Erfolgreich abgemeldet', 'success', 3000)
    }

    async function register(email: string, password: string) {
        const toastStore = useToastStore()
        const { data, error } = await supabase.auth.signUp({
            email,
            password
        })
        if (error) {
            console.error("Fehler bei Registration:", error.message)
            toastStore.showToast(`Registrierung fehlgeschlagen: ${error.message}`, 'error')
            return { success: false, error: error.message }
        }
        user.value = data.user
        session.value = data.session
        toastStore.showToast('Erfolgreich registriert', 'success', 3000)
        return { success: true}
    }

    async function initializeAuth() {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
            user.value = data.session.user
            session.value = data.session
        }
    }
    return {
          user,
          session,
          login,
          logout,
          register,
          initializeAuth
      }
})
