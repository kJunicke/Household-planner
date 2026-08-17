<script setup lang="ts">
/**
 * Der Fetzen über der Erledigt-Liste (Pinnwand-Redesign, Etappe 4, Ticket 11).
 *
 * Ein abgerissener Zettel hinterlässt einen Fetzen: den Rest, der beim Abreißen
 * hängen bleibt. Ein Tipp klebt ihn zurück — die Aufgabe ist wieder dran, die
 * Punkte sind wieder aus dem Balken raus.
 *
 * **Kein Toast**, und ausdrücklich nichts, was sich über die Wand legt: der
 * Fetzen steht im Fluss der Seite, direkt über der Erledigt-Liste, und schiebt
 * sie nach unten statt sie zu verdecken.
 *
 * Er verschwindet **nicht von selbst**. Er hängt, bis die Pinnwand verlassen
 * oder die Seite neu geladen wird — dann ordnet sich ohnehin alles neu an.
 * Warum das mehr ist als Bequemlichkeit, steht in `useTornScrap`.
 *
 * Zustand liegt dort; hier ist nur das Bild dazu.
 */
import { onUnmounted, watch } from 'vue'
import { useTaskStore } from '@/stores/taskStore'
import { useScrollQuiet } from '@/composables/useScrollQuiet'
import { dropScrap, tornScrapState, undoScrap } from '@/composables/useTornScrap'

const taskStore = useTaskStore()

const { scrap, busy } = tornScrapState

/**
 * Der gemeinsame Scroll-Wächter — mitbenutzt, nicht nachgebaut. Gehalten wird er
 * für die Lebensdauer dieser Komponente; das Abmelden übernimmt `useScrollQuiet`.
 */
const scrolling = useScrollQuiet()

/**
 * Verschwindet die Aufgabe unter dem Fetzen ganz — ein anderes Mitglied löscht
 * sie, während der Fetzen hängt —, führt das Zurückkleben ins Leere. Dann ist
 * der Fetzen weg, bevor jemand darauf tippt.
 *
 * Nur das Löschen ist dieser Fall. Setzt jemand die Aufgabe per „wieder
 * dreckig" zurück, während der Fetzen hängt, bleibt er ausdrücklich stehen: die
 * Punkte sind dann immer noch verbucht, und genau die holt das Zurückkleben
 * heraus.
 */
watch(
  () => Boolean(scrap.value) && !taskStore.tasks.some(t => t.task_id === scrap.value?.taskId),
  gone => {
    if (gone && scrap.value) dropScrap(scrap.value.taskId)
  }
)

/**
 * Verlassen der Pinnwand — der eine Weg, auf dem der Fetzen von selbst
 * verschwindet. Was man nicht sieht, darf man nicht mehr auslösen können.
 */
onUnmounted(() => {
  if (scrap.value) dropScrap(scrap.value.taskId)
})

/**
 * Derselbe Scroll-Schutz wie am Eselsohr, aus demselben gemeinsamen Wächter:
 * ein Tipp, der eine Wischbewegung beendet, ist kein Tipp. Ohne ihn nimmt ein
 * Fingerabsetzen beim Scrollen die eben erledigte Aufgabe wieder zurück.
 *
 * Es geht dabei nichts verloren: der Fetzen läuft nicht ab, ein zweiter Tipp
 * nach dem Nachlauf tut dasselbe wie der erste gewollt hätte.
 */
const onScrapClick = () => {
  if (scrolling.value) return
  void undoScrap()
}
</script>

<template>
  <button
    v-if="scrap"
    class="scrap"
    :class="{ 'scrap--busy': busy }"
    type="button"
    @click="onScrapClick"
  >
    <span class="scrap-icon"><i class="bi bi-arrow-90deg-left" aria-hidden="true"></i></span>
    <span class="scrap-text">
      <span class="scrap-label">{{ busy ? 'wird zurückgeklebt …' : 'Zurückkleben' }}</span>
      <span class="scrap-title">{{ scrap.title }}</span>
    </span>
    <span v-if="scrap.points > 0" class="scrap-points">−{{ scrap.points }} P</span>
  </button>
</template>

<style scoped>
/* Papier mit gerissener Unterkante. Die Zacken sind eine `clip-path`, kein
   Bild: sie skalieren mit jeder Breite und kosten keine Datei.

   `padding-bottom` ist größer als oben, weil die Zacken bis zu 7 px in den
   Inhalt schneiden — ohne diesen Ausgleich läge der Titel im Riss. Die Höhe
   steht nicht als Zahl da: `min-height` sichert die 48 px Trefferfläche,
   wachsen darf der Fetzen mit seinem Inhalt. Der QC hat gemessen, dass der
   Abstand des Titels zum Riss bei Schriftgröße 20 statt 13 von 3,9 auf 4,7 px
   *wächst* — genau deshalb steht hier keine feste Höhe.

   Der Abstand nach oben ist derselbe wie der der Erledigt-Liste (16 px), damit
   der Fetzen zu ihr gehört und nicht zur Wand.

   **Er steht im Fluss und darf das auch**: er verschwindet nicht von selbst,
   also gibt es keinen Moment, in dem er die Liste unter einem aufliegenden
   Finger nach oben zieht. Ein neuer Abriss tauscht nur den Inhalt an derselben
   Stelle — der Titel bricht nie um (`nowrap` + Auslassung), die Höhe bleibt
   also dieselbe. */
.scrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  min-height: 48px;
  margin: 16px 0 0;
  padding: 11px 12px 15px;
  border: 0;
  text-align: left;
  background: var(--pw-paper);
  color: var(--pw-ink);
  box-shadow: var(--pw-shadow);
  cursor: pointer;
  transform: rotate(-0.5deg);
  clip-path: polygon(
    0 0,
    100% 0,
    100% calc(100% - 5px),
    92% 100%,
    84% calc(100% - 4px),
    76% calc(100% - 1px),
    68% calc(100% - 6px),
    60% calc(100% - 2px),
    52% calc(100% - 7px),
    44% calc(100% - 2px),
    36% calc(100% - 5px),
    28% calc(100% - 1px),
    20% calc(100% - 6px),
    12% calc(100% - 2px),
    4% calc(100% - 5px),
    0 calc(100% - 2px)
  );
}

/* Kein `transform` im Aktiv-Zustand: der Fetzen trägt bereits eines (die
   Neigung), und ein zweites würde es ersetzen statt es zu ergänzen — er spränge
   beim Tippen gerade. Stattdessen zieht sich der Schatten zusammen, das ist
   dieselbe Aussage („eingedrückt") ohne den Nebeneffekt. */
.scrap:active {
  box-shadow: 1px 1px 0 var(--pw-line);
}

/* Während das Zurückkleben läuft, ist der Fetzen kein Angebot mehr, sondern
   eine Meldung. Er bleibt sichtbar stehen, bis der Server bestätigt hat. */
.scrap--busy {
  cursor: default;
  opacity: 0.75;
}

.scrap-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  font-size: 14px;
  line-height: 1;
  background: var(--pw-tape);
  border: 1.5px solid var(--pw-line);
  border-radius: 50%;
}

/* `min-width: 0` ist Pflicht, sonst ist die Mindestbreite dieses Flex-Kindes
   seine Inhaltsbreite: der Titel kürzt dann nicht, sondern drückt den
   Punktwert aus dem Fetzen heraus. */
.scrap-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.scrap-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pw-ink-soft);
}

.scrap-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 700;
}

/* Was das Zurückkleben aus dem Balken nimmt — mit Minus, weil es die
   Gegenrichtung des Punkteflugs ist. */
.scrap-points {
  flex: none;
  font-size: 11px;
  font-weight: 800;
  color: var(--pw-ink-soft);
  white-space: nowrap;
}
</style>
