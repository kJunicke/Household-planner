- Du bist auf Linux Mint in VScode
- **Tests sind grundsätzlich manuell.** Es gibt bewusst kein Test-Framework, Tests immer im Browser mit Chrome Erweiterung. Messfallen im ferngesteuerten Tab → [docs/testing.md](docs/testing.md)

- Entwicklung ist immer Mobile First. Auf kleinen Viewport optimieren.
- wenn ein invokter skill vom user vermeintlich nicht existiert suche nach ihm, bevor du entscheidest, dass dieser nicht existiert.

## Agent skills

- **Issue tracker**: Issues und Specs als Markdown unter `.scratch/<feature-slug>/`
  (gitignored) → [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)
  - active dev operations are in .scratch and completed one are in .scratch/archive
  - whenever a dev operation is completed move the entire folder into /archive
- **Triage labels**: die fünf kanonischen Rollen als `Status:`-Zeile im Issue-File
  → [docs/agents/triage-labels.md](docs/agents/triage-labels.md)
- **Domain docs**: single-context, `CONTEXT.md` + `docs/adr/` im Root
  → [docs/agents/domain.md](docs/agents/domain.md)
