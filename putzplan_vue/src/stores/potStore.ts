import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Pot, PotExpense, PotParticipant, PotRepayment } from '@/types/Pot'
import { supabase } from '@/lib/supabase'
import { onSessionEnd } from '@/lib/sessionEnd'
import { isInFlight, runOptimistic } from '@/lib/optimistic'
import { expenseShares, potBalances, type ExpenseSplit, type LedgerExpense } from '@/lib/potLedger'
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

  const toLedgerExpense = (e: PotExpense): LedgerExpense => ({
    payerId: e.payer_participant_id,
    amountCents: e.amount_cents,
    split:
      e.split_kind === 'equal'
        ? { kind: 'equal', participantIds: Object.keys(e.split_values) }
        : { kind: e.split_kind, values: e.split_values },
  })

  /** Rohwerte fürs Speichern: wer nichts trägt, steht nicht drin. */
  const toSplitValues = (split: ExpenseSplit): Record<string, number> =>
    split.kind === 'equal'
      ? Object.fromEntries(split.participantIds.map((id) => [id, 1]))
      : Object.fromEntries(Object.entries(split.values).filter(([, v]) => v > 0))

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

  /** Der eigene Teilnehmer in einem Topf, falls man einer ist. */
  const myParticipantId = (potId: string): string | null =>
    participants.value.find((p) => p.pot_id === potId && p.user_id === authStore.user?.id)
      ?.participant_id ?? null

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
  // Ausgaben
  // ---------------------------------------------------------------

  /**
   * Ausgabe eintragen mit ihrer Aufteilung. Gespeichert
   * werden die Rohwerte der Aufteilung, nicht die Euro je Person. Die ID
   * vergibt der Client, damit das Realtime-Echo die optimistische Zeile trifft.
   */
  const createExpense = (input: {
    potId: string
    payerId: string
    amountCents: number
    spentOn: string
    description: string
    split: ExpenseSplit
  }): boolean => {
    const householdId = activeHouseholdId
    if (!householdId) return false
    const toastStore = useToastStore()
    const now = new Date().toISOString()
    const row: PotExpense = {
      expense_id: crypto.randomUUID(),
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

    const { applied } = runOptimistic<PotExpense>({
      entityId: row.expense_id,
      apply: () => {
        expenses.value.push(row)
        return row
      },
      commit: async () => {
        const { error } = await supabase.from('pot_expenses').insert({
          expense_id: row.expense_id,
          pot_id: row.pot_id,
          household_id: row.household_id,
          payer_participant_id: row.payer_participant_id,
          amount_cents: row.amount_cents,
          spent_on: row.spent_on,
          description: row.description,
          split_kind: row.split_kind,
          split_values: row.split_values,
          updated_by_participant_id: row.updated_by_participant_id,
        })
        if (error) throw error
      },
      revert: (snapshot) => {
        expenses.value = expenses.value.filter((x) => x.expense_id !== snapshot.expense_id)
      },
      onError: () => {
        toastStore.showToast('Ausgabe konnte nicht eingetragen werden', 'error')
      },
    })
    return applied
  }

  // ---------------------------------------------------------------
  // Rückzahlungen
  // ---------------------------------------------------------------

  /**
   * Rückzahlung eintragen: `fromId` hat `toId` im Topf `potId` Geld überwiesen.
   * Frei eingetragen oder aus einem Überweisungsvorschlag; optimistisch mit
   * Client-ID wie bei Ausgaben.
   */
  const createRepayment = (input: {
    potId: string
    fromId: string
    toId: string
    amountCents: number
    paidOn: string
  }): boolean => {
    const householdId = activeHouseholdId
    if (!householdId) return false
    const toastStore = useToastStore()
    const now = new Date().toISOString()
    const row: PotRepayment = {
      repayment_id: crypto.randomUUID(),
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

    const { applied } = runOptimistic<PotRepayment>({
      entityId: row.repayment_id,
      apply: () => {
        repayments.value.push(row)
        return row
      },
      commit: async () => {
        const { error } = await supabase.from('pot_repayments').insert({
          repayment_id: row.repayment_id,
          pot_id: row.pot_id,
          household_id: row.household_id,
          from_participant_id: row.from_participant_id,
          to_participant_id: row.to_participant_id,
          amount_cents: row.amount_cents,
          paid_on: row.paid_on,
          updated_by_participant_id: row.updated_by_participant_id,
        })
        if (error) throw error
      },
      revert: (snapshot) => {
        repayments.value = repayments.value.filter((x) => x.repayment_id !== snapshot.repayment_id)
      },
      onError: () => {
        toastStore.showToast('Rückzahlung konnte nicht eingetragen werden', 'error')
      },
    })
    return applied
  }

  // ---------------------------------------------------------------
  // Einträge ändern, löschen, wiederherstellen (Ausgaben und Rückzahlungen)
  // ---------------------------------------------------------------

  /**
   * Ändern, Löschen und Rückgängig für eine Eintragstabelle. Jeder darf jeden
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

    return { update, remove }
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
    expensesOf,
    repaymentsOf,
    balancesOf,
    sharesOf,
    participantName,
    participantExists,
    myParticipantId,
    createExpense,
    createRepayment,
    updateExpense,
    deleteExpense,
    updateRepayment,
    deleteRepayment,
  }
})
