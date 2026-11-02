import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

// Eigene Konfiguration statt `test:`-Block in vite.config.ts: die Tests prüfen
// nur reine Logik unter src/lib und brauchen weder Vue-, PWA- noch
// DevTools-Plugin — nur den `@`-Alias. Kein DOM, keine Globals: jede Testdatei
// importiert `describe`/`it`/`expect` ausdrücklich aus `vitest`.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Die App rechnet in Gerätezeit (weekWindow, taskSchedule). Feste Zone mit
    // Sommerzeit, damit die DST-Grenzen auf jedem Rechner und in CI dieselben sind.
    env: { TZ: 'Europe/Berlin' },
  },
})
