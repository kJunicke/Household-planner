/// <reference types="vite/client" />

/**
 * Zur Bauzeit eingesetzt (→ `define` in `vite.config.ts`). Keine Variablen zur
 * Laufzeit: die Werte stehen als Zeichenketten im Bundle und sind damit genau
 * das, was auf dem Geraet wirklich liegt.
 */
declare const __BUILD_COMMIT__: string
declare const __BUILD_DATE__: string

/**
 * Testkonten für die Ein-Tipp-Anmeldung, nur auf dem Dev-Server: das Vite-Plugin
 * `devLogins` (`vite.config.ts`) liefert das Modul, im Build gibt es es nicht.
 */
declare module 'virtual:dev-logins' {
  const logins: import('@/lib/devLogins').DevLogin[]
  export default logins
}
