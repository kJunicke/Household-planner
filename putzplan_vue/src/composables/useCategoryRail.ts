import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

/**
 * Scrollspy state for the right-side category quick-nav rail, shared by the
 * packing and shopping views. Views register each section's element via the
 * returned ref-fn; the active chip is the last section whose top has crossed the
 * active line (~120px below the viewport top) — deterministic and cheap.
 *
 * Also owns the persisted collapse toggle and the `showRail` heuristic
 * (worth showing only once there's more than a single bucket).
 *
 * @param keys     getter for the ordered group keys currently rendered
 * @param storageKey  localStorage key persisting the collapsed state
 */
export function useCategoryRail(opts: {
  keys: () => string[]
  storageKey: string
  activeLine?: number
}) {
  const activeLine = opts.activeLine ?? 120
  const sectionEls = new Map<string, HTMLElement>()
  const activeKey = ref<string | null>(null)

  const showRail = computed(() => opts.keys().length > 1)

  const railCollapsed = ref(localStorage.getItem(opts.storageKey) === '1')
  const setRailCollapsed = (v: boolean) => {
    railCollapsed.value = v
    localStorage.setItem(opts.storageKey, v ? '1' : '0')
  }

  const setSectionEl = (key: string, el: unknown) => {
    if (el instanceof HTMLElement) sectionEls.set(key, el)
    else sectionEls.delete(key)
  }

  const refreshActive = () => {
    const keys = opts.keys()
    let current: string | null = keys[0] ?? null
    for (const key of keys) {
      const el = sectionEls.get(key)
      if (!el) continue
      if (el.getBoundingClientRect().top <= activeLine) current = key
      else break
    }
    activeKey.value = current
  }

  let scrollRaf = 0
  const onScroll = () => {
    if (scrollRaf) return
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0
      refreshActive()
    })
  }

  const scrollToKey = (key: string) => {
    activeKey.value = key
    sectionEls.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Recompute when the category set changes (list switch, add/delete).
  watch(() => opts.keys().join('|'), () => nextTick(refreshActive))

  onMounted(() => {
    window.addEventListener('scroll', onScroll, { passive: true })
    nextTick(refreshActive)
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll)
    if (scrollRaf) cancelAnimationFrame(scrollRaf)
  })

  return { activeKey, showRail, railCollapsed, setRailCollapsed, setSectionEl, scrollToKey, refreshActive }
}
