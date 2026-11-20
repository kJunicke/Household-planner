import { describe, expect, it } from 'vitest'
import { devLoginsFromFiles, isDevLoginFile } from './devLogins'

const qcFile = (email: string, extra = '') =>
  `# Kommentar\n\nQC_EMAIL=${email}\nQC_PASSWORD=geheim=mit=gleich\nQC_USER_ID=u-1\n${extra}`

describe('devLoginsFromFiles', () => {
  it('liest E-Mail und Passwort und benennt das Konto nach der Datei', () => {
    expect(devLoginsFromFiles([{ name: 'qc-login-2.env', text: qcFile('b@x.test') }])).toEqual([
      { label: 'QC 2', email: 'b@x.test', password: 'geheim=mit=gleich' },
    ])
  })

  it('nennt die Datei ohne Nummer „QC 1“', () => {
    expect(devLoginsFromFiles([{ name: 'qc-login.env', text: qcFile('a@x.test') }])[0]?.label).toBe(
      'QC 1',
    )
  })

  it('nimmt QC_LABEL als Namen, wenn die Datei einen hat', () => {
    const text = qcFile('c@x.test', 'QC_LABEL="QC 3 ohne Haushalt"\n')
    expect(devLoginsFromFiles([{ name: 'qc-login-3.env', text }])[0]?.label).toBe(
      'QC 3 ohne Haushalt',
    )
  })

  it('sortiert nach Kontonummer, nicht nach Dateireihenfolge', () => {
    const logins = devLoginsFromFiles([
      { name: 'qc-login-10.env', text: qcFile('j@x.test') },
      { name: 'qc-login-2.env', text: qcFile('b@x.test') },
      { name: 'qc-login.env', text: qcFile('a@x.test') },
    ])
    expect(logins.map((l) => l.label)).toEqual(['QC 1', 'QC 2', 'QC 10'])
  })

  it('übergeht Dateien ohne E-Mail oder Passwort und fremde Dateinamen', () => {
    expect(
      devLoginsFromFiles([
        { name: 'qc-login.env', text: 'QC_EMAIL=a@x.test\n' },
        { name: 'qc-login-2.env', text: 'QC_PASSWORD=p\n' },
        { name: 'supabase-personal.env', text: qcFile('z@x.test') },
        { name: 'qc-login-3.env', text: qcFile('c@x.test') },
      ]).map((l) => l.email),
    ).toEqual(['c@x.test'])
  })

  it('verträgt Windows-Zeilenenden', () => {
    const text = 'QC_EMAIL=a@x.test\r\nQC_PASSWORD=pw\r\n'
    expect(devLoginsFromFiles([{ name: 'qc-login.env', text }])).toEqual([
      { label: 'QC 1', email: 'a@x.test', password: 'pw' },
    ])
  })
})

describe('isDevLoginFile', () => {
  it('erkennt nur die Testkonto-Dateien, keine anderen Geheimnisse daneben', () => {
    expect(isDevLoginFile('qc-login.env')).toBe(true)
    expect(isDevLoginFile('qc-login-3.env')).toBe(true)
    expect(isDevLoginFile('supabase-personal.env')).toBe(false)
    expect(isDevLoginFile('qc-login.env.bak')).toBe(false)
    expect(isDevLoginFile('notes.txt')).toBe(false)
  })
})
