<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useHouseholdStore } from '../stores/householdStore'
import SettingsSidebar from './SettingsSidebar.vue'
import SyncIndicator from './SyncIndicator.vue'
import WallStatusBar from './WallStatusBar.vue'
import BrandLogo from './BrandLogo.vue'
import AssistantPanel from './AssistantPanel.vue'
import { useElementHeightVar } from '../composables/useElementHeightVar'
import { settingsSidebarOpen } from '../lib/appNavigation'

/**
 * Der Header greift im `<style>` direkt auf die `--pw-*`-Rohtoken aus
 * `base.css` zu, nicht auf die `--color-*`-Token. Das stammt aus der Zeit des
 * Aussehen-Umschalters: der Header sah als einzige Ausnahme in jedem Aussehen
 * gleich aus (Papier), während die `--color-*`-Token je nach Aussehen
 * umsprangen. Seit dem Abriss gibt es nur noch die Pinnwand; das Zusammenführen
 * der Token-Sätze steht noch aus.
 * `color` wird explizit auf `--pw-ink` gesetzt, damit nicht die geerbte
 * `--color-text-primary` vom `<body>` durchschlägt — dieselbe Regel gilt für
 * `SyncIndicator`, der nur hier im Header sitzt.
 *
 * Die Rangliste ist ersatzlos entfernt, der Store-Wert `weeklyRanking`
 * ebenfalls. Laut Glossar (Wochenziel) gibt es
 * ausdrücklich keine Rangliste — auch nicht künftig.
 *
 * Das „Putzplan"-Logo stand ursprünglich links neben der Rangliste und sollte
 * laut ursprünglichem Plan ganz entfallen — der Nutzer hat das nach dem
 * ersten Umbau präzisiert: das Logo bleibt, wandert aber an die alte
 * Avatar-Stelle rechts und ist jetzt selbst der Menü-Knopf (ersetzt den rein
 * dekorativen farbigen Kreis). Die Spec-Zeile „kein Logo" meinte nur den alten
 * Platz links neben der Rangliste.
 */
const householdStore = useHouseholdStore()

// Geteilt, damit der Assistent die Einstellungen öffnen kann (appNavigation.ts).
const sidebarOpen = settingsSidebarOpen
const assistantOpen = ref(false)

// Der Header meldet seine eigene Höhe (inkl. der jetzt eingebetteten
// Wochenziel-Leiste) global; Toasts, Sync-Indikator und die Verlauf-Kopfzeile
// hängen sich daran, ein fester Pixelwert wäre auf Desktop und im
// Kompaktzustand falsch.
const headerEl = ref<HTMLElement | null>(null)
useElementHeightVar(headerEl, '--app-header-height')

onMounted(async () => {
  await householdStore.loadWeeklyCompletions()
})
</script>

<template>
  <header ref="headerEl" class="app-header">
    <!-- Eine Zeile: links die Wochenziel-Leiste über die freie Breite, rechts
         Sync-Status und der Menü-Knopf (Logo). Kein Logo/keine Rangliste mehr
         an ihrem alten Platz links — siehe Kommentar oben im Script. -->
    <div class="header-bar">
      <WallStatusBar class="header-goal" />

      <div class="header-actions">
        <SyncIndicator />
        <button
          type="button"
          class="header-assistant-btn"
          aria-label="Assistent öffnen"
          title="Assistent"
          @click="assistantOpen = true"
        >
          <i class="bi bi-chat-dots" />
        </button>
        <button
          type="button"
          class="header-logo-btn"
          :aria-expanded="sidebarOpen"
          aria-label="Einstellungen öffnen"
          title="Einstellungen öffnen"
          @click="sidebarOpen = true"
        >
          <BrandLogo size="sm" :wordmark="false" />
        </button>
      </div>
    </div>

    <!-- Settings Sidebar -->
    <SettingsSidebar v-model:open="sidebarOpen" />
    <AssistantPanel v-model:open="assistantOpen" />
  </header>
</template>

<style scoped>
/* Direkt die `--pw-*`-Rohtoken statt `--color-*` — siehe Kommentar oben im
   Script. `color`
   ist Absicht, nicht Zierde: ohne ihn erbt jedes Kind (u. a. `WallStatusBar`s
   Zahlen, falls sie mal keinen eigenen `color` setzen) die gegatete
   `--color-text-primary` vom Body. */
.app-header {
  background: var(--pw-paper);
  border-bottom: 2px solid var(--pw-line);
  box-shadow: var(--pw-shadow);
  color: var(--pw-ink);
  position: sticky;
  top: 0;
  /* Über dem Seiteninhalt, aber unter den Sidebar-/Modal-Ebenen ab 1040
     (`SettingsSidebar.vue`) — der Header darf nicht über Modals/Overlays
     liegen. */
  z-index: 950;
}

.header-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 1rem;
}

/* Die Wochenziel-Leiste nimmt die freie Breite, die früher Logo + Rangliste
   belegt haben; die Icons rechts bleiben in ihrer natürlichen Breite. */
.header-goal {
  flex: 1 1 auto;
  min-width: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

/* Menü-Knopf: ersetzt den vormals rein dekorativen farbigen Kreis. Das Logo
   selbst ist 32px hoch (`BrandLogo` Größe „sm"), damit die Zeile nicht höher
   wird als vorher — ein Hochskalieren auf Avatar-Größe (36px) hätte die
   ohnehin knappe Ziel-Headerhöhe (61px INKLUSIVE der 2px `border-bottom` von
   `.app-header` — die fehlte in einer früheren Rechnung hier, siehe QC-Runde
   2) unnötig strapaziert. Die Trefferfläche wird trotzdem auf 48px gebracht,
   per `::after` — dasselbe Muster wie in `SyncIndicator.vue`. */
.header-logo-btn {
  position: relative;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  border-radius: var(--radius-md);
  line-height: 0;
}

.header-assistant-btn {
  background: none;
  border: none;
  padding: 0 4px;
  color: var(--pw-ink);
  font-size: 1.25rem;
  line-height: 1;
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
  cursor: pointer;
}

.header-logo-btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  transform: translate(-50%, -50%);
}

.header-logo-btn:focus-visible {
  outline: 2px solid var(--pw-accent);
  outline-offset: 2px;
  border-radius: var(--radius-md);
}

/* `BrandLogo` selbst setzt Fläche/Schatten über die gegateten `--color-primary`
   / `--shadow-sm` — im klassischen Aussehen wäre das Indigo statt Tinte-Blau.
   Dieselbe Ausnahme wie überall im Header: fest auf die `--pw-*`-Rohtoken.
   KEIN `!important` nötig: `:deep()` haengt hier an `.header-logo-btn`, einer
   ZUSÄTZLICHEN Klasse gegenüber `BrandLogo.vue`s eigener Regel — der
   emittierte Selektor ist (0,3,0) gegen deren (0,2,0), gewinnt also rein über
   Spezifität, unabhängig von der Bundle-Reihenfolge der beiden `<style>`-
   Blöcke. (Korrigiert nach QC-Runde 2: eine frühere Fassung dieses Kommentars
   behauptete gleiche Spezifität und begründete damit ein `!important`, das
   real gar nicht nötig war.) */
.header-logo-btn :deep(.brand-mark) {
  background: var(--pw-accent);
  box-shadow: var(--pw-shadow);
}

/* Desktop: mehr horizontale Luft, aber DASSELBE vertikale Polster wie mobil
   (0.375rem) — QC-Runde 2 hat 65/61px auf Desktop gemessen (gegen 61/57px
   mobil), weil hier vorher 0.5rem statt 0.375rem stand: 2px oben + 2px unten
   zu viel. Zwei verschiedene Headerhöhen je Breite sind nicht vorgesehen,
   deshalb bleibt das vertikale Polster über beide Breakpoints gleich — nur
   das horizontale wächst. */
@media (min-width: 768px) {
  .header-bar {
    padding: 0.375rem 1.5rem;
  }
}
</style>
