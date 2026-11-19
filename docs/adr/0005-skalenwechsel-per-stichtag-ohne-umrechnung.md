# ADR-0005 — Skalenwechsel per Stichtag, ohne die Historie umzurechnen

Datum: 2026-11-19
Status: akzeptiert

## Kontext

Die **Punkte** wechseln von der festen Skala 1–5 ohne Zeitbezug auf eine offene Skala mit
Anker 1 Punkt ≈ 5 Minuten leichter Arbeit, geeicht über die **Richtwerte** des Haushalts.
Mit der **Umrechnung** in Geld wird die **Bilanz** zu einer Aussage über Euro. Die Bilanz
rechnet über die ganze Historie, und alle bisherigen Erledigungen und Ausgleiche tragen
Werte der alten Skala.

## Entscheidung

Die Historie wird **nicht** umgerechnet. Alte Erledigungen und Ausgleiche bleiben mit ihren
Werten stehen. Stattdessen:

- Der Haushalt gleicht die Bilanz zum Wechsel einmal aus, so wie er sich auf der alten Skala
  geeinigt hat — außerhalb der App-Logik, als gewöhnlicher **Ausgleich**.
- Die Migration setzt die **Standardpunkte** jeder Aufgabe auf leer: alle Aufgaben werden
  **unbewertet** und bekommen ihre neuen Punkte beim nächsten Erledigen oder im
  Bearbeiten-Dialog.
- Die App kennt keinen Stichtag. Die Bilanz rechnet weiter über alles; nach dem Ausgleich
  steht sie auf null, und von da an wächst sie nur noch mit Punkten der neuen Skala.

## Begründung

- **Jede Aufgabe will neu bewertet werden.** Die neue Skala misst Zeit und Anstrengung
  zusammen und ist feiner; ob eine alte „3“ heute eine 3, 5 oder 8 ist, entscheidet kein
  Faktor.
- **Kein neuer Begriff in der Bilanz.** Ein Stichtag in der Bilanzrechnung wäre ein
  zusätzlicher Zustand, den jede Auswertung kennen müsste; der einmalige Ausgleich leistet
  dasselbe mit dem, was es schon gibt.

## Verworfene Alternativen

- **Alles mit festem Faktor hochrechnen** (×2,4, also 5 → 12) — Aufgaben, Erledigungen,
  Ausgleiche, Wochenziel. Hätte Bilanz und Statistik durchgehend vergleichbar gehalten, aber
  eine geschätzte Zahl als Tatsache in die Historie geschrieben.
- **Historie löschen und neu starten.** Hätte die Statistik bereinigt, aber Daten
  vernichtet, die niemand loswerden wollte.

## Folgen

- **Statistik über den Wechsel hinweg ist nicht vergleichbar.** Erledigungen vor dem
  Wechsel zählen in der alten Skala; Wochen- und Personenvergleiche über den Wechsel
  springen. Bewusst hingenommen.
- **Der Geld-Vorschlag beim Umstellungs-Ausgleich ist zu niedrig**, weil alte Punkte mehr
  wert waren. Der Haushalt setzt den Betrag dort von Hand.
- Wer die Historie später doch umrechnen will, muss die Ausgleiche vor dem Wechsel
  herausrechnen — sie sind dann schon in alten Punkten gebucht.
