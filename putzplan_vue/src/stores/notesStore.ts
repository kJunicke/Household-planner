import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Note } from '@/types/Note'
import { supabase } from '@/lib/supabase'
import { useHouseholdStore } from './householdStore'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

export const useNotesStore = defineStore('notes', () => {
  // State
  const notes = ref<Note[]>([])
  const isLoading = ref(false)

  // Realtime subscription channel
  let realtimeChannel: RealtimeChannel | null = null

  // ============================================================================
  // Getters (computed)
  // ============================================================================

  // Notes sorted by most recent first
  const sortedNotes = computed(() => {
    return [...notes.value].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  })

  // ============================================================================
  // Actions
  // ============================================================================

  const loadNotes = async () => {
    const householdStore = useHouseholdStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold) {
      console.warn('No current household, cannot load notes')
      notes.value = []
      return
    }

    if (isLoading.value) {
      console.log('Already loading notes, skipping...')
      return
    }

    isLoading.value = true

    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('household_id', householdStore.currentHousehold.household_id)
        .order('created_at', { ascending: false })

      if (error) throw error

      notes.value = data || []
      console.log('Loaded notes:', notes.value.length)

    } catch (error) {
      console.error('Error loading notes:', error)
      toastStore.showToast('Fehler beim Laden der Notizen', 'error')
    } finally {
      isLoading.value = false
    }
  }

  const createNote = async (content: string) => {
    const householdStore = useHouseholdStore()
    const authStore = useAuthStore()
    const toastStore = useToastStore()

    if (!householdStore.currentHousehold) {
      toastStore.showToast('Fehler: Kein Haushalt ausgewaehlt', 'error')
      return null
    }

    if (!authStore.user) {
      toastStore.showToast('Fehler: Nicht angemeldet', 'error')
      return null
    }

    if (!content.trim()) {
      toastStore.showToast('Notiz darf nicht leer sein', 'error')
      return null
    }

    try {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          content: content.trim(),
          household_id: householdStore.currentHousehold.household_id,
          created_by: authStore.user.id
        })
        .select()
        .single()

      if (error) throw error

      // Realtime will add it to the list, but we can also add optimistically
      notes.value.unshift(data)
      toastStore.showToast('Notiz erstellt', 'success', 2000)
      return data

    } catch (error) {
      console.error('Error creating note:', error)
      toastStore.showToast('Fehler beim Erstellen der Notiz', 'error')
      return null
    }
  }

  const updateNote = async (noteId: string, content: string) => {
    const toastStore = useToastStore()

    if (!content.trim()) {
      toastStore.showToast('Notiz darf nicht leer sein', 'error')
      return false
    }

    try {
      const { error } = await supabase
        .from('notes')
        .update({ content: content.trim() })
        .eq('note_id', noteId)

      if (error) throw error

      // Update local state (Realtime will also update, but immediate feedback is better)
      const index = notes.value.findIndex(n => n.note_id === noteId)
      if (index !== -1) {
        notes.value[index] = {
          ...notes.value[index],
          content: content.trim(),
          updated_at: new Date().toISOString()
        }
      }

      toastStore.showToast('Notiz aktualisiert', 'success', 2000)
      return true

    } catch (error) {
      console.error('Error updating note:', error)
      toastStore.showToast('Fehler beim Aktualisieren der Notiz', 'error')
      return false
    }
  }

  const deleteNote = async (noteId: string) => {
    const toastStore = useToastStore()

    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('note_id', noteId)

      if (error) throw error

      // Remove from local state
      notes.value = notes.value.filter(n => n.note_id !== noteId)
      toastStore.showToast('Notiz geloescht', 'success', 2000)
      return true

    } catch (error) {
      console.error('Error deleting note:', error)
      toastStore.showToast('Fehler beim Löschen der Notiz', 'error')
      return false
    }
  }

  // ============================================================================
  // REALTIME - Subscribe to changes
  // ============================================================================

  const subscribeToNotes = () => {
    const householdStore = useHouseholdStore()

    if (!householdStore.currentHousehold) {
      console.warn('Cannot subscribe: No current household')
      return
    }

    // Cleanup old subscription
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
    }

    console.log('Subscribing to notes for household:', householdStore.currentHousehold.household_id)

    realtimeChannel = supabase
      .channel(`notes-changes-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `household_id=eq.${householdStore.currentHousehold.household_id}`
        },
        (payload) => {
          console.log('Realtime notes event:', payload)

          if (payload.eventType === 'INSERT') {
            const newNote = payload.new as Note
            if (!notes.value.find(n => n.note_id === newNote.note_id)) {
              notes.value.unshift(newNote)
            }
          }

          if (payload.eventType === 'UPDATE') {
            const updatedNote = payload.new as Note
            const index = notes.value.findIndex(n => n.note_id === updatedNote.note_id)
            if (index !== -1) {
              notes.value[index] = updatedNote
            }
          }

          if (payload.eventType === 'DELETE') {
            const deletedNote = payload.old as Note
            notes.value = notes.value.filter(n => n.note_id !== deletedNote.note_id)
          }
        }
      )
      .subscribe((status) => {
        console.log('Notes realtime subscription status:', status)
      })
  }

  const unsubscribeFromNotes = () => {
    if (realtimeChannel) {
      console.log('Unsubscribing from notes')
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  // ============================================================================
  // Return - Public API
  // ============================================================================

  return {
    notes,
    isLoading,
    sortedNotes,
    loadNotes,
    createNote,
    updateNote,
    deleteNote,
    subscribeToNotes,
    unsubscribeFromNotes
  }
})
