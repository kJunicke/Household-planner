import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { Household, HouseholdMember } from '@/types/households'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'

interface CompletionWithEffort {
  user_id: string
  task_id: string
  completed_at: string
  effort_override: number | null
  tasks?: {
    effort: number
  }
}

export const useHouseholdStore = defineStore('household', () => {
    // State
    const currentHousehold = ref<Household | null>(null)
    const householdMembers = ref<HouseholdMember[]>([])
    const weeklyCompletions = ref<CompletionWithEffort[]>([])

    // Actions
    const loadUserHousehold = async () => {
        const authStore = useAuthStore()
        const toastStore = useToastStore()

        if (!authStore.user) {
            console.error('No user logged in')
            return
        }

        // 1. Finde household_member Eintrag für diesen User
        const { data: memberData, error: memberError } = await supabase
            .from('household_members')
            .select('*')
            .eq('user_id', authStore.user.id)
            .maybeSingle()

        if (memberError) {
            console.error('Error loading household member:', memberError)
            toastStore.showToast('Fehler beim Laden des Haushalts', 'error')
            return
        }

        if (!memberData) {
            console.log('User has no household')
            return
        }

        // 2. Lade den zugehörigen Household
        const { data: householdData, error: householdError } = await supabase
            .from('households')
            .select('*')
            .eq('household_id', memberData.household_id)
            .single()

        if (householdError) {
            console.error('Error loading household:', householdError)
            toastStore.showToast('Fehler beim Laden des Haushalts', 'error')
            return
        }

        currentHousehold.value = householdData
        console.log('Loaded household:', householdData)

        // 3. Lade alle Mitglieder des Households
        await loadHouseholdMembers()
    }

    const loadHouseholdMembers = async () => {
        const toastStore = useToastStore()

        if (!currentHousehold.value) {
            householdMembers.value = []
            return
        }

        const { data, error } = await supabase
            .from('household_members')
            .select('user_id, household_id, display_name, user_color')
            .eq('household_id', currentHousehold.value.household_id)

        if (error) {
            console.error('Error loading household members:', error)
            toastStore.showToast('Fehler beim Laden der Haushaltsmitglieder', 'error')
            householdMembers.value = []
            return
        }

        householdMembers.value = data || []
        console.log('Loaded household members:', data)
    }

    const updateMemberDisplayName = async (newName: string) => {
        const authStore = useAuthStore()
        const toastStore = useToastStore()

        if (!authStore.user || !currentHousehold.value) {
            return { success: false, error: 'Not logged in or no household' }
        }

        const { error } = await supabase
            .from('household_members')
            .update({ display_name: newName })
            .eq('user_id', authStore.user.id)
            .eq('household_id', currentHousehold.value.household_id)

        if (error) {
            console.error('Error updating display name:', error)
            toastStore.showToast('Fehler beim Aktualisieren des Namens', 'error')
            return { success: false, error: error.message }
        }

        // Update local state
        await loadHouseholdMembers()
        toastStore.showToast('Name aktualisiert', 'success', 3000)
        return { success: true }
    }

    const updateMemberProfile = async (newName: string, newColor: string) => {
        const authStore = useAuthStore()
        const toastStore = useToastStore()

        if (!authStore.user || !currentHousehold.value) {
            return { success: false, error: 'Not logged in or no household' }
        }

        const { error } = await supabase
            .from('household_members')
            .update({
                display_name: newName,
                user_color: newColor
            })
            .eq('user_id', authStore.user.id)
            .eq('household_id', currentHousehold.value.household_id)

        if (error) {
            console.error('Error updating member profile:', error)
            toastStore.showToast('Fehler beim Aktualisieren des Profils', 'error')
            return { success: false, error: error.message }
        }

        // Update local state
        await loadHouseholdMembers()
        toastStore.showToast('Profil aktualisiert', 'success', 3000)
        return { success: true }
    }

    const getCurrentMemberDisplayName = (): string => {
        const authStore = useAuthStore()
        if (!authStore.user) return 'Unbekannt'

        const member = householdMembers.value.find(m => m.user_id === authStore.user!.id)
        return member?.display_name || 'Unbekannt'
    }

    // Lade wöchentliche Completions für Stats
    const loadWeeklyCompletions = async () => {
        if (!currentHousehold.value) return

        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)

        // Lade Completions mit Tasks (für effort)
        const { data, error } = await supabase
            .from('task_completions')
            .select(`
                user_id,
                task_id,
                completed_at,
                effort_override,
                tasks (effort)
            `)
            .gte('completed_at', weekAgo.toISOString())

        if (error) {
            console.error('Error loading weekly completions:', error)
            return
        }

        weeklyCompletions.value = (data || []) as CompletionWithEffort[]
    }

    // Berechne wöchentliche Punkte pro User
    const weeklyPointsByUser = computed(() => {
        const pointsMap = new Map<string, number>()

        weeklyCompletions.value.forEach((completion: CompletionWithEffort) => {
            // Priorisiere effort_override, dann task.effort, Fallback 1
            const taskEffort = completion.tasks?.effort ?? 1
            const effort = completion.effort_override ?? taskEffort
            const current = pointsMap.get(completion.user_id) || 0
            pointsMap.set(completion.user_id, current + effort)
        })

        return pointsMap
    })

    // Aktuelle User-Punkte diese Woche
    const currentUserWeeklyPoints = computed(() => {
        const authStore = useAuthStore()
        if (!authStore.user) return 0
        return weeklyPointsByUser.value.get(authStore.user.id) || 0
    })

    // Wöchentliche Rangliste
    const weeklyRanking = computed(() => {
        const authStore = useAuthStore()
        if (!authStore.user) return null

        const points = weeklyPointsByUser.value

        // Erstelle sortierte Rangliste
        const ranking = Array.from(points.entries())
            .map(([userId, pts]) => {
                const member = householdMembers.value.find(m => m.user_id === userId)
                return {
                    userId,
                    name: member?.display_name || 'Unbekannt',
                    color: member?.user_color || '#4A90E2',
                    points: pts,
                    isCurrentUser: userId === authStore.user!.id
                }
            })
            .sort((a, b) => b.points - a.points) // Sortiere nach Punkten (absteigend)

        if (ranking.length === 0) return null

        // Finde eigene Position
        const currentUserIndex = ranking.findIndex(r => r.isCurrentUser)
        const currentUserRank = currentUserIndex + 1 // 1-basiert

        const leader = ranking[0]
        const isLeader = currentUserIndex === 0

        return {
            leader,
            currentUser: currentUserIndex >= 0 ? ranking[currentUserIndex] : null,
            currentUserRank,
            isLeader,
            totalUsers: ranking.length
        }
    })

    const createHousehold = async (name: string) => {
        const authStore = useAuthStore()
        const toastStore = useToastStore()

        if (!authStore.user) {
            console.error('No user logged in')
            toastStore.showToast('Fehler: Nicht angemeldet', 'error')
            throw new Error('Not logged in')
        }

        // 1. Create household (invite_code generated by Supabase)
        const { data: householdData, error: householdError } = await supabase
            .from('households')
            .insert({ name })
            .select()
            .single()

        if (householdError) {
            console.error('Error creating household:', householdError)
            toastStore.showToast('Fehler beim Erstellen des Haushalts', 'error')
            throw new Error(householdError.message)
        }

        // 2. Add user as member with email as fallback display_name
        const displayName = authStore.user.email?.split('@')[0] || 'Unbekannt'
        const { error: memberError } = await supabase
            .from('household_members')
            .insert({
                household_id: householdData.household_id,
                user_id: authStore.user.id,
                display_name: displayName
            })

        if (memberError) {
            console.error('Error adding user to household:', memberError)
            toastStore.showToast('Fehler beim Beitreten zum Haushalt', 'error')
            throw new Error(memberError.message)
        }

        currentHousehold.value = householdData
        console.log('Created household:', householdData)

        // Load members (nur der Creator initial)
        await loadHouseholdMembers()
        toastStore.showToast('Haushalt erstellt', 'success', 3000)
    }

    const joinHousehold = async (inviteCode: string) => {
        const authStore = useAuthStore()
        const toastStore = useToastStore()

        if (!authStore.user) {
            console.error('No user logged in')
            toastStore.showToast('Fehler: Nicht angemeldet', 'error')
            return false
        }

        // Check if user already has a household
        if (currentHousehold.value) {
            console.error('User already in household')
            toastStore.showToast('Du bist bereits in einem Haushalt', 'error')
            return false
        }

        // 1. Find household by invite code
        const { data: householdData, error: householdError } = await supabase
            .from('households')
            .select('*')
            .eq('invite_code', inviteCode.toUpperCase())
            .maybeSingle()

        if (householdError || !householdData) {
            console.error('Error finding household:', householdError)
            toastStore.showToast('Ungültiger Einladungscode', 'error')
            return false
        }

        // 2. Add user as member with email as fallback display_name
        const displayName = authStore.user.email?.split('@')[0] || 'Unbekannt'
        const { error: memberError } = await supabase
            .from('household_members')
            .insert({
                household_id: householdData.household_id,
                user_id: authStore.user.id,
                display_name: displayName
            })

        if (memberError) {
            console.error('Error joining household:', memberError)
            toastStore.showToast('Fehler beim Beitreten zum Haushalt', 'error')
            return false
        }

        currentHousehold.value = householdData
        console.log('Joined household:', householdData)

        // Load all members
        await loadHouseholdMembers()
        toastStore.showToast('Haushalt beigetreten', 'success', 3000)
        return true
    }

    const leaveHousehold = async () => {
        const authStore = useAuthStore()
        const toastStore = useToastStore()

        if (!authStore.user) {
            console.error('No user logged in')
            toastStore.showToast('Fehler: Nicht angemeldet', 'error')
            throw new Error('Not logged in')
        }

        if (!currentHousehold.value) {
            toastStore.showToast('Fehler: Kein Haushalt vorhanden', 'error')
            throw new Error('Not in a household')
        }

        // Delete household_member entry
        const { error } = await supabase
            .from('household_members')
            .delete()
            .eq('user_id', authStore.user.id)

        if (error) {
            console.error('Error leaving household:', error)
            toastStore.showToast('Fehler beim Verlassen des Haushalts', 'error')
            throw new Error(error.message)
        }

        // Clear state
        currentHousehold.value = null
        householdMembers.value = []
        console.log('Left household')
        toastStore.showToast('Haushalt verlassen', 'success', 3000)
    }

    return {
        currentHousehold,
        householdMembers,
        loadUserHousehold,
        loadHouseholdMembers,
        updateMemberDisplayName,
        updateMemberProfile,
        getCurrentMemberDisplayName,
        createHousehold,
        joinHousehold,
        leaveHousehold,
        loadWeeklyCompletions,
        currentUserWeeklyPoints,
        weeklyRanking
    }
})
