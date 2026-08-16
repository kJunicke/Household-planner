<script setup lang="ts">
import { useToastStore } from '@/stores/toastStore'
import type { ToastType } from '@/stores/toastStore'

const toastStore = useToastStore()

// Reine Darstellung: kein Bootstrap-Toast, kein Auto-Hide-Timer, keine DOM-Refs.
// Der Timer sitzt im Store.

const icons: Record<ToastType, string> = {
  success: 'bi-check-circle-fill',
  error: 'bi-exclamation-circle-fill',
  info: 'bi-info-circle-fill'
}
</script>

<template>
  <div class="toast-stack" aria-live="polite" aria-atomic="true">
    <TransitionGroup name="toast">
      <button
        v-for="toast in toastStore.toasts"
        :key="toast.id"
        type="button"
        class="toast-line"
        :class="`toast-${toast.type}`"
        role="alert"
        aria-label="Meldung ausblenden"
        @click="toastStore.removeToast(toast.id)"
      >
        <i class="bi" :class="icons[toast.type]"></i>
        <span class="toast-text">{{ toast.message }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* Oben rechts, unterhalb des Headers — der Einstellungen-Avatar bleibt frei.
   Die Headerhöhe kommt aus der globalen Variable, die der Header selbst misst. */
.toast-stack {
  position: fixed;
  top: calc(var(--app-header-height, 56px) + 0.5rem);
  right: 0.5rem;
  left: 0.5rem;
  z-index: 1080;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.375rem;
  pointer-events: none;
}

.toast-line {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  max-width: min(24rem, 100%);
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-background-elevated);
  box-shadow: var(--shadow-lg);
  color: var(--color-text-primary);
  font-size: var(--font-md);
  text-align: left;
  cursor: pointer;
}

/* Normale Meldungen sind einzeilig. Lange Texte (der Offline-Erklärtext) brechen
   um, statt abgeschnitten zu werden — abgeschnittene Erklärungen sind nutzlos. */
.toast-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Typ-Signal ausschließlich über Icon und linken Rand — kein Titel, kein Kopfbalken. */
.toast-success {
  border-left-color: var(--color-success);
}
.toast-success i {
  color: var(--color-success);
}

.toast-error {
  border-left-color: var(--color-danger);
}
.toast-error i {
  color: var(--color-danger);
}

.toast-info {
  border-left-color: var(--color-primary);
}
.toast-info i {
  color: var(--color-primary);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--transition-base), transform var(--transition-base);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}
</style>
