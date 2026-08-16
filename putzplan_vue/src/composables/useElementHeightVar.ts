import { onMounted, onUnmounted, watch, type Ref } from 'vue'

/**
 * Schreibt die gemessene Höhe eines Elements laufend in eine globale CSS-Variable
 * auf `<html>`.
 *
 * Allgemeiner Baustein, nicht an eine bestimmte Komponente gebunden: der Header
 * meldet damit seine Höhe (`--app-header-height`), die Toasts und der
 * Sync-Indikator positionieren sich daran, und der vertagte Sticky-Kategoriekopf
 * kann dieselbe Variable benutzen. Feste Pixelwerte scheiden aus, weil der Header
 * auf Desktop höher ist und je nach Zustand der Rangliste umbricht.
 *
 * @param target Ref auf das zu messende Element
 * @param cssVarName Name der Custom Property, z. B. `--app-header-height`
 */
// Anzahl der aktiven Schreiber je Variable. Die Variablen sind gemeinsames Gut
// (Toasts, Sync-Indikator, später der Sticky-Kategoriekopf) — der letzte
// Schreiber räumt auf, nicht der erste, der abgebaut wird.
const writers = new Map<string, number>()

export function useElementHeightVar(
  target: Ref<HTMLElement | null | undefined>,
  cssVarName: string
) {
  let observer: ResizeObserver | null = null
  writers.set(cssVarName, (writers.get(cssVarName) ?? 0) + 1)

  const write = (height: number) => {
    document.documentElement.style.setProperty(cssVarName, `${Math.round(height)}px`)
  }

  const observe = (el: HTMLElement | null | undefined) => {
    observer?.disconnect()
    if (!el) return
    write(el.getBoundingClientRect().height)
    // Bewusst getBoundingClientRect statt contentRect: der Header hat einen
    // Rahmen unten, der zur sichtbaren Höhe gehört.
    observer = new ResizeObserver(() => write(el.getBoundingClientRect().height))
    observer.observe(el)
  }

  onMounted(() => observe(target.value))
  watch(target, el => observe(el))

  onUnmounted(() => {
    observer?.disconnect()
    observer = null

    const remaining = (writers.get(cssVarName) ?? 1) - 1
    if (remaining <= 0) {
      writers.delete(cssVarName)
      document.documentElement.style.removeProperty(cssVarName)
    } else {
      writers.set(cssVarName, remaining)
    }
  })
}
