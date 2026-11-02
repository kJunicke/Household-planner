import type { User, Session } from '@supabase/supabase-js'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { defineStore } from 'pinia'
import { useToastStore } from './toastStore'
import { endSession } from '@/lib/sessionEnd'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)

  /**
   * Setzt `user`/`session` aus einer Supabase-Sitzung (Listener und logout).
   * Wechselt dabei das Konto oder endet es, räumen zuerst alle Stores und
   * Kanäle auf — sonst erbt das nächste Konto im selben Tab Haushalt, Aufgaben
   * und Abos des vorigen. Idempotent: ein zweiter Aufruf mit demselben Konto
   * tut nichts.
   */
  function applySession(newSession: Session | null) {
    const previousUserId = user.value?.id ?? null
    const nextUserId = newSession?.user?.id ?? null
    if (previousUserId !== null && previousUserId !== nextUserId) {
      endSession({ userId: previousUserId })
      // Kein `removeAllChannels()` als Kehrbesen: realtime-js trennt danach
      // bedingungslos den Socket und reißt damit auch die Kanäle ab, die das
      // neue Konto gleich anlegt. Jeder Store mit Kanal meldet ihn in seinem
      // `onSessionEnd` selbst per `removeChannel` ab.
    }
    session.value = newSession
    user.value = newSession?.user ?? null
  }

  async function login(email: string, password: string) {
    const toastStore = useToastStore()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      console.error('Fehler beim Login:', error.message)
      toastStore.showToast(`Login fehlgeschlagen: ${error.message}`, 'error')
      return { success: false, error: error.message }
    }
    user.value = data.user
    session.value = data.session
    toastStore.showToast('Erfolgreich angemeldet', 'success', 3000)
    return { success: true }
  }
  async function logout() {
    const toastStore = useToastStore()
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Logout error:', error.message)
      toastStore.showToast(`Logout fehlgeschlagen: ${error.message}`, 'error')
      return
    }

    applySession(null)
    toastStore.showToast('Erfolgreich abgemeldet', 'success', 3000)
  }

  async function register(email: string, password: string) {
    const toastStore = useToastStore()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) {
      console.error('Fehler bei Registration:', error.message)
      toastStore.showToast(`Registrierung fehlgeschlagen: ${error.message}`, 'error')
      return { success: false, error: error.message }
    }
    user.value = data.user
    session.value = data.session
    toastStore.showToast('Erfolgreich registriert', 'success', 3000)
    return { success: true }
  }

  // Verhindert doppelte Listener bei mehrfachem initializeAuth()-Aufruf
  let authListenerRegistered = false

  async function initializeAuth() {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      user.value = data.session.user
      session.value = data.session
    }

    // Supabase erneuert Tokens im Hintergrund und meldet Logouts aus anderen Tabs.
    // Ohne diesen Listener bliebe der Store auf dem Stand vom App-Start stehen.
    if (!authListenerRegistered) {
      authListenerRegistered = true
      supabase.auth.onAuthStateChange((_event, newSession) => {
        applySession(newSession)
      })
    }
  }
  return {
    user,
    session,
    login,
    logout,
    register,
    initializeAuth,
  }
})
