<script setup lang="ts">
/**
 * Die Erledigt-Liste unter der Wand (Pinnwand-Redesign, Etappe 5).
 *
 * Erledigte Aufgaben hängen nicht an der Wand — sie kosten dort den Überblick
 * über das, was noch offen ist. Sie stehen darunter als kompakter Streifen:
 * eine Zeile je Aufgabe, Titel durchgestrichen, Personenfarbe als Punkt,
 * Uhrzeit rechts. Aufbau und Reihenfolge sind die des klassischen
 * Erledigt-Tabs (`useTaskBoard.completedTasks`), nur in der neuen Formsprache.
 *
 * **„wieder dreckig" gehört hierher**, nicht an den Zettel: es betrifft
 * ausschließlich erledigte Aufgaben.
 *
 * Verschobene Aufgaben stehen ebenfalls hier — `postponeTask` setzt
 * `completed = true` —, tragen aber statt einer Uhrzeit das Kennzeichen
 * „verschoben auf …". Sie hat niemand erledigt; eine Uhrzeit wäre gelogen.
 */
import { computed, ref } from 'vue'
import type { Task } from '@/types/Task'
import { useTaskStore } from '@/stores/taskStore'
import { useHouseholdStore } from '@/stores/householdStore'
import { scheduleOf, formatPostponeDate } from '@/lib/taskSchedule'

const props = defineProps<{ tasks: readonly Task[] }>()

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()

/**
 * Wer eine Aufgabe zuletzt erledigt hat und wann — aus `task_completions`,
 * der einzigen Quelle dafür. `tasks.last_completed_at` kennt nur den
 * Zeitpunkt, nicht die Person.
 *
 * Die Quelle deckt bewusst nur die **laufende Woche** ab: der Store lädt
 * nichts anderes, und die Liste ist als Chronik des Tages gedacht. Für ältere
 * Erledigungen fällt die Zeit auf `last_completed_at` zurück und der Punkt
 * bleibt farblos — lieber kein Punkt als der falsche.
 */
const lastCompletionByTask = computed(() => {
  const map = new Map<string, { userId: string; at: string }>()
  for (const completion of householdStore.effectiveWeeklyCompletions) {
    const existing = map.get(completion.task_id)
    if (!existing || completion.completed_at > existing.at) {
      map.set(completion.task_id, { userId: completion.user_id, at: completion.completed_at })
    }
  }
  return map
})

const colorOfUser = (userId: string | null | undefined): string | null => {
  if (!userId) return null
  return householdStore.householdMembers.find(m => m.user_id === userId)?.user_color || null
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

type DoneRow = {
  task: Task
  /** Personenfarbe des Erledigers — `null` heißt „nicht bekannt", nicht „niemand". */
  color: string | null
  /** Rechte Spalte: Uhrzeit, Datum oder „verschoben auf …". */
  stamp: string
  /** Verschoben sieht anders aus als erledigt — es ist keine Leistung. */
  postponed: boolean
}

/**
 * Uhrzeit, solange die Erledigung von heute ist — darum geht es in der
 * Chronik. Alles Ältere bekommt stattdessen das Datum: „09:14" an einer
 * Aufgabe von vorletzter Woche liest sich wie heute Morgen.
 */
const formatStamp = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  if (date >= startOfToday()) {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

const rows = computed((): DoneRow[] =>
  props.tasks.map((task): DoneRow => {
    const schedule = scheduleOf(task)
    if (schedule.status === 'postponed' && schedule.postponedUntil) {
      // Punkt bleibt neutral. Er beantwortet „wer hat das gemacht" — eine
      // verschobene Aufgabe hat niemand gemacht. Die Farbe des Zuständigen
      // stünde hier in derselben Bildsprache wie die wahre Aussage der Zeile
      // daneben und wäre damit nicht als andere Aussage erkennbar.
      return {
        task,
        color: null,
        stamp: `verschoben auf ${formatPostponeDate(schedule.postponedUntil)}`,
        postponed: true
      }
    }

    const completion = lastCompletionByTask.value.get(task.task_id)
    const iso = completion?.at ?? task.last_completed_at
    return {
      task,
      color: colorOfUser(completion?.userId),
      stamp: iso ? formatStamp(iso) : '',
      postponed: false
    }
  })
)

/**
 * Schutz gegen den Doppeltipp. `markAsDirty` ist asynchron und lädt danach
 * neu; ohne Sperre setzen zwei schnelle Tipps zwei Anfragen ab, und die Zeile
 * steht bis zum Nachladen weiter da.
 *
 * **ACHTUNG — der Schutz hängt allein an der `if`-Zeile unten, nicht am
 * `:disabled` im Template.** Vue schreibt das Attribut erst im nächsten Tick;
 * der QC hat gemessen, dass `btn.disabled` nach dem ersten, zweiten *und*
 * dritten synchronen Klick noch `false` war. `:disabled` ist hier reine Optik.
 *
 * Daraus folgt: die Sperre MUSS synchron vor dem ersten `await` gesetzt
 * werden. Wer davor ein `await` einschiebt (eine Rückfrage, ein Nachladen,
 * eine Animation), öffnet das Fenster wieder — und ein Doppeltipp setzt dann
 * zwei Aufgaben-Rücksetzungen ab.
 */
const busy = ref(new Set<string>())

const markDirty = async (taskId: string) => {
  // Synchron. Zwischen dieser Zeile und der Zuweisung darunter darf nichts
  // stehen, das den Ablauf unterbricht.
  if (busy.value.has(taskId)) return
  busy.value = new Set(busy.value).add(taskId)
  try {
    await taskStore.markAsDirty(taskId)
  } finally {
    const next = new Set(busy.value)
    next.delete(taskId)
    busy.value = next
  }
}
</script>

<template>
  <section v-if="rows.length" class="done">
    <h2 class="done-head">Erledigt</h2>
    <ul class="done-list">
      <li
        v-for="row in rows"
        :key="row.task.task_id"
        class="done-row"
        :class="{ 'done-row--postponed': row.postponed }"
        :style="row.color ? { '--dot': row.color } : undefined"
      >
        <span class="dot" aria-hidden="true"></span>
        <span class="done-title">{{ row.task.title }}</span>
        <span class="stamp">{{ row.stamp }}</span>
        <button
          class="again"
          title="Wieder dreckig"
          :disabled="busy.has(row.task.task_id)"
          @click="markDirty(row.task.task_id)"
        >
          <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.done {
  margin-top: 16px;
}

.done-head {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pw-ink-soft);
}

.done-list {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--pw-paper);
  border: 2px solid var(--pw-line);
  box-shadow: var(--pw-shadow);
}

/* Rund 36 px je Zeile (Ticket). Die Höhe ist gesetzt und nicht dem Inhalt
   überlassen — der Streifen soll bei jeder Titellänge gleich dicht bleiben. */
.done-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 0 0 8px;
  border-bottom: 1px solid rgba(36, 31, 26, 0.18);
}

.done-row:last-child {
  border-bottom: none;
}

/* Personenfarbe als Punkt. Ohne bekannte Person bleibt `--dot` ungesetzt und
   der zweite Parameter greift — derselbe zurücktretende Ton wie am Zettel. */
.dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--dot, color-mix(in srgb, var(--pw-free) 45%, var(--pw-paper)));
  border: 1.5px solid var(--pw-line);
}

/* `min-width: 0` ist Pflicht: ohne sie ist die Mindestbreite eines Flex-Kindes
   seine Inhaltsbreite, das Kürzen greift nicht und der lange Titel drückt
   stattdessen Uhrzeit und Knopf aus der Zeile. */
.done-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 700;
  color: var(--pw-ink-soft);
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}

/* Verschoben ist nicht erledigt — deshalb kein Strich durch den Titel. */
.done-row--postponed .done-title {
  text-decoration: none;
}

.stamp {
  flex: none;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--pw-ink-soft);
  opacity: 0.85;
  white-space: nowrap;
}

.done-row--postponed .stamp {
  opacity: 1;
}

/* Die Trefferfläche deckt sich mit der sichtbaren Fläche: 48 px breit,
   senkrecht der volle **Inhaltsbereich** der Zeile.

   Die Höhe steht deshalb NICHT als Zahl da, sondern als `align-self: stretch`.
   `.done-row` ist 36 px hoch als Border-Box und trägt eine 1 px starke
   Trennlinie unten — ihr Inhaltsbereich ist damit 35 px, nicht 36. Ein fest
   auf 36 px gesetzter Knopf ragt oben und unten je 0,5 px darüber hinaus; die
   unteren 0,5 px liegen im Band der nächsten Zeile, und deren Knopf gewinnt
   als späteres Geschwisterelement das Hit-Testing. Ein Tipp auf den unteren
   Rand setzte dann die FALSCHE Aufgabe wieder auf dran — vom QC an allen drei
   unteren Ecken über sieben Zeilen nachgewiesen. `stretch` bindet die Höhe an
   den Inhaltsbereich und kann deshalb nicht wieder auseinanderlaufen, wenn
   sich Zeilenhöhe oder Linienstärke ändern.
   Prüfen lässt sich das nur durch Abtasten der Ecken, nicht durch Ansehen.

   Kein Padding und kein Margin, `border: 0` und `box-sizing: border-box`
   stehen ausdrücklich da, damit keine geerbte Regel die 48 px in der Breite zu
   einem Innenmaß macht.

   Die Höhe bleibt unter den sonst üblichen 48 px — sie ist durch die
   36-px-Zeile aus dem Ticket gedeckelt. Ein danebengegangener Tipp macht eine
   erledigte Aufgabe wieder auf, deshalb darf hier kein Pixel verschenkt sein.

   Gemessen (QC, DPR 1, Zoom 1, sieben Zeilen): Überstand oben und unten je
   0,000 px, Vollflächen-Abtastung 100 % Eigentreffer, kein einziger
   Fremdtreffer. In der letzten Zeile fehlt die Trennlinie, dort wird der Knopf
   von allein 36 px hoch — genau das könnte eine feste Höhe nicht. */
.again {
  flex: none;
  align-self: stretch;
  box-sizing: border-box;
  width: 48px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--pw-ink-soft);
  font-size: 15px;
  line-height: 1;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.again:active:not(:disabled) {
  transform: translate(1px, 1px);
}

.again:disabled {
  opacity: 0.4;
}
</style>
