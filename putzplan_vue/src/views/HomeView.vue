<script setup lang="ts">
/**
 * Der Putzen-Screen der Route `/` — und zwar der, den die Aussehen-Einstellung
 * verlangt (Pinnwand-Redesign, Etappe 0).
 *
 * Die Wahl ist ein reaktiver Wert im `designStore`, deshalb greift ein
 * Umschalten **sofort und ohne Neuladen**. Beide Ansichten hängen an denselben
 * Stores; `CleaningView` und `TaskCard` bleiben davon unangetastet.
 *
 * Bewusst kein `keep-alive`: die weichende Ansicht soll ihre Realtime-
 * Subscription abmelden, statt sie im Hintergrund weiterlaufen zu lassen.
 */
import { computed } from 'vue'
import { useDesignStore } from '../stores/designStore'
import CleaningView from './CleaningView.vue'
import WallView from './WallView.vue'

const designStore = useDesignStore()
const isPinnwand = computed(() => designStore.design === 'pinnwand')
</script>

<template>
  <WallView v-if="isPinnwand" />
  <CleaningView v-else />
</template>
