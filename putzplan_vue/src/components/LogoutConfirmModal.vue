<script setup lang="ts">
/**
 * Bestätigung vor dem Abmelden, solange Änderungen noch nicht beim Server sind.
 *
 * Verloren gehen sie nicht — die Warteschlange bleibt unter Konto und Haushalt
 * auf dem Gerät liegen. Gesendet werden sie aber erst, wenn sich hier wieder
 * dasselbe Konto anmeldet; wer das Gerät weitergibt, soll das vorher wissen.
 */
defineProps<{
  /** Ungesendete Änderungen aus Einkauf, Packliste und To-do zusammen. */
  pendingCount: number
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop logout-confirm" @click="emit('close')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">Abmelden?</h3>
          <button class="btn-close" @click="emit('close')" aria-label="Schließen"></button>
        </div>

        <div class="modal-body">
          <p class="logout-text">
            <template v-if="pendingCount === 1">1 Änderung ist</template>
            <template v-else>{{ pendingCount }} Änderungen sind</template>
            noch nicht gesendet. Sie werden nachgereicht, sobald du dich auf diesem Gerät wieder mit
            diesem Konto anmeldest.
          </p>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="emit('close')">Abbrechen</button>
          <button type="button" class="btn btn-danger" @click="emit('confirm')">Abmelden</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Über der Settings-Sidebar (z-index 1050), aus der das Modal geöffnet wird. */
.logout-confirm {
  z-index: 1060;
}

.logout-text {
  margin: 0;
  color: var(--color-text-primary);
  line-height: 1.45;
}
</style>
