/**
 * Die App-Anleitung des Assistenten: Seiten, Gesten und Begriffe nach dem
 * Glossar (CONTEXT.md). Sie geht nicht mit jeder Frage mit, sondern nur, wenn
 * Claude sie über `get_app_guide` abruft.
 *
 * Wer eine Funktion der App ändert, ändert diese Anleitung mit.
 */
import type { AssistantTool } from './tools'

const APP_GUIDE = `# Anleitung Putzplan

Unten fünf Seiten: Putzen, Verlauf, Kasse, Listen, Notizen. Oben auf jeder Seite der Wochenziel-Balken (nur Anzeige), der Chat-Knopf (Sprechblase) und rechts das Logo: es öffnet die Einstellungen.

## Putzen (Pinnwand, Seite „putzen“)
- Jede Aufgabe hängt als Zettel an der Wand. Das Papier zeigt den Typ (wiederkehrend, täglich, einmalig, Projekt), die Befestigung in der Farbe der zuständigen Person die Zuweisung.
- Neue Aufgabe: schwebender Knopf mit Lupe und Plus → Suchfeld „Aufgabe suchen oder erstellen…“ → „Aufgabe erstellen“ (Titel, Punkte, Typ, Tage bis zum nächsten Putzen). Gibt es eine gleichnamige Aufgabe schon, wird sie nicht angeboten (Duplikat).
- Quick-Aufgabe (etwas Erledigtes, das nicht an der Wand hing): im selben Suchfeld „Quick-Aufgabe abschließen“ → Titel, Punkte, Notiz.
- Erledigen = Abreißen: das Eselsohr unten rechts greifen und nach unten ziehen. Danach hängt der Fetzen unter der Wand; ein Tipp darauf ist Zurückkleben (die Erledigung wird gelöscht, die Punkte gehen raus).
- Kranz: Zettel gedrückt halten, dann mit demselben Finger ziehen: unten = erledigen, oben = verschieben, links = zuweisen, rechts = Punkte dieses Mal anpassen (Abweichung, braucht eine Begründung).
- Eine unbewertete Aufgabe (ohne Standardpunkte) öffnet vor dem Erledigen die Punktwahl; der gewählte Wert gilt danach immer.
- Projekte haben keinen Kranz; nach unten ziehen öffnet „Am Projekt arbeiten“.
- Überstempeln: Tipp auf den Stempel legt WICHTIG, dann DRINGEND, dann wieder sauber. Fällt beim Erledigen weg.
- Tipp auf einen Zettel mit Unteraufgaben klappt ihn auf. Der Stift auf dem Zettel öffnet „Aufgabe bearbeiten“ (Titel, Typ, Punkte, Wiederholung, Verschieben, Zuweisen, Unteraufgaben, Löschen).
- Typen: wiederkehrend (alle X Tage wieder dran), täglich (setzt sich jede Nacht selbst zurück), einmalig, Projekt (wird nie fertig; man arbeitet daran über „Am Projekt arbeiten“).
- Der Stempel unten auf dem Zettel zeigt, wie sie steht: NEU (noch nie gemacht), FÄLLIG, bei täglichen BEDARF, bei Projekten ein Spruch. Überfällig ist eine Aufgabe, die dran ist und deren Tage abgelaufen sind; gezählt wird ab dem Ablauf.
- Zuweisen: Kranz links oder Stift → „Zuweisen“; Mitglied oder „Niemand“ wählen. „Zuweisung dauerhaft beibehalten“ lässt sie auch nach dem Putzen stehen, sonst fällt sie mit dem Erledigen weg.
- Verschieben: Kranz oben oder Stift → „Verschieben“. Termin nach dem Intervall, in eigener Anzahl Tage oder an einem Datum, frühestens morgen. Keine Punkte, kein Verlaufseintrag; bis dahin steht die Aufgabe im Erledigt-Streifen mit „verschoben auf …“. Nicht für tägliche Aufgaben und Projekte.
- Löschen: Stift → „Löschen“. Der Zettel verschwindet, seine Erledigungen bleiben im Verlauf (als gelöscht markiert) und zählen weiter.
- Erledigt-Streifen unter der Wand: je Aufgabe Stift und „Wieder dreckig“ (wieder dran, die Punkte bleiben).
- Die Suche filtert die Wand; erledigte Treffer erscheinen als lose Zettel, Tipp auf die Nadelstelle ist „wieder dreckig“.

## Verlauf (Seite „verlauf“)
- Alle Erledigungen; Suchfeld „Aufgabe, Person, Notiz…“. Tipp auf eine Zeile zeigt die Notiz.
- Nach links wischen löscht einen eigenen Eintrag.

## Kasse (Seiten „kasse_statistik“, „kasse_ausgleich“, „toepfe“)
- Statistik: Punkte nach Zeitraum (Gesamt, Woche, Monat, Jahr), nur Anzeige.
- Ausgleich: oben die Umrechnung („Kurs: 1 Pkt. = … €“, Tipp zum Ändern). Unter „Offene Salden“ die Bilanz je Paar mit Knopf „Ausgleichen“; „Neu“ öffnet „Neuer Ausgleich“ (Von, An, Punkte, Art: Aktivität, Geld, Überraschung, Sonstiges oder Topf, Betrag, Kommentar, Datum). Die Art „Topf“ ist das Verrechnen mit dem Haushaltstopf: es erscheint nur, wenn „Von“ dort bei „An“ Geld gut hat, und trägt zugleich eine Rückzahlung im Haushaltstopf ein.
- Töpfe: „+ Topf“ legt einen Topf für einen Anlass an (Anlass, Teilnehmer). Der Haushaltstopf ist immer da. Tipp auf eine Karte öffnet den Topf.
- Im Topf: „+ Ausgabe“ (Beschreibung, Betrag, Bezahlt von, Datum, Aufteilung: gleich, ganze Gruppe oder erweitert) und „Rückzahlung“ (Von, An, Betrag, Datum). „Vorschlag zum Ausgleichen“ zeigt, wer wem überweist; ein Tipp trägt die Rückzahlung vorausgefüllt ein. Tipp auf einen Eintrag bearbeitet oder löscht ihn. Unten Teilnehmer eintragen, Gastlink, Abschließen, Wieder öffnen, Löschen.

## Listen (Seiten „einkauf“, „packlisten“, „todo“)
- Drei Reiter: Einkauf, Packlisten, To-do. Jede Liste steht auf einem langen Zettel; oben die Listen-Chips: Tipp wechselt die Liste, Plus legt eine neue an, der Stift am Chip benennt um, teilt per Gastlink oder löscht.
- Eintrag hinzufügen: Leiste oben (Name, Anzahl, Kategorie, „Hinzufügen“). Tipp auf einen Eintrag hakt ihn ab; der Stift bearbeitet (Name, Kategorie, Menge, Löschen). Langes Drücken zieht einen Eintrag in eine andere Kategorie.
- Einkauf: gekaufte Artikel stehen unter „Gekauft“; ein Tipp holt einen zurück auf die Liste.
- Packlisten und To-do: „Alle zurücksetzen“ und ein Notizfeld je Liste; auf Packlisten zählen +/− bei Mengen über 1.

## Notizen (Seite „notizen“)
- „Neue Notiz schreiben…“ und Knopf zum Anlegen; je Notiz Bearbeiten und Löschen.

## Einstellungen (Seite „einstellungen“, das Logo oben rechts)
- Haushalt: Name, Einladungs-Code zum Kopieren (so tritt jemand bei).
- Mitglieder: nur Anzeige. Dein Profil: Name und Farbe.
- Wochenziel: „Punkte pro Woche“ und „Woche beginnt am“, dann „Wochenziel speichern“. Eine neue Zielzahl gilt sofort, ein neuer Wochenstart ab nächster Woche.
- Gastlinks: alle Freigaben mit „Link kopieren“ und „Freigabe beenden“. Neue Gastlinks entstehen bei der Liste („Liste bearbeiten“) oder im Topf.
- Richtwerte: Punktwerte mit Beispielaufgaben, die Eichung der Punkte; „Knopf“ macht einen Richtwert zur Schnelloption in der Punktwahl.

## Begriffe
- Punkte: Leistung einer Erledigung, 1 Punkt ≈ 5 Minuten leichter Arbeit. Standardpunkte zählen bei jeder Erledigung; eine Abweichung zählt einmal anders.
- Wochenziel: Punkte, die sich der Haushalt gemeinsam je Woche vornimmt; ein Balken für alle, keine Rangliste.
- Bilanz: offene Punktdifferenz zwischen zwei Mitgliedern über die ganze Historie. Ausgleich: Gegenleistung, die die Bilanz verringert.
- Topf: Kreis von Teilnehmern, die Ausgaben teilen; Rückzahlung senkt den Saldo zwischen zweien.
- Gastlink: öffnet genau eine Liste oder einen Topf für Menschen außerhalb des Haushalts, ohne Anmeldung.
- verschieben: Aufgabe bis zu einem Tag aus dem Weg räumen, ohne Erledigung und ohne Punkte.
`

export const guideTools = (): AssistantTool[] => [
  {
    name: 'get_app_guide',
    description:
      'Liefert die Anleitung der App: Seiten, Gesten, wo welche Einstellung liegt, Begriffe. ' +
      'Ruf sie auf, bevor du erklärst, wie etwas in der App geht oder wo etwas liegt.',
    input_schema: { type: 'object', properties: {} },
    execute: async () => ({ result: APP_GUIDE }),
  },
]
