# Handoff: Ziehgeste und Richtungskranz der Pinnwand

Grundüberholung der Karten-Ziehgeste auf der Pinnwand (`WallView`).

**Stand: Grilling und Prototyp sind durch, die Optik ist vom Nutzer abgenommen
(„Sieht super aus").** Was unter „Entschieden" steht, ist nicht mehr offen. Was
noch fehlt, ist der echte Umbau von `WallDirectionMenu.vue`.

## Der Prototyp

`putzplan_vue/src/views/PrototypeKranzView.vue` plus Route `/proto-kranz` in
`router/index.ts`. **Wegwerfcode**, im Kopf als solcher markiert.

Aufruf (BASE_URL nicht vergessen):
`http://localhost:5173/Household-planner/proto-kranz?v=aether|tafel|skizze|kork`
Leiste unten: Variante, Ziehschwelle 0–90 px, Rand-Streuung, „nur unten".

> **Branch-Lage klären, bevor jemand weiterbaut.** Die Datei liegt auf
> `proto/kartengroesse` und ist dort teilweise committet; der Rest ist
> uncommitted im Worktree. Wohin der Prototyp gehört, hat der Nutzer noch nicht
> entschieden.

## Entschieden

1. **Kein Chip-Kranz mehr um die Karte.** Vollbild-Overlay, absolut, unabhängig
   von der View. Die vier Richtungen sitzen an den vier **Bildschirmrändern**,
   nicht um die Karte. Damit entfallen ersatzlos: die Laufzeitmessung der
   Kärtchen (`extent`), die Klemmlogik, `DECORATION`/`EDGE`, das ganze
   `documentElement.clientWidth`-Thema. Die Gründe im Kopfkommentar von
   `WallDirectionMenu.vue` (Teleport nach `body`, `fixed`,
   `pointer-events: none`, z-index) gelten **unverändert weiter**.

2. **Darstellung: „Randnebel + Pfeil", Handschrift Kreidetafel.** Dunkelgrüner
   Schleier über der App. Randnebel je Richtung als weicher radialer Schein,
   blass (0.3) im Ruhezustand, voll deckend (1.0) wenn die Richtung anliegt.
   Kein Bogen, keine weißen Boxen.

3. **Beschriftung: normale, gut lesbare Schrift**, fett, mit dunkler Kontur
   (`paint-order: stroke`). **Ausdrücklich keine Kreide-/Handschrift** — war
   getestet und wurde wegen Lesbarkeit verworfen. „Aufwand anpassen" wird
   **zweizeilig** gesetzt (`tspan`, um den Randpunkt zentriert); damit ist das
   Anschneiden am rechten Rand gelöst, ohne Drehen oder Kürzen.

4. **Pfeil: kurz, an der Karte, dreht frei zum Finger.** Zwei getrennte
   Aussagen, das ist der Kern: der Pfeil sagt „wohin du ziehst", das Aufleuchten
   am Rand sagt „was beim Loslassen passiert". In der Diagonale steht der Pfeil
   schräg und **nichts** leuchtet — genau richtig. Kein Strahl bis zum Rand
   (läuft ins Leere), kein Rasten auf die vier Achsen.
   Geometrie: 30 px Abstand zur Kartenmitte, Spitze **am** Finger, Schaft endet
   am Ansatz des Dreiecks (sonst ragt er durch die Spitze), unter 48 px
   Gesamtstrecke gar kein Pfeil. In der Tafel-Fassung Schaft 6 px durch einen
   `feTurbulence`-Filter (`#chalk`) — das Kreidige steckt im **Pfeil**, nicht in
   der Schrift.

5. **Belegung je `task_type`.** Für alles außer Projekten gilt: dieselbe
   Bewegung tut weiter dasselbe, die **Grundoption ist immer „nach unten"**.

   **Projekte bekommen gar keinen Kranz.** (Vom Nutzer nach der
   Prototyp-Session entschieden — das ersetzt die dortige Fassung, die auch bei
   Projekten einen reduzierten Kranz vorsah.) Die **Geste bleibt**: nach unten
   ziehen öffnet den `ProjectWorkModal` — dasselbe Fenster wie der Knopf „Am
   Projekt arbeiten" im klassischen Aussehen, mit Eintrag, was gemacht wurde und
   wie viel Aufwand es war. Es gibt bei Projekten kein einfaches „erledigen",
   kein Verschieben; zuweisen läuft über den Edit-Stift am Zettel.

6. **Randbeschwerde links** ist **nicht** über die Ziehschwelle gelöst, sondern
   über das Layout: die Karten bekommen einen **zufälligen** Randabstand
   links/rechts statt überall denselben (im Prototyp 8–34 px).

## Offen für den echten Umbau

- **`COMMIT_DISTANCE` (48)** bleibt oder sinkt. Der Grund für die 48 war laut
  Kommentar „Daumen verdeckt die Beschriftung" — dieser Grund ist mit den
  Randbeschriftungen weg. Der Schwellenregler stand im Prototyp noch bei 48 px,
  abschließend getestet ist das nicht.
- **Schleier-Deckkraft**: aktuell `rgba(26, 46, 38, 0.82)`. Vorbehalt der
  Prototyp-Session: das schluckt die Zettel ziemlich, ~0.6 wäre besser. Der
  Nutzer hat sich dazu nicht geäußert.
- **Seitliche Richtungen**: im Prototyp Nebel-**Ellipsen**, das trägt. Die
  Rechteck-Bahnen der Fassungen `kork`/`skizze` liefen über die volle Höhe und
  wirkten wie Streifen — nicht übernehmen.
- **Nicht vom Prototypen abgedeckt**: der Klick-Wächter, das Scroll-Verhalten
  und `isControl` aus `useDirectionPress.ts` (der Prototyp hat eine
  vereinfachte Geste). Die Logik dort **bleibt wie sie ist**, nur der Anker wird
  nicht mehr gebraucht.

## Kollision mit dem Karten-Redesign

Aus `HANDOFF-kartengroesse.md` (Prototyp abgenommen): der **Bearbeiten-Stift
sitzt jetzt in der unteren Ecke des Zettels**, direkt neben dem Eselsohr, beide
44×44 px. Das ist dieselbe Ecke, in der abgerissen wird und aus der die Geste
startet. Wer die Geste umbaut, muss den Stift mitdenken — `isControl` in
`useDirectionPress.ts` und der Wächter `.closest('.ear, .mini, .edit')` in
`WallNote.vue` entscheiden dort, was Geste ist und was Knopf.

## Verifikation

Manuell über die laufende App bei 420×860, per synthetischen `PointerEvent`s.
`vue-tsc` sauber. Kein Test-Framework → `docs/testing.md`.

## Suggested skills

- `implement` bzw. `tdd` fallen hier auf manuelle Verifikation zurück (siehe
  `CLAUDE.md`).
- `code-review` nach dem Umbau, Achse Spec: gegen dieses Dokument.
