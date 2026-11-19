# ADR-0007: Raster statt freiem Packen — der Stempel ragt, statt Breite zu reservieren

**Status:** Angenommen · 19.11.2026 · ersetzt die Platzreservierung aus
[ADR-0003](0003-der-stapel-haelt-seinen-platz-frei.md)

Die frei gepackte Wand (jeder Zettel so breit wie sein Inhalt, Skyline-Packer) fiel auf dem
Handy auf **eine** Spalte zurück und ließ große leere Flächen: die Fußzeile — reservierter
Platz für den breitesten Abdruck plus 88 px für Stift und Eselsohr — machte jeden Zettel
rund 190 px breit, bei rund 160 px je Spalte auf einem 360-px-Gerät.

Entschieden: Die Wand ist ein **Raster aus gleich breiten Spalten**, auf dem Handy immer zwei,
breiter so viele, wie mit rund 160 px passen. Jeder Zettel kommt in fester, zufälliger
Reihenfolge in die gerade kürzeste Spalte; die drei Gruppen (fällig, täglich, Projekt) fließen
in denselben Spalten weiter. Die Wildheit einer echten Pinnwand tragen allein Versatz und
Neigung, fest an die Aufgabe gebunden. Ein aufgeklappter Zettel teilt die Spalten an seiner
Stelle.

Damit die Fußzeile passt, verliert der Stempel Kasten und Polster — nur noch das Wort — und
**darf in den Stift und über den Papierrand ragen**. Reicht das nicht, wird die Schrift kleiner.
Beides hatte ADR-0003 verworfen (überlappender Stift; Schriftgröße bewusst angehoben). Es gilt
jetzt trotzdem, weil zwei Zettel nebeneinander schwerer wiegen; Barrierefreiheit ist ohnehin
kein Ziel der App. Was bleibt: **Antippen ändert den Stempel nur im eigenen Stempelbereich**,
Stift und Eselsohr behalten ihre Trefffläche — sichtbare Überlappung ja, blockierte Funktion
nein. Und weiterhin bewegt sich beim Stempeln nichts: die Zettelbreite ist die Spaltenbreite,
der Abdruck verändert sie nicht.

## Konsequenzen

- Breitenmessung, „Streifen füllen“, der Skyline-Packer und die Sperrlinien-Logik des
  Aufklappens entfallen; die Herleitungen in `docs/pinnwand-layout.md` zu Wandrand, Messmarge
  und freiem Packen gelten nur noch, soweit das Raster sie übernimmt.
- Die Suche filtert die Wand selbst — im Raster heißt das nur: Zettel ausblenden, Spalten
  rücken nach.
