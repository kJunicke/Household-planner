/// <reference types="vite/client" />

/**
 * Zur Bauzeit eingesetzt (→ `define` in `vite.config.ts`). Keine Variablen zur
 * Laufzeit: die Werte stehen als Zeichenketten im Bundle und sind damit genau
 * das, was auf dem Geraet wirklich liegt.
 */
declare const __BUILD_COMMIT__: string
declare const __BUILD_DATE__: string
