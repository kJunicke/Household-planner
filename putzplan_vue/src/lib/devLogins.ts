/**
 * Testkonten für die Ein-Tipp-Anmeldung auf dem Dev-Server (docs/testing.md).
 *
 * Läuft nur in Node, im Vite-Plugin `devLogins` (`vite.config.ts`): es liest
 * die Dateien `qc-login*.env` aus mastermind `Private/secrets/` und reicht das
 * Ergebnis als virtuelles Modul `virtual:dev-logins` an die App. Die Dateien
 * kommen nie ins Repo, und im Produktions-Build gibt es weder Plugin noch Modul.
 */

export interface DevLogin {
  label: string
  email: string
  password: string
}

interface EnvFile {
  name: string
  text: string
}

const FILE_NAME = /^qc-login(?:-(\d+))?\.env$/

/**
 * Gehört die Datei zu den Testkonten? Das Plugin liest nur diese — im Ordner
 * liegen auch andere Geheimnisse, die nicht einmal gelesen werden sollen.
 */
export function isDevLoginFile(name: string): boolean {
  return FILE_NAME.test(name)
}

function parseEnv(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const value = line.slice(eq + 1).trim()
    values.set(line.slice(0, eq).trim(), value.replace(/^(["'])(.*)\1$/, '$2'))
  }
  return values
}

/**
 * Macht aus den Dateien die Liste der Testkonten, nach Kontonummer sortiert
 * (`qc-login.env` ist Nummer 1). Unvollständige und fremde Dateien fallen weg.
 */
export function devLoginsFromFiles(files: EnvFile[]): DevLogin[] {
  const numbered: { n: number; login: DevLogin }[] = []
  for (const file of files) {
    const match = FILE_NAME.exec(file.name)
    if (!match) continue
    const values = parseEnv(file.text)
    const email = values.get('QC_EMAIL')
    const password = values.get('QC_PASSWORD')
    if (!email || !password) continue
    const n = match[1] ? Number(match[1]) : 1
    numbered.push({ n, login: { label: values.get('QC_LABEL') || `QC ${n}`, email, password } })
  }
  return numbered.sort((a, b) => a.n - b.n).map((entry) => entry.login)
}
