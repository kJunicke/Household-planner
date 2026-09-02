import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Die Kennung des ausgelieferten Standes — zur Anzeige in den Einstellungen.
 *
 * Zweck ist nicht Buchhaltung, sondern eine einzige Frage: **laeuft auf diesem
 * Geraet ueberhaupt der Stand, den ich gerade teste?** Die App ist eine PWA mit
 * Precaching; auf dem Homescreen liefert der Service Worker die alte Fassung
 * aus, bis er sich erneuert, und auf iOS ist das zaeh, weil das System die App
 * suspendiert statt sie zu beenden. Ohne sichtbare Kennung misst man
 * ahnungslos am alten Bundle.
 *
 * Der Commit kommt aus `git`, im GitHub-Actions-Lauf ersatzweise aus
 * `GITHUB_SHA` — `actions/checkout` legt ein flaches Abbild an, in dem `git`
 * zwar funktioniert, aber nicht garantiert ist. Faellt beides aus, steht dort
 * `unbekannt`: eine falsche Kennung waere schlimmer als eine fehlende, weil
 * genau sie die Frage oben falsch beantwortete.
 */
function buildStamp(): { commit: string; time: string } {
  let commit = process.env.GITHUB_SHA?.slice(0, 7) ?? ''
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short HEAD', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
    } catch {
      commit = ''
    }
  }
  return {
    commit: commit || 'unbekannt',
    // Nur der Tag, nicht die Uhrzeit: er beantwortet „ist das von heute?",
    // und mehr wird hier nicht gefragt.
    time: new Date().toISOString().slice(0, 10)
  }
}

const stamp = buildStamp()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(stamp.commit),
    __BUILD_DATE__: JSON.stringify(stamp.time)
  },
  plugins: [
    vue(),
    vueDevTools(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Household Planner',
        short_name: 'Household Planner',
        description: 'Gamifizierte Shared-Household Task-App',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/Household-planner/',
        scope: '/Household-planner/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  // GitHub Pages deployment - repo wird unter /Household-planner/ gehostet
  base: '/Household-planner/',
})
