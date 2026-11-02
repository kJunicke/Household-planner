# Putzplan

Vue 3 + Supabase, PWA für einen Zwei-Personen-Haushalt. App in `putzplan_vue/`.
Push auf `main` deployt sofort (GitHub Pages). Umgebung: Linux Mint, VS Code.

## Regeln

- **Mobile first**, kleinster Viewport zuerst. Jedes Feature muss auf Android **und** iOS
  funktionieren. Barrierefreiheit und Tastaturbedienung sind kein Ziel — Gesten dürfen der
  einzige Weg sein.
- **UI wird manuell geprüft**, im Browser über die Chrome-Erweiterung — kein UI-Test-Framework,
  bewusst. Messfallen im ferngesteuerten Tab: [docs/testing.md](docs/testing.md).
- **Reine Logik unter `src/lib` hat vitest-Tests** (`npm test` in `putzplan_vue/`, Datei
  `*.test.ts` neben dem Modul, ohne DOM). Neue reine Logik bekommt Tests. Grüne Tests ersetzen
  keinen Blick aufs Gerät.
- **Jede Codeänderung prüft ein zweiter Agent (QC)** — auch die einzeilige, auch die der
  Hauptinstanz, auch der Formatierungs-Commit. Wer baut, prüft nicht. Der QC macht ein
  Code-Review mit `/code-review` **und** sieht sich bei sichtbaren Änderungen das Aussehen
  an. (05.09.2026: „ist doch nur CSS“ ohne QC → abgeschnittene Stempelränder auf 261 von
  282 Lagen, am Gerät in Minuten gesehen; die eigene Messung fragte „wie breit“, nicht
  „sieht es ganz aus“.)
- **Eine Messung ist kein Blick.** Geometrie messen und Aussehen ansehen sind zwei Aufträge;
  beide vergeben.
- Vor jedem Push auf `main`: `npm test` und `npm run build` in `putzplan_vue/`. Nur eigene Pfade stagen.
- Nennt der User einen Skill, der zu fehlen scheint: erst danach suchen (`.claude/skills/`),
  dann entscheiden.

## Kommentare

- Ein Kommentar sagt **warum so** oder **was bricht, wenn man es ändert**. Was der Code tut, sagt der Code.
- Nicht in den Code: Ticketnummern, Etappen, QC-Runden, Daten, „vorher/früher/seit/nicht mehr“,
  Messprotokolle — das gehört in Commit oder Ticket. Messwerte nur als Ergebnis, ggf. mit Verweis.
- Verweise auf ADR, `CONTEXT.md` und `docs/` sind erwünscht. Lange Herleitungen dorthin, nicht in den Code.
- Fallen-Warnungen (Messvertrag von `relayout`, iOS/WebKit) bleiben wörtlich stehen.

## Wissen

- Vor dem Erkunden lesen: [CONTEXT.md](CONTEXT.md) und die ADRs des Bereichs.
- Vokabular: Begriffe aus [CONTEXT.md](CONTEXT.md), keine Synonyme; fehlt einer, ist das
  ein Befund. Wo Skills `GLOSSARY.md` sagen, ist diese Datei gemeint.
- Entscheidungen: [docs/adr/](docs/adr/). Ein ADR gilt, bis er ausdrücklich zurückgezogen ist;
  wer ihm widerspricht, schreibt das in den ADR. Wer eine Festlegung ersetzt, liest vorher,
  was in der ersetzten Quelle wirklich steht.
- Getrackte Dateien verlinken nicht in `.scratch/` — Wesentliches wird übernommen.

## Tracker

Lokal unter `.scratch/` (gitignored); Ordner, Pflichtzeilen und `Status:`-Werte:
[docs/agents/tracker.md](docs/agents/tracker.md).

- Backlog: `.scratch/backlog/` (Einstieg `README.md`). Vorhaben: `.scratch/<slug>/`.
- Abgeschlossenes Vorhaben → ganzer Ordner nach `.scratch/archive/`. Das Archiv nur auf
  Verweis lesen.
