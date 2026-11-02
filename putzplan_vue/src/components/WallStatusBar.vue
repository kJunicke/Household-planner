<script setup lang="ts">
/**
 * Wochenziel-Leiste (→ CONTEXT.md „Wochenziel“), eingebettet in `Header.vue`
 * und damit auf jeder Route sichtbar.
 *
 * **Ein einziger** Balken über die volle Papierbreite, ein Farbsegment je
 * Mitglied in dessen `user_color`. Die Legende (Farbe + Name + Punkte je
 * Mitglied) steht links in der Kopfzeile, die Gesamtpunktzahl rechts. Die
 * Legende gehört in die Kopfzeile, nicht in die Segmente — Beschriftung im
 * Balken hat der Maintainer gesehen und abgelehnt.
 *
 * Ausdrücklich **keine Rangliste**: weder Reihenfolge noch Legende richten
 * sich nach der Punktzahl, es gibt keine Platzierung. Die Reihenfolge ist die
 * der Mitgliederliste und bleibt deshalb über die Woche stabil.
 *
 * Bearbeitet wird das Ziel hier nicht — das gehört in die Settings-Sidebar.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useHouseholdStore } from '../stores/householdStore'

const householdStore = useHouseholdStore()

const goal = computed(() => householdStore.weeklyGoalPoints)
const total = computed(() => householdStore.weeklyTotalPoints)
const contributions = computed(() => householdStore.weeklyContributions)

const isOverflowing = computed(() => goal.value > 0 && total.value > goal.value)
const overflowPoints = computed(() => Math.max(0, total.value - goal.value))

/**
 * Füllstand der **einen** Bahn, in Prozent der Spurbreite.
 *
 * Über dem Ziel bleibt der Balken bei 100 % stehen — das Übermaß trägt nicht
 * mehr die Balkenlänge, sondern das Aufplatzen der rechten Kante (siehe
 * `pressure`). Damit skaliert die Leiste rein prozentual mit der
 * Bildschirmbreite und braucht nie eine zweite Bahn.
 */
const fillPercent = computed(() => {
  if (goal.value <= 0) return total.value > 0 ? 100 : 0
  return Math.min(100, (total.value / goal.value) * 100)
})

interface Segment {
  key: string
  color: string
  /** Anteil an der **gefüllten** Strecke, in Prozent. */
  percent: number
  /** Anteil links davon, in Prozent — absolute Position statt Flex-Fluss. */
  offset: number
  points: number
  name: string
}

/**
 * Die Farbsegmente im gefüllten Teil, verhältnistreu nach Punkten.
 *
 * **Warum absolute Positionen statt eines Flex-Containers:** im Flex-Fluss
 * staucht Flexbox die Segmente, sobald ihre Summe die Spurbreite übersteigt,
 * stillschweigend auf die Spur zurück — jeder Füllstand ab 100 %
 * rendert dann pixelidentisch, ohne Fehlermeldung, und `overflow: visible`
 * hilft nicht. Hier ist die Falle strukturell ausgeschlossen: jedes Segment ist
 * `position: absolute` mit `left`/`width` in Prozent seines Containers. Absolut
 * positionierte Kinder nehmen an keinem Flex- oder Block-Fluss teil, es gibt
 * also nichts, was sie stauchen könnte.
 *
 * Zusätzlich kann die Summe hier gar nicht über 100 % steigen: die Prozente
 * beziehen sich auf die **Gesamtpunktzahl** (nicht auf das Ziel), summieren sich
 * also exakt auf 100 % des gefüllten Teils — und der gefüllte Teil ist bei
 * `min(100 %, …)` gedeckelt.
 *
 * Ein Mitglied ohne Punkte behält sein Segment mit Breite 0.
 */
const segments = computed<Segment[]>(() => {
  const sum = total.value
  let offset = 0
  return contributions.value.map((entry) => {
    const percent = sum > 0 ? (entry.points / sum) * 100 : 0
    const segment: Segment = {
      key: entry.userId,
      color: entry.color,
      percent,
      offset,
      points: entry.points,
      name: entry.name,
    }
    offset += percent
    return segment
  })
})

/**
 * Der Druck im Rohr — das Maß, an dem das Ausmaß des Übertreffens hängt.
 *
 * `P = log2(Punkte / Ziel)`, also 0 bei punktgenau erfülltem Ziel und danach
 * **streng monoton wachsend ohne obere Grenze**: keine Schwelle, ab der jeder
 * Stand gleich aussieht — jede zusätzliche Erledigung erhöht P und damit jede
 * daraus abgeleitete Größe.
 *
 * Warum logarithmisch und nicht linear: linear wäre bei Ziel 1 und 100 Punkten
 * ein hundertfach heftiges Spritzen, das die Leiste sprengt. Der Logarithmus wächst
 * unbegrenzt, aber langsam genug, dass auch absurde Stände in die Leiste
 * passen.
 *
 * Beispiele bei Ziel 30:
 *   50 Pkt  → P = log2(1,667) = 0,737
 *   102 Pkt → P = log2(3,4)   = 1,766
 */
const pressure = computed(() => {
  if (!isOverflowing.value) return 0
  return Math.log2(total.value / goal.value)
})

/**
 * Der Streifen rechts der Zielkante, in dem die Spritzer fliegen.
 *
 * **Konstant**, nicht druckabhängig. Er ist immer reserviert — auch unterhalb
 * des Ziels —, damit sich beim Überschreiten weder Höhe noch Spurlänge
 * ruckartig ändern. Alles, was im Streifen passiert, ist absolut positioniert
 * und trägt deshalb **nichts** zur Layouthöhe bei.
 */
const BURST_GUTTER_PX = 18

/** Obergrenzen, damit der Effekt im Papier bleibt (siehe `burstStyle`). */
const MAX_TRAVEL_PX = BURST_GUTTER_PX - 3
const MAX_LINE_PX = 13
const MAX_JETS = 9

/**
 * Aus dem Druck abgeleitete Größen des Überlaufs — **alle waagerecht**.
 *
 * Der Effekt bleibt in der Höhe des Balkens. Deshalb wirkt P ausschließlich auf
 * Größen, die zur Seite gehen oder in der Zeit liegen:
 *
 * - `travelPx`  — wie weit ein Spritzer nach rechts schießt.
 * - `linePx`    — wie lang die Linie ist (flach, nicht tropfend).
 * - `jetCount`  — wie viele Linien gleichzeitig unterwegs sind.
 * - `durationS` — die Taktrate. `1.45 s / (1 + 0.5·P)`: streng monoton fallend,
 *                 **ohne untere Schranke**.
 * - `strength`  — Einfärbung der überlasteten Kante.
 * - `glowPeak`  — wie hell der gefüllte Balken **als Ganzes** aufleuchtet. Das
 *                 ist der tragende Kanal des Erfolgssignals: er ändert Fläche
 *                 und Kontrast, nicht eine Kantendicke. Ein wanderndes
 *                 Streifenmuster wäre zu schnell und zu ablenkend.
 * - `glowCycle` — bleibt bewusst **ruhig** (5,2 s → 3 s). Tempo trägt hier
 *                 kein Ausmaß, es würde nur aufdringlich.
 *
 * `travelPx` und `linePx` sind gedeckelt, weil der Streifen fest ist und ein
 * `overflow: hidden` sonst genau das Plateau erzeugen würde, das hier verboten
 * ist. Das Ausmaß trägt sichtbar die **Reichweite**, nicht die Taktrate. Oberhalb
 * der Travel-Grenze (P ≥ 2,5, r ≥ 5,66) tragen `linePx` (bis r ≈ 32) und
 * `jetCount` (bis r ≈ 45) weiter; erst jenseits davon bleibt `durationS` als
 * einzige ungedeckelte Größe.
 *
 * Animiert werden nur `transform` und `opacity`. Kein `requestAnimationFrame`.
 */
const burstStyle = computed(() => {
  const p = pressure.value
  // Das Aufleuchten des gefüllten Balkens.
  //
  // **Die Helligkeit trägt das Ausmaß**, nicht das Tempo: schneller hieße
  // aufdringlicher, und genau das soll es nicht sein.
  //
  // Basisterm 0,08: darunter ist der Hub knapp über dem Ziel auf einer
  // **hellen** Mitgliederfarbe nicht zu sehen. Die Steigung 0,075 hält den
  // Deckel bei r ≈ 7,6. Der Deckel bei 0,30 ist echt und wird nicht kaschiert —
  // er hält die Segmentfarben lesbar und ist ab P = 2,93 erreicht. Oberhalb
  // trägt die exakte `+N`-Zahl das Ausmaß; das sichtbare Signal trägt dann die
  // Tatsache „wir sind drüber", plus die feine Abstufung über die Spritzer.
  const glowPeak = Math.min(0.3, 0.08 + 0.075 * p)
  // Ein voller Atemzug (Auf **und** Ab, wegen `alternate` zwei Halbwellen)
  // dauert 5,2 s und geht nur sanft auf 3 s herunter — ruhig bleibt ruhig.
  const glowCycle = Math.max(3, 5.2 - 0.6 * p)
  return {
    '--pw-travel': `${Math.min(MAX_TRAVEL_PX, 6 + 4 * p).toFixed(2)}px`,
    '--pw-jet-len': `${Math.min(MAX_LINE_PX, 3 + 2 * p).toFixed(2)}px`,
    '--pw-burst-dur': `${(1.45 / (1 + 0.5 * p)).toFixed(3)}s`,
    '--pw-burst-strength': `${Math.min(1, 0.35 + 0.3 * p).toFixed(3)}`,
    // Auch die Spritzer werden kräftiger, nicht nur länger. Sie liegen
    // absolut in der Spur — ohne Beitrag zur Höhe.
    '--pw-jet-h': `${Math.min(4, 1.5 + 0.6 * p).toFixed(2)}px`,
    // Das Aufleuchten: Spitzenhelligkeit und Dauer **einer Halbwelle**.
    '--pw-glow-peak': `${glowPeak.toFixed(3)}`,
    '--pw-glow-half': `${(glowCycle / 2).toFixed(3)}s`,
  } as Record<string, string>
})

interface Jet {
  key: string
  color: string
  /** Senkrechte Lage im Balken, in Prozent — deterministisch gestreut. */
  top: number
  /** Negative Phase in Vielfachen der Taktdauer; ersetzt jeden Zufall. */
  phase: number
}

/**
 * Die Spritzer selbst.
 *
 * Ihre Farben kommen aus **derselben** Quelle wie die Segmente
 * (`weeklyContributions[].color`) und werden reihum durchgezählt — bei zwei
 * Mitgliedern wechseln sich zwei Farben ab, bei einem blinkt es einfarbig, bei
 * dreien in drei Farben. Keine zweite Farbliste.
 *
 * Die Zahl der Linien wächst mit dem Druck (gedeckelt bei `MAX_JETS`, sonst
 * würde ein absurdes Ziel/Punkte-Verhältnis beliebig viele Knoten erzeugen).
 * Lage und Phase sind aus dem Index gerechnet: es wirkt gestreut, kommt aber
 * ohne Zufallszahl aus — auch nicht je Frame.
 */
const jets = computed<Jet[]>(() => {
  if (!isOverflowing.value) return []
  const colors = contributions.value.map((entry) => entry.color)
  const palette = colors.length > 0 ? colors : ['var(--pw-accent)']
  const count = Math.min(MAX_JETS, 3 + Math.round(pressure.value * 1.2))
  const result: Jet[] = []
  for (let i = 0; i < count; i += 1) {
    result.push({
      key: `jet-${i}`,
      color: palette[i % palette.length],
      top: 12 + ((i * 37) % 76),
      phase: -((i * 0.37) % 1),
    })
  }
  return result
})

/**
 * Beim Scrollen schrumpft die Leiste auf den Balken zusammen.
 *
 * Eine oben klebende Leiste verdeckt zwangsläufig, was unter ihr durchscrollt —
 * und verdeckte Zettel sind später verdeckte Eselsohren. Kompakt heißt nur
 * engere Polster. Der Balken selbst bleibt unverändert stehen, damit der
 * Punkteflug sein Ziel behält.
 */
const isScrolled = ref(false)
const onScroll = () => {
  isScrolled.value = window.scrollY > 4
}

/**
 * Bewusst **keine** eigene Höhenvariable: die Leiste ist Teil der sticky-Box
 * des Headers, die verdeckte Höhe ist also die Headerhöhe — und die trägt
 * bereits `--app-header-height` (`useElementHeightVar` in `Header.vue`). Eine
 * zweite, fast identische Variable wäre eine Dopplung, die auseinanderlaufen
 * kann. `WallView.vue` rechnet sein Polster gegen `--app-header-height`.
 */
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div class="wall-status" :class="{ 'wall-status--compact': isScrolled }">
    <div class="status-paper">
      <!-- Reihenfolge ist die der Mitgliederliste — keine Sortierung, keine
           Platzierung; ein Mitglied ohne Punkte steht mit 0 da. -->
      <div class="status-head">
        <ul class="status-legend">
          <li v-for="entry in contributions" :key="entry.userId" class="legend-item">
            <span class="legend-dot" :style="{ backgroundColor: entry.color }"></span>
            <span class="legend-name">{{ entry.name }}</span>
            <span class="legend-points">{{ entry.points }}</span>
          </li>
        </ul>
        <span class="status-score" :class="{ 'status-score--over': isOverflowing }">
          {{ total }}<span class="status-score-sep">/</span>{{ goal }} Pkt
          <span v-if="isOverflowing" class="status-over">+{{ overflowPoints }}</span>
        </span>
      </div>

      <!-- Genau eine Bahn über die volle Papierbreite. Über dem Ziel platzt sie
           an der rechten Kante auf, statt umzulaufen. -->
      <div class="status-bars" :class="{ 'status-bars--burst': isOverflowing }" :style="burstStyle">
        <!-- `data-points-target` ist das Ziel des Punkteflugs.
             Ein Attribut und keine Klasse, weil `lib/pointsFlight.ts` von
             ausserhalb dieser Komponente sucht: Klassennamen in scoped Styles
             sind zwar stabil, aber als Vertrag nach aussen nicht erkennbar —
             ein Attribut sagt „hieran haengt jemand". -->
        <div class="status-track" data-points-target>
          <div class="status-fill" :style="{ width: `${fillPercent}%` }">
            <div
              v-for="segment in segments"
              :key="segment.key"
              class="status-seg"
              :class="{ 'status-seg--empty': segment.percent === 0 }"
              :style="{
                left: `${segment.offset}%`,
                width: `${segment.percent}%`,
                backgroundColor: segment.color,
              }"
              :title="`${segment.name}: ${segment.points} Pkt`"
            ></div>

            <!-- Überdruck: der gefüllte Balken leuchtet als Ganzes langsam auf
                 und wieder ab. Liegt **über** den Farbsegmenten und hellt sie
                 nur auf. Erst ab echtem Überschuss — bei punktgenau erfülltem
                 Ziel leuchtet nichts. -->
            <div v-if="isOverflowing" class="fill-glow" aria-hidden="true"></div>
          </div>

          <!-- Der Überlauf: der Rahmen ist überlastet, es schießt flach und
               waagerecht aus der rechten Kante — in den Farben der Bewohner.
               Alles liegt absolut in der Spur, nichts geht nach unten, die
               Leistenhöhe ändert sich dadurch nicht. -->
          <div v-if="isOverflowing" class="status-burst" aria-hidden="true">
            <!-- Die Austrittsstelle selbst: sie atmet, damit sichtbar ist, wo
                 der Druck anliegt. Langsam, kein Flackern. -->
            <span class="burst-vent"></span>
            <span class="burst-crack"></span>
            <span
              v-for="jet in jets"
              :key="jet.key"
              class="burst-jet"
              :style="{
                top: `${jet.top}%`,
                background: jet.color,
                '--jet-phase': `${jet.phase}`,
              }"
            ></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* KEIN eigenes `position: sticky`: die Komponente steckt IN `Header.vue`, und
   ein Einklinken an `--app-header-height` wäre zirkulär — sie mäße sich an der
   Höhe des Elements, dessen Teil sie ist. Die Sticky-Position samt z-index
   trägt `.app-header` in `Header.vue` für beide.
   `flex: 1 1 auto`: sitzt neben den Icons in `.header-bar` (flex row) und nimmt
   die freie Breite. Einziger Verwendungsort, deshalb hier fest verdrahtet. */
.wall-status {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
}

/* KEIN eigenes Papier-Kärtchen: der Header ist selbst Papier (`--pw-paper`),
   ein zweites kostete nur Höhe, die laut Vorgabe `Header ≤ ~61px` fehlt.
   `overflow: hidden`: das Spritzen (siehe `.status-bars`) geht über die
   Balkenkante hinaus und muss am Komponentenrand enden, nicht in den
   Header-Icons daneben. */
.status-paper {
  overflow: hidden;
}

/* Feste Höhe, nicht inhaltsabhängig: die `+N`-Klebemarke ist höher als der
   restliche Text und erscheint erst beim Überschreiten des Ziels. Ohne feste
   Höhe würde die Leiste genau dann um ein paar Pixel wachsen — die geforderte
   Höhenkonstanz über alle Punktstände hinge sonst am Textinhalt. 22px trägt die
   um 3° gedrehte Marke — aber **knapp**: dreistellig 20,20px, es bleiben 1,8px;
   gescrollt liegen zwischen Markenunterkante und Balken nur 1,16px. Wer an
   Schriftgröße, Zeilenhöhe oder Drehung von `.status-over` dreht, muss diese
   Höhe mit anheben.

   Höhe dieser Komponente (gerechnet): offen 22 + 5 + 20 = 47px, kompakt
   22 + 1 + 20 = 43px. Die Gesamt-Headerhöhe einschließlich Rahmen steht in
   `Header.vue`. */
.status-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
  margin-bottom: 5px;
}

.status-score {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  font-weight: 800;
  color: var(--pw-ink);
  white-space: nowrap;
}

.status-score-sep {
  margin: 0 1px;
  color: var(--pw-ink-soft);
}

.status-score--over {
  color: var(--pw-accent);
}

/* Das Übermaß bekommt eine eigene Zahl — innerhalb des Papiers, damit sie am
   rechten Bildschirmrand nicht abgeschnitten wird. Sie trägt die Genauigkeit,
   das Spritzen trägt das Gefühl. */
.status-over {
  padding: 1px 5px;
  font-size: 11px;
  line-height: 1.3;
  color: var(--pw-ink);
  background: var(--pw-tape);
  border: 1.5px solid var(--pw-line);
  transform: rotate(-3deg);
}

.status-bars {
  --pw-travel: 0px;
  --pw-jet-len: 0px;
  --pw-burst-dur: 1.45s;
  --pw-burst-strength: 0;
  --pw-jet-h: 1.5px;
  --pw-glow-peak: 0;
  --pw-glow-half: 2.6s;
  /* Der Spritzstreifen rechts der Zielkante. **Immer** reserviert und immer
     gleich breit — deshalb springt beim Überschreiten weder die Spurlänge noch
     irgendetwas anderes. Kein `padding-bottom`: der Effekt geht nie nach unten,
     also wächst die Leiste beim Überschuss um exakt 0 px. */
  padding-right: 18px;
}

/* Die Zielkante ist die rechte Kante dieser Spur — es gibt nur diese eine.
 *
 * Rahmen **konstant 2px**, Innenraum **konstant 16px**, Border-Box 20px. Eine
 * unter Druck dicker werdende Kontur ist verworfen: bei dunklen
 * Mitgliederfarben praktisch unsichtbar, in Chrome auf ganze Pixel quantisiert,
 * und sie ließe den farbigen Streifen schrumpfen, je mehr geschafft ist. Das
 * Erfolgssignal trägt das Aufleuchten der Füllung.
 *
 * **Falle:** Die Variablen, die diese Komponente auf `.status-bars` setzt,
 * dürfen kein globales Token aus `base.css` überschatten. Hieße eine davon
 * `--pw-line`, würde `border: 2px solid var(--pw-line)` ungültig, und die Spur
 * stünde ohne Kontur da. */
.status-track {
  position: relative;
  box-sizing: border-box;
  height: 20px;
  border: 2px solid var(--pw-line);
  background: rgba(0, 0, 0, 0.06);
}

/* Vom überlasteten Rahmen bleibt die Einfärbung Richtung Akzent — sie kostet
   nichts. Tragen tut das Signal sie nicht; das ist Aufgabe des Musters. */
.status-bars--burst .status-track {
  border-color: color-mix(
    in srgb,
    var(--pw-accent) calc(var(--pw-burst-strength) * 100%),
    var(--pw-line)
  );
}

/* Ankunftsquittung des Punkteflugs. Nur ein kurzer Ring um die
   Spur — die eigentliche Aussage macht der wachsende Balken. Die Klasse setzt
   `lib/pointsFlight.ts` fuer rund 420 ms; sie greift auch imperativ gesetzt,
   weil scoped Styles ueber das Datenattribut des ELEMENTS matchen und nicht
   ueber die Herkunft der Klasse. */
.status-track.is-hit {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pw-accent) 55%, transparent);
  transition: box-shadow 0.18s ease-out;
}

.status-fill {
  position: relative;
  height: 100%;
  transition: width 0.45s cubic-bezier(0.2, 0.8, 0.3, 1);
}

/* Absolut positioniert — siehe Kommentar an `segments`: so kann Flexbox die
   Breiten nicht stauchen. Reiner Farbblock ohne Beschriftung. */
.status-seg {
  position: absolute;
  top: 0;
  bottom: 0;
  box-sizing: border-box;
  border-right: 1px solid rgba(0, 0, 0, 0.18);
  transition:
    width 0.45s cubic-bezier(0.2, 0.8, 0.3, 1),
    left 0.45s cubic-bezier(0.2, 0.8, 0.3, 1);
}

/* Ein Mitglied ohne Punkte darf keinen Strich hinterlassen — bei Breite 0
   bliebe sonst der rechte Rahmen als 1-px-Strich mitten im Balken stehen. */
.status-seg:last-child,
.status-seg--empty {
  border-right: 0;
}

/* Eine einzige Schicht über den Segmenten, exakt so breit wie die Füllung
   (sie erbt deren Breite als `inset: 0`). Animiert wird **nur** `opacity` —
   eine Eigenschaft, die der Kompositor allein erledigt; kein Layout, kein
   Neuzeichnen der Segmente darunter.
 *
 * Warum die Segmentfarben erkennbar bleiben: das Weiß liegt bei höchstens
 * `--pw-glow-peak` = 0,30 Deckkraft und sinkt in jeder Halbwelle auf 12 % davon
 * zurück. Selbst im hellsten Moment bleiben mindestens 70 % der Segmentfarbe
 * stehen, die Farbtöne und die Grenzen zwischen den Segmenten also erhalten —
 * es ist ein Aufhellen, kein Überdecken. */
.fill-glow {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: var(--pw-glow-peak);
  pointer-events: none;
  will-change: opacity;
  /* `alternate` heißt: ein voller Atemzug dauert zwei Halbwellen. Weiches Ein-
     und Ausblenden über `ease-in-out`. */
  animation: fill-glow var(--pw-glow-half) ease-in-out infinite alternate;
}

@keyframes fill-glow {
  from {
    opacity: calc(var(--pw-glow-peak) * 0.12);
  }
  to {
    opacity: var(--pw-glow-peak);
  }
}

/* Sitzt genau auf der Zielkante, außerhalb der Spur, und ist **absolut**
   positioniert: er kann die Höhe der Leiste nicht beeinflussen. Die Breite ist
   der konstante Streifen aus `.status-bars`. */
.status-burst {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 100%;
  width: 18px;
  pointer-events: none;
}

/* Die Austrittsstelle. Sie atmet ruhig rein und raus, damit man sieht, **wo**
   der Druck anliegt — eine Halbwelle dauert `2,5 × --pw-burst-dur`, ein voller
   Atemzug wegen `alternate` also das Fünffache: ein Atmen, kein Blinklicht.
 *
 * Bewusst an dieselbe Taktrate gehängt: `--pw-burst-dur` ist die einzige Größe
 * ohne Deckel und trägt oberhalb des 5,66-fachen Ziels das Ausmaß allein. Als
 * Atemtempo einer großen Fläche ist dieser Unterschied ungleich besser
 * abzulesen als an der Wiederholrate dünner Linien.
 *
 * Absolut positioniert und auf die Spurhöhe begrenzt — kein Beitrag zur
 * Layouthöhe. */
.burst-vent {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -5px;
  width: 12px;
  background: radial-gradient(
    ellipse at 30% 50%,
    var(--pw-accent) 0%,
    color-mix(in srgb, var(--pw-accent) 45%, transparent) 45%,
    transparent 75%
  );
  opacity: var(--pw-burst-strength);
  will-change: transform, opacity;
  animation: burst-vent calc(var(--pw-burst-dur) * 2.5) ease-in-out infinite alternate;
}

@keyframes burst-vent {
  from {
    opacity: calc(var(--pw-burst-strength) * 0.28);
    transform: scaleX(0.7);
  }
  to {
    opacity: var(--pw-burst-strength);
    transform: scaleX(1.15);
  }
}

/* Der Riss im Rahmen — das Zeichen dafür, dass er überlastet ist. Er wird mit
   dem Druck breiter. */
.burst-crack {
  position: absolute;
  /* Deckt genau den 2px-Rahmen der Spur ab, liegt also noch in deren
     Border-Box. Keine zusätzliche Höhe. */
  top: -2px;
  bottom: -2px;
  left: -2px;
  width: calc(2px + var(--pw-jet-len) * 0.22);
  background: var(--pw-accent);
  opacity: var(--pw-burst-strength);
  clip-path: polygon(0 0, 100% 18%, 35% 40%, 100% 62%, 0 100%, 60% 50%);
}

/* Ein Spritzer: eine flache, fast linienförmige Marke, die unter Druck
   waagerecht aus der Kante schießt. ihre Dicke wächst mit dem
   Druck, bleibt aber absolut positioniert und weit unter der Spurhöhe — der
   Effekt tastet die Balkenhöhe nicht an. Die Farbe kommt inline aus der
   `user_color` des jeweiligen Mitglieds. */
.burst-jet {
  position: absolute;
  left: 0;
  width: var(--pw-jet-len);
  height: var(--pw-jet-h);
  border-radius: 1px;
  opacity: 0;
  transform-origin: left center;
  will-change: transform, opacity;
  animation: burst-jet var(--pw-burst-dur) linear infinite;
  animation-delay: calc(var(--pw-burst-dur) * var(--jet-phase, 0));
}

/* Waagerecht, mit einem Aufblitzen am Anfang: der Strahl wird kurz gestreckt
   und verglimmt nach außen. Nur transform und opacity. */
@keyframes burst-jet {
  0% {
    transform: translate3d(0, 0, 0) scaleX(0.25);
    opacity: 0;
  }
  15% {
    transform: translate3d(calc(var(--pw-travel) * 0.35), 0, 0) scaleX(1);
    opacity: 1;
  }
  60% {
    opacity: 0.75;
  }
  100% {
    transform: translate3d(var(--pw-travel), 0, 0) scaleX(0.5);
    opacity: 0;
  }
}

/* **Fit-Regel, absichtlich rein in CSS, keine gemessene/geschätzte Breite in
   JavaScript:** `flex: 1 1 auto` + `min-width: 0` auf `.status-legend` heißt,
   sie nimmt den Platz zwischen dem linken Rand und `.status-score` und gibt
   ihn zuerst wieder her, wenn es eng wird — die Punktzahl ist `flex: 0 0 auto`
   und wird NIE gestaucht (das ist die wichtigere Angabe, siehe
   `.legend-points` unten für dieselbe Regel auf Mitgliedsebene). Innerhalb
   der Legende schrumpft jedes `.legend-item` (`min-width: 0`, Flex-Shrink
   standardmäßig an) gemeinsam; einzelne, ungewöhnlich lange Namen ellipsieren
   für sich (`.legend-name`, `text-overflow: ellipsis`). Reicht der Platz
   selbst dafür nicht mehr (sehr viele Mitglieder), schneidet
   `overflow: hidden` auf `.status-legend` die überzähligen Einträge am
   rechten Rand der Legende sauber ab, statt sie umzubrechen oder die Zeile
   wachsen zu lassen — genau das verlangt die Höhenvorgabe des Headers
   (61/57px, siehe `Header.vue`). `flex-wrap: nowrap` verhindert den Umbruch
   strukturell, nicht nur der Optik nach.

   Gemessene Grenze: bei **drei** Mitgliedern auf **375px** ellipsieren die
   Namen ab **5 Zeichen**. */
.status-legend {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 0 7px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 11px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--pw-line);
  flex-shrink: 0;
}

.legend-name {
  font-weight: 700;
  color: var(--pw-ink-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Die Punktzahl je Mitglied ist Teil der Kernaussage der Legende und wird
   deshalb nie gestaucht — enger wird zuerst der Name. */
.legend-points {
  flex: 0 0 auto;
  font-weight: 800;
  color: var(--pw-ink);
}

/* Gescrollt: die Leiste wird flacher. Hier lässt sich nur der Kopfabstand
   sparen; der Rest kommt aus `Header.vue`s knapperem Zeilenpolster. */
.wall-status--compact .status-head {
  margin-bottom: 1px;
}

/* Ohne Bewegung: kein Blinken. Die Spritzer stehen still, aber gestaffelt nach
   außen — Linienlänge, Rissbreite, Anzahl und die Weite der äußersten Linie
   hängen weiter am Druck, das Ausmaß bleibt also am stehenden Bild ablesbar.
   Die Staffelung nutzt dieselbe Phase wie die Animation. */
@media (prefers-reduced-motion: reduce) {
  .status-fill,
  .status-seg {
    transition: none;
  }

  /* Kein Atmen — aber die Austrittsstelle bleibt betont: volle Intensität,
     stehend. Ihre Stärke hängt weiter am Druck. */
  .burst-vent {
    animation: none;
    opacity: var(--pw-burst-strength);
    transform: scaleX(1);
  }

  /* Kein Pulsieren — aber der Balken steht dauerhaft auf der vollen
     Spitzenhelligkeit, und die hängt am Druck: das Ausmaß bleibt am stehenden
     Bild ablesbar. */
  .fill-glow {
    animation: none;
    opacity: var(--pw-glow-peak);
  }

  .burst-jet {
    animation: none;
    opacity: 0.9;
    transform: translate3d(calc(var(--pw-travel) * (-1 * var(--jet-phase, 0))), 0, 0);
  }
}
</style>
