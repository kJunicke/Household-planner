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
- **Punkte-Sticker oben** genau bei Zetteln mit Unteraufgaben: die Fußzeile hat neben Stift und
  Eselsohr (88 px) nur rund 50 px, genug für Sticker und Stempelbereich oder für das
  Unteraufgaben-Zeichen.

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
**Stempelbereich**: ein Flex-Kind der Fußzeile, 44 px breit und so hoch wie die Griffzeile,
das sich den Rest bis zum Stift nimmt und in einer schmalen Spalte schrumpft. Die Lagen liegen
absolut darin, am linken Rand verankert, und ragen nach rechts.

- **Links verankert, nicht zentriert:** links steht der Punkte-Sticker, und dorthin darf
  kein Abdruck ragen; nach rechts liegen Stift und Eselsohr, in die er ragen darf.
- **Trefffläche = Stempelbereich:** die Lagen tragen `pointer-events: none`. Stift und
  Eselsohr stehen im DOM später und liegen über den Lagen, auch für den Finger.
- **Nur gestempelte Lagen im DOM:** die unsichtbaren Platzhalter für die Breite
  (ADR-0003) entfallen.
- **Halo bleibt:** die oberste Lage ist deckend auf Papierfarbe, sonst scheinen die unteren
  Wörter durch ihre Buchstaben. Ohne Polster sitzt er knapp am Wort.
