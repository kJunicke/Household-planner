<script setup lang="ts">
/**
 * Die vier beschrifteten Richtungen beim Long-Press (Ticket 10).
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
 * Der Anker sind **Fensterkoordinaten** der Zettelmitte (`fixed` rechnet im
 * selben Bezugssystem) — geliefert von `useDirectionPress`.
 *
 * `pointer-events: none` auf allem: die Geste läuft über den eingefangenen
 * Zeiger am Zettel weiter. Ein Element unter dem Finger, das Ereignisse
 * annehmen könnte, wäre nur eine Gelegenheit, sie zu verlieren. Die
 * Beschriftungen sind auch nicht anklickbar gemeint — sie erklären die Geste,
 * sie ersetzen sie nicht.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import type { PressDirection } from '@/composables/useDirectionPress'

const props = defineProps<{
  anchor: { x: number; y: number } | null
  active: PressDirection | null
}>()

/**
 * Wie weit die Mitte vom Fensterrand wegbleiben muss, damit **alle vier**
 * Beschriftungen vollständig sichtbar sind — nach jeder Seite getrennt, weil
 * der Kranz nicht symmetrisch ist („Aufwand anpassen" rechts ist deutlich
 * breiter als „zuweisen" links).
 *
 * **Gemessen, nicht gerechnet, und das ist der Punkt dieser Fassung.** Vorher
 * standen hier zwei geschätzte Zahlen (Radius + 84 bzw. + 26). Der QC hat
 * nachgemessen:
 *
 *   verschieben        angenommen 84 px   gemessen 104,0
 *   erledigen                             gemessen  89,8
 *   zuweisen                              gemessen  87,7
 *   Aufwand anpassen                      gemessen 141,8   (+69 %)
 *
 * Folge: 11 von 19 Zetteln zeigten eine angeschnittene Beschriftung, im
 * schlimmsten Fall 57,8 px außerhalb des Fensters. Eine Beschriftung, die
 * „Aufwand anpass…" heißt, lehrt die Geste nur halb — und genau das Lehren ist
 * der Zweck dieses Tickets.
 *
 * Es steht deshalb **keine neue Zahl** an dieser Stelle: das Kärtchen liegt zur
 * Klemmzeit bereits im DOM, seine Ausdehnung ist ablesbar. Eine geschätzte Zahl
 * hier hätte den Fehler nur an die nächste Textänderung weitergereicht — ein
 * längeres Wort, eine Übersetzung, eine andere Schriftgröße.
 *
 * `null`, bis gemessen wurde; bis dahin bleibt der Kranz unsichtbar (siehe
 * `measured`).
 */
const extent = ref<{ left: number; right: number; top: number; bottom: number } | null>(null)

/**
 * Was `getBoundingClientRect()` **nicht** mitliefert: Schlagschatten und
 * `outline` liegen außerhalb der Layoutbox.
 *
 * Der Wert ist aus den Deklarationen weiter unten **abgelesen**, nicht
 * geschätzt: der größte Schatten ist der des anliegenden Zustands
 * (`5px 6px`), das `outline` ist 3 px breit bei 1 px Versatz (= 4 px nach
 * jeder Seite). 8 px deckt beides nach jeder Seite ab.
 *
 * Wer an Schatten oder `outline` dreht, zieht diese Zahl mit. Sie hängt an
 * CSS-Werten in derselben Datei, nicht am Text — deshalb darf sie hier stehen.
 */
const DECORATION = 8

/** Luft zum Fensterrand, damit nichts bündig an der Kante klebt. */
const EDGE = 4

const layerEl = ref<HTMLElement | null>(null)
const anchorEl = ref<HTMLElement | null>(null)

/**
 * Die Ausdehnung des Kranzes um seine Mitte, in Pixeln je Seite.
 *
 * Sie hängt **nicht** davon ab, wo der Kranz gerade steht: die Beschriftungen
 * sitzen mit festen Versätzen um den nulldimensionalen Anker. Einmal messen je
 * Einblendung genügt deshalb — und die Komponente wird bei jedem Long-Press
 * frisch eingehängt, misst also nach Schriftwechsel, Zoom und Drehung von
 * selbst neu.
 */
const measure = () => {
  const anchor = anchorEl.value
  const layer = layerEl.value
  if (!anchor || !layer) return
  const origin = anchor.getBoundingClientRect()
  let left = 0
  let right = 0
  let top = 0
  let bottom = 0
  for (const chip of layer.querySelectorAll<HTMLElement>('.dir-chip')) {
    const rect = chip.getBoundingClientRect()
    left = Math.max(left, origin.left - rect.left)
    right = Math.max(right, rect.right - origin.right)
    top = Math.max(top, origin.top - rect.top)
    bottom = Math.max(bottom, rect.bottom - origin.bottom)
  }
  extent.value = {
    left: left + DECORATION + EDGE,
    right: right + DECORATION + EDGE,
    top: top + DECORATION + EDGE,
    bottom: bottom + DECORATION + EDGE
  }
}

onMounted(() => {
  // Erst nach dem Rendern der Kärtchen — vorher gibt es nichts zu messen.
  void nextTick(measure)
})

/**
 * Geklemmt wird die **Anzeige**, nicht die Geste: welche Richtung gewählt ist,
 * hängt allein an der Fingerbewegung. Der Kranz darf also verrutschen, ohne
 * dass etwas Falsches ausgelöst wird — und er muss es, denn ein Zettel kann am
 * Bildschirmrand oder unter der klebenden Statusleiste liegen.
 *
 * Passt der Kranz nicht mehr zwischen beide Ränder (sehr schmales Fenster),
 * gewinnt die linke bzw. obere Grenze. Dann ist rechts etwas abgeschnitten —
 * aber die Alternative wäre, dass beide Seiten abschneiden.
 */
const position = computed(() => {
  if (!props.anchor) return null
  const ext = extent.value
  // **Nicht `window.innerWidth`.** Das ist das Fenster *einschließlich* der
  // Bildlaufleiste; die Kranz-Ebene (`position: fixed; inset: 0`) ist dagegen
  // so breit wie `documentElement.clientWidth`, also ohne sie. Zwei
  // Bezugssysteme, die meistens gleich sind — und genau deshalb gefährlich.
  //
  // Gemessen hat der QC 500 gegen 485: das rechte Kärtchen reichte bis 488 und
  // verlor 3,0 px an das `clip` der Ebene. Sichtbar tat das nichts, weil der
  // Streifen in der Rinne der Bildlaufleiste liegt, und auf dem Zielgerät —
  // Telefon mit überlagernder Leiste — sind beide Werte ohnehin identisch. Der
  // Fehler tritt also ausschließlich am Entwicklungsrechner auf, was ihn nicht
  // harmlos macht, sondern nur schwer auffindbar: dieselbe Falle wie bei der
  // geschätzten Klemmbreite, nur kleiner.
  //
  // `documentElement` steht immer zur Verfügung, sobald diese Komponente
  // gerendert wird — sie hängt bereits im Dokument.
  const root = typeof document !== 'undefined' ? document.documentElement : null
  const w = root?.clientWidth ?? 0
  const h = root?.clientHeight ?? 0
  // Vor der Messung: ungeklemmt setzen und unsichtbar lassen. Ohne Position
  // hätten die Kärtchen keine Lage, die sich messen ließe.
  if (!ext) return { left: `${props.anchor.x}px`, top: `${props.anchor.y}px` }
  return {
    left: `${Math.min(Math.max(props.anchor.x, ext.left), Math.max(ext.left, w - ext.right))}px`,
    top: `${Math.min(Math.max(props.anchor.y, ext.top), Math.max(ext.top, h - ext.bottom))}px`
  }
})

/**
 * Sichtbar erst nach der Messung — ein einziger Frame.
 *
 * `visibility: hidden` und nicht `v-if`: ein ausgeblendetes Element wird
 * weiterhin gelayoutet und ist damit messbar, ein nicht vorhandenes nicht.
 * Ohne diesen Frame blitzte der Kranz kurz ungeklemmt auf — also genau in der
 * Lage, gegen die diese Fassung antritt.
 */
const measured = computed(() => extent.value !== null)

/**
 * Die Belegung. Sie steht bewusst als **feste Liste** hier und hängt an keiner
 * Eigenschaft der Aufgabe: dieselbe Bewegung muss bei jedem Aufgabentyp
 * dasselbe tun (Spec). Wer hier eine Bedingung einbaut, macht die Geste
 * unzuverlässig.
 */
const items: Array<{ dir: PressDirection; label: string }> = [
  { dir: 'up', label: 'verschieben' },
  { dir: 'down', label: 'erledigen' },
  { dir: 'left', label: 'zuweisen' },
  { dir: 'right', label: 'Aufwand anpassen' }
]
</script>

<template>
  <Teleport to="body">
    <div v-if="position" ref="layerEl" class="dir-layer" :class="{ 'dir-layer--measured': measured }">
      <div ref="anchorEl" class="dir-anchor" :style="position">
        <span class="dir-dot" aria-hidden="true"></span>
        <span
          v-for="item in items"
          :key="item.dir"
          class="dir-chip"
          :class="[`dir-chip--${item.dir}`, { 'dir-chip--active': props.active === item.dir }]"
        >
          <i class="bi" :class="`bi-arrow-${item.dir}`" aria-hidden="true"></i>
          {{ item.label }}
        </span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Über der Wand, über dem FAB (1000) und über dem Such-Overlay (1010), aber
   unter der Modal-Ebene (1050, utilities.css) — die Modals, die diese Geste
   öffnet, müssen darüber liegen. Sie kann allerdings nicht gleichzeitig mit
   einem Modal sichtbar sein: das Loslassen schließt sie und öffnet erst dann. */
.dir-layer {
  position: fixed;
  inset: 0;
  z-index: 1040;
  /* Der Finger hängt am eingefangenen Zeiger des Zettels — hier darf nichts
     dazwischenkommen. */
  pointer-events: none;
  /* Unsichtbar bis zur Messung der Kärtchen (→ `measured` im Skript). Ein
     ausgeblendetes Element wird trotzdem gelayoutet und bleibt messbar. */
  visibility: hidden;
  /* In dem einen Frame vor der Messung steht der Kranz ungeklemmt und kann
     rechts über das Fenster hinausragen. Ohne `clip` verlängerte das den
     Scrollbereich des Dokuments, eine waagerechte Bildlaufleiste erschiene, die
     Wandbreite änderte sich — und der `ResizeObserver` in `WallView` packte
     mitten in der Geste neu. Nach der Messung liegt hier nichts mehr außerhalb;
     `clip` ist die Absicherung des Zwischenzustands, nicht der Regelfall. */
  overflow: clip;
}

.dir-layer--measured {
  visibility: visible;
}

.dir-anchor {
  position: absolute;
  width: 0;
  height: 0;
}

/* Die Mitte, von der aus gezogen wird. */
.dir-dot {
  position: absolute;
  left: -5px;
  top: -5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pw-paper);
  border: 2px solid var(--pw-line);
}

/* Papier wie alles auf dieser Wand — harte Kontur, harter Schatten. */
.dir-chip {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  background: var(--pw-paper);
  color: var(--pw-ink);
  border: 2px solid var(--pw-line);
  border-radius: 3px;
  box-shadow: var(--pw-shadow);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.1px;
  /* Eine Beschriftung darf nie umbrechen: „Aufwand anpassen" auf zwei Zeilen
     verschiebt die Mitte des Kranzes und ließe ihn schief wirken. */
  white-space: nowrap;
}

/* Abstand zur Mitte: 56 px. Etwas mehr als die 48 px, ab denen die Richtung
   gewählt ist (`COMMIT_DISTANCE` in `useDirectionPress`) — der Zug ist also
   entschieden, bevor der Finger die Beschriftung erreicht und sie verdecken
   könnte. Gesetzt, nicht gemessen; die Reihenfolge der beiden Zahlen ist das
   Verbindliche, nicht ihr Abstand.

   Die Beschriftungen wachsen IMMER von der Mitte weg (`translate` zieht sie um
   ihre eigene Ausdehnung nach außen). Ein langer Text schiebt sich damit nach
   außen statt über den Mittelpunkt — sonst läge „Aufwand anpassen" auf dem
   Daumen. Genau deshalb darf die Klemmung des Kranzes nicht raten, wie breit
   er ist: die Breite steckt im Text, nicht in dieser Datei (→ `extent`). */
.dir-chip--up {
  left: 0;
  top: -56px;
  transform: translate(-50%, -100%);
}

.dir-chip--down {
  left: 0;
  top: 56px;
  transform: translate(-50%, 0);
}

.dir-chip--left {
  left: -56px;
  top: 0;
  transform: translate(-100%, -50%);
}

.dir-chip--right {
  left: 56px;
  top: 0;
  transform: translate(0, -50%);
}

/* Anliegende Richtung: das Loslassen würde JETZT genau das tun. Kräftiger
   Grund statt nur Farbwechsel am Text — auf Kork mit vier Zetteln daneben ist
   ein blasser Unterschied nicht zu sehen.

   **Bewusst ohne jede Geometrieänderung.** Die Lage jeder Beschriftung steckt
   in ihrem `transform`; ein zweites `transform` würde das erste ersetzen und
   sie in die Mitte springen lassen, und ein `scale` daneben skalierte um den
   Ursprung VOR dieser Verschiebung — die Beschriftung wanderte beim Anliegen
   also messbar aus. Der Hervorhebung reichen Farbe, Schatten und ein
   `outline`, das per Definition keinen Platz einnimmt. */
.dir-chip--active {
  background: var(--pw-accent);
  border-color: var(--pw-accent);
  color: var(--pw-paper);
  outline: 3px solid var(--pw-tape);
  outline-offset: 1px;
  box-shadow: 5px 6px 0 rgba(36, 31, 26, 0.4);
}
</style>
