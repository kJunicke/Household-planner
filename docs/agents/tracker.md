# Tracker: lokales Markdown unter `.scratch/`

Issues und Specs liegen als Markdown-Dateien in `.scratch/` (gitignored, existiert nur im
Hauptbaum, nicht in Worktrees oder Clones). Wo ein Skill „Issue-Tracker“ oder „Label“ sagt,
ist das hier Beschriebene gemeint.

## Ordner

- **Backlog** — `.scratch/backlog/issues/NN-<slug>.md`: alles, was noch kein Vorhaben ist.
  Ein globaler Nummernkreis; neue Tickets bekommen die nächste freie Nummer, vergebene
  werden nie neu belegt (Lücken sind normal). Einstieg und Übersicht: `.scratch/backlog/README.md`.
- **Vorhaben** — `.scratch/<slug>/`: Spec in `spec.md`, Tickets als `issues/NN-<slug>.md`
  (eine Datei pro Ticket, ab `01` in Abhängigkeitsreihenfolge, `Blocked by:` nennt die
  Blocker). Ein Vorhaben darf statt eigener Tickets Backlog-Nummern referenzieren.
- **Archiv** — `.scratch/archive/<slug>/`: abgeschlossene Vorhaben, ganzer Ordner.
  **Abgeschlossen heißt: vom Lead abgenommen** — QC grün, nach `main` gemergt, Tickets
  `erledigt` mit Abnahmenotiz. Was nur der Maintainer am Gerät prüfen kann, wird vor dem
  Archivieren ein Backlog-Ticket `Status: ready-for-human` mit Link auf die Testanleitung.

„In den Tracker schreiben“ heißt: Datei an der passenden Stelle anlegen. „Ticket holen“
heißt: die genannte Datei lesen; der User nennt meist Pfad oder Nummer.

## Kopf jedes Tickets

```
# NN — Titel

Status: needs-triage
Kategorie: bug | enhancement
Vorhaben: <slug> | —
Quelle: <woher der Befund stammt>
```

Alle vier Zeilen sind Pflicht. Kommentare und Verlauf kommen ans Dateiende unter
`## Comments`.

## Status-Werte

| Status            | Bedeutung                                       |
| ----------------- | ----------------------------------------------- |
| `needs-triage`    | Maintainer muss es bewerten                     |
| `needs-info`      | wartet auf mehr Information                     |
| `ready-for-agent` | vollständig beschrieben, ein Agent kann bauen   |
| `ready-for-human` | braucht einen Menschen (z. B. Gerätetest)       |
| `wontfix`         | wird nicht gebaut                               |
| `erledigt`        | gebaut, geprüft und vom Lead abgenommen         |

`erledigt` gibt es, weil Markdown-Tickets nicht geschlossen werden: ohne eigenen Wert
stünde ein abgenommenes Ticket weiter auf `ready-for-agent`. `wontfix` heißt das Gegenteil.
Ein `erledigt`-Ticket trägt den Commit-Hash und eine **Abnahmenotiz**: was belegt
funktioniert (mit Zahlen), welche Restbefunde bewusst stehen bleiben, was nur am Gerät zu
prüfen ist. Prüfkästchen werden nur abgehakt, wenn sie belegt sind.
