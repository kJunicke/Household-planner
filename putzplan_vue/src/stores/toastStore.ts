import { ref } from 'vue'
import { defineStore } from 'pinia'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
  timestamp: number
}

export const useToastStore = defineStore('toast', () => {
  // State
  const toasts = ref<Toast[]>([])

  // Der Auto-Hide-Timer liegt hier, nicht in der Darstellung: der Container ist
  // reine Anzeige, die Lebensdauer eines Toasts gehört zu seinem Zustand.
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  // Actions
  const showToast = (message: string, type: ToastType = 'info', duration: number = 5000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const toast: Toast = {
      id,
      message,
      type,
      timestamp: Date.now()
    }

    toasts.value.push(toast)

    // Auto-dismiss nach duration (default 5s)
    if (duration > 0) {
      timers.set(id, setTimeout(() => removeToast(id), duration))
    }

    return id
  }

  const removeToast = (id: string) => {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  // Return - Public API
  return {
    toasts,
    showToast,
    removeToast
  }
})
