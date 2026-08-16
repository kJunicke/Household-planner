/**
 * Schreibt die Höhe des *Visual* Viewports in die globale CSS-Variable
 * `--visual-viewport-height` auf `<html>`.
 *
 * Hintergrund: beim Öffnen der Bildschirmtastatur verkleinern Android und iOS
 * standardmäßig nur den Visual Viewport. Ein Modal, das sich am Layout-Viewport
 * (100vh / 100%) bemisst, bleibt dadurch zu hoch und schiebt seinen Footer hinter
 * die Tastatur. Der Viewport-Meta-Tag mit `interactive-widget=resizes-content`
 * behebt das auf Android Chrome; iOS Safari ignoriert ihn, deshalb zusätzlich
 * diese Messung.
 *
 * Wird einmalig in `main.ts` gestartet und läuft für die Lebensdauer der App;
 * das geteilte Modal-Muster in `utilities.css` liest die Variable.
 */
export function useVisualViewportHeight() {
  const root = document.documentElement

  const update = () => {
    const height = window.visualViewport?.height ?? window.innerHeight
    root.style.setProperty('--visual-viewport-height', `${Math.round(height)}px`)
  }

  update()

  const vv = window.visualViewport
  if (vv) {
    vv.addEventListener('resize', update)
    // Beim Scrollen im eingeblendeten Tastatur-Zustand ändert sich der Offset,
    // die Höhe kann sich dabei ebenfalls anpassen.
    vv.addEventListener('scroll', update)
  }
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', update)

  const stop = () => {
    vv?.removeEventListener('resize', update)
    vv?.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    window.removeEventListener('orientationchange', update)
  }

  return { stop }
}
