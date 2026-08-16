<script setup lang="ts">
/**
 * Die Pinnwand (Pinnwand-Redesign, Etappe 2).
 *
 * Eigene Komponente **neben** `CleaningView`, nicht dessen Umbau: `HomeView`
 * entscheidet anhand der Aussehen-Einstellung, welche der beiden gerendert
 * wird. Beide arbeiten auf denselben Stores und derselben Auswahl
 * (`useTaskBoard`), damit ein Umschalten nichts verliert.
 *
 * Es gibt keine Kategorie-Chipleiste, keine Gruppierung und keine
 * Überschriften. Die Reihenfolge auf der Wand ist: offene Aufgaben nach
 * Dringlichkeit, dann tägliche, dann Projekte — den Typ trägt das Papier.
 *
 * Oben klebt die Statusleiste mit dem gemeinsamen Wochenziel (Etappe 3).
 *
 * Noch nicht hier (spätere Etappen): Erledigt-Liste unter der Wand,
 * Aufklappen von Unteraufgaben, Abreiß-Geste.
 * Erledigen läuft in dieser Etappe weiter über die bestehenden Wege
 * (Such-Overlay mit der alten Karte, Quick-Aufgabe).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import WallNote from '../components/WallNote.vue'
import WallStatusBar from '../components/WallStatusBar.vue'
import TaskCard from '../components/TaskCard.vue'
import TaskCreateModal from '../components/TaskCreateModal.vue'
import QuickTaskModal from '../components/QuickTaskModal.vue'
import { useTaskStore } from '../stores/taskStore'
import { useHouseholdStore } from '../stores/householdStore'
import { useTaskBoard } from '@/composables/useTaskBoard'
import { searchTasks } from '@/lib/taskSearch'
import { MIN_NOTE_WIDTH, packWall, rotationOf } from '@/lib/wallLayout'
import type { Task } from '@/types/Task'

const taskStore = useTaskStore()
const householdStore = useHouseholdStore()
const board = useTaskBoard(() => taskStore.tasks)

/**
 * Reihenfolge der Wand. `pendingTasks` ist bereits nach Dringlichkeit sortiert;
 * die Listen aus dem Composable sind `readonly`, deshalb wird kopiert statt
 * sortiert.
 */
const wallTasks = computed((): Task[] => [
  ...board.pendingTasks.value,
  ...board.dailyTasks.value,
  ...board.projectTasks.value
])

// --- Layout ------------------------------------------------------------------

/** Luft zum Wandrand, damit ein geneigter Zettel samt Schatten nicht überhängt. */
const EDGE = 6

/**
 * Zuschlag auf jede gemessene Breite.
 *
 * Zwischen der am Wurzelelement gemessenen Breite und der Breite, die der
 * Titel später tatsächlich zur Verfügung hat, liegt eine kleine, nicht
 * herleitbare Differenz: der Browser rundet die Auflösung von Rahmen und
 * Innenabstand sowie die Breite des Textlaufs unabhängig voneinander.
 *
 * Diese Marge ist deshalb **bemessen, nicht bewiesen**. Bei einem Zuschlag von
 * 1 px lag die geringste gemessene Restluft über 25 Zettel bei 0,50 px
 * („Keller entrümpeln"), danach 0,61 px und 0,96 px — es ist nie umgebrochen,
 * aber die nächste Änderung an Schriftgröße oder Innenabstand hätte darüber
 * entschieden. Mit 4 px liegt dieselbe Restluft bei rund 3,5 px.
 *
 * Ein paar Pixel zusätzliche Zettelbreite sieht niemand; ein fehlendes halbes
 * Pixel bricht den Titel um. Die Marge geht deshalb immer nach oben.
 */
const MEASURE_SAFETY = 4

/**
 * Obergrenze für Zettel mit **mehrwortigen** Titeln, als Anteil der Wandbreite.
 * Kurze Titel erreichen sie nie und bleiben einzeilig; lange brechen an einer
 * Wortgrenze um, statt eine ganze Reihe für sich zu beanspruchen.
 */
const MAX_WIDTH_RATIO = 0.68

const wallEl = ref<HTMLElement | null>(null)
const wallHeight = ref(0)
const noteEls = new Map<string, HTMLElement>()
/** Zuletzt gesetzte Positionen — Ausgangspunkt jeder FLIP-Animation. */
const lastPositions = new Map<string, { x: number; y: number }>()

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

type NoteExposed = { root: HTMLElement | null } | null

const setNoteEl = (taskId: string, instance: unknown) => {
  const el = (instance as NoteExposed)?.root ?? null
  if (el) noteEls.set(taskId, el)
  else noteEls.delete(taskId)
}

/**
 * Packt die Wand neu: Breite aus der Titellänge setzen, Höhe messen, Skyline
 * rechnen, Positionen schreiben. Muss nach jedem Datenwechsel, nach dem Laden
 * der Schrift und nach jeder Breitenänderung laufen — sonst stünden die Zettel
 * auf Maßen, die nicht mehr gelten.
 */
const relayout = (animate: boolean) => {
  const wall = wallEl.value
  if (!wall) return

  const usableWidth = wall.clientWidth - 2 * EDGE
  if (usableWidth <= 0) return

  const before = new Map(lastPositions)

  const metrics = []
  for (const task of wallTasks.value) {
    const el = noteEls.get(task.task_id)
    if (!el) continue

    // Schritt 1 — natürliche Breite: Titel einzeilig, ohne Deckel.
    //
    // Gemessen wird mit `getBoundingClientRect()`, NICHT mit `offsetWidth`.
    // `offsetWidth` ist eine ganze Zahl und rundet ab: bei einer echten
    // Textbreite von 123,4 px liefert es 123, wir setzen 123 als feste Breite
    // — und der Titel passt um 0,4 px nicht mehr in seine Zeile und bricht um.
    // Das trifft im Mittel jeden zweiten Titel und sieht wie ein Zufall aus.
    // `getBoundingClientRect().width` liefert die Nachkommastellen; danach
    // wird aufgerundet und `MEASURE_SAFETY` addiert. Was das garantiert, steht
    // dort — kurz: die Marge ist bemessen, nicht bewiesen, und geht nach oben.
    el.classList.add('zettel--measuring')
    el.style.width = 'max-content'
    el.style.maxWidth = 'none'
    const natural = Math.ceil(el.getBoundingClientRect().width) + MEASURE_SAFETY
    el.classList.remove('zettel--measuring')
    el.style.maxWidth = ''

    // Schritt 2 — Breite festlegen.
    //
    // Kurze Titel bekommen genau ihre natürliche Breite und bleiben einzeilig.
    // Der Deckel greift erst oberhalb davon und trifft kurze Titel deshalb nie:
    // ein langer, mehrwortiger Titel soll lieber an einer Wortgrenze umbrechen,
    // als die halbe Wand breit zu werden.
    //
    // Ein einzelnes langes Wort ist davon ausgenommen — es kann nicht
    // umbrechen, ein Deckel würde es nur abschneiden. Es bekommt so viel
    // Breite, wie es braucht, höchstens die ganze Wand.
    const capped = Math.min(usableWidth, Math.round(usableWidth * MAX_WIDTH_RATIO))
    const wraps = /\s/.test(task.title.trim())
    const wanted = natural > capped && wraps ? capped : natural

    const width = Math.max(MIN_NOTE_WIDTH, Math.min(usableWidth, wanted))
    el.style.width = `${width}px`
    // Höhe erst nach dem Setzen der Breite messen — vorher ist sie bedeutungslos.
    metrics.push({ id: task.task_id, width, height: el.offsetHeight })
  }

  const packed = packWall(metrics, usableWidth)
  wallHeight.value = packed.height

  lastPositions.clear()
  const moved: Array<{ el: HTMLElement; id: string; dx: number; dy: number; z: number }> = []

  for (const note of packed.notes) {
    const el = noteEls.get(note.id)
    if (!el) continue
    const x = note.x + EDGE
    const y = note.y
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.zIndex = String(note.z)
    lastPositions.set(note.id, { x, y })

    const previous = before.get(note.id)
    if (previous) {
      const dx = previous.x - x
      const dy = previous.y - y
      if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) {
        moved.push({ el, id: note.id, dx, dy, z: note.z })
      }
    }
  }

  if (!animate || prefersReducedMotion?.matches) return
  animateMoves(moved)
}

/**
 * FLIP über die Web Animations API: abnehmen (Schatten wächst, Neigung richtet
 * sich auf) → fliegen → kleiner Überschwinger → andocken. Nur Zettel, deren
 * Platz sich wirklich geändert hat, bewegen sich — der Rest bleibt still.
 */
const animateMoves = (
  moved: Array<{ el: HTMLElement; id: string; dx: number; dy: number; z: number }>
) => {
  moved.forEach(({ el, id, dx, dy, z }, index) => {
    const rot = rotationOf(id)
    const lift = `translate(${dx * 0.6}px, ${dy * 0.6 - 8}px) rotate(${rot * 0.25}deg) scale(1.07)`
    el.style.zIndex = String(600 + index)
    const animation = el.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1)`,
          boxShadow: 'var(--pw-shadow)',
          offset: 0
        },
        { transform: lift, boxShadow: 'var(--pw-shadow-lift)', offset: 0.3 },
        {
          transform: `translate(0, 0) rotate(${rot * 0.6}deg) scale(1.035)`,
          boxShadow: 'var(--pw-shadow-lift)',
          offset: 0.74
        },
        {
          transform: `translate(0, 0) rotate(${rot + 1.4}deg) scale(.985)`,
          boxShadow: 'var(--pw-shadow)',
          offset: 0.88
        },
        {
          transform: `translate(0, 0) rotate(${rot}deg) scale(1)`,
          boxShadow: 'var(--pw-shadow)',
          offset: 1
        }
      ],
      {
        duration: 430 + Math.min(160, Math.hypot(dx, dy)),
        delay: Math.min(120, index * 7),
        easing: 'cubic-bezier(.28,.9,.32,1)',
        fill: 'backwards'
      }
    )
    animation.onfinish = () => {
      el.style.zIndex = String(z)
    }
  })
}

const scheduleRelayout = (animate: boolean) => {
  nextTick(() => relayout(animate))
}

/**
 * Nur Änderungen, die das Packen betreffen, lösen ein Neupacken aus: Menge,
 * Reihenfolge, Titel (steuert die Breite) und Typ (steuert das Papier). Eine
 * geänderte Zuweisung färbt nur um und darf die Wand nicht durchschütteln.
 */
const layoutSignature = computed(() =>
  wallTasks.value.map(task => `${task.task_id}:${task.task_type}:${task.title}`).join('|')
)

watch(layoutSignature, () => scheduleRelayout(true))

let resizeObserver: ResizeObserver | null = null
let lastWidth = 0

onMounted(async () => {
  await taskStore.loadTasks()
  taskStore.subscribeToTasks()
  householdStore.loadWeeklyCompletions()

  scheduleRelayout(false)

  // Breitenänderung (Drehen, Fensterbreite) → neu packen. Die Höhe der Wand
  // setzen wir selbst; würde sie mitzählen, drehte sich der Observer im Kreis.
  if (wallEl.value && typeof ResizeObserver !== 'undefined') {
    lastWidth = wallEl.value.clientWidth
    resizeObserver = new ResizeObserver(() => {
      const width = wallEl.value?.clientWidth ?? 0
      if (width === lastWidth) return
      lastWidth = width
      relayout(false)
    })
    resizeObserver.observe(wallEl.value)
  }

  // Die Schrift bestimmt die Textbreite und damit JEDE Zettelbreite. Wird mit
  // der Ersatzschrift gemessen, fallen alle Zettel zu schmal aus und die Titel
  // brechen um — dasselbe Schadensbild wie bei einer abgerundeten Messung.
  // `relayout()` misst die Breiten neu, deshalb genügt hier ein weiterer Lauf,
  // sobald die Schriften stehen. Ist bereits alles geladen, löst das Promise
  // sofort aus und der Lauf kostet nichts.
  //
  // Der Lauf liegt in einem `requestAnimationFrame`, nicht direkt im
  // `then`-Callback: `fonts.ready` ist beim **Umschalten des Aussehens** bereits
  // erfüllt und löst dann als Mikrotask aus — also möglicherweise noch bevor der
  // Browser die eben gesetzte Wandhöhe angewandt hat. Gemessen würde dann in
  // einem Zwischenzustand, und weil `wallEl.clientWidth` davon abhängt, ob die
  // Seite in diesem Moment schon eine Bildlaufleiste hat, fällt die Wandbreite
  // um deren Breite anders aus als nach einem Neuladen — genau das Bild aus dem
  // QC-Befund (ein Zettel rutscht beim Umschalten in die zweite Reihe, nach dem
  // Neuladen steht er wieder oben). Ein Frame später steht der Zustand.
  document.fonts?.ready.then(() => requestAnimationFrame(() => relayout(false)))
})

onUnmounted(() => {
  taskStore.unsubscribeFromTasks()
  resizeObserver?.disconnect()
})

// --- Suche, Erstellen, Quick-Aufgabe (funktional unverändert) ----------------

const showCreateModal = ref(false)
const showQuickModal = ref(false)
const showSearchOverlay = ref(false)
const searchQuery = ref('')

const searchResults = computed(() => searchTasks(taskStore.tasks, searchQuery.value))

const openSearchOverlay = () => {
  showSearchOverlay.value = true
  setTimeout(() => {
    const input = document.querySelector('.search-overlay-input') as HTMLInputElement | null
    input?.focus()
  }, 100)
}

const closeSearchOverlay = () => {
  showSearchOverlay.value = false
  searchQuery.value = ''
}

const openCreateFromSearch = () => {
  showSearchOverlay.value = false
  showCreateModal.value = true
}

const openQuickFromSearch = () => {
  showSearchOverlay.value = false
  showQuickModal.value = true
}

const handleCreateTask = async (taskData: {
  title: string
  effort: 1 | 2 | 3 | 4 | 5
  recurrence_days: number
  task_type: 'recurring' | 'daily' | 'one-time' | 'project'
}) => {
  try {
    await taskStore.createTask(taskData)
    showCreateModal.value = false
    searchQuery.value = ''
  } catch (error) {
    console.error('Fehler beim Erstellen:', error)
  }
}

const handleCreateQuickTask = async (data: {
  title: string
  effort: 1 | 2 | 3 | 4 | 5
  note?: string
}) => {
  const result = await taskStore.createQuickTask(data)
  if (result) {
    showQuickModal.value = false
    searchQuery.value = ''
  }
}
</script>

<template>
  <main class="wall-page">
    <!-- Statusleiste: klebt oben, bleibt beim Scrollen sichtbar. -->
    <WallStatusBar />

    <!-- Die Wand: Kork, absolut positionierte Zettel, keine Überschriften. -->
    <div ref="wallEl" class="pw-wall wall" :style="{ height: `${wallHeight}px` }">
      <WallNote
        v-for="task in wallTasks"
        :key="task.task_id"
        :ref="instance => setNoteEl(task.task_id, instance)"
        :task="task"
      />
    </div>

    <p v-if="!taskStore.isLoading && wallTasks.length === 0" class="wall-empty">
      Nichts angepinnt.
    </p>

    <!-- FAB: schwebende Papierkarte, nicht angepinnt. Sitzt so hoch, dass sie
         die untere rechte Ecke des untersten Zettels frei lässt. -->
    <div class="fab-card">
      <button
        class="fab-btn"
        :disabled="taskStore.isLoading"
        aria-label="Aufgabe suchen oder hinzufügen"
        @click="openSearchOverlay"
      >
        <i class="bi bi-search" aria-hidden="true"></i>
        <span class="fab-plus" aria-hidden="true"><i class="bi bi-plus"></i></span>
      </button>
    </div>

    <!-- Such-Overlay: funktional unverändert, inklusive der bestehenden Karte
         als Ergebniszeile — sie bleibt in dieser Etappe der Weg zum Erledigen. -->
    <div v-if="showSearchOverlay" class="search-overlay">
      <div class="search-overlay-backdrop" @click="closeSearchOverlay"></div>
      <div class="search-overlay-content">
        <div class="search-overlay-header">
          <div class="search-overlay-input-wrapper">
            <i class="bi bi-search"></i>
            <input
              v-model="searchQuery"
              type="text"
              class="search-overlay-input"
              placeholder="Aufgabe suchen oder erstellen..."
              @keyup.esc="closeSearchOverlay"
            />
            <button
              v-if="searchQuery"
              class="search-clear-btn"
              aria-label="Eingabe löschen"
              @click="searchQuery = ''"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <button class="search-overlay-close" aria-label="Suche schließen" @click="closeSearchOverlay">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div v-if="searchQuery.trim()" class="search-overlay-actions">
          <button class="btn btn-primary" @click="openCreateFromSearch">
            <i class="bi bi-plus-lg"></i> Aufgabe erstellen
          </button>
          <button class="btn btn-success" @click="openQuickFromSearch">
            <i class="bi bi-lightning-charge-fill"></i> Quick-Aufgabe abschließen
          </button>
        </div>

        <div class="search-overlay-body">
          <template v-if="searchResults && searchResults.length > 0">
            <div
              v-for="result in searchResults"
              :key="result.task.task_id"
              class="search-result-item"
            >
              <div class="search-result-category">{{ result.categoryLabel }}</div>
              <TaskCard :task="result.task" />
            </div>
          </template>

          <div v-else-if="searchResults && searchResults.length === 0" class="search-overlay-initial">
            <i class="bi bi-search"></i>
            <p>Keine Aufgaben gefunden für "{{ searchQuery }}"</p>
          </div>

          <div v-else class="search-overlay-initial">
            <i class="bi bi-search"></i>
            <p>Suche über alle Aufgaben...</p>
          </div>
        </div>
      </div>
    </div>

    <TaskCreateModal
      v-if="showCreateModal"
      :initialTitle="searchQuery.trim()"
      :isLoading="taskStore.isLoading"
      @close="showCreateModal = false"
      @create="handleCreateTask"
    />

    <QuickTaskModal
      v-if="showQuickModal"
      :initialTitle="searchQuery.trim()"
      :isLoading="taskStore.isLoading"
      @close="showQuickModal = false"
      @complete="handleCreateQuickTask"
    />
  </main>
</template>

<style scoped>
.wall-page {
  min-height: 100vh;
  background: var(--pw-cork-deep);
  /* Unten kommt zum FAB-Polster die Höhe der oben klebenden Statusleiste dazu.
     `WallStatusBar` misst sie und schreibt sie als `--wall-status-height` an
     <html> — eine feste Pixelzahl wäre falsch, weil die Leiste kompakt/nicht
     kompakt und je nach Leck unterschiedlich hoch ist. Ohne dieses Polster
     bleiben am Seitenende Zettel dauerhaft unter der Leiste und ihr Eselsohr
     (Etappe 4) wäre unerreichbar. */
  padding: 10px 8px calc(96px + var(--wall-status-height, 0px));
}

/* Der Bezugsrahmen der absolut positionierten Zettel. Die Höhe kommt aus dem
   Packen, nicht aus dem Inhalt. `.pw-wall` (pinnwand.css) liefert den Kork. */
.wall {
  position: relative;
  width: 100%;
  /* Während der Breitenmessung ist ein Zettel kurzzeitig `max-content` breit
     und kann die Wand überragen. `clip` verhindert, dass dabei ein waagerechter
     Bildlauf aufblitzt; `visible` in der Senkrechten hält Reißzwecke und
     Klebeband sichtbar, die über die Oberkante hinausragen. */
  overflow-x: clip;
  overflow-y: visible;
  border: 2px solid rgba(0, 0, 0, 0.12);
  transition: height 0.42s cubic-bezier(0.2, 0.8, 0.3, 1);
}

.wall-empty {
  margin: 24px auto 0;
  max-width: 240px;
  padding: 14px 12px;
  text-align: center;
  background: var(--pw-paper);
  border: 2px solid var(--pw-line);
  box-shadow: var(--pw-shadow);
  transform: rotate(-1.2deg);
  font-weight: 800;
  font-size: 13px;
  color: var(--pw-ink-soft);
}

/* --- FAB als schwebende Papierkarte ---------------------------------------- */
.fab-card {
  position: fixed;
  right: 18px;
  bottom: calc(64px + 18px + env(safe-area-inset-bottom));
  z-index: 1000;
  background: var(--pw-paper);
  border: 2px solid var(--pw-line);
  border-radius: 5px;
  box-shadow:
    4px 5px 0 var(--pw-line),
    0 10px 18px rgba(36, 31, 26, 0.28);
  transform: rotate(-1.8deg);
}

.fab-btn {
  position: relative;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--pw-ink);
  font-size: 21px;
  cursor: pointer;
}

.fab-btn:active:not(:disabled) {
  transform: translate(1px, 1px);
}

.fab-btn:disabled {
  opacity: 0.5;
}

.fab-plus {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  background: var(--pw-tape);
  border: 1.5px solid var(--pw-line);
  border-radius: 50%;
}

/* --- Such-Overlay (Aufbau wie im Putzen-Screen) ----------------------------- */
.search-overlay {
  position: fixed;
  inset: 0;
  /* Über dem FAB (1000), unter der Modal-Ebene (1050, utilities.css): die
     Modals der Ergebniskarten teleportieren nach <body>. */
  z-index: 1010;
}

.search-overlay-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(36, 31, 26, 0.5);
  z-index: 1;
}

.search-overlay-content {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
}

.search-overlay-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--color-background-elevated);
  border-bottom: 2px solid var(--pw-line);
  flex-shrink: 0;
}

.search-overlay-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--pw-paper);
  border: 2px solid var(--pw-line);
  border-radius: var(--radius-md);
}

.search-overlay-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 1rem;
  color: var(--color-text-primary);
}

.search-clear-btn,
.search-overlay-close {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.search-clear-btn {
  width: 24px;
  height: 24px;
  padding: 4px;
  font-size: 1rem;
}

.search-overlay-close {
  width: 44px;
  height: 44px;
  font-size: 1.4rem;
}

.search-overlay-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-background-elevated);
  border-bottom: 2px solid var(--pw-line);
  flex-shrink: 0;
}

.search-overlay-actions .btn {
  flex: 1 1 200px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

.search-overlay-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.search-overlay-initial {
  text-align: center;
  padding: 3rem 2rem;
  color: var(--color-text-secondary);
}

.search-overlay-initial i {
  display: block;
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.3;
}

.search-result-item {
  margin-bottom: 0.5rem;
}

.search-result-category {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.25rem;
  padding-left: 0.5rem;
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .wall {
    transition: none;
  }
}
</style>
