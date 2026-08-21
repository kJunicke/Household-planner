<script setup lang="ts">
/**
 * Die vier beschrifteten Richtungen beim Long-Press — als Vollbild-Overlay
 * (Ticket 10, grundüberholt in Ticket 00b).
 *
 * **Warum an den Bildschirmrändern und nicht um den Zettel herum:** ein Kranz
 * um den Zettel liegt genau dort, wo der Daumen liegt. „Im Moment blockiert man
 * auch die Hälfte der Sachen mit seinem Daumen" — das war der Auftrag. Wer den
 * Kranz später „aus Ergonomiegründen" wieder an den Zettel heranholt, macht
 * genau diese Korrektur rückgängig.
 *
 * **Warum das Ding nach `body` teleportiert und `fixed` liegt**, statt im Zettel
 * zu stecken:
 *
 * - Der Zettel ist **geneigt** (−3°…+3°). Ein Kind darin wäre mitgeneigt — die
 *   Beschriftung „oben" stünde dann schief und läge streng genommen nicht mehr
 *   oben. Die Richtungen sind aber Bildschirmrichtungen, keine Zettelrichtungen.
 * - Die Wand hat `overflow-x: clip`. Ein Zettel am linken oder rechten Wandrand
 *   bekäme seine seitliche Beschriftung abgeschnitten.
 * - Zettel liegen dicht; der Zettel selbst hat einen niedrigen z-index aus dem
 *   Packen. Die Beschriftungen müssen über **allem** liegen.
 *
 * `pointer-events: none` auf allem: die Geste läuft über den eingefangenen
 * Zeiger am Zettel weiter. Ein Element unter dem Finger, das Ereignisse
 * annehmen könnte, wäre nur eine Gelegenheit, sie zu verlieren. Die
 * Beschriftungen sind auch nicht anklickbar gemeint — sie erklären die Geste,
 * sie ersetzen sie nicht.
 *
 * **Zwei getrennte Aussagen, absichtlich:** der **Pfeil** zeigt, wohin der
 * Daumen zieht (frei drehend, jeder Winkel), das **Aufleuchten am Rand** zeigt,
 * was beim Loslassen passiert. In der Diagonale steht der Pfeil schräg und
 * **nichts** leuchtet. Das ist gewollt und kein Fehler.
 *
 * Beide Angaben haben denselben Ursprung: den **Aufsetzpunkt** (`origin`), nicht
 * die Zettelmitte. Der Pfeil sagt, wie weit gezogen wurde — und ab derselben
 * Strecke, ab der eine Richtung anliegt (`COMMIT_DISTANCE`), ist er da. Zwei
 * Ursprünge wären der Fehler, den Ticket 00b abstellt: eine anliegende Richtung
 * ohne sichtbaren Pfeil.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { COMMIT_DISTANCE, type PressDirection } from '@/composables/useDirectionPress'

const props = defineProps<{
  /** Der Aufsetzpunkt der Geste, in **Fensterkoordinaten**. */
  origin: { x: number; y: number } | null
  /** Wo der Finger gerade liegt — der Pfeil zeigt DORTHIN, nicht auf die Option. */
  tip: { x: number; y: number } | null
  active: PressDirection | null
}>()

/** Schleier über der App. Vom Nutzer abgenommen; nicht heller drehen. */
const VEIL = 'rgba(26, 46, 38, 0.82)'
/** Farbe des Randnebels und der Schrift (Kreidetafel-Fassung). */
const FOG = '#eaf6ec'
const INK = '#f4fbf5'

/**
 * Die Belegung. Sie steht bewusst als **feste Liste** hier und hängt an keiner
 * Eigenschaft der Aufgabe: dieselbe Bewegung muss bei jedem Aufgabentyp
 * dasselbe tun (Spec). Wer hier eine Bedingung einbaut, macht die Geste
 * unzuverlässig.
 *
 * Zweizeilig statt einzeilig: „Aufwand anpassen" passt am rechten Rand nicht in
 * eine Zeile. Umbrechen löst das, ohne dass der Text gedreht oder gekürzt
 * werden muss — und eine halbe Beschriftung („Aufwand anpass…") lehrt die Geste
 * nur halb, was ihr ganzer Zweck ist.
 */
const LINES: Record<PressDirection, string[]> = {
  down: ['erledigen'],
  up: ['verschieben'],
  left: ['zuweisen'],
  right: ['Aufwand', 'anpassen']
}
const DIRS: PressDirection[] = ['down', 'up', 'left', 'right']
const LINE_H = 17

/** Einrückung des Randpunkts vom jeweiligen Bildschirmrand. */
const IN = 56

/**
 * Luft, die eine geklemmte Beschriftung zum Bildschirmrand behält.
 *
 * 4 px Abstand plus die halbe Kontur (3,5 px Strichbreite, also 1,75 px nach
 * außen) — `getBBox()` liefert nur die Geometrie ohne Kontur.
 */
const EDGE_PAD = 6

// --- Fenster und Tab-Navigation ---------------------------------------------
//
// `documentElement.clientWidth` und **nicht** `window.innerWidth`: das ist das
// Fenster *einschließlich* der Bildlaufleiste, das Overlay (`fixed; inset: 0`)
// ist dagegen so breit wie `clientWidth`. Zwei Bezugssysteme, die meistens
// gleich sind — und genau deshalb gefährlich.
const vw = ref(0)
const vh = ref(0)
/**
 * Die **echte** Höhe der Tab-Navigation, gemessen statt geraten: sie trägt
 * `padding-bottom: env(safe-area-inset-bottom)` und ist damit auf Geräten mit
 * Gestenleiste höher als die 64 px ihrer Deklaration. Eine verdrahtete Zahl
 * ließe die untere Beschriftung dort hinter der Leiste verschwinden.
 *
 * Ohne Leiste (Login, Onboarding) ist der Wert 0 und der Randpunkt sitzt
 * schlicht `IN` über dem unteren Rand.
 */
const navH = ref(0)

const sync = () => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  vw.value = root.clientWidth
  vh.value = root.clientHeight
  navH.value = document.querySelector('.bottom-nav')?.getBoundingClientRect().height ?? 0
}

// **Sofort, nicht erst in `onMounted`.** Die Komponente wird mitten in der Geste
// eingehängt; mit einer Viewbox aus Nullen im ersten Durchlauf stünde das
// Overlay einen Bildaufbau lang zusammengefaltet da. `document` steht bereit,
// sobald hier gerendert wird — die Wand hängt bereits im Dokument.
sync()

const waagerecht = (d: PressDirection) => d === 'left' || d === 'right'

/** Mitte des Randbereichs je Richtung — dort sitzt Nebel und Beschriftung. */
const edgePoint = (d: PressDirection) => {
  const w = vw.value
  const h = vh.value
  if (d === 'down') return { x: w / 2, y: h - navH.value - IN }
  if (d === 'up') return { x: w / 2, y: IN }
  if (d === 'left') return { x: IN, y: h / 2 }
  return { x: w - IN, y: h / 2 }
}

// --- Beschriftungen klemmen --------------------------------------------------
//
// Bei `text-anchor: middle` wächst eine Beschriftung um ihren Randpunkt nach
// beiden Seiten. Rechts steht der Randpunkt bei `vw - IN`; ist die längste
// Zeile breiter als 2 × IN, ragt sie aus dem Fenster. Geklemmt wird deshalb der
// **Randpunkt** — ausdrücklich nicht über ein kleineres `IN`, einen Wechsel der
// Ausrichtung, Kürzen oder Drehen (alles verworfen, siehe Ticket 00b).
//
// **Gemessen, nicht geschätzt**, aus demselben Grund wie beim alten Kranz: eine
// geschätzte Breite hier reichte den Fehler an die nächste Textänderung weiter
// — ein längeres Wort, eine Übersetzung, eine andere Schriftgröße.
//
// Gemessen wird an unsichtbaren Zwillingen in der **anliegenden** Größe (16 px,
// der breitere der beiden Zustände). Damit ist die Klemmung unabhängig davon,
// welche Richtung gerade leuchtet — sonst wanderte die Beschriftung während der
// 120 ms des Schriftsprungs sichtbar hin und her.
//
// Gemessen wird **jede Zeile einzeln**, geklemmt nach der breitesten: welche
// Zeile die breitere ist, entscheidet die Schrift, nicht die Zahl der
// Buchstaben („Aufwand" gegen „anpassen").
const measureEls = new Map<string, SVGTextElement>()
const measureKey = (d: PressDirection, line: string) => `${d}::${line}`
const setMeasureEl = (key: string, el: unknown) => {
  if (el instanceof SVGTextElement) measureEls.set(key, el)
  else measureEls.delete(key)
}
const halfWidth = ref<Record<PressDirection, number>>({ up: 0, down: 0, left: 0, right: 0 })

const measureLabels = () => {
  const next = { ...halfWidth.value }
  for (const d of DIRS) {
    let widest = 0
    for (const line of LINES[d]) {
      const el = measureEls.get(measureKey(d, line))
      if (!el) continue
      // `getBBox()` wirft in Umgebungen ohne Layout (jsdom, ausgeblendeter
      // Baum). Dann bleibt die alte Zahl stehen und es wird nicht geklemmt —
      // sichtbar falsch wäre erst ein Absturz.
      try {
        widest = Math.max(widest, el.getBBox().width)
      } catch {
        /* nicht messbar — ungeklemmt lassen */
      }
    }
    if (widest > 0) next[d] = widest / 2
  }
  halfWidth.value = next
}

/** Randpunkt der Beschriftung: wie `edgePoint`, aber im Fenster gehalten. */
const labelPoint = (d: PressDirection) => {
  const p = edgePoint(d)
  const half = halfWidth.value[d]
  const min = half + EDGE_PAD
  const max = vw.value - half - EDGE_PAD
  // Passt die Beschriftung überhaupt nicht zwischen beide Ränder, ist die Mitte
  // die am wenigsten falsche Lage — dann schneidet es beidseitig gleich viel ab.
  const x = max < min ? vw.value / 2 : Math.min(Math.max(p.x, min), max)
  return { x, y: p.y }
}

/** Erste Grundlinie: mehrzeilige Beschriftungen sitzen um den Randpunkt zentriert. */
const firstLineY = (d: PressDirection) =>
  labelPoint(d).y - ((LINES[d].length - 1) * LINE_H) / 2

onMounted(() => {
  // Noch einmal: zwischen Setup und Einhängen kann sich die Leiste geändert
  // haben (Ansichtswechsel, eingeblendete Tastatur).
  sync()
  window.addEventListener('resize', sync)
  // Erst nach dem Rendern der Beschriftungen — vorher gibt es nichts zu messen.
  void nextTick(measureLabels)
})
onUnmounted(() => window.removeEventListener('resize', sync))

// --- Der Pfeil ---------------------------------------------------------------

/** Länge der Pfeilspitze. */
const ARROW_HEAD = 15

/**
 * Kürzeste sichtbare Pfeillänge: die Spitze (15) plus ein Rest Schaft (3).
 *
 * Eine **Länge**, kein Abstand vom Ursprung — deshalb aus dem Prototypen
 * unverändert übernommen.
 */
const ARROW_MIN = 18

/**
 * Abstand des Schaftanfangs zum Ursprung.
 *
 * **Umgerechnet, nicht übernommen.** Im Prototypen waren es 30 px, aber gemessen
 * ab der *Zettelmitte*; hier ist der Ursprung der Aufsetzpunkt. Verbindlich ist
 * stattdessen, dass Pfeil und Richtungswahl **dieselbe** Schwelle haben:
 * sichtbar wird der Pfeil ab `ARROW_GAP + ARROW_MIN`, anliegen kann eine
 * Richtung ab `COMMIT_DISTANCE` — also muss `ARROW_GAP = COMMIT_DISTANCE −
 * ARROW_MIN` sein (32 − 18 = 14). Nicht ausrechnen, sondern rechnen lassen: wer
 * an der Ziehschwelle dreht, soll den Pfeil nicht von Hand nachziehen müssen.
 *
 * 14 px genügen als Freiraum, weil um den Ursprung nur der Ankerpunkt-Kreis
 * (r = 4) liegt und nicht ein ganzer Zettel.
 */
const ARROW_GAP = COMMIT_DISTANCE - ARROW_MIN

/**
 * Der Schaft endet am **Ansatz** der Spitze, nicht an ihrer Kerbe — sonst ragt
 * er sichtbar durch das Dreieck hindurch.
 */
const arrow = computed(() => {
  const a = props.origin
  const t = props.tip
  if (!a || !t) return null
  const dx = t.x - a.x
  const dy = t.y - a.y
  const dist = Math.hypot(dx, dy)
  if (dist < ARROW_GAP + ARROW_MIN) return null
  const ux = dx / dist
  const uy = dy / dist
  const x1 = a.x + ux * ARROW_GAP
  const y1 = a.y + uy * ARROW_GAP
  // Spitze sitzt am Finger, Schaft hört davor auf.
  const bx = t.x - ux * ARROW_HEAD
  const by = t.y - uy * ARROW_HEAD
  const px = -uy
  const py = ux
  const wingA = { x: bx + px * ARROW_HEAD * 0.62, y: by + py * ARROW_HEAD * 0.62 }
  const wingB = { x: bx - px * ARROW_HEAD * 0.62, y: by - py * ARROW_HEAD * 0.62 }
  return {
    line: `M ${x1} ${y1} L ${bx} ${by}`,
    head: `M ${t.x} ${t.y} L ${wingA.x} ${wingA.y} L ${wingB.x} ${wingB.y} Z`
  }
})
</script>

<template>
  <Teleport to="body">
    <svg v-if="origin" class="dir-ov" :viewBox="`0 0 ${vw} ${vh}`">
      <defs>
        <!-- Kreidestaub: grob gekörnter Schein. Liegt **nur** auf dem Pfeil —
             nicht auf der Schrift (war getestet, wegen Lesbarkeit verworfen)
             und nicht auf dem Nebel. -->
        <filter id="chalk" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence baseFrequency="0.9" numOctaves="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
          <feGaussianBlur stdDeviation="0.4" />
        </filter>
        <radialGradient id="fog">
          <stop offset="0%" :stop-color="FOG" stop-opacity="0.6" />
          <stop offset="100%" :stop-color="FOG" stop-opacity="0" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" :width="vw" :height="vh" :fill="VEIL" />

      <template v-for="d in DIRS" :key="d">
        <!-- Randnebel als Ellipse für **alle vier** Richtungen. Rechteck-Bahnen
             über die volle Höhe wirkten wie Streifen und sind verworfen.

             „Voll deckend" heißt 1 auf der Ellipse — der Radialverlauf hat in
             der Mitte aber nur `stop-opacity .6`. Die effektive Deckkraft liegt
             damit bei rund 0,6. Das ist der abgenommene Eindruck, nicht
             nachbessern. -->
        <ellipse
          class="dir-fog"
          :cx="edgePoint(d).x"
          :cy="edgePoint(d).y"
          :rx="waagerecht(d) ? 96 : vw * 0.62"
          :ry="waagerecht(d) ? vh * 0.62 : 96"
          fill="url(#fog)"
          :style="{ opacity: active === d ? 1 : 0.3 }"
        />

        <text
          class="dir-lab"
          :class="{ 'dir-lab--on': active === d }"
          :fill="INK"
          :x="labelPoint(d).x"
          :y="firstLineY(d)"
          text-anchor="middle"
          dominant-baseline="middle"
        ><tspan
          v-for="(line, i) in LINES[d]"
          :key="line"
          :x="labelPoint(d).x"
          :dy="i === 0 ? 0 : LINE_H"
        >{{ line }}</tspan></text>
      </template>

      <!-- Unsichtbare Zwillinge, nur zum Messen der Breite (→ `labelPoint`).
           Immer in der anliegenden Größe, damit die Klemmung nicht mit dem
           Schriftsprung wandert. -->
      <g class="dir-measure" aria-hidden="true">
        <template v-for="d in DIRS" :key="d">
          <text
            v-for="line in LINES[d]"
            :key="line"
            :ref="el => setMeasureEl(measureKey(d, line), el)"
            class="dir-lab dir-lab--on"
            x="0"
            y="0"
          >{{ line }}</text>
        </template>
      </g>

      <!-- Der kurze Pfeil an der Geste: Kreidiger Schaft plus Spitze. -->
      <g v-if="arrow" filter="url(#chalk)" opacity="0.92">
        <path :d="arrow.line" :stroke="INK" stroke-width="6" stroke-linecap="round" fill="none" />
        <path :d="arrow.head" :fill="INK" />
      </g>

      <!-- Der Punkt, von dem aus gezogen wird. -->
      <circle v-if="origin" :cx="origin.x" :cy="origin.y" r="4" :fill="INK" opacity="0.85" />
    </svg>
  </Teleport>
</template>

<style scoped>
/* Über der Wand, über dem FAB (1000) und über dem Such-Overlay (1010), aber
   unter der Modal-Ebene (1050, utilities.css) — die Modals, die diese Geste
   öffnet, müssen darüber liegen. Sie kann allerdings nicht gleichzeitig mit
   einem Modal sichtbar sein: das Loslassen schließt sie und öffnet erst dann. */
.dir-ov {
  position: fixed;
  inset: 0;
  z-index: 1040;
  /* Der Finger hängt am eingefangenen Zeiger des Zettels — hier darf nichts
     dazwischenkommen. */
  pointer-events: none;
}

/* Weich, aber kurz: an einer langsam gezogenen Geste wirkt eine harte
   Umschaltung wie ein Ruckeln. */
.dir-fog {
  transition: opacity 120ms ease;
}

/* Normale, fette Schrift mit dunkler Kontur — **ausdrücklich keine
   Kreide-/Handschrift**: die war gebaut, getestet und wegen Lesbarkeit
   verworfen. Das Kreidige steckt im Pfeil. */
.dir-lab {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.2px;
  opacity: 0.6;
  paint-order: stroke;
  stroke: rgba(14, 28, 22, 0.85);
  stroke-width: 3.5px;
  transition:
    opacity 120ms ease,
    font-size 120ms ease;
}

.dir-lab--on {
  opacity: 1;
  font-size: 16px;
}

/* `visibility` und nicht `display: none`: ein ausgeblendetes Element wird
   weiterhin gelayoutet und bleibt messbar, ein nicht gerendertes nicht. */
.dir-measure {
  visibility: hidden;
}
</style>
