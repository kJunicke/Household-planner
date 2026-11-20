// Läuft nach `npm run build` (Skript `postbuild`) und lässt den Build
// scheitern, wenn etwas von der Ein-Tipp-Anmeldung der Testkonten in `dist/`
// gelandet ist (docs/testing.md). Das Repo und die Seite sind öffentlich, die
// Testkonten liegen im Live-Projekt.
//
// Zwei Prüfungen:
// 1. Merkmale der Dev-Anmeldung, immer: virtuelles Modul, Komponentennamen,
//    Überschrift und Klassen der Knöpfe, die Domain der Testkonten. Sie stehen
//    nur in den Dev-Dateien, die der Build hinter `import.meta.env.DEV` weglässt.
// 2. Die Zugangsdaten selbst, wenn der Ordner mit `qc-login*.env` da ist
//    (`HP_DEV_LOGINS_DIR`, sonst `Private/secrets/HouseholdPlanner` auf dem Weg
//    nach oben — wie das Plugin `devLogins` in vite.config.ts). Auf CI fehlt er;
//    dann bleibt es bei 1.
//
// Ausgegeben werden nur Datei und Art des Treffers, nie ein Wert.
//
// Aufruf: node scripts/check-no-test-credentials.mjs [dist-Ordner]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(process.argv[2] ?? join(root, 'dist'))

const MARKERS = [
  'virtual:dev-logins',
  'DevLoginButtons',
  'DevAccountSwitcher',
  'Testkonten (nur Dev-Server)',
  'dev-logins-title',
  'dev-switcher-chip',
  '@putzplan.test',
]

const LOGIN_FILE = /^qc-login(?:-\d+)?\.env$/
const CREDENTIAL_KEYS = ['QC_EMAIL', 'QC_PASSWORD']

function findSecretsDir() {
  if (process.env.HP_DEV_LOGINS_DIR) return process.env.HP_DEV_LOGINS_DIR
  let current = root
  for (;;) {
    const candidate = join(current, 'Private', 'secrets', 'HouseholdPlanner')
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/** [Bezeichnung ohne Wert, Wert] je Zugangsdatum aus den `qc-login*.env`. */
function credentials(dir) {
  if (!dir || !existsSync(dir)) return []
  const found = []
  for (const name of readdirSync(dir).filter((n) => LOGIN_FILE.test(n))) {
    const text = readFileSync(join(dir, name), 'utf-8')
    for (const key of CREDENTIAL_KEYS) {
      const match = new RegExp(`^\\s*${key}\\s*=(.*)$`, 'm').exec(text)
      const value = match?.[1].trim().replace(/^(["'])(.*)\1$/, '$2')
      if (value) found.push([`${key} aus ${name}`, value])
    }
  }
  return found
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else yield path
  }
}

if (!existsSync(dist)) {
  console.error(`check-no-test-credentials: ${dist} fehlt — erst bauen`)
  process.exit(1)
}

const secrets = credentials(findSecretsDir())
const needles = [...MARKERS.map((m) => [`Merkmal "${m}"`, m]), ...secrets]

const hits = []
let scanned = 0
for (const file of files(dist)) {
  scanned++
  const text = readFileSync(file, 'utf-8')
  for (const [label, needle] of needles) {
    if (text.includes(needle)) hits.push(`${relative(dist, file)}: ${label}`)
  }
}

if (hits.length > 0) {
  console.error('check-no-test-credentials: Testkonten-Spuren im Produktions-Build:')
  for (const hit of hits) console.error(`  ${hit}`)
  process.exit(1)
}
console.log(
  `check-no-test-credentials: ${scanned} Dateien sauber — ${MARKERS.length} Merkmale, ` +
    (secrets.length
      ? `${secrets.length} Zugangsdaten aus qc-login*.env`
      : 'keine Zugangsdaten geprüft (Ordner fehlt, z. B. auf CI)'),
)
