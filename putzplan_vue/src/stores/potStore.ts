import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Pot, PotExpense, PotParticipant, PotRepayment } from '@/types/Pot'
import { supabase } from '@/lib/supabase'
import { newId } from '@/lib/newId'
import { onSessionEnd } from '@/lib/sessionEnd'
import { isInFlight, runOptimistic } from '@/lib/optimistic'
import {
  expenseShares,
  pendingWholeGroupJoins,
  potBalances,
  wholeGroupCarriers,
  type ExpenseSplit,
  type LedgerExpense,
  type PendingJoin,
} from '@/lib/potLedger'
import { currentParticipants, wholeGroup } from '@/lib/potRules'
import { rememberGuestParticipant, rememberedGuestParticipant } from '@/lib/guestIdentity'
import { useAuthStore } from './authStore'
import { useHouseholdStore } from './householdStore'
import { useToastStore } from './toastStore'

/** So lange lässt sich ein Löschen über den Hinweis zurücknehmen. */
const UNDO_TOAST_MS = 8000

/**
 * **Töpfe** des Haushalts (CONTEXT.md § Topf): Töpfe, Teilnehmer, Ausgaben und
 * Rückzahlungen laden, live halten und Ausgaben eintragen. Gerechnet wird in
 * der Topf-Rechnung (`@/lib/potLedger`), nie hier.
 *
 * Verwaltet sich selbst wie der Richtwerte-Store: sobald ein Haushalt da ist,
 * lädt er und abonniert die Änderungen; wechselt oder endet der Haushalt, räumt
 * er ab. Nachgeladen wird bei jedem (Wieder-)Beitritt des Kanals und beim
 * Zurückkehren auf den Tab. Schreiben über die optimistische Schicht, ohne
 * Offline-Warteschlange.
 */
export const usePotStore = defineStore('pot', () => {
  const pots = ref<Pot[]>([])
  const participants = ref<PotParticipant[]>([])
  const expenses = ref<PotExpense[]>([])
  const repayments = ref<PotRepayment[]>([])
  const loaded = ref(false)

  let channel: RealtimeChannel | null = null
  let visibilityHandler: (() => void) | null = null
  let activeHouseholdId: string | null = null

  const householdStore = useHouseholdStore()
  const authStore = useAuthStore()

  const householdPot = computed(() => pots.value.find((p) => p.kind === 'household') ?? null)

  /**
   * Teilnehmer eines Topfs in seiner festen Reihenfolge (Anlage, dann Kennung):
   * nach ihr verteilt die Topf-Rechnung Cent-Reste, auf jedem Gerät gleich.
   */
  const participantsOf = (potId: string): PotParticipant[] =>
    participants.value
      .filter((p) => p.pot_id === potId)
      .sort(
        (a, b) =>
          Date.parse(a.created_at) - Date.parse(b.created_at) ||
          (a.participant_id < b.participant_id ? -1 : a.participant_id > b.participant_id ? 1 : 0),
      )

  /**
   * Wer heute an neuen Ausgaben teilnimmt (Zahler, „gleich auf alle“). Im
   * Haushaltstopf ohne ehemalige Mitglieder; ihr Saldo bleibt sichtbar.
   */
  const currentParticipantsOf = (potId: string): PotParticipant[] => {
    const pot = pots.value.find((p) => p.pot_id === potId)
    if (!pot) return []
    return currentParticipants(
      pot.kind,
      participantsOf(potId),
      householdStore.householdMembers.map((m) => m.user_id),
    )
  }

  /** Neueste zuerst: nach Datum, bei gleichem Datum nach Anlage. */
  const expensesOf = (potId: string): PotExpense[] =>
    expenses.value
      .filter((e) => e.pot_id === potId)
      .sort(
        (a, b) =>
          b.spent_on.localeCompare(a.spent_on) ||
          Date.parse(b.created_at) - Date.parse(a.created_at),
      )

  /** Neueste zuerst, wie die Ausgaben. */
  const repaymentsOf = (potId: string): PotRepayment[] =>
    repayments.value
      .filter((r) => r.pot_id === potId)
      .sort(
        (a, b) =>
          b.paid_on.localeCompare(a.paid_on) || Date.parse(b.created_at) - Date.parse(a.created_at),
      )

  /**
   * Wer eine Ausgabe „ganze Gruppe“ trägt, die zu `createdAt` angelegt wurde
   * bzw. wird: alle, die da schon dabei und noch nicht ausgetreten waren, und
   * bestätigte Nachzügler. Gerechnet über alle Teilnehmer des Topfs, nicht nur
   * die heutigen: ein Austritt ändert frühere Ausgaben nicht.
   */
  const wholeGroupCarriersAt = (potId: string, createdAt: string): string[] =>
    wholeGroupCarriers(createdAt, wholeGroup(participantsOf(potId)))

  const toLedgerExpense = (e: PotExpense): LedgerExpense => ({
    payerId: e.payer_participant_id,
    amountCents: e.amount_cents,
    split:
      e.split_kind === 'equal'
        ? { kind: 'equal', participantIds: Object.keys(e.split_values) }
        : e.split_kind === 'whole_group'
          ? { kind: 'whole_group', participantIds: wholeGroupCarriersAt(e.pot_id, e.created_at) }
          : { kind: e.split_kind, values: e.split_values },
  })

  /**
   * Rohwerte fürs Speichern: wer nichts trägt, steht nicht drin. Die ganze
   * Gruppe speichert keine Auswahl — wer trägt, ergibt sich beim Rechnen.
   */
  const toSplitValues = (split: ExpenseSplit): Record<string, number> =>
    split.kind === 'whole_group'
      ? {}
      : split.kind === 'equal'
        ? Object.fromEntries(split.participantIds.map((id) => [id, 1]))
        : Object.fromEntries(Object.entries(split.values).filter(([, v]) => v > 0))

  /**
   * Die Meldung zur ganzen Gruppe: Nachzügler, über deren Aufnahme in frühere
   * Ausgaben „ganze Gruppe“ noch niemand entschieden hat, mit Beträgen.
   */
  const pendingJoinsOf = (potId: string): PendingJoin[] =>
    pendingWholeGroupJoins(
      wholeGroup(participantsOf(potId)),
      expenses.value
        .filter((e) => e.pot_id === potId && e.split_kind === 'whole_group')
        .map((e) => ({
          id: e.expense_id,
          createdAt: e.created_at,
          payerId: e.payer_participant_id,
          amountCents: e.amount_cents,
        })),
      participantsOf(potId).map((p) => p.participant_id),
    )

  /** Euro je Person einer Ausgabe in Cent, in Topf-Reihenfolge. */
  const sharesOf = (e: PotExpense): Map<string, number> =>
    expenseShares(
      toLedgerExpense(e),
      participantsOf(e.pot_id).map((p) => p.participant_id),
    )

  /** Saldo je Teilnehmer in Cent (> 0 hat gut, < 0 schuldet). */
  const balancesOf = (potId: string): Map<string, number> =>
    potBalances(
      participantsOf(potId).map((p) => p.participant_id),
      expenses.value.filter((e) => e.pot_id === potId).map(toLedgerExpense),
      repayments.value
        .filter((r) => r.pot_id === potId)
        .map((r) => ({
          fromId: r.from_participant_id,
          toId: r.to_participant_id,
          amountCents: r.amount_cents,
        })),
    )

  /**
   * Anzeigename eines Teilnehmers: bei Mitgliedern der heutige Anzeigename
   * aus dem Haushalt (er ändert sich in den Einstellungen), sonst der Name im Topf.
   */
  const participantName = (participantId: string | null): string => {
    const p = participants.value.find((x) => x.participant_id === participantId)
    if (!p) return 'Unbekannt'
    const member = p.user_id
      ? householdStore.householdMembers.find((m) => m.user_id === p.user_id)
      : undefined
    return member?.display_name ?? p.name
  }

  const participantExists = (participantId: string | null): boolean =>
    participants.value.some((x) => x.participant_id === participantId)

  // Der Browser-Speicher ist nicht reaktiv: jede Wahl zählt diesen Zähler
  // hoch, damit Anzeigen, die vom eigenen Teilnehmer abhängen, neu rechnen.
  const guestChoiceVersion = ref(0)

  /**
   * Der eigene Teilnehmer in einem Topf, falls man einer ist. Mitglieder sind
   * es über ihr Konto; ein Gast ist, wen er gewählt hat (im Browser gemerkt).
   * Diese Kennung landet als „zuletzt geändert von“ an Einträgen.
   */
  const myParticipantId = (potId: string): string | null => {
    if (authStore.isGuest) {
      void guestChoiceVersion.value
      return rememberedGuestParticipant(
        localStorage,
        potId,
        participants.value.filter((p) => p.pot_id === potId).map((p) => p.participant_id),
      )
    }
    return (
      participants.value.find((p) => p.pot_id === potId && p.user_id === authStore.user?.id)
        ?.participant_id ?? null
    )
  }

  /**
   * Gast: „Das bin ich“ — Wahl aus der Teilnehmerliste oder nach „Ich bin neu“;
   * eine neue Wahl ersetzt die alte (Wechseln).
   */
  const chooseGuestParticipant = (potId: string, participantId: string) => {
    rememberGuestParticipant(localStorage, potId, participantId)
    guestChoiceVersion.value++
  }

  // ---------------------------------------------------------------
  // Laden und Realtime
  // ---------------------------------------------------------------

  const load = async () => {
    const householdId = activeHouseholdId
    if (!householdId) return
    const [p, t, e, r] = await Promise.all([
      supabase.from('pots').select('*').eq('household_id', householdId),
      supabase.from('pot_participants').select('*').eq('household_id', householdId),
      supabase.from('pot_expenses').select('*').eq('household_id', householdId),
      supabase.from('pot_repayments').select('*').eq('household_id', householdId),
    ])
    if (householdId !== activeHouseholdId) return
    const error = p.error ?? t.error ?? e.error ?? r.error
    if (error) {
      console.error('Error loading pots:', error)
      useToastStore().showToast('Töpfe konnten nicht geladen werden', 'error')
      return
    }
    pots.value = (p.data ?? []) as Pot[]
    participants.value = (t.data ?? []) as PotParticipant[]
    // Echo-Schutz wie beim Richtwerte-Store: eigene, noch laufende Einträge
    // gelten lokal ganz — auch ein laufendes Löschen (dann fehlt die Zeile lokal).
    expenses.value = [
      ...((e.data ?? []) as PotExpense[]).filter((x) => !isInFlight(x.expense_id)),
      ...expenses.value.filter((x) => isInFlight(x.expense_id)),
    ]
    repayments.value = [
      ...((r.data ?? []) as PotRepayment[]).filter((x) => !isInFlight(x.repayment_id)),
      ...repayments.value.filter((x) => isInFlight(x.repayment_id)),
    ]
    loaded.value = true
  }

  /** Zeile einfügen oder ersetzen bzw. entfernen, je nach Realtime-Ereignis. */
  const applyChange = <T extends object>(
    list: { value: T[] },
    key: keyof T,
    payload: { eventType: string; new: object; old: object },
  ) => {
    if (payload.eventType === 'DELETE') {
      const id = (payload.old as T)[key]
      if (typeof id === 'string' && isInFlight(id)) return
      list.value = list.value.filter((x) => x[key] !== id)
      return
    }
    const row = payload.new as T
    const id = row[key]
    if (typeof id === 'string' && isInFlight(id)) return
    const idx = list.value.findIndex((x) => x[key] === id)
    if (idx === -1) list.value.push(row)
    else list.value[idx] = row
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
    // Alle vier Tabellen haben REPLICA IDENTITY FULL: auch DELETE-Ereignisse
    // tragen household_id und kommen durch den Filter.
    const filter = `household_id=eq.${householdId}`
    channel = supabase
      .channel(`pots-${householdId}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pots', filter }, (payload) =>
        applyChange(pots, 'pot_id', payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pot_participants', filter },
        (payload) => applyChange(participants, 'participant_id', payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pot_expenses', filter },
        (payload) => applyChange(expenses, 'expense_id', payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pot_repayments', filter },
        (payload) => applyChange(repayments, 'repayment_id', payload),
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
    pots.value = []
    participants.value = []
    expenses.value = []
    repayments.value = []
    loaded.value = false
  }

  // ---------------------------------------------------------------
  // Einträge eintragen, ändern, löschen, wiederherstellen (Ausgaben und Rückzahlungen)
  // ---------------------------------------------------------------

  /**
   * Eintragen, Ändern, Löschen und Rückgängig für eine Eintragstabelle. Jeder darf jeden
   * Eintrag ändern und löschen, auch fremde (CONTEXT.md § Topf); die Datenbank
   * setzt `updated_at`, der Client `updated_by_participant_id`.
   */
  const entryWriter = <T extends PotExpense | PotRepayment>(config: {
    table: 'pot_expenses' | 'pot_repayments'
    list: { value: T[] }
    idOf: (row: T) => string
    pkColumn: string
    /** „Ausgabe“, „Rückzahlung“ — für die Meldungen. */
    label: string
  }) => {
    const { table, list, idOf, pkColumn, label } = config

    const findLocal = (id: string) => list.value.find((x) => idOf(x) === id)
    const putLocal = (row: T) => {
      const idx = list.value.findIndex((x) => idOf(x) === idOf(row))
      if (idx === -1) list.value.push(row)
      else list.value[idx] = row
    }
    const dropLocal = (id: string) => {
      list.value = list.value.filter((x) => idOf(x) !== id)
    }

    /**
     * Nach einem Fehlschlag gilt der Stand der Datenbank: Zeile frisch lesen und
     * übernehmen bzw. entfernen. Ist auch das Lesen nicht möglich (offline),
     * greift `fallback`.
     */
    const reconcile = async (id: string, fallback: () => void) => {
      const { data, error } = await supabase.from(table).select('*').eq(pkColumn, id).maybeSingle()
      if (error) {
        fallback()
        return
      }
      if (data) putLocal(data as T)
      else dropLocal(id)
    }

    /**
     * Neuen Eintrag optimistisch anlegen. Die ID vergibt der Client, damit das
     * Realtime-Echo die optimistische Zeile trifft; die Zeitstempel setzt die Datenbank.
     */
    const create = (build: (householdId: string) => T): boolean => {
      const toastStore = useToastStore()
      // Nie still scheitern: ohne Haushaltsrahmen oder wenn schon das Bauen der
      // Zeile wirft, sagt eine Meldung, dass nichts eingetragen wurde.
      let row: T
      try {
        if (!activeHouseholdId) throw new Error('no_household')
        row = build(activeHouseholdId)
      } catch (error) {
        console.error(`Error preparing ${table} row:`, error)
        toastStore.showToast(`${label} konnte nicht eingetragen werden`, 'error')
        return false
      }
      const { applied } = runOptimistic<T>({
        entityId: idOf(row),
        apply: () => {
          putLocal(row)
          return row
        },
        commit: async () => {
          const insert: Record<string, unknown> = { ...row }
          delete insert.created_at
          delete insert.updated_at
          const { error } = await supabase.from(table).insert(insert)
          if (error) throw error
        },
        revert: () => dropLocal(idOf(row)),
        onError: () => toastStore.showToast(`${label} konnte nicht eingetragen werden`, 'error'),
      })
      return applied
    }

    const update = (id: string, patch: Partial<T>): boolean => {
      const toastStore = useToastStore()
      if (!findLocal(id)) {
        // Inzwischen von jemand anderem gelöscht.
        toastStore.showToast(`${label} gibt es nicht mehr`, 'info')
        return false
      }
      let changedBy: string | null = null
      const { applied } = runOptimistic<T>({
        entityId: id,
        apply: () => {
          const before = findLocal(id)
          if (!before) return null
          changedBy = myParticipantId(before.pot_id)
          putLocal({
            ...before,
            ...patch,
            updated_by_participant_id: changedBy,
            updated_at: new Date().toISOString(),
          })
          return before
        },
        commit: async () => {
          const { error } = await supabase
            .from(table)
            .update({ ...patch, updated_by_participant_id: changedBy })
            .eq(pkColumn, id)
          if (error) throw error
        },
        revert: (before) => reconcile(id, () => putLocal(before)),
        onError: () => toastStore.showToast(`${label} konnte nicht geändert werden`, 'error'),
      })
      return applied
    }

    /**
     * Den gelöschten Eintrag unverändert wieder anlegen: dieselbe Kennung,
     * dieselben Zeitstempel, derselbe „zuletzt geändert von“.
     */
    const restore = (row: T) => {
      const toastStore = useToastStore()
      runOptimistic<T>({
        entityId: idOf(row),
        apply: () => {
          if (findLocal(idOf(row))) return null
          putLocal(row)
          return row
        },
        commit: async () => {
          const { error } = await supabase.from(table).insert(row)
          if (error) throw error
        },
        revert: () => reconcile(idOf(row), () => dropLocal(idOf(row))),
        onError: () =>
          toastStore.showToast(`${label} konnte nicht wiederhergestellt werden`, 'error'),
      })
    }

    /** Löschen mit Rückgängig-Hinweis. */
    const remove = (id: string): boolean => {
      const toastStore = useToastStore()
      const row = findLocal(id)
      if (!row) return false
      let undoToastId: string | null = null
      const { applied } = runOptimistic<T>({
        entityId: id,
        apply: () => {
          dropLocal(id)
          return row
        },
        commit: async () => {
          const { error } = await supabase.from(table).delete().eq(pkColumn, id)
          if (error) throw error
        },
        revert: (before) => reconcile(id, () => putLocal(before)),
        onError: () => {
          // Nichts gelöscht, also nichts zurückzunehmen.
          if (undoToastId) toastStore.removeToast(undoToastId)
          toastStore.showToast(`${label} konnte nicht gelöscht werden`, 'error')
        },
      })
      if (!applied) return false
      // Rückgängig reiht sich hinter das noch laufende Löschen derselben
      // Kennung ein (Serialisierung in der optimistischen Schicht).
      undoToastId = toastStore.showToast(`${label} gelöscht`, 'info', UNDO_TOAST_MS, {
        label: 'Rückgängig',
        run: () => restore(row),
      })
      return true
    }

    return { create, update, remove }
  }

  const expenseWriter = entryWriter<PotExpense>({
    table: 'pot_expenses',
    list: expenses,
    idOf: (e) => e.expense_id,
    pkColumn: 'expense_id',
    label: 'Ausgabe',
  })

  const repaymentWriter = entryWriter<PotRepayment>({
    table: 'pot_repayments',
    list: repayments,
    idOf: (r) => r.repayment_id,
    pkColumn: 'repayment_id',
    label: 'Rückzahlung',
  })

  /**
   * Ausgabe eintragen mit ihrer Aufteilung. Gespeichert werden die Rohwerte
   * der Aufteilung, nicht die Euro je Person.
   */
  const createExpense = (input: {
    potId: string
    payerId: string
    amountCents: number
    spentOn: string
    description: string
    split: ExpenseSplit
  }): boolean => {
    return expenseWriter.create((householdId) => {
      const now = new Date().toISOString()
      return {
        expense_id: newId(),
        pot_id: input.potId,
        household_id: householdId,
        payer_participant_id: input.payerId,
        amount_cents: input.amountCents,
        spent_on: input.spentOn,
        description: input.description,
        split_kind: input.split.kind,
        split_values: toSplitValues(input.split),
        updated_by_participant_id: myParticipantId(input.potId),
        created_at: now,
        updated_at: now,
      }
    })
  }

  /** Ausgabe ändern; die Aufteilung wird wie beim Eintragen als Rohwerte gespeichert. */
  const updateExpense = (
    expenseId: string,
    input: {
      payerId: string
      amountCents: number
      spentOn: string
      description: string
      split: ExpenseSplit
    },
  ): boolean =>
    expenseWriter.update(expenseId, {
      payer_participant_id: input.payerId,
      amount_cents: input.amountCents,
      spent_on: input.spentOn,
      description: input.description,
      split_kind: input.split.kind,
      split_values: toSplitValues(input.split),
    })

  const deleteExpense = (expenseId: string): boolean => expenseWriter.remove(expenseId)

  /**
   * Rückzahlung eintragen: `fromId` hat `toId` im Topf `potId` Geld überwiesen.
   * Frei eingetragen oder aus einem Überweisungsvorschlag.
   */
  const createRepayment = (input: {
    potId: string
    fromId: string
    toId: string
    amountCents: number
    paidOn: string
  }): boolean => {
    return repaymentWriter.create((householdId) => {
      const now = new Date().toISOString()
      return {
        repayment_id: newId(),
        pot_id: input.potId,
        household_id: householdId,
        from_participant_id: input.fromId,
        to_participant_id: input.toId,
        amount_cents: input.amountCents,
        paid_on: input.paidOn,
        updated_by_participant_id: myParticipantId(input.potId),
        created_at: now,
        updated_at: now,
      }
    })
  }

  const updateRepayment = (
    repaymentId: string,
    input: { fromId: string; toId: string; amountCents: number; paidOn: string },
  ): boolean =>
    repaymentWriter.update(repaymentId, {
      from_participant_id: input.fromId,
      to_participant_id: input.toId,
      amount_cents: input.amountCents,
      paid_on: input.paidOn,
    })

  const deleteRepayment = (repaymentId: string): boolean => repaymentWriter.remove(repaymentId)

  // ---------------------------------------------------------------
  // Töpfe für einen Anlass
  // ---------------------------------------------------------------

  /**
   * Topf für einen Anlass anlegen, mit Mitgliedern und weiteren Namen als
   * Teilnehmern, in einem Zug (RPC `create_event_pot`). Wartet auf die
   * Datenbank, statt optimistisch zu zeigen: ein doppelter Name soll den
   * Topf gar nicht erst entstehen lassen. Gibt die Kennung des Topfs zurück.
   */
  const createEventPot = async (input: {
    name: string
    memberIds: readonly string[]
    guestNames: readonly string[]
  }): Promise<string | null> => {
    const householdId = activeHouseholdId
    if (!householdId) return null
    const { data, error } = await supabase.rpc('create_event_pot', {
      p_pot_id: newId(),
      p_name: input.name.trim(),
      p_member_ids: input.memberIds,
      p_guest_names: input.guestNames.map((n) => n.trim()),
    })
    if (error) {
      console.error('Error creating pot:', error)
      useToastStore().showToast(
        error.code === '23505'
          ? 'Ein Name steht doppelt in der Liste'
          : 'Topf konnte nicht angelegt werden',
        'error',
      )
      return null
    }
    if (householdId !== activeHouseholdId) return null
    const pot = data as Pot
    if (!pots.value.some((p) => p.pot_id === pot.pot_id)) pots.value.push(pot)
    // Die Teilnehmer kommen per Realtime; nachladen, falls der Kanal hängt.
    void load()
    return pot.pot_id
  }

  /**
   * Gast: „Ich bin neu“ — sich selbst als Teilnehmer eintragen (RPC
   * `join_pot_as_guest`) und die Wahl merken. Wartet auf die Datenbank statt
   * optimistisch zu zeigen: ein vergebener Name soll gar nicht erst auftauchen.
   */
  const joinPotAsGuest = async (
    potId: string,
    name: string,
  ): Promise<'ok' | 'duplicate' | 'closed' | 'error'> => {
    const { data, error } = await supabase.rpc('join_pot_as_guest', {
      p_pot_id: potId,
      p_name: name.trim(),
    })
    if (error) {
      console.error('Error joining pot:', error)
      if (error.code === '23505') return 'duplicate'
      if (error.message === 'pot_closed') return 'closed'
      return 'error'
    }
    const row = data as PotParticipant
    if (!participants.value.some((p) => p.participant_id === row.participant_id)) {
      participants.value.push(row)
    }
    chooseGuestParticipant(potId, row.participant_id)
    return 'ok'
  }

  /** Teilnehmer per Namen in einen offenen Topf für einen Anlass eintragen. */
  const addParticipant = (potId: string, name: string): boolean => {
    const householdId = activeHouseholdId
    if (!householdId) return false
    const toastStore = useToastStore()
    const row: PotParticipant = {
      participant_id: newId(),
      pot_id: potId,
      household_id: householdId,
      name: name.trim(),
      user_id: null,
      // Neue Teilnehmer beginnen offen; die Datenbank erzwingt das ohnehin.
      confirmed: false,
      rejected: false,
      left_at: null,
      created_at: new Date().toISOString(),
    }
    const { applied } = runOptimistic<PotParticipant>({
      entityId: row.participant_id,
      apply: () => {
        participants.value.push(row)
        return row
      },
      commit: async () => {
        const { error } = await supabase.from('pot_participants').insert({
          participant_id: row.participant_id,
          pot_id: row.pot_id,
          household_id: row.household_id,
          name: row.name,
        })
        if (error) throw error
      },
      revert: (snapshot) => {
        participants.value = participants.value.filter(
          (x) => x.participant_id !== snapshot.participant_id,
        )
      },
      onError: (error) => {
        const duplicate = (error as { code?: string } | null)?.code === '23505'
        toastStore.showToast(
          duplicate
            ? `${row.name} gibt es in diesem Topf schon`
            : 'Teilnehmer konnte nicht eingetragen werden',
          'error',
        )
      },
    })
    return applied
  }

  /**
   * Ganze Gruppe: ein Haushaltsmitglied bestätigt (`confirm: true`) oder lehnt
   * ab, dass ein Nachzügler die früheren Ausgaben „ganze Gruppe“ mitträgt
   * (RPC `decide_whole_group_join`; Gäste weist die Datenbank ab). Endgültig:
   * hat ein anderes Gerät schon anders entschieden, gilt dessen Entscheidung.
   */
  const decideWholeGroupJoin = (participantId: string, confirm: boolean): boolean => {
    const toastStore = useToastStore()
    const findRow = () => participants.value.find((p) => p.participant_id === participantId)
    if (!findRow()) return false
    const { applied } = runOptimistic<PotParticipant>({
      entityId: participantId,
      apply: () => {
        const row = findRow()
        if (!row) return null
        const before = { ...row }
        row.confirmed = confirm
        row.rejected = !confirm
        return before
      },
      commit: async () => {
        const { data, error } = await supabase.rpc('decide_whole_group_join', {
          p_participant_id: participantId,
          p_confirm: confirm,
        })
        if (error) throw error
        const row = findRow()
        const saved = data as PotParticipant
        if (row) Object.assign(row, saved)
      },
      revert: (before) => {
        const row = findRow()
        if (row) Object.assign(row, before)
      },
      onError: (error) => {
        if ((error as { message?: string } | null)?.message === 'already_decided') {
          toastStore.showToast('Darüber hat schon jemand anders entschieden', 'info')
          void load()
          return
        }
        toastStore.showToast(
          confirm ? 'Bestätigen hat nicht geklappt' : 'Ablehnen hat nicht geklappt',
          'error',
        )
      },
    })
    return applied
  }

  /**
   * Abschließen (`closed: true`) oder wieder öffnen. Nie den Haushaltstopf.
   * `closedAt` setzt ein früheres Abschlussdatum wieder (Rückgängig des
   * Assistenten nach dem Wieder öffnen); sonst gilt jetzt.
   */
  const setPotClosed = (potId: string, closed: boolean, closedAt?: string): boolean => {
    const toastStore = useToastStore()
    const pot = pots.value.find((p) => p.pot_id === potId)
    if (!pot || pot.kind !== 'event') return false
    const closedAtValue = closed ? (closedAt ?? new Date().toISOString()) : null
    const { applied } = runOptimistic<{ before: string | null }>({
      entityId: potId,
      apply: () => {
        // Eingepackt: ein offener Topf hat `closed_at = null`, und `null` hieße „abbrechen“.
        const before = pot.closed_at
        pot.closed_at = closedAtValue
        return { before }
      },
      commit: async () => {
        // RLS lässt einen verbotenen Schreibzugriff still ins Leere laufen:
        // ohne zurückgegebene Zeile ist nichts geschehen.
        const { data, error } = await supabase
          .from('pots')
          .update({ closed_at: closedAtValue })
          .eq('pot_id', potId)
          .select('pot_id')
        if (error) throw error
        if (!data?.length) throw new Error('pot_not_updated')
      },
      revert: ({ before }) => {
        const current = pots.value.find((p) => p.pot_id === potId)
        if (current) current.closed_at = before
      },
      onError: () => {
        toastStore.showToast(
          closed ? 'Topf konnte nicht abgeschlossen werden' : 'Topf konnte nicht geöffnet werden',
          'error',
        )
      },
    })
    return applied
  }

  /** Topf für einen Anlass samt Teilnehmern, Ausgaben und Rückzahlungen löschen. */
  const deletePot = (potId: string): boolean => {
    const toastStore = useToastStore()
    const pot = pots.value.find((p) => p.pot_id === potId)
    if (!pot || pot.kind !== 'event') return false
    type Snapshot = {
      pot: Pot
      participants: PotParticipant[]
      expenses: PotExpense[]
      repayments: PotRepayment[]
    }
    const { applied } = runOptimistic<Snapshot>({
      entityId: potId,
      apply: () => {
        const inPot = <T extends { pot_id: string }>(x: T) => x.pot_id === potId
        const notInPot = <T extends { pot_id: string }>(x: T) => x.pot_id !== potId
        const snapshot: Snapshot = {
          pot,
          participants: participants.value.filter(inPot),
          expenses: expenses.value.filter(inPot),
          repayments: repayments.value.filter(inPot),
        }
        pots.value = pots.value.filter(notInPot)
        participants.value = participants.value.filter(notInPot)
        expenses.value = expenses.value.filter(notInPot)
        repayments.value = repayments.value.filter(notInPot)
        return snapshot
      },
      commit: async () => {
        const { data, error } = await supabase
          .from('pots')
          .delete()
          .eq('pot_id', potId)
          .select('pot_id')
        if (error) throw error
        if (!data?.length) throw new Error('pot_not_deleted')
      },
      revert: (snapshot) => {
        pots.value.push(snapshot.pot)
        participants.value.push(...snapshot.participants)
        expenses.value.push(...snapshot.expenses)
        repayments.value.push(...snapshot.repayments)
      },
      onError: () => {
        toastStore.showToast('Topf konnte nicht gelöscht werden', 'error')
      },
    })
    return applied
  }

  watch(
    () => householdStore.currentHousehold?.household_id ?? null,
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

  return {
    pots,
    loaded,
    householdPot,
    participantsOf,
    currentParticipantsOf,
    wholeGroupCarriersAt,
    pendingJoinsOf,
    decideWholeGroupJoin,
    expensesOf,
    repaymentsOf,
    balancesOf,
    sharesOf,
    participantName,
    participantExists,
    myParticipantId,
    chooseGuestParticipant,
    joinPotAsGuest,
    createExpense,
    createEventPot,
    addParticipant,
    setPotClosed,
    deletePot,
    createRepayment,
    updateExpense,
    deleteExpense,
    updateRepayment,
    deleteRepayment,
  }
})
