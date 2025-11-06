<template>
  <div class="toast-container position-fixed bottom-0 end-0 p-3">
    <div
      v-for="toast in toastStore.toasts"
      :key="toast.id"
      :ref="el => setToastRef(toast.id, el as HTMLElement | null)"
      class="toast"
      :class="getToastClass(toast.type)"
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      data-bs-autohide="true"
      data-bs-delay="5000"
    >
      <div class="toast-header">
        <span class="toast-icon me-2" :class="getIconClass(toast.type)">
          {{ getIcon(toast.type) }}
        </span>
        <strong class="me-auto">{{ getTitle(toast.type) }}</strong>
        <button
          type="button"
          class="btn-close"
          data-bs-dismiss="toast"
          aria-label="Close"
        ></button>
      </div>
      <div class="toast-body">
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useToastStore } from '@/stores/toastStore'
import type { ToastType } from '@/stores/toastStore'
import { Toast as BootstrapToast } from 'bootstrap'

const toastStore = useToastStore()

// Map toast IDs to DOM refs
const toastRefs = ref<Map<string, HTMLElement>>(new Map())

const setToastRef = (id: string, el: HTMLElement | null) => {
  if (el) {
    toastRefs.value.set(id, el)
  } else {
    toastRefs.value.delete(id)
  }
}

// Helper: Get Bootstrap color class for toast type
const getToastClass = (type: ToastType): string => {
  const classes: Record<ToastType, string> = {
    success: 'toast-success',
    error: 'toast-error',
    info: 'toast-info'
  }
  return classes[type]
}

// Helper: Get icon for toast type
const getIcon = (type: ToastType): string => {
  const icons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  }
  return icons[type]
}

// Helper: Get icon class for toast type
const getIconClass = (type: ToastType): string => {
  const classes: Record<ToastType, string> = {
    success: 'text-success',
    error: 'text-danger',
    info: 'text-primary'
  }
  return classes[type]
}

// Helper: Get title for toast type
const getTitle = (type: ToastType): string => {
  const titles: Record<ToastType, string> = {
    success: 'Erfolg',
    error: 'Fehler',
    info: 'Info'
  }
  return titles[type]
}

// Watch for new toasts and initialize Bootstrap Toast
watch(
  () => toastStore.toasts.length,
  async () => {
    await nextTick()

    // Initialize Bootstrap Toasts for new toasts
    toastStore.toasts.forEach(toast => {
      const el = toastRefs.value.get(toast.id)
      if (el) {
        // Check if already initialized
        const existingInstance = BootstrapToast.getInstance(el)
        if (!existingInstance) {
          const bsToast = new BootstrapToast(el)

          // Listen to hidden event to remove from store
          el.addEventListener('hidden.bs.toast', () => {
            toastStore.removeToast(toast.id)
          })

          // Show the toast
          bsToast.show()
        }
      }
    })
  }
)
</script>

<style scoped>
.toast-container {
  z-index: 9999;
}

/* Custom toast colors using Design System variables */
.toast-success .toast-header {
  background-color: var(--color-success-light);
  color: white;
}

.toast-error .toast-header {
  background-color: var(--color-danger);
  color: white;
}

.toast-info .toast-header {
  background-color: var(--color-primary);
  color: white;
}

/* Icon styling */
.toast-icon {
  font-size: 1.25rem;
  font-weight: bold;
}

/* Toast body styling */
.toast-body {
  font-size: 0.9rem;
}

/* Override Bootstrap close button color for colored headers */
.toast-success .btn-close,
.toast-error .btn-close,
.toast-info .btn-close {
  filter: brightness(0) invert(1);
}
</style>
