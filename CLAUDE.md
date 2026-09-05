- Du bist auf Linux Mint in VScode
- **Tests sind grundsätzlich manuell.** Es gibt bewusst kein Test-Framework, Tests immer im Browser mit Chrome Erweiterung. Messfallen im ferngesteuerten Tab → [docs/testing.md](docs/testing.md)

- Entwicklung ist immer Mobile First. Auf kleinen Viewport optimieren.
- Alle features müssen auf Android und IOS funktionieren
- wenn ein invocter skill vom user vermeintlich nicht existiert suche nach ihm, bevor du entscheidest, dass dieser nicht existiert.
- **Jede Änderung am Code wird von einem zweiten Agenten geprüft — immer, auch die
  einzeilige.** Wer baut, prüft nicht. Das gilt ausdrücklich auch dann, wenn die
  Hauptinstanz selbst gebaut hat: dann geht sie trotzdem an einen unabhängigen QC.
  Am 05.09.2026 hat genau diese Ausnahme („ist doch nur CSS") einen Fehler
  durchgelassen, den der Maintainer in Minuten am Gerät sah — abgeschnittene
  Stempelränder auf 261 von 282 Lagen. Die eigene Messung hatte ihn nicht gefunden,
  weil sie „wie breit" fragte und nicht „sieht es ganz aus".
- **Eine Messung ist kein Blick.** Wer Geometrie misst, hat nicht geprüft, ob etwas
  richtig aussieht. Beides beauftragen.

## Agent skills

- **Issue tracker**: Issues und Specs als Markdown unter `.scratch/<feature-slug>/`
  (gitignored) → [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)
  - active dev operations are in .scratch and completed one are in .scratch/archive
  - whenever a dev operation is completed move the entire folder into /archive
- **Triage labels**: die fünf kanonischen Rollen als `Status:`-Zeile im Issue-File
  → [docs/agents/triage-labels.md](docs/agents/triage-labels.md)
- **Domain docs**: single-context, `CONTEXT.md` + `docs/adr/` im Root
  → [docs/agents/domain.md](docs/agents/domain.md)
