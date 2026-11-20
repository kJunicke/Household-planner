import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import { devLoginsFromFiles } from './src/lib/devLogins'

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

/**
 * Legt die App zusaetzlich als `gast/index.html` ab. GitHub Pages hat keinen
 * SPA-Rueckfall: ein Gastlink auf einen erfundenen Pfad waere in einem
 * frischen Browser (noch kein Service Worker) eine 404. Unter `gast/` liegt so
 * eine echte Datei; den Rest erledigt der Router (`/gast` → Gastansicht).
 * Die Asset-Pfade sind absolut (`base`), dieselbe Datei laeuft auch dort.
 */
function guestPage(): Plugin {
  return {
    name: 'guest-page',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (index?.type !== 'asset') {
        this.error('guest-page: index.html fehlt im Bundle')
      }
      this.emitFile({ type: 'asset', fileName: 'gast/index.html', source: index.source })
    }
  }
}

function findSecretsDir(): string | undefined {
  let current = fileURLToPath(new URL('.', import.meta.url))
  for (;;) {
    const candidate = join(current, 'Private', 'secrets', 'HouseholdPlanner')
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/**
 * Testkonten für die Ein-Tipp-Anmeldung, nur auf dem Dev-Server
 * (docs/testing.md). Das Repo ist öffentlich, die Konten liegen im
 * Live-Projekt: die Zugangsdaten bleiben in mastermind `Private/secrets/`
 * und kommen nur als virtuelles Modul `virtual:dev-logins` in den Browser.
 * `apply: 'serve'`: im Build gibt es weder Plugin noch Modul; App und Login
 * laden die Dev-Komponenten hinter `import.meta.env.DEV`.
 *
 * Ordner: `HP_DEV_LOGINS_DIR`, sonst der erste `Private/secrets/HouseholdPlanner`
 * auf dem Weg nach oben (mastermind; Haupt-Checkout und Worktrees liegen
 * verschieden tief). Fehlt er, ist die Liste leer und es gibt keine Knöpfe.
 *
 * Mit `--host` ist der Dev-Server im LAN erreichbar; das Modul bekommt nur
 * ein Aufruf von diesem Rechner selbst.
 */
function devLogins(): Plugin {
  const moduleId = 'virtual:dev-logins'
  const resolvedId = '\0' + moduleId
  const dir = process.env.HP_DEV_LOGINS_DIR ?? findSecretsDir()
  const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

  function readFiles() {
    if (!dir) return []
    try {
      return readdirSync(dir).map((name) => {
        const path = join(dir, name)
        return { name, path, text: readFileSync(path, 'utf-8') }
      })
    } catch {
      return []
    }
  }

  return {
    name: 'dev-logins',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let url = req.url ?? ''
        try {
          url = decodeURIComponent(url)
        } catch {
          // kaputte Kodierung: roh prüfen
        }
        if (url.includes(moduleId) && !loopback.has(req.socket.remoteAddress ?? '')) {
          res.statusCode = 403
          res.end()
          return
        }
        next()
      })
    },
    resolveId(source) {
      return source === moduleId ? resolvedId : undefined
    },
    load(id) {
      if (id !== resolvedId) return undefined
      const files = readFiles()
      // Geänderte Zugangsdaten ohne Neustart des Dev-Servers übernehmen.
      for (const file of files) this.addWatchFile(file.path)
      const logins = devLoginsFromFiles(files)
      return `export default ${JSON.stringify(logins)}`
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Im Prod-Build fallen console.log/debug/info weg — sie geben u. a.
  // Nutzerdaten aus. `pure` statt `drop: ['console']`:
  // console.error und console.warn bleiben, auf console.error verlaesst sich
  // z. B. das Alt-Projekt ohne Arbeits-Unteraufgabe. `pure`
  // streicht nur Aufrufe, deren Ergebnis unbenutzt ist; Argumente mit
  // Seiteneffekten wertet esbuild weiterhin aus.
  esbuild:
    command === 'build' ? { pure: ['console.log', 'console.debug', 'console.info'] } : {},
  define: {
    __BUILD_COMMIT__: JSON.stringify(stamp.commit),
    __BUILD_DATE__: JSON.stringify(stamp.time)
  },
  plugins: [
    vue(),
    vueDevTools(),
    guestPage(),
    devLogins(),
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
}))
