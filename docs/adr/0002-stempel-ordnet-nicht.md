# ADR-0002: Ein Stempel für beides — und er ordnet nichts um

**Status:** Angenommen · 18.08.2026

## Kontext

Auf der Pinnwand gab es zwei Aussagen über eine Aufgabe, die sich fast berührten:

- die **berechnete** Dringlichkeit aus Kadenz und letzter Erledigung, sichtbar als
  Gummistempel NIE / FÄLLIG / HEUTE,
- und den von Hand gesetzten **Nachdruck** („diesmal ist es wichtig"), geplant als
  zweiter Stempel daneben mit den Stufen WICHTIG und DRINGEND.

Beide hätten in derselben Fußzeile gestanden, beide als Gummistempel, und beide hätten
das Wort **FÄLLIG** benutzt — der eine als berechneten Zustand, der andere als
Grundstufe. Dazu kam ein praktisches Loch: der berechnete Stempel erschien nur, wenn es
brannte. Eine Aufgabe, die noch Zeit hatte, zeigte gar keinen — es gab nichts anzutippen.

## Entscheidung

**Es gibt genau einen Stempel je Zettel, und jeder Zettel trägt ihn.**

Sein unterster Abdruck ist berechnet: NEU für eine noch nie erledigte Aufgabe, sonst
FÄLLIG. Tägliche Aufgaben tragen ROUTINE, Projekte einen Spruch ohne
Dringlichkeitsbedeutung — beide können nicht in Verzug geraten. HEUTE entfällt
ersatzlos; auf der Wand sind alle fälligen Aufgaben gleich dringend.

Ein Tipp legt WICHTIG obenauf, der nächste DRINGEND, der nächste macht den Zettel wieder
sauber. Die Abdrücke bleiben sichtbar übereinander liegen.

**Und der Stempel ordnet nichts um.** Eine mit DRINGEND gestempelte Aufgabe darf unter
einer ungestempelten hängen.

## Alternativen

**Zwei getrennte Stempel.** Sauber getrennte Begriffe, aber zwei Gummistempel mit
demselben Wort nebeneinander in einer Zeile, in der ohnehin Punktwert, Unteraufgaben-
Zeichen, Stift und Eselsohr um Platz ringen. Verworfen.

**Nachdruck ordnet die Wand um** — gestempelte Aufgaben in ein eigenes Band nach oben.
Das war die ausdrückliche Empfehlung aus der Entwurfsrunde, mit dem Argument, das Feature
sei sonst bloße Dekoration. **Vom Nutzer abgelehnt.** Eine Wand ist keine Liste: wer
Zettel an eine Pinnwand heftet, sortiert sie nicht nach Wichtigkeit, sondern nach Platz.
Der Stempel ist die Aussage, nicht die Position.

## Konsequenzen

- Die Reihenfolge auf der Wand bleibt allein Sache des Packens. Wer später „sortiert doch
  nach Dringlichkeit" einbaut, macht das hier bewusst rückgängig — es ist kein Fehler,
  der repariert werden will.
- Der Begriff **Dringlichkeit** ist aus dem Glossar verschwunden und wird durch
  **Stempel** ausgedrückt. Der berechnete Vergleichswert existiert weiter und ordnet die
  **Listen**; er hat auf der Wand nur keine eigene Darstellung mehr.
- **Nachdruck** heißt jetzt **Überstempeln**.
- Zurückgesetzt wird beim Erledigen — auch bei täglichen Aufgaben. Der nächtliche Reset
  aus Ticket 09a entfällt und muss zurückgebaut werden.
