# Pinnwand-Layout — Herleitungen

Begründungen für Zahlen und Entscheidungen der Wand, die im Code nur als Ergebnis stehen.
Messfallen beim Nachmessen: [testing.md](testing.md). Warum jeder Zettel Platz für den ganzen
Abdruckstapel freihält: [ADR-0003](adr/0003-der-stapel-haelt-seinen-platz-frei.md).

### Wandrand `EDGE` (WallView.vue)

- Fest 12 px, nicht anteilig. Der Rand ist für den Daumen da, und der wächst nicht mit dem
  Bildschirm. 5 % gäben dem 412-px-Gerät 19,6 px und dem 360-px-Gerät 17,0 px — für den Daumen
  gleich —, kosteten das 360-px-Gerät aber +22,9 % Wandhöhe, das 390-px-Gerät +3,6 %. Ein
  Prozentsatz gibt dem schmalsten Gerät den kleinsten Rand und die größten Kosten.
- Kosten des Rands allein (Browser, 86 Zettel): 390 px +0,66 %, 375 px +5,77 %, 360 px +17,47 %
  Wandhöhe. Absolute Wandhöhen im Browser messen; eine Node-Simulation mit Baseline-Breiten liegt
  rund 2 % daneben und taugt nur für Vorher-Nachher-Vergleiche.
- 12 ist ein Kompromiss und bewusst nicht auf eine Höhenklippe optimiert: bei
  `usableWidth ≈ 324` kostet 1 px +8,3 % Höhe. Ein knapp darunter geparkter Rand wäre scheinbar
  gratis und bräche still, sobald sich ein Titel ändert — die Klippe gehört dem Bestand, nicht
  dem Code.
- Bezugsgröße ist `wall.clientWidth`, nie `window.innerWidth`.

### Messmarge `MEASURE_SAFETY` (WallView.vue)

- 4 px Zuschlag auf jede gemessene Breite. Deckt nur den Rundungsrest, mit dem der Browser
  Rahmen, Innenabstand und Textlauf unabhängig voneinander auflöst. Rahmen und Innenabstand von
  `.zettel` zählt `chromeWidth` exakt dazu; die Marge ersetzt das nicht. Fehlt `chromeWidth`,
  stehen Fußzeilen-gebundene Zettel konstant um ~14,7 px über.
- Ergebnis bei 4 px (Wandbreite 370, 60 Zettel): die Fußzeilen-Untergrenze hält überall
  ≥ 4,00 px Luft; Zettel mit voller `natural`-Breite haben 4,00…4,86 px (Marge plus
  `Math.ceil`-Rest). Eine ältere Messung mit 1 px Marge (25 Zettel, noch **ohne** `chromeWidth`,
  also ein anderes Maß und nicht mit dem obigen vergleichbar) fand 0,50 px knappste Restluft —
  zu wenig, als dass Schrift- oder Polsteränderungen folgenlos blieben.
- Ein Zettel kann breiter sein, als sein Titel verlangt: `minimum` sticht den 45-%-Deckel, und in
  der Fassung mit Punkten oben bindet oft `titleMinimum + cornerExtra`.
- Die Marge geht immer nach oben: ein paar Pixel Breite sieht niemand, ein fehlendes halbes Pixel
  bricht den Titel um.

### Stempelstapel: Zellbreite, Zentrierung, kein Halo-Zuschlag (WallNote.vue)

Alle drei Lagen liegen in derselben Grid-Zelle (`grid-area: 1 / 1`); die Zelle ist so breit wie
die breiteste Lage, und **jede** Lage steht über `min-width: 100%` auf Zellbreite und zentriert
ihr Wort (`text-align: center` an `.stamp-layer`, nicht nur an der obersten).

- **Zellbreite für jede Lage:** Steht sie nur an der obersten, fällt eine Lage beim Überstempeln
  auf ihre Textbreite zurück (rund 78 → 40 px) — der Abdruck sieht geschrumpft aus.
- **Zentrierung in jeder Lage:** Ohne sie klebt das Wort im breiteren Kasten links und springt
  beim Überstempeln, während der Kasten stehen bleibt (bis rund 25 px). Wer prüfen will, ob sich
  ein Text bewegt, vergleicht seine Position vor und nach dem Tipp — nicht
  `getComputedStyle().textAlign`; das misst eine Eigenschaft, keine Bewegung.
- **Kein seitlicher Halo-Zuschlag:** Bei Lagen auf Zellbreite überdeckt ein Zuschlag in 261 von
  282 Lagen den Rahmen der Lage darunter (bis rund 10 px) — die Abdrücke sehen seitlich
  abgeschnitten aus. Ohne ihn liegt in 17 von 282 Fällen höchstens rund 4 px Kastenrand der
  unteren Lage frei, kaum je ein Buchstabe. Entschieden für „ohne“.
- **Halo deckend, Halo an der Zelle:** Mit durchsichtiger oberster Lage scheinen die unteren
  Wörter durch die Buchstaben; ein Halo nur auf Wortbreite lässt längere Grundabdrücke
  (Projektsprüche) seitlich herausschauen.
- **Nur in Chrome gemessen:** `min-width: 100%` an einem Grid-Element mit inhaltsabhängiger Spur
  ist eine zyklische Prozentangabe; laut Spezifikation bläht sie die Spur nicht auf, WebKit ist
  hier für Abweichungen bekannt.

Zahlen: Wand mit 94 Zetteln × 3 Stufen, Chrome.

### Freies Packen vor einer Sperrlinie (wallLayout.ts, `packFree`)

Packt die Wand oberhalb einer Vorgabe (ein aufgeklappter Zettel bleibt liegen), wählt sie für
jeden Zettel die Spalte, deren erreichbare Oberkante seiner alten (`previousTop`) am nächsten
liegt. *Welcher* Zettel zuerst gesetzt wird, bleibt dagegen gierig nach niedrigster Oberkante.
Verworfen wurde, die Zettel in der Reihenfolge ihrer alten Oberkanten zu setzen: das bewegte im
Prüfstand mehr Zettel über der Vorgabe (2,4 statt 0,9 je Aufklappen), weil der Packer keine
x-Vorgeschichte kennt und die Zettel seitlich driften — die alte Anordnung entsteht so trotzdem
nicht.
