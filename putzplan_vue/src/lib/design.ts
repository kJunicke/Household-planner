/**
 * Aussehen-Umschalter (Pinnwand-Redesign, Etappe 0).
 *
 * Die Wahl gilt **pro Gerät** und wird lokal gespeichert — kein Feld am Haushalt,
 * keine Synchronisierung. Beim ersten Start ist das **alte** Aussehen aktiv.
 *
 * Technisch hängt die Umschaltung an einem Attribut am Wurzelelement:
 *   - 'classic'  → kein Attribut, `:root` in base.css gilt unverändert
 *   - 'pinnwand' → `data-design="pinnwand"`, der zweite Token-Satz greift
 */

export type DesignMode = 'classic' | 'pinnwand'

export const DESIGN_MODES: readonly DesignMode[] = ['classic', 'pinnwand']

export const DEFAULT_DESIGN: DesignMode = 'classic'

/**
 * ACHTUNG: derselbe Schlüssel steht im Inline-Script im <head> von index.html.
 * Das Script muss synchron vor dem ersten Stylesheet laufen und kann deshalb
 * nichts importieren. Wird der Schlüssel hier geändert, dort mitziehen.
 */
const STORAGE_KEY = 'putzplan.design'

const isDesignMode = (value: unknown): value is DesignMode =>
    value === 'classic' || value === 'pinnwand'

/** Liest die gespeicherte Wahl; fällt auf das alte Aussehen zurück. */
export function readStoredDesign(): DesignMode {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        return isDesignMode(stored) ? stored : DEFAULT_DESIGN
    } catch {
        // localStorage nicht verfügbar (Private Mode o. ä.) — altes Aussehen
        return DEFAULT_DESIGN
    }
}

export function storeDesign(mode: DesignMode): void {
    try {
        localStorage.setItem(STORAGE_KEY, mode)
    } catch {
        // Speichern fehlgeschlagen — die Wahl gilt dann nur für diese Sitzung
    }
}

/**
 * Setzt das Attribut am Wurzelelement. Muss beim App-Start laufen, bevor der
 * erste Screen sichtbar wird, sonst blitzt kurz das falsche Aussehen auf.
 */
export function applyDesign(mode: DesignMode): void {
    const root = document.documentElement
    if (mode === 'pinnwand') {
        root.setAttribute('data-design', 'pinnwand')
    } else {
        root.removeAttribute('data-design')
    }
}

/** Einstiegspunkt für main.ts: gespeicherte Wahl lesen und sofort anwenden. */
export function initializeDesign(): DesignMode {
    const mode = readStoredDesign()
    applyDesign(mode)
    return mode
}
