# ADR-0003: Der Abdruckstapel hält seinen Platz frei — und die Wand wird dafür länger

**Status:** Angenommen · 02.09.2026

## Kontext

Seit dem Überstempeln kann der Stempel eines Zettels drei Abdrücke tragen, und sie sind
verschieden breit: `NEU` misst rund 39 px, `DRINGEND` **77,87 px** (nachgemessen am
05.09.2026; hier stand bis dahin „rund 79"). Ein Zettel, der hochgestempelt
wird, bräuchte also plötzlich rund 40 px mehr Platz in seiner Fußzeile.

Diese 40 px muss irgendwer bezahlen, und es gibt genau zwei Zahlstellen. Der Grund ist
[ADR-0002](0002-stempel-ordnet-nicht.md): **der Stempel ordnet nicht**, die Wand packt nach
einem Tipp bewusst nicht neu (`layoutSignature` kennt `emphasis_level` nicht). Wüchse die
Fußzeile beim Stempeln, schöbe sich das Layout unter dem Finger weg — oder bliebe, schlimmer,
falsch gepackt stehen, mit überlappenden Zetteln.

## Entscheidung

**Jeder Zettel hält den Platz für alle drei Abdrücke frei, auch wenn er nie gestempelt wird.**

Alle drei Lagen stehen immer im DOM; noch nicht gesetzte tragen `visibility: hidden` —
unsichtbar, aber im Grid weiterhin vermessen. Der Stapel hat seinen Platz damit von Anfang an,
unabhängig von der Stufe.

**Der Preis ist gemessen und ausdrücklich in Kauf genommen:** die Wand wird bei 390 px
Fensterbreite **37 % länger** und bei 412 px **55 %** (7387,70 → 10129,01 px bzw. 6554,07 →
10129,01 px, am damaligen Bestand von 93 Zetteln). Bei 412 px kippt sie dadurch von zwei
Spalten auf eine.

> **Nachtrag 05.09.2026 — „echte Zettel" waren es nicht.** Der Bestand, an dem hier
> gemessen wurde, besteht zu über vier Fünfteln aus Testaufgaben, die frühere Prüfläufe in
> die Produktionsdatenbank geschrieben und nie weggeräumt haben (am 05.09. gezählt: **79
> von 94** Zetteln tragen eine QC-Kennung, von den übrigen 15 sind weitere Altlasten). Die
> **Mechanik** der Zahlen bleibt gültig — die Wandhöhe entsteht aus Zettelbreiten, und die
> Breite hängt am Stempel, nicht am Titel. Der Bestand ist aber keine Stichprobe des
> echten Haushalts, und die Prozentsätze oben sind auf einer Wand entstanden, die so nie
> jemandem gehört hat. Wer sie nachmisst, misst zuerst nach, worauf.

## Alternativen

**Die Lagen absolut über den Grundabdruck legen, ohne Platz zu reservieren.** Gebaut und
gemessen. Sie hält die Wandhöhe **exakt** auf dem stempellosen Stand, bewegt beim Stempeln
ebenfalls keinen Pixel und schluckt keinen Klick. Sie scheitert an einer Arithmetik, die mit
der Optik nichts zu tun hat: die Breite eines Zettels wird aus dem **Grundabdruck** plus den
88 px für Stift und Eselsohr gerechnet. Auf einem schmalen Zettel (`NEU`, Zettel 156 px)
beginnt der Stift damit unmittelbar rechts vom Grundabdruck — für die 77,87 px von `DRINGEND` ist
dort kein Platz, egal wie man die Lage verankert; nach links sind es nur 9 px bis zur
Papierkante. Gemessen lag auf **36 von 93** Zetteln die Stiftspitze auf dem Wort `DRINGEND`.
Verworfen, weil „hier wird der Abdruck lesbar" der Zweck des Stapels ist.

**Den Stempel schmaler setzen.** Gemessen, bringt **6 px**. Sperrsatz und Polster sind
verhandelbar, die Schriftgröße nicht: sie wurde beim Karten-Redesign bewusst angehoben, weil
13/10 px unter jeder Zugänglichkeitsrichtlinie lagen. Verworfen.

**Den Punkte-Sticker aus der Fußzeile nach oben rechts schieben** (`zettel--meta-top`), was
40 px spart. An der echten Wand gegenstandslos: der Zweig **greift bereits bei 91 von 93
Zetteln**. Dort ist nichts mehr zu holen.

**Die Wand nach dem Stempeln neu packen.** Nicht ernsthaft erwogen — sie widerspricht
ADR-0002 und ließe die Zettel unter dem Finger wandern.

## Konsequenzen

- **Die Wandhöhe ist kein Maß für die Menge der Aufgaben mehr**, sondern auch eines für die
  Breite des breitesten möglichen Abdrucks. Wer die Wand kürzen will, muss an die 88 px für
  Stift und Eselsohr oder an das Unteraufgaben-Zeichen — beides ist bisher unangetastet.
- **Zwei Zettel nebeneinander sind auf schmalen Geräten nicht in allen Fällen zu halten.** Das
  war schon vor dem Stempel so: ein Zettel mit Punkten und Unteraufgaben-Zeichen brauchte
  bereits 194 px, die Bestandsgrenze liegt bei 174. Der Stempel verschärft ein bestehendes
  Problem, er verursacht es nicht.
- **Ein längeres Wort als `DRINGEND` verteuert jeden Zettel auf der Wand**, auch die
  ungestempelten. Wer eine vierte Stufe oder längere Abdrücke einführt, sollte das wissen.
- Die Reservierung ist die Ursache, nicht die Optik: schaltet man sie ab, liegt die Wand
  wieder praktisch auf dem Ausgangswert. Wer die Höhe zurückgewinnen will, gibt damit die
  Zusage auf, dass sich beim Stempeln nichts bewegt.

### Nachtrag · 05.09.2026 — der Breitensprung nach dem Abräumen bleibt

Seit Projekte auf **allen drei Stufen** einen Spruch tragen (→ ADR-0002, Nachtrag), wechselt
das Abräumen `2 → 0` **alle drei Wörter auf einmal**. Die Stempelzelle kann dabei ihre Breite
ändern — an einem echten Tap auf `QC03-PROJ-NOSUB` gemessen **87,83 → 97,20 px (+9,37)**. Die
Wand packt trotzdem **nicht** neu: `layoutSignature` kennt weder `emphasis_level` noch
`project_saying_index`. Das ist genau die Zusage dieses ADR — beim Stempeln bewegt sich
nichts.

**Alle Zahlen dieses Nachtrags stammen aus einer Messung, die als eigene Notiz vorliegt:**
`.scratch/ueberstempeln-bedienung/MESSUNG-breitensprung-05-09-2026.md` (Aufbau, Methode,
Messender, und was dabei **nicht** reproduzierbar war). Ohne sie stünden sie nur hier.

**Der Preis dafür ist neu und gehört benannt.** Der Zettel behält seine gepackte Breite, der
Stempel darin wird breiter, und der Abstand zur 44-px-Trefffläche des Stifts schrumpft.
Vorher war die Zellbreite durch `DRINGEND` (77,87 px) nach unten festgenagelt; heute liegt
sie über die 13 Projekte zwischen **76,82 und 97,20 px** und kann in **beide** Richtungen
springen.

**Drei Pufferzahlen, die NICHT dasselbe messen** — sie stehen hier zusammen, damit sie
niemand gegeneinander stellt:

| Wert | Kante bzw. Zeitpunkt |
|---|---|
| **10,87 px** | Abstand vom **Layoutkasten** des Stapels zur Stiftfläche, **nach** einem Packlauf |
| **3,87 px** | derselbe Abstand, gemessen von der äußersten **gedrehten Ecke** |
| **2,09 px** | Abstand **unmittelbar nach einem Abräumen**, **vor** dem nächsten Packlauf |

Rechnerischer schlimmster Fall — ein Projekt zieht `ÜBERMORGEN` (98,63 px) bei Wandbreite
374 px — **0,57 px**. Nach dem nächsten Packlauf (Neuladen, Drehen, Änderung an der
Aufgabenliste) ist alles wieder sauber; das Fenster ist die Zeit zwischen Tipp und nächstem
Packlauf.

**Ausdrücklich in Kauf genommen, kein Fehler, nicht „korrigieren".** Vom Maintainer am
05.09.2026 entschieden. Die beiden erwogenen Alternativen stehen hier, damit sie niemand neu
erfindet:

- **Den Platz für den breitesten möglichen Spruch von vornherein freihalten.** Kostet jeden
  Projektzettel dauerhaft Breite. Verworfen.
- **Beim Spruchwechsel neu packen.** Lässt die Zettel unter dem Finger wandern und
  widerspricht ADR-0002. Verworfen.

**Eine Obergrenze fehlt.** Solange die Breite eines Sprungs nicht begrenzt ist, hängt der
schlimmste Fall allein an der Länge des **längsten Spruchs in der Liste**
(`PROJECT_PHRASES`). Wer die Liste erweitert, verschiebt damit still diese Zahl — die
Zehn-Zeichen-Grenze ist eine Zeichen-, keine Pixelgrenze.
