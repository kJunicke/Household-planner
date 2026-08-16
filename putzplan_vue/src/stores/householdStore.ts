import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { Household, HouseholdMember } from '@/types/households'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import { DEFAULT_MEMBER_COLOR, pickMemberColor } from '@/lib/memberColors'
import {
    DEFAULT_WEEKLY_GOAL_POINTS,
    effectiveWeekStartDay,
    formatDayStamp,
    isPendingWeekStartDue,
    normalizeWeekStartDay,
    parseDayStamp,
    resolveWeekWindowStart,
    weekStartChangeover,
    type PendingWeekStart
} from '@/lib/weekWindow'
import type { RealtimeChannel } from '@supabase/supabase-js'

/** Grenzen des Wochenziels — identisch zum CHECK auf `households`. */
export const MIN_WEEKLY_GOAL_POINTS = 1
export const MAX_WEEKLY_GOAL_POINTS = 1000

interface CompletionWithEffort {
  user_id: string
  task_id: string
  completed_at: string
  effort_override: number | null
  tasks: {
    effort: number
    household_id?: string
  } | null
}

export const useHouseholdStore = defineStore('household', () => {
    // State
    const currentHousehold = ref<Household | null>(null)
    const householdMembers = ref<HouseholdMember[]>([])
    const weeklyCompletions = ref<CompletionWithEffort[]>([])

    // Optimistische Completions (noch nicht vom Server bestätigt). Bewusst
    // getrennt von `weeklyCompletions`, weil `loadWeeklyCompletions()` die Liste
    // komplett ersetzt und dabei eine parallel noch laufende Erledigung sonst
    // kurz aus dem Wochen-Ranking fallen würde. Der Punktwert darin ist eine
    // Schätzung — die Edge Function rechnet serverseitig, die echte Zeile
    // korrigiert still.
    const optimisticWeeklyCompletions = ref<(CompletionWithEffort & { clientMutationId: string })[]>([])

    const addOptimisticCompletion = (entry: CompletionWithEffort & { clientMutationId: string }) => {
        optimisticWeeklyCompletions.value.push(entry)
    }

    const removeOptimisticCompletion = (clientMutationId: string) => {
        optimisticWeeklyCompletions.value = optimisticWeeklyCompletions.value.filter(
            c => c.clientMutationId !== clientMutationId
        )
    }

    /** Bestätigte + optimistische Completions — Basis aller Wochen-Kennzahlen. */
    const effectiveWeeklyCompletions = computed<CompletionWithEffort[]>(() => [
        ...weeklyCompletions.value,
        ...optimisticWeeklyCompletions.value
    ])

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

        // 4. Änderungen der Haushalts-Einstellungen mitbekommen
        subscribeToHouseholdSettings()
    }

    const loadHouseholdMembers = async () => {
        const toastStore = useToastStore()

        if (!currentHousehold.value) {
            householdMembers.value = []
            return
        }

        // Stabile Reihenfolge, und zwar in der Query: die Statusleiste zeigt
        // „Reihenfolge der Mitgliederliste, keine Platzierung" — ohne ORDER BY
        // garantiert Postgres gar keine Reihenfolge, und ein UPDATE auf
        // `household_members` (Farbe, Name) kann sie zwischen zwei Ladevorgängen
        // still kippen. Beitrittsdatum ist die fachliche Ordnung; `user_id` ist
        // der Tiebreaker, falls `joined_at` fehlt oder zweimal gleich ist.
        const { data, error } = await supabase
            .from('household_members')
            .select('user_id, household_id, display_name, user_color')
            .eq('household_id', currentHousehold.value.household_id)
            .order('joined_at', { ascending: true, nullsFirst: true })
            .order('user_id', { ascending: true })

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

    /** Der in der Zeile als aktiv hinterlegte Wochenstart (0 = Sonntag … 6 = Samstag). */
    const activeWeekStartDay = computed(() =>
        normalizeWeekStartDay(currentHousehold.value?.week_start_day)
    )

    /** Anstehende Änderung des Wochenstarts, so wie sie am Haushalt steht. */
    const pendingWeekStart = computed<PendingWeekStart>(() => ({
        day:
            typeof currentHousehold.value?.week_start_day_pending === 'number'
                ? normalizeWeekStartDay(currentHousehold.value.week_start_day_pending)
                : null,
        from: parseDayStamp(currentHousehold.value?.week_start_pending_from)
    }))

    /**
     * Wochenstart des Haushalts (0 = Sonntag … 6 = Samstag).
     *
     * Eine **fällige** anstehende Änderung zählt hier schon, auch wenn sie noch
     * kein Client nach `week_start_day` fortgeschrieben hat: das Lesen darf
     * nicht davon abhängen, wer zuerst online war.
     *
     * Fällt auf Montag zurück, solange die Spalte fehlt oder leer ist — die
     * Migration ist beim ersten Ausrollen dieser Anzeige noch nicht gelaufen.
     */
    const weekStartDay = computed(() =>
        effectiveWeekStartDay(new Date(), activeWeekStartDay.value, pendingWeekStart.value)
    )

    /**
     * Der Wochentag, den die Einstellungen anzeigen sollen: eine noch nicht
     * fällige Änderung ist bereits die Entscheidung des Haushalts, auch wenn
     * sie erst später greift. Sonst sähe es aus, als wäre sie verlorengegangen.
     */
    const selectedWeekStartDay = computed(() => {
        const pending = pendingWeekStart.value
        return pending.day !== null ? pending.day : weekStartDay.value
    })

    /** Gemeinsames Wochenziel in Punkten; ohne gesetzten Wert ein sinnvoller Standard. */
    const weeklyGoalPoints = computed(() => {
        const raw = currentHousehold.value?.weekly_goal_points
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
            return DEFAULT_WEEKLY_GOAL_POINTS
        }
        return Math.trunc(raw)
    })

    // Lade die Erledigungen der **laufenden Woche** (feste Woche ab dem
    // eingestellten Wochenstart, nicht die letzten sieben Tage) und
    // ausschließlich die des eigenen Haushalts.
    //
    // Die Haushaltszugehörigkeit hängt an der Aufgabe, nicht an der Erledigung —
    // `task_completions` hat keine `household_id`. Deshalb der Inner Join auf
    // `tasks` mit explizitem Filter: sich auf RLS zu verlassen wäre eine stille
    // Abhängigkeit, die bei jeder Policy-Änderung falsche Zahlen liefern kann.
    /**
     * Start der laufenden Woche — ausschließlich aus Feldern des Haushalts
     * abgeleitet. Kein gerätelokaler Zustand: zwei Mitglieder (und zwei Geräte
     * desselben Mitglieds) müssen dieselbe Grenze sehen, sonst zeigt der
     * gemeinsame Balken still verschiedene Zahlen.
     */
    const currentWeekStart = (now: Date = new Date()): Date =>
        resolveWeekWindowStart(now, activeWeekStartDay.value, pendingWeekStart.value)

    /**
     * Datum, ab dem ein auf `newWeekStartDay` geänderter Wochenstart greift —
     * die Zahl, die die Bestätigung dem Nutzer nennt und die beim Speichern
     * unverändert in `week_start_pending_from` landet.
     */
    const weekStartEffectiveFrom = (newWeekStartDay: number, now: Date = new Date()): Date =>
        weekStartChangeover(currentWeekStart(now), newWeekStartDay)

    /**
     * Fällige Wochenstart-Änderung nach `week_start_day` fortschreiben.
     *
     * **Idempotent:** die Bedingung steckt im `WHERE` des UPDATEs
     * (`week_start_day_pending` nicht NULL, `week_start_pending_from` erreicht).
     * Ein zweiter Aufruf — auch gleichzeitig vom anderen Mitglied — trifft
     * keine Zeile mehr, weil das Pending im selben Statement geleert wird.
     * Das Wochenfenster kann sich dabei nicht verschieben: die Leseregel wendet
     * eine fällige Änderung ohnehin schon an, vorher und nachher kommt
     * derselbe Wochentag heraus. Schlägt der Aufruf fehl (offline), bleibt es
     * bei genau dieser Leseregel — nur die Zeile ist noch nicht aufgeräumt.
     */
    const promoteDueWeekStart = async (now: Date = new Date()) => {
        if (!currentHousehold.value) return
        const pending = pendingWeekStart.value
        if (!isPendingWeekStartDue(now, pending) || pending.day === null) return

        const { data, error } = await supabase
            .from('households')
            .update({
                week_start_day: pending.day,
                week_start_day_pending: null,
                week_start_pending_from: null
            })
            .eq('household_id', currentHousehold.value.household_id)
            .not('week_start_day_pending', 'is', null)
            .lte('week_start_pending_from', formatDayStamp(now))
            .select()
            .maybeSingle()

        if (error) {
            console.error('Error promoting pending week start:', error)
            return
        }
        if (data) currentHousehold.value = data
    }

    /** Wochenstart, gegen den die geladenen Erledigungen gezogen wurden. */
    const loadedWeekStart = ref<string | null>(null)

    const runLoadWeeklyCompletions = async () => {
        if (!currentHousehold.value) return

        await promoteDueWeekStart()

        const weekStart = currentWeekStart()
        loadedWeekStart.value = formatDayStamp(weekStart)

        // Lade Completions mit Tasks (für effort)
        const { data, error } = await supabase
            .from('task_completions')
            .select(`
                user_id,
                task_id,
                completed_at,
                effort_override,
                tasks!inner (effort, household_id)
            `)
            .eq('tasks.household_id', currentHousehold.value.household_id)
            .gte('completed_at', weekStart.toISOString())

        if (error) {
            console.error('Error loading weekly completions:', error)
            return
        }

        // Supabase gibt tasks als Array zurück, wir nehmen das erste Element
        weeklyCompletions.value = (data || []).map(item => ({
            ...item,
            tasks: Array.isArray(item.tasks) ? item.tasks[0] || null : item.tasks
        }))
        lastWeeklyLoadAt = Date.now()
    }

    /**
     * Die Woche wird beim Seitenaufbau von mehreren Stellen gleichzeitig
     * angefordert (Header, Putzen-Ansicht, Sichtbarkeits-Prüfung) — jede für
     * sich berechtigt, zusammen aber mehrere identische GETs auf
     * `task_completions`. Gleichzeitige Anforderungen teilen sich deshalb
     * dieselbe laufende Abfrage.
     *
     * **`force: true`** umgeht die Bündelung und ist Pflicht für jeden Aufruf
     * *nach einem eigenen Schreibvorgang*: eine bereits laufende Abfrage wurde
     * womöglich vor dem Schreiben abgeschickt und brächte den alten Stand
     * zurück — genau die Art stiller Fehler, bei der Punkte kurz „fehlen".
     */
    let inFlightWeeklyLoad: Promise<void> | null = null
    let lastWeeklyLoadAt = 0

    /**
     * Kurzes Frischefenster für den Seitenaufbau: Header und Putzen-Ansicht
     * fordern die Woche nacheinander an (die Ansicht wartet erst auf die
     * Aufgaben), überlappen sich also nicht immer. Übersprungen wird nur, wenn
     * die geladene Wochengrenze noch dieselbe ist — ein verschobenes Fenster
     * lädt immer neu.
     */
    const WEEKLY_LOAD_FRESH_MS = 2000

    const weeklyDataIsFresh = () =>
        lastWeeklyLoadAt > 0 &&
        Date.now() - lastWeeklyLoadAt < WEEKLY_LOAD_FRESH_MS &&
        loadedWeekStart.value === formatDayStamp(currentWeekStart())

    const loadWeeklyCompletions = (options: { force?: boolean } = {}) => {
        if (!options.force && inFlightWeeklyLoad) return inFlightWeeklyLoad
        if (!options.force && weeklyDataIsFresh()) return Promise.resolve()

        const run = runLoadWeeklyCompletions()
        if (!options.force) {
            inFlightWeeklyLoad = run
            void run.finally(() => {
                if (inFlightWeeklyLoad === run) inFlightWeeklyLoad = null
            })
        }
        return run
    }

    // Berechne wöchentliche Punkte pro User
    const weeklyPointsByUser = computed(() => {
        const pointsMap = new Map<string, number>()

        effectiveWeeklyCompletions.value.forEach((completion: CompletionWithEffort) => {
            // Priorisiere effort_override, dann task.effort, Fallback 1
            const taskEffort = completion.tasks?.effort ?? 1
            const effort = completion.effort_override ?? taskEffort
            const current = pointsMap.get(completion.user_id) || 0
            pointsMap.set(completion.user_id, current + effort)
        })

        return pointsMap
    })

    // Anzahl heute (Kalendertag) im Haushalt abgeschlossener Aufgaben.
    // Kooperative Momentum-Metrik fürs Putzen-Dashboard.
    const todayCompletionsCount = computed(() => {
        const now = new Date()
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        return effectiveWeeklyCompletions.value.filter(
            c => new Date(c.completed_at) >= startOfToday
        ).length
    })

    // Aktuelle User-Punkte diese Woche
    const currentUserWeeklyPoints = computed(() => {
        const authStore = useAuthStore()
        if (!authStore.user) return 0
        return weeklyPointsByUser.value.get(authStore.user.id) || 0
    })

    // Wöchentliche Rangliste — enthält **alle** Haushaltsmitglieder, auch solche
    // ohne Punkte in dieser Woche. Wer führt, soll trotzdem sehen, wie viele Punkte
    // die andere Person hat und welche Farbe sie trägt.
    const weeklyRanking = computed(() => {
        const authStore = useAuthStore()
        if (!authStore.user) return []

        const points = weeklyPointsByUser.value

        return householdMembers.value
            .map((member, index) => ({
                userId: member.user_id,
                name: member.display_name || 'Unbekannt',
                color: member.user_color || '#4A90E2',
                points: points.get(member.user_id) || 0,
                isCurrentUser: member.user_id === authStore.user!.id,
                order: index
            }))
            // Punkte absteigend; bei Gleichstand die Mitgliederreihenfolge, damit
            // die Liste nicht bei jeder Neuberechnung springt.
            .sort((a, b) => b.points - a.points || a.order - b.order)
            .map((entry, index) => ({ ...entry, rank: index + 1 }))
    })

    /**
     * Beiträge zum gemeinsamen Wochenziel — die Datengrundlage der Statusleiste.
     *
     * **Keine Rangliste.** Die Reihenfolge ist die der Mitgliederliste und hängt
     * nie an der Punktzahl; es gibt keinen Rang und keine Sortierung.
     *
     * Aufgebaut wird über `householdMembers`, NICHT über die Completions: wer die
     * Segmente aus den Erledigungen ableitet, verliert genau das Mitglied, das
     * diese Woche noch nichts getan hat — und niemandem fällt es auf, solange
     * alle fleißig sind. Jedes Mitglied erscheint, notfalls mit 0.
     */
    const weeklyContributions = computed(() => {
        const points = weeklyPointsByUser.value
        return householdMembers.value.map(member => ({
            userId: member.user_id,
            name: member.display_name || 'Unbekannt',
            color: member.user_color || DEFAULT_MEMBER_COLOR,
            points: points.get(member.user_id) || 0
        }))
    })

    /** Punkte des ganzen Haushalts in der laufenden Woche. */
    const weeklyTotalPoints = computed(() =>
        weeklyContributions.value.reduce((sum, entry) => sum + entry.points, 0)
    )

    /**
     * Wochenziel und Wochenstart setzen. Jedes Mitglied darf das — die
     * UPDATE-Policy auf `households` gilt für alle Mitglieder des Haushalts.
     *
     * Die Zielzahl wird **sofort** wirksam: `weeklyGoalPoints` hängt an
     * `currentHousehold`, der Balken rechnet also unmittelbar gegen den neuen
     * Wert.
     *
     * Der Wochenstart dagegen wird nicht in `week_start_day` geschrieben,
     * sondern als anstehende Änderung samt Wechseltag abgelegt. Der Wechseltag
     * wird **hier einmal** ausgerechnet und danach nur noch gelesen — er ist
     * damit für alle Mitglieder dieselbe Zahl, statt auf jedem Gerät neu
     * geschätzt zu werden.
     */
    const updateWeeklyGoalSettings = async (goalPoints: number, newWeekStartDay: number) => {
        const toastStore = useToastStore()

        if (!currentHousehold.value) {
            return { success: false, error: 'Kein Haushalt' }
        }

        const goal = Math.trunc(goalPoints)
        if (
            !Number.isFinite(goal) ||
            goal < MIN_WEEKLY_GOAL_POINTS ||
            goal > MAX_WEEKLY_GOAL_POINTS
        ) {
            // Vorab prüfen statt den CHECK der Datenbank zuschlagen zu lassen:
            // ein Postgres-Fehlertext ist keine Nutzermeldung.
            return { success: false, error: 'Ungültiges Wochenziel' }
        }

        // Eine fällige Änderung zuerst aufräumen, damit der Wechseltag gegen
        // den wirklich laufenden Wochenstart gerechnet wird.
        await promoteDueWeekStart()

        const day = normalizeWeekStartDay(newWeekStartDay)
        const now = new Date()

        const patch: Record<string, unknown> = { weekly_goal_points: goal }

        if (day === weekStartDay.value) {
            // Zurück auf den geltenden Tag: eine womöglich noch anstehende
            // Änderung wird damit widerrufen.
            patch.week_start_day_pending = null
            patch.week_start_pending_from = null
        } else {
            patch.week_start_day_pending = day
            patch.week_start_pending_from = formatDayStamp(weekStartEffectiveFrom(day, now))
        }

        const { data, error } = await supabase
            .from('households')
            .update(patch)
            .eq('household_id', currentHousehold.value.household_id)
            .select()
            .single()

        if (error) {
            console.error('Error updating weekly goal settings:', error)
            toastStore.showToast('Fehler beim Speichern des Wochenziels', 'error')
            return { success: false, error: error.message }
        }

        currentHousehold.value = data
        toastStore.showToast('Wochenziel gespeichert', 'success', 3000)
        return { success: true }
    }

    /** Haushaltszeile neu laden — Rückfallweg, wenn ein Realtime-Ereignis fehlte. */
    const refreshHousehold = async () => {
        if (!currentHousehold.value) return

        const { data, error } = await supabase
            .from('households')
            .select('*')
            .eq('household_id', currentHousehold.value.household_id)
            .maybeSingle()

        if (error || !data) return
        currentHousehold.value = data
    }

    // ---------------------------------------------------------------
    // Realtime: Haushalts-Einstellungen
    //
    // `postgres_changes` auf `households` — die Tabelle wird dafür in
    // `20260816170000_week_start_pending.sql` in die Publikation
    // `supabase_realtime` aufgenommen. Bewusst nicht per Broadcast: der
    // hinge daran, dass der **schreibende** Client sein Ereignis auch
    // absetzt; verliert er im falschen Moment die Verbindung, erfährt das
    // andere Mitglied nie davon und merkt es auch nicht.
    //
    // Als zweites Netz wird die Zeile beim Zurückkehren auf den Tab neu
    // geladen — und dabei gleich geprüft, ob inzwischen eine neue Woche
    // begonnen hat (eine App, die über den Wochenwechsel offen bleibt,
    // zeigte sonst bis zum nächsten Laden das alte Fenster).
    // ---------------------------------------------------------------
    let settingsChannel: RealtimeChannel | null = null
    let visibilityHandler: (() => void) | null = null

    /** Fenstergrenze neu prüfen und bei Verschiebung die Woche nachladen. */
    const reloadWeeklyCompletionsIfWindowMoved = async () => {
        if (!currentHousehold.value) return
        await promoteDueWeekStart()
        if (formatDayStamp(currentWeekStart()) !== loadedWeekStart.value) {
            await loadWeeklyCompletions()
        }
    }

    const subscribeToHouseholdSettings = () => {
        if (!currentHousehold.value) return
        unsubscribeFromHouseholdSettings()

        const householdId = currentHousehold.value.household_id

        settingsChannel = supabase
            .channel(`household-${householdId}-${Date.now()}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'households',
                    filter: `household_id=eq.${householdId}`
                },
                payload => {
                    const row = payload.new as Household | undefined
                    if (!row) return
                    currentHousehold.value = row
                    void reloadWeeklyCompletionsIfWindowMoved()
                }
            )
            .subscribe()

        visibilityHandler = () => {
            if (document.visibilityState !== 'visible') return
            void refreshHousehold().then(reloadWeeklyCompletionsIfWindowMoved)
        }
        document.addEventListener('visibilitychange', visibilityHandler)
    }

    const unsubscribeFromHouseholdSettings = () => {
        if (settingsChannel) {
            supabase.removeChannel(settingsChannel)
            settingsChannel = null
        }
        if (visibilityHandler) {
            document.removeEventListener('visibilitychange', visibilityHandler)
            visibilityHandler = null
        }
    }

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

        // 2. Add user as member with email as fallback display_name.
        //    Creator is the first member → gets the first palette color.
        const displayName = authStore.user.email?.split('@')[0] || 'Unbekannt'
        const { error: memberError } = await supabase
            .from('household_members')
            .insert({
                household_id: householdData.household_id,
                user_id: authStore.user.id,
                display_name: displayName,
                user_color: DEFAULT_MEMBER_COLOR
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
        subscribeToHouseholdSettings()
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

        // 2. Pick a color not yet used by existing members, so the new
        //    member is visually distinct in avatars and charts.
        const { data: existingMembers } = await supabase
            .from('household_members')
            .select('user_color')
            .eq('household_id', householdData.household_id)
        const memberColor = pickMemberColor(
            (existingMembers || []).map(m => m.user_color)
        )

        // 3. Add user as member with email as fallback display_name
        const displayName = authStore.user.email?.split('@')[0] || 'Unbekannt'
        const { error: memberError } = await supabase
            .from('household_members')
            .insert({
                household_id: householdData.household_id,
                user_id: authStore.user.id,
                display_name: displayName,
                user_color: memberColor
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
        subscribeToHouseholdSettings()
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
        unsubscribeFromHouseholdSettings()
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
        // Bewusst NICHT die rohe `weeklyCompletions` exportieren: wer sie statt
        // `effectiveWeeklyCompletions` benutzt, übersieht optimistische
        // Erledigungen. Nach außen gibt es nur die zusammengeführte Sicht.
        effectiveWeeklyCompletions,
        addOptimisticCompletion,
        removeOptimisticCompletion,
        currentUserWeeklyPoints,
        todayCompletionsCount,
        weeklyRanking,
        weeklyContributions,
        weeklyTotalPoints,
        weeklyGoalPoints,
        weekStartDay,
        activeWeekStartDay,
        pendingWeekStart,
        selectedWeekStartDay,
        updateWeeklyGoalSettings,
        weekStartEffectiveFrom,
        currentWeekStart,
        refreshHousehold,
        subscribeToHouseholdSettings,
        unsubscribeFromHouseholdSettings
    }
})
