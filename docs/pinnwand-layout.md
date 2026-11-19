# Pinnwand-Layout — Herleitungen

Begründungen für Zahlen und Entscheidungen der Wand, die im Code nur als Ergebnis stehen.
Messfallen beim Nachmessen: [testing.md](testing.md). Warum die Wand ein Raster ist und der
Abdruckstapel keinen Platz mehr freihält, sondern in Stift und Papierrand ragt:
[ADR-0007](adr/0007-raster-statt-freiem-packen.md).

### Raster (wallLayout.ts, `wallGrid`, `layoutWall`)

- **Spaltenzahl** = nutzbare Wandbreite / 160, abgerundet, mindestens zwei. Nutzbar ist
  `wall.clientWidth − 2 × EDGE`; auf dem Handy (Fenster 320…412 px) sind das 276…368 px,
  also immer zwei Spalten von 134…180 px. Ab rund 524 px Fenster drei, auf dem Tablet
  (768 px) vier.
- **Spaltenabstand 8 px.** Der waagerechte Versatz je Zettel ist ±3 px; zwei Nachbarn laufen
  höchstens 6 px aufeinander zu, 2 px Luft bleiben (am ungedrehten Kasten; die Neigung darf
  überlappen, der linke Zettel liegt dann oben).
- **Reihenfolge:** Gruppe (fällig → täglich → Projekt, in der Suche danach die losen
  Zettel), innerhalb der Gruppe der Hash der Kennung. Jeder Zettel kommt in die gerade
  kürzeste Spalte, bei Gleichstand die linke. Die Gruppen fließen in denselben Spalten
  weiter: ein täglicher Zettel kann neben einem fälligen höher hängen, innerhalb einer
  Spalte aber nie darüber.
- **Gruppe bestimmt das obere Polster** (`WallGroup`): jede bringt ihre Befestigung mit,
  die losen Zettel ihre Nadelstelle. Ein Zettel, den keine Liste kennt (`unknown`),
  bekommt das Polster aller Befestigungen.
- **Wildheit:** Versatz (±3 px waagerecht, 4…15 px Luft darüber) und Neigung (±3°) hängen
  allein an der Kennung. Kommt ein Zettel dazu oder geht, rücken andere in andere Spalten,
  behalten aber Versatz und Neigung.
- **Breite = Spaltenbreite.** Nichts am Inhalt verbreitert einen Zettel: ein langer Titel bricht
  an Wortgrenzen um, ein einzelnes überlanges Wort endet mit Ellipse, der Abdruck ragt. Darum
  verrutscht beim Stempeln nichts. Die Wand setzt erst allen Zetteln die Breite und misst dann
  alle Höhen — ein erzwungenes Layout je Lauf.
- **Punkte-Sticker und Unteraufgaben-Zeichen oben rechts**, an jedem Zettel. Die Fußzeile gehört
  allein dem Stempelbereich: auf 360 px ist der Zettel innen 136,5 px breit, Stift und
  Eselsohr nehmen 88 px, es bleiben 48,5 px. Mit dem Sticker (34 px) davor waren es 3–9 px —
  kein Fingerziel (Browser-QC vom 19.11.2026).
- **Der Titel umfließt die Ecke:** neben ihr stehen nur seine ersten Zeilen verkürzt, darunter
  läuft er über die volle Breite. Ein Wort, das nicht neben die Ecke passt, rutscht unter sie,
  statt mit Ellipse zu enden. Dafür trägt `.title` `overflow: clip` statt `hidden` (das öffnete
  einen eigenen Formatierungskontext, und der Titel stünde in einer schmalen Spalte daneben).

### Aufklappen teilt die Spalten (`layoutWall`, `expanded`)

Der aufgeklappte Zettel liegt wandbreit, ohne Versatz, 8 px unter der tiefsten Spalte; danach
beginnen alle Spalten 8 px unter ihm neu. Weil das Raster der Reihe nach legt, bleibt alles vor
ihm, wo es war, und Zuklappen stellt den vorigen Zustand her — es gibt keinen Zustand, den die
Wand sich merken müsste. Mehrere aufgeklappte Zettel teilen je an ihrer Stelle.

Das obere Polster für die Befestigungen wird bei Spaltenbreite gerechnet, nicht wandbreit: die
Klammern eines aufgeklappten Projekts hätten den längeren Hebel und schöben sonst die ganze
Wand, auch die Zettel vor ihm. Liegt ein aufgeklappter Zettel ganz oben, bekommt er sein eigenes
Polster.

### Wandrand `EDGE` (WallView.vue)

- Fest 12 px, nicht anteilig. Der Rand ist für den Daumen da, und der wächst nicht mit dem
  Bildschirm. 5 % gäben dem 412-px-Gerät 19,6 px und dem 360-px-Gerät 17,0 px — für den Daumen
  gleich —, nähmen aber dem schmalsten Gerät am meisten Spaltenbreite.
- Bezugsgröße ist `wall.clientWidth`, nie `window.innerWidth`.

### Stempelstapel: Stempelbereich und ragende Abdrücke (WallNote.vue)

Der Abdruck ist nur das Wort, ohne Kasten und Polster (ADR-0007). `.due-stamp` ist der
**Stempelbereich**: das einzige Kind der Fußzeile, so hoch wie die Griffzeile und so breit wie
alles links vom Stift — 48,5 px auf 360 px, 63,5 px auf 390 px, 74,5 px auf 412 px, 28 px auf
dem 320-px-Gerät. Die Lagen liegen absolut darin, am linken Rand verankert, und ragen nach rechts.

- **Links verankert, nicht zentriert:** links ist die Papierkante; nach rechts liegen Stift und
  Eselsohr, in die ein langer Abdruck ragen darf. NEU, FÄLLIG und BEDARF liegen auf 360 px
  ganz im Stempelbereich, WICHTIG und DRINGEND ragen ein Stück, der längste Projektspruch
  (IRGENDWANN, 87 px) über den Stift bis kurz vor das Eselsohr.
- **Trefffläche = Stempelbereich:** die Lagen tragen `pointer-events: none`. Stift und
  Eselsohr stehen im DOM später und liegen über den Lagen, auch für den Finger.
- **Nur gestempelte Lagen im DOM:** die unsichtbaren Platzhalter für die Breite
  (ADR-0003) entfallen.
- **Halo bleibt:** die oberste Lage ist deckend auf Papierfarbe, sonst scheinen die unteren
  Wörter durch ihre Buchstaben. Ohne Polster und mit `line-height: 1` sitzt er knapp am Wort.
- **Senkrecht gefächert** (`stampStackOf`): Lage 0 liegt 7 ± 1 px zur einen Seite der Mitte,
  Lage 1 zur anderen, Lage 2 ± 1,5 px um die Mitte. Je zwei Lagen liegen so mindestens 4,5 px
  auseinander, und von jeder unteren lugt ein Streifen unter dem Halo hervor. Mit ±5,5 px
  freiem Zufall je Lage lagen zwei oft deckungsgleich, lesbar war nur das oberste Wort
  (Browser-QC vom 19.11.2026). Die unteren Lagen stehen mit 55 % und 75 % Deckkraft.
