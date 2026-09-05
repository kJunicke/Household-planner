# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

Because this repo uses a local-markdown tracker (see `issue-tracker.md`), a "label" is the value of the `Status:` line near the top of an issue file — e.g. `Status: ready-for-agent`.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |
| —                          | `erledigt`           | Gebaut, geprüft und abgenommen           |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## `erledigt` — das sechste Label

Die fünf Rollen von Matt Pocock beschreiben **Triage vor der Arbeit**: sie beantworten, wer
als Nächstes an ein Issue muss. Was danach kommt, kennen sie nicht — in einem
GitHub-Tracker schließt man das Issue einfach.

Hier gibt es kein Schließen: Issues sind Markdown-Dateien, und ein abgenommenes Ticket
bleibt sichtbar liegen, bis das ganze Vorhaben nach `.scratch/archive/` wandert. Ohne
eigenes Label steht dort weiter `ready-for-agent`, und beim nächsten Durchsehen greift
jemand daneben.

`wontfix` ist dafür **nicht** zu verwenden — es heißt „wird nicht gebaut", das Gegenteil.
Ein abgenommenes Ticket trägt `erledigt`, den Commit-Hash und eine **Abnahmenotiz**: was
belegt funktioniert, mit welchen Zahlen, welche Restbefunde bewusst stehen bleiben und was
nur am Gerät zu prüfen ist. Prüfschritt-Kästchen werden nur abgehakt, wenn sie wirklich
belegt sind — ein Haken aus Höflichkeit ist schlimmer als ein offenes Kästchen.
