import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GuestShare, GuestShareKind } from '@/types/GuestShare'
import { supabase } from '@/lib/supabase'
import { onSessionEnd } from '@/lib/sessionEnd'
import { guestLinkUrl } from '@/lib/guestLink'
import { useAuthStore } from './authStore'
import { useHouseholdStore } from './householdStore'
import { useToastStore } from './toastStore'

/** Tabelle und Schlüsselspalte des Ziels je Art — für die Namen in der Übersicht. */
const TARGET_TABLES: Record<GuestShareKind, { table: string; idColumn: string }> = {
  shopping_list: { table: 'shopping_lists', idColumn: 'list_id' },
  packing_list: { table: 'packing_lists', idColumn: 'list_id' },
  todo_list: { table: 'todo_lists', idColumn: 'list_id' },
  pot: { table: 'pots', idColumn: 'pot_id' },
}

/**
 * **Gastlinks** des Haushalts aus Sicht eines Mitglieds: welche Ziele geteilt
 * sind, Link erzeugen, erneuern, beenden (→ CONTEXT.md § Gastlink).
 *
 * Live wie die anderen Stores: sobald ein Haushalt da ist, lädt er und
 * abonniert die Änderungen; erzeugt, erneuert oder beendet ein anderes Mitglied
 * einen Link, sehen offene Ansichten das sofort. Verwaltet wird nur online über
 * die RPCs der Datenbank; die prüft auch, dass nur Mitglieder mit Konto das dürfen.
 */
export const useGuestShareStore = defineStore('guestShare', () => {
  const shares = ref<GuestShare[]>([])
  /** Name des Ziels je `target_id`, für die Übersicht. */
  const targetNames = ref<Record<string, string>>({})
  let loadedFor: string | null = null
  let channel: RealtimeChannel | null = null
  let visibilityHandler: (() => void) | null = null
  let activeHouseholdId: string | null = null

  const upsertLocal = (row: GuestShare) => {
    const idx = shares.value.findIndex((s) => s.share_id === row.share_id)
    if (idx === -1) shares.value.push(row)
    else shares.value[idx] = row
  }

  const load = async () => {
    const householdId = useHouseholdStore().currentHousehold?.household_id
    if (!householdId) return
    loadedFor = householdId
    const { data, error } = await supabase
      .from('guest_shares')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: true })
    if (loadedFor !== householdId) return
    if (error) {
      console.error('Error loading guest shares:', error)
      return
    }
    shares.value = (data ?? []) as GuestShare[]
    await loadTargetNames(householdId)
  }

  const loadTargetNames = async (householdId: string) => {
    const names: Record<string, string> = {}
    for (const kind of Object.keys(TARGET_TABLES) as GuestShareKind[]) {
      const ids = shares.value.filter((s) => s.target_kind === kind).map((s) => s.target_id)
      if (ids.length === 0) continue
      const { table, idColumn } = TARGET_TABLES[kind]
      const { data } = await supabase.from(table).select(`${idColumn}, name`).in(idColumn, ids)
      for (const row of (data ?? []) as unknown as Record<string, string>[]) {
        names[row[idColumn]!] = row.name!
      }
    }
    if (loadedFor === householdId) targetNames.value = names
  }

  const shareFor = (kind: GuestShareKind, targetId: string): GuestShare | null =>
    shares.value.find((s) => s.target_kind === kind && s.target_id === targetId) ?? null

  const linkFor = (share: GuestShare): string =>
    guestLinkUrl(window.location.origin, import.meta.env.BASE_URL, share.secret)

  const create = async (kind: GuestShareKind, targetId: string, name: string) => {
    const { data, error } = await supabase.rpc('create_guest_share', {
      p_kind: kind,
      p_target_id: targetId,
    })
    if (error) {
      console.error('Error creating guest share:', error)
      useToastStore().showToast('Gastlink ließ sich nicht erzeugen', 'error')
      return null
    }
    upsertLocal(data as GuestShare)
    targetNames.value = { ...targetNames.value, [targetId]: name }
    return data as GuestShare
  }

  const renew = async (shareId: string) => {
    const { data, error } = await supabase.rpc('renew_guest_share', { p_share_id: shareId })
    if (error) {
      console.error('Error renewing guest share:', error)
      useToastStore().showToast('Gastlink ließ sich nicht erneuern', 'error')
      return null
    }
    upsertLocal(data as GuestShare)
    useToastStore().showToast('Neuer Gastlink — der alte gilt nicht mehr', 'success', 3000)
    return data as GuestShare
  }

  const end = async (shareId: string) => {
    const { error } = await supabase.rpc('end_guest_share', { p_share_id: shareId })
    if (error) {
      console.error('Error ending guest share:', error)
      useToastStore().showToast('Freigabe ließ sich nicht beenden', 'error')
      return false
    }
    shares.value = shares.value.filter((s) => s.share_id !== shareId)
    useToastStore().showToast('Freigabe beendet', 'success', 3000)
    return true
  }

  const unsubscribe = () => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  const subscribe = (householdId: string) => {
    unsubscribe()
    // Neue und erneuerte Links: neu laden, damit auch der Name des Ziels da ist.
    // DELETE ungefiltert: ohne REPLICA IDENTITY FULL trägt es nur `share_id`.
    channel = supabase
      .channel(`guest-shares-${householdId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guest_shares',
          filter: `household_id=eq.${householdId}`,
        },
        () => void load(),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'guest_shares',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => upsertLocal(payload.new as GuestShare),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'guest_shares' },
        (payload) => {
          const id = (payload.old as Partial<GuestShare>).share_id
          if (id) shares.value = shares.value.filter((s) => s.share_id !== id)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load()
      })

    visibilityHandler = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }

  const reset = () => {
    unsubscribe()
    activeHouseholdId = null
    loadedFor = null
    shares.value = []
    targetNames.value = {}
  }

  // Gäste verwalten keine Links; ihr Haushaltsrahmen (Gastansicht) abonniert nichts.
  watch(
    () =>
      useAuthStore().isGuest ? null : (useHouseholdStore().currentHousehold?.household_id ?? null),
    (householdId) => {
      if (householdId === activeHouseholdId) return
      reset()
      if (!householdId) return
      activeHouseholdId = householdId
      subscribe(householdId)
    },
    { immediate: true },
  )

  onSessionEnd(reset)

  return { shares, targetNames, load, shareFor, linkFor, create, renew, end }
})
