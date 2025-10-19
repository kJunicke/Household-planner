import type { User, Session } from '@supabase/supabase-js'
import { ref } from "vue"
import { supabase } from '@/lib/supabase'
import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
    const user= ref<User | null>(null)
    const session = ref<Session | null>(null)

    async function login(email: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        })
        if (error) {
            console.error("Fehler beim Login:", error.message)
            return { success: false, error: error.message }
        }
        user.value = data.user
        session.value = data.session
        return { success: true}
    }
    async function logout() {
        const { error } = await supabase.auth.signOut()

        if (error) {
        console.error('Logout error:', error.message)
        return
        }

        user.value = null
        session.value = null
    }

    async function register(email: string, password: string, displayName?: string) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: displayName || email.split('@')[0]
                }
            }
        })
        if (error) {
            console.error("Fehler bei Registration:", error.message)
            return { success: false, error: error.message }
        }
        user.value = data.user
        session.value = data.session
        return { success: true}
    }

    async function updateDisplayName(newName: string) {
        const { data, error } = await supabase.auth.updateUser({
            data: {
                display_name: newName
            }
        })

        if (error) {
            console.error("Fehler beim Update des Display Names:", error.message)
            return { success: false, error: error.message }
        }

        user.value = data.user
        return { success: true }
    }

    function getUserDisplayName(userId?: string): string {
        // Falls keine userId: Aktueller User
        if (!userId) {
            if (!user.value) return 'Unbekannt'

            const displayName = user.value.user_metadata?.display_name
            if (displayName && displayName.trim()) {
                return displayName
            }

            // Fallback: Email-Prefix
            return user.value.email?.split('@')[0] || 'User'
        }

        // Falls userId === aktueller User: Name anzeigen
        if (user.value && userId === user.value.id) {
            return getUserDisplayName() // Rekursiv ohne Parameter
        }

        // Für andere User: "Jemand anderes" (MVP - später mit DB lookup)
        return 'Anderer Nutzer'
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
          updateDisplayName,
          getUserDisplayName,
          initializeAuth
      }
})
