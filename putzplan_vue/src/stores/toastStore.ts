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

  // Actions
  const showToast = (message: string, type: ToastType = 'info', duration: number = 5000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const toast: Toast = {
      id,
      message,
      type,
      timestamp: Date.now()
    }

    toasts.value.push(toast)

    // Auto-dismiss nach duration (default 5s)
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }

  const removeToast = (id: string) => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  // Return - Public API
  return {
    toasts,
    showToast,
    removeToast
  }
})
