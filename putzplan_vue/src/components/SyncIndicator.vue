<script setup lang="ts">
import { computed } from 'vue'
import { useSyncStatus } from '@/composables/useSyncStatus'
import { useToastStore } from '@/stores/toastStore'

const { state, isSyncing } = useSyncStatus()
const toastStore = useToastStore()

const explanation = computed(() => {
  if (state.value === 'offline') {
    return 'Offline-Modus: Änderungen werden gespeichert und automatisch synchronisiert, sobald die Verbindung wieder da ist.'
  }
  return isSyncing.value
    ? 'Änderungen werden gerade synchronisiert.'
    : 'Es warten noch Änderungen auf die Synchronisation.'
})

// Der Erklärtext ist einmal informativ, nicht dauerhaft: Tooltip auf dem Desktop,
// Tap-Toast auf dem Handy.
const showExplanation = () => {
  toastStore.showToast(explanation.value, 'info')
}
</script>

<template>
  <button
    v-if="state !== 'idle'"
    type="button"
    class="sync-indicator"
    :class="`sync-${state}`"
    :title="explanation"
    :aria-label="explanation"
    @click="showExplanation"
  >
    <i v-if="state === 'offline'" class="bi bi-wifi-off"></i>
    <!-- Die Drehung zeigt echte Aktivität; wartende Änderungen stehen still. -->
    <i class="bi bi-arrow-repeat" :class="{ spin: isSyncing }" v-else></i>
  </button>
</template>

<style scoped>
/* Optisch so hoch wie der Avatar, damit das Ein- und Ausblenden die Headerhöhe
   nicht verändert. Die Trefferfläche wird über ein Pseudo-Element auf 48px
   erweitert — dasselbe Muster wie an den Kategorie-Kopfzeilen. */
.sync-indicator {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1.15rem;
  line-height: 1;
}

.sync-indicator::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  transform: translate(-50%, -50%);
}

/* `--color-warning-dark` / `--color-primary` sind gegated (`data-design`) und
   sähen im klassischen Aussehen anders aus als im Pinnwand-Aussehen. Diese
   Komponente wird ausschließlich im App-Header eingesetzt (`Header.vue`) —
   der ist die bewusste Ausnahme vom Aussehen-Schalter (siehe Kommentar dort)
   und braucht deshalb ungegatete Farben direkt, sonst sieht der Sync-Status
   in beiden Aussehen unterschiedlich aus. `--pw-accent` trägt „syncing" wie
   überall im Header (`--pw-accent` ist die ungegatete Rohtoken-Fassung von
   `--color-primary`, siehe `base.css`).

   Für „offline" gibt es in der Rohpalette kein Warnton-Äquivalent — dafür der
   Literalwert `#8f6214`. Das ist BEWUSST kein neuer `--pw-*`-Token für einen
   einzigen Anwendungsfall, sondern derselbe Farbwert, den `base.css` schon
   für `--color-warning-dark` unter `[data-design='pinnwand']` einträgt: dort
   extra auf Lesbarkeit auf Papier abgestimmt — und der Header-Hintergrund ist
   jetzt IMMER Papier (`--pw-paper`), auch klassisch. */
.sync-offline {
  color: #8f6214;
}

.sync-syncing {
  color: var(--pw-accent);
}

.spin {
  display: inline-block;
  animation: sync-spin 1.2s linear infinite;
}

@keyframes sync-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
