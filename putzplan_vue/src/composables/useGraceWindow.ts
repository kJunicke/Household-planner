import { ref, onUnmounted } from 'vue'

/**
 * A short "grace" window for freshly-completed items. Just-checked items stay in
 * their original spot (struck-through) for `graceMs` so a mis-check can be undone
 * quickly, before they fold away into a collapsed/done group. When the timer
 * fires the reactive `graceIds` set changes, so views re-derive placement — i.e.
 * the row only *moves* once the window elapses (delayed move, not immediate).
 */
export function useGraceWindow(graceMs = 6000) {
  const graceIds = ref<Set<string>>(new Set())
  const timers = new Map<string, number>()

  const isInGrace = (id: string) => graceIds.value.has(id)

  const markGrace = (id: string) => {
    graceIds.value.add(id)
    const existing = timers.get(id)
    if (existing) clearTimeout(existing)
    timers.set(id, window.setTimeout(() => {
      graceIds.value.delete(id)
      timers.delete(id)
    }, graceMs))
  }

  const clearGrace = (id: string) => {
    graceIds.value.delete(id)
    const existing = timers.get(id)
    if (existing) { clearTimeout(existing); timers.delete(id) }
  }

  const clearAllGrace = () => {
    timers.forEach(t => clearTimeout(t))
    timers.clear()
    graceIds.value = new Set()
  }

  onUnmounted(clearAllGrace)

  return { graceIds, isInGrace, markGrace, clearGrace, clearAllGrace }
}
