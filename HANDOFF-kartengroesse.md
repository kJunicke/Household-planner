# Handoff: Lesbarkeit der Pinnwand-Karten

**Stand: Prototyp durch, vom Nutzer abgenommen („sieht gut aus").** Was folgt,
ist Ergebnis, nicht Vorschlag. Offen ist nur noch der saubere Einbau.

## Branch und Ansehen

`proto/kartengroesse`, 6 Commits, zuletzt `96e3846`. `main` ist unberührt.
**Wegwerfcode — nicht mergen**; der Nutzer entscheidet, was in die echte
Umsetzung geht.

Ansehen: `http://localhost:5173/Household-planner/` (Dev-Server läuft,
Basispfad `/Household-planner/`). Bedienfeld unten, Einstellung steckt in
`?proto=…`.

> Beim Testen: das Browserfenster geht nicht unter ~520 CSS-px. Schmalen Fall
> simulieren mit `#app{width:390px}` + `resize`-Event, oder DevTools-Gerätemodus.

## Ergebnis

Die ursprüngliche Frage („Schrift größer vs. `MIN_NOTE_WIDTH` höher") war zu eng
gestellt. Der Zettel wurde stattdessen umgebaut.

1. **Schrift ×1,2** (Titel 13 → 15,6 px). Recherche: Material 3 Body-Large
   16 sp, Apple Body 17 pt, Material Label-Small 11 sp als Untergrenze — der
   Ist-Zustand lag mit 13/10 px unter allem davon.
2. **Die Fußzeile ist die Griffzeile**: links Punkte/Fälligkeit, rechts Stift
   und Eselsohr nebeneinander, beide 44×44 px (Apple HIG 44, Material 48). Der
   Titel bekommt dadurch die ganze obere Kante.
3. **Der `clip-path`-Ausschnitt im Eselsohr entfällt ersatzlos** — er existierte
   nur, damit der Stift oben rechts nicht darunter verschwand. Trefferfläche
   wächst von ~1500 auf ~1936 px². Die vermessene Ausschnitt-Geometrie samt
   Kommentarrechnung in `WallNote.vue` fällt mit weg.
4. **Punkte als aufgeklebter Sticker, die Form trägt den Wert**: Kreis 1,
   Quadrat 2, Sechseck 3, Wappen 4, goldener Stern 5. Funktioniert auch bei
   Farbenblindheit, weil die Silhouette trägt und nicht nur die Farbe.
5. **Unteraufgaben haben jetzt immer ein Zeichen** (angeklammerter Stapel,
   gestrichelter Rand, echter Knopf). Bisher verriet nur die Fortschrittszahl
   ihre Existenz — die fehlt bei `daily` und reinen Checklisten völlig, dort war
   das Aufklappen unsichtbar.
6. **Punkte/Rückstand wandern nach oben rechts**, aber nur wenn die Fußzeile
   sonst breiter als der Titel wäre. Die Wand misst das je Zettel (Titel und
   Fußzeile auf `max-content` während `zettel--measuring`), setzt es als Prop,
   der Titel fließt per `float` um die Ecke.
7. **Dringlichkeit**: farbiger **Ring** um die Reißzwecke (die Füllung bleibt
   die Personenfarbe!) plus Gummistempel NIE/FÄLLIG/HEUTE als Element **im
   Fluss** der Fußzeile.
8. **Zettel an der linken Wandkante werden eingerückt**, deterministisch
   0…26 px aus `fnv1a(task_id + "#indent")`, nur bei `bestColumn === 0`. Vorher
   standen fast alle exakt auf `x = 0`; der Versatz von ±5 px war zu klein, um
   die Linie zu brechen.

## Zahlen

Zettel 110–245 px breit, ~80 px hoch (vorher ~51). Zwei nebeneinander passen auf
374 px Wand weiterhin. Zwischenzeitlich war die Paar-Packung weg (Zettel
168–208 px), weil die Fußzeile mit Punkten drin die Mindestbreite hochtrieb —
Punkt 6 hat sie zurückgeholt.

**`MIN_NOTE_WIDTH` ist dadurch praktisch wirkungslos geworden: die Fußzeile
setzt die Untergrenze.**

## Berührte Dateien

`src/lib/wallProto.ts` (neu), `src/components/WallProtoBar.vue` (neu),
`src/components/WallNote.vue`, `src/views/WallView.vue`,
`src/lib/wallLayout.ts` (`MIN_NOTE_WIDTH` ist `let` + `setMinNoteWidth`, neu
`setLeftIndent`/`indentOf`).

## Beim sauberen Einbau beachten

- `.stamp` ist schon vergeben (`WallDoneList` nennt sein Datum so) — hier heißt
  er `.due-stamp`.
- Eine per `classList` gesetzte Klasse überlebt kein Vue-Update (`patchClass`
  setzt `className` neu). `zettel--meta-top` hängt deshalb an einem Prop, das
  die Wand nach jedem Messlauf setzt.
- Die Stickerfarben sind geraten (blass/blau/grün/orange/gold) und konkurrieren
  mit den Personenfarben am Zettelrand — passt zur noch offenen kuratierten
  Palette.
- **Ungeprüft**: ein Zettel, der gleichzeitig überfällig ist **und**
  Unteraufgaben hat (kommt in den Testdaten nicht vor). Stempel und Stapel
  stehen dann dicht nebeneinander in der Fußzeile.
- **Offen**: Punktwerte > 5 (Bonus-Unteraufgaben) fallen alle auf den Stern;
  eine sechste Stufe (Rosette) wäre denkbar.

## Kollisionen mit anderen Strängen

- **Ziehgeste** (`HANDOFF-ziehgeste.md`): der Stift sitzt jetzt in **derselben
  unteren Ecke**, in der abgerissen wird und der Richtungskranz erscheinen soll.
  Muss beim Umbau der Geste zusammen gedacht werden.
- **Sortierlogik**: in einer laufenden Grilling-Session wurde entschieden, dass
  die Skyline innerhalb der drei Gruppen (fällig → täglich → Projekt) **frei**
  packen darf. Damit verliert die Paar-Erzwingung in `planNoteWidths` ihren
  Zweck — Punkt 6 oben hat sie zwar gerettet, aber möglicherweise für eine
  Mechanik, die ohnehin gestrichen wird.

## Verifikation

Manuell über die laufende App. Kein Test-Framework → `docs/testing.md`.
