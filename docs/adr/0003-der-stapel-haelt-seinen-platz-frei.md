# ADR-0003: Der Abdruckstapel hält seinen Platz frei — und die Wand wird dafür länger

**Status:** Angenommen · 02.09.2026

## Kontext

Seit dem Überstempeln kann der Stempel eines Zettels drei Abdrücke tragen, und sie sind
verschieden breit: `NEU` misst rund 39 px, `DRINGEND` rund 79. Ein Zettel, der hochgestempelt
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
beginnt der Stift damit unmittelbar rechts vom Grundabdruck — für die 79 px von `DRINGEND` ist
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
