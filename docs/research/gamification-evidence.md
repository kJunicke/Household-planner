# Gamification: Evidenzlage & Übertragung auf Putzplan

Stand: 2026-08-16. Teil A = Forschungslage (nur Primärquellen: Meta-Analysen, Reviews,
peer-reviewte Studien). Teil B = konkrete Umsetzung in diesem Repo.

---

## Teil A — Was die Forschung hergibt

### A.1 Wirkt Gamification überhaupt?

| Quelle | Design | Ergebnis | Stärke |
|---|---|---|---|
| Sailer & Homner 2020 | Meta-Analyse, k=19/16/9 | kognitiv g=0.49 [0.30,0.69], motivational g=0.36 [0.18,0.54], behavioral g=0.25 [0.04,0.46] | **stark** (aber: nur kognitiver Effekt stabil bei hoher Methodenqualität) |
| Bai, Hew & Huang 2020 | Meta-Analyse, 30 Interventionen / 24 Studien | g=0.504 [0.284,0.723] auf Lernergebnis | **stark** |
| Hamari, Koivisto & Sarsa 2014 | Literature Review, 24 empirische Studien | „positive Effekte, aber stark kontext- und nutzerabhängig"; viele Studien methodisch schwach | mittel |
| Koivisto & Hamari 2019 | Review von 819 Papers | Feld wächst, aber Evidenz weiter heterogen; Effekte hängen an Kontext + Nutzertyp | mittel |
| Patel et al. 2019 (STEP UP) | RCT, N=602, 24 Wochen + 12 Wochen Follow-up | Gamification **mit sozialen Anreizen** (Support/Kollaboration/Wettbewerb) erhöhte Schrittzahl signifikant vs. Kontrolle | **stark** (echtes RCT, Alltagsverhalten) |

**Kernaussage:** Der Durchschnittseffekt ist klein bis mittel und real, aber er kommt
**nicht** von „Punkte draufkleben". Sailer & Homner: reine Reward-and-Status-Mechaniken
schneiden deutlich schwächer ab als Designs mit Herausforderung, sinnvollen Zielen und
Narrativ.

Quellen:
- Sailer, M. & Homner, L. (2020). *The Gamification of Learning: a Meta-analysis.*
  Educational Psychology Review 32, 77–112. https://doi.org/10.1007/s10648-019-09498-w
- Bai, S., Hew, K. F. & Huang, B. (2020). *Does gamification improve student learning
  outcome?* Educational Research Review 30, 100322.
  https://doi.org/10.1016/j.edurev.2020.100322
- Hamari, J., Koivisto, J. & Sarsa, H. (2014). *Does Gamification Work? — A Literature
  Review of Empirical Studies on Gamification.* HICSS 47, 3025–3034.
  https://doi.org/10.1109/HICSS.2014.377
- Koivisto, J. & Hamari, J. (2019). *The rise of motivational information systems: A
  review of gamification research.* Int. J. of Information Management 45, 191–210.
  https://doi.org/10.1016/j.ijinfomgt.2018.10.013
- Patel, M. S. et al. (2019). *Effectiveness of Behaviorally Designed Gamification
  Interventions With Social Incentives … STEP UP RCT.* JAMA Internal Medicine 179(12).
  https://doi.org/10.1001/jamainternmed.2019.3505

### A.2 Einzelne Mechaniken

| Mechanik | Evidenz | Bewertung |
|---|---|---|
| **Ziele setzen (spezifisch + schwierig)** | Locke & Latham 2002, 35 Jahre Forschung, hunderte Studien | **Stärkster Baustein.** Spezifische, herausfordernde Ziele schlagen „gib dein Bestes" konsistent. Moderatoren: Commitment, Feedback, Aufgabenkomplexität. |
| **Implementation Intentions** („wenn X, dann Y") | Gollwitzer & Sheeran 2006, Meta-Analyse, 94 Tests, d=0.65 | **stark**, mittel-bis-großer Effekt — und unterschätzt in Apps |
| **Selbstmonitoring / Fortschrittsfeedback** | Michie et al. 2009, Meta-Regression zu Ernährung/Bewegung | **stark**: Selbstmonitoring war der wirksamste einzelne Baustein, besonders in Kombination |
| **Badges** | Hamari 2017, 2-Jahres-Feldexperiment (N=1410 vs. 1579) | mittel: Aktivität stieg, aber **nur bei Nutzern, die die Badges aktiv nutzten**; kein pauschaler Effekt |
| **Punkte / Level / Leaderboard isoliert** | Mekler et al. 2017, 2×4-Experiment | **Menge** der Outputs stieg, **intrinsische Motivation und Kompetenzerleben nicht**. Klassische extrinsische Anreize. |
| **Streaks** | keine belastbare Primärevidenz gefunden | **schwach/dünn.** Populäre Behauptungen stammen aus App-Blogs, nicht aus Studien. Siehe A.4. |
| **Variable Belohnungen** | in der Gamification-Literatur kaum sauber isoliert getestet | **dünn** — Analogieschluss aus Verstärkungsplänen, keine Feld-Evidenz für Produktivitätsapps |

Quellen:
- Locke, E. A. & Latham, G. P. (2002). *Building a practically useful theory of goal
  setting and task motivation: A 35-year odyssey.* American Psychologist 57(9), 705–717.
  https://doi.org/10.1037/0003-066X.57.9.705
- Gollwitzer, P. M. & Sheeran, P. (2006). *Implementation intentions and goal achievement:
  A meta-analysis of effects and processes.* Advances in Experimental Social Psychology
  38, 69–119. https://doi.org/10.1016/S0065-2601(06)38002-1
- Michie, S. et al. (2009). *Effective techniques in healthy eating and physical activity
  interventions: a meta-regression.* Health Psychology 28(6), 690–701.
  https://doi.org/10.1037/a0016136
- Hamari, J. (2017). *Do badges increase user activity? A field experiment on the effects
  of gamification.* Computers in Human Behavior 71, 469–478.
  https://doi.org/10.1016/j.chb.2015.03.036
- Mekler, E. D., Brühlmann, F., Tuch, A. N. & Opwis, K. (2017). *Towards understanding the
  effects of individual gamification elements on intrinsic motivation and performance.*
  Computers in Human Behavior 71, 525–534. https://doi.org/10.1016/j.chb.2015.08.048

### A.3 Wann Belohnungen schaden (SDT / Overjustification)

- **Deci, Koestner & Ryan 1999**, Meta-Analyse über 128 Experimente: erwartete, greifbare
  Belohnungen untergraben freiwillige intrinsische Motivation — engagement-contingent
  d=−0.40, completion-contingent d=−0.36, performance-contingent d=−0.28. **Verbales,
  informierendes Feedback wirkte dagegen positiv.**
  https://doi.org/10.1037/0033-2909.125.6.627
- **van Roy & Zaman 2018**, längsschnittlich, SDT-basiert: Kurzzeit- und Langzeiteffekte
  von Gamification unterscheiden sich; bedürfnisunterstützendes Design (Autonomie,
  Kompetenz, Verbundenheit) ist der entscheidende Moderator.
  *Need-supporting gamification in education: An assessment of motivational effects over
  time.* Computers & Education 127, 283–297.
  https://doi.org/10.1016/j.compedu.2018.08.018
- **van Roy & Zaman 2017**: neun SDT-Heuristiken, warum Gamification scheitert.
  https://doi.org/10.1007/978-3-319-51645-5_22

**Praktische Regel:** Punkte als *Information über Aufwand und Fairness* = unproblematisch.
Punkte als *Bedingung für eine Belohnung* („bei 100 Punkten gibt es X") = Risiko der
Untergrabung, genau der von Deci et al. gemessene Fall.

### A.4 Was NICHT hält

| Behauptung | Realität |
|---|---|
| „66 Tage bis zur Gewohnheit" | Lally et al. 2010: **Median** 66 Tage, Spannweite 18–254 Tage, N=96, nur eine Teilmenge erreichte überhaupt ein Plateau. Keine universelle Zahl. https://doi.org/10.1002/ejsp.674 |
| „Ein verpasster Tag zerstört die Gewohnheit" (Streak-Logik) | Lally et al. 2010 fanden explizit, dass einzelne ausgelassene Gelegenheiten den Automatisierungsverlauf **nicht** messbar beeinträchtigten. Die „Streak bricht auf 0"-Mechanik hat damit **keine** Grundlage in dieser Studie. |
| „Leaderboards motivieren" | Hanus & Fox 2015, längsschnittlich: Klasse mit Leaderboard + Badges zeigte über die Zeit **weniger** Motivation, Zufriedenheit und Empowerment, vermittelt über sozialen Vergleich. https://doi.org/10.1016/j.compedu.2014.08.019 |
| „Punkte steigern Motivation" | Mekler et al. 2017: steigern Output-Menge, nicht Motivation oder Kompetenzerleben. |
| „Der Effekt hält an" | Koivisto & Hamari 2014 (N=3234): wahrgenommener Nutzen, Spaß, Verspieltheit und sozialer Einfluss **sinken mit Nutzungsdauer** → Novelty Effect. https://doi.org/10.1016/j.chb.2014.03.007 |
| „Gamification wirkt generell" | Sailer & Homner 2020: motivationale und behaviorale Effekte waren bei methodisch strengen Studien **nicht stabil**. |
| Variable Rewards / „Dopamin-Loops" | populär, aber für Haushalts-/Produktivitäts-Apps praktisch **keine** peer-reviewte Feldevidenz. Nicht als belegt behandeln. |

### A.5 Domänenspezifisch: geteilter Haushalt

- Wahrgenommene **Fairness** der Arbeitsteilung sagt Beziehungszufriedenheit besser
  vorher als die tatsächliche Aufteilung (Hiekel & Ivanova 2023,
  https://doi.org/10.1177/0192513X211055119; Carlson et al. 2019, PLOS ONE,
  https://doi.org/10.1371/journal.pone.0214204).
- **Wertschätzung** puffert die negativen Effekte ungleicher Arbeitsteilung
  (Gordon et al. 2022, Psychological Science, https://doi.org/10.1177/09567976221081872).

→ Für Putzplan ist der wirksamste „Gamification"-Hebel wahrscheinlich **Transparenz +
Anerkennung**, nicht Wettbewerb.

---

## Teil B — Übertragung auf Putzplan

### B.1 Was es schon gibt

| Element | Ort | Evidenz-Einordnung |
|---|---|---|
| Punkte = `task_completions.effort_override` (0–5, NOT NULL, Single Source of Truth) | Edge Function `complete-task`, `taskStore.ts` | neutral/gut, solange es Fairness-Information bleibt |
| Wochen-Rangliste `weeklyRanking` im Header | `householdStore.ts` Z. 226ff, `Header.vue` Z. 38ff | **Risiko** (Hanus & Fox 2015) — bei 2–4 Personen ist „Rang 2 von 2" ein Vorwurf |
| Stats-Charts (Bar/Pie/Line, Zeiträume) | `StatsView.vue` | **gut** = Selbstmonitoring (Michie 2009) |
| Ausgleich / `settlements` (paarweise Balances, Methode „activity/money/surprise") | `settlementStore.ts`, `SettlementView.vue` | **sehr gut** — bedient direkt die Fairness-Achse aus A.5 |
| Konfetti bei Completion | `TaskCard.vue`, `SubtaskItem.vue` | harmlos, informierendes Feedback |
| Subtask-Punktmodi (`checklist/deduct/bonus`) | Schema + `docs/data-model.md` | neutral |

Nicht vorhanden: `xp`, `level`, `streak`, `badge`/`achievement` — weder Tabelle noch
Spalte. Alles Zeitliche wäre aus `task_completions.completed_at` ableitbar (Index
`idx_task_completions_completed_at DESC` existiert).

Offene TODOs dazu: „User Stats – XP, Level, Streaks" (TODO.md Z. 125ff), „Ranglisten"
(Z. 127), „Achievements – Badges/Trophäen" (Z. 284).

### B.2 Vorschläge, priorisiert

**P1 — Zielsetzung pro Haushalt statt pro Person**
Evidenz: Locke & Latham 2002 (stärkste Basis), Patel 2019 (Kollaborations-Arm wirkte).
Ein gemeinsames Wochenziel („Haushalt schafft 40 Punkte diese Woche"), Fortschrittsbalken
in `StatsView` + Header-Chip.
- Daten: neue Tabelle `household_goals(goal_id, household_id, period, target_points,
  starts_at)` oder simpler: eine Spalte `households.weekly_goal_points INT`.
- UI: ein Progressbar-Widget, ersetzt langfristig den Rang-Chip im Header.
- Warum vor allem anderen: bedient das evidenzstärkste Prinzip und **entschärft**
  gleichzeitig das Leaderboard-Problem (kooperativ statt kompetitiv).

**P2 — Rangliste entschärfen**
Evidenz: Hanus & Fox 2015, Deci et al. 1999.
Bei 2–4 Mitgliedern ist ein Ranking faktisch ein Fairness-Urteil. Konkret:
- Rangnummer entfernen, stattdessen **Beitragsanteil** („du 45 %, Partner 55 %") oder
  direkt die vorhandene `pairBalances`-Differenz zeigen.
- Alternativ Rang nur einblenden, wenn `members.length >= 4`.
- Kein Code-Neuland: `weeklyRanking` liefert die Daten schon, nur Darstellung ändern.

**P3 — Stat-Kacheln (Selbstmonitoring ausbauen)**
Evidenz: Michie et al. 2009 (stark), Sailer & Homner 2020 (Feedback-Komponente).
`StatsView` hat Charts, aber keine KPI-Kacheln. Ergänzen: „erledigt diese Woche",
„Punkte vs. Vorwoche", „am längsten überfällig", „meistgemachte Aufgabe".
- Daten: **keine** Migration nötig, alles aus `task_completions` + `tasks` ableitbar.
- Aufwand klein, Evidenz gut → bestes Verhältnis.

**P4 — Erinnerungen als Implementation Intentions**
Evidenz: Gollwitzer & Sheeran 2006, d=0.65 — der stärkste Einzeleffekt in diesem Dossier.
Statt „Aufgabe X ist überfällig": Aufgabe an Zeit/Ort/Auslöser koppeln („Sonntag nach dem
Frühstück: Bad"). Push-Notification steht schon im Backlog (TODO.md Z. 285).
- Daten: `tasks.trigger_hint TEXT` (optional) + bestehende `recurrence_days`.
- UI: ein Freitextfeld im Task-Editor, Text erscheint in Notification und Task-Card.

**P5 — Badges: nur sparsam und nicht-vergleichend**
Evidenz: Hamari 2017 (Effekt nur bei aktiver Nutzung), Deci et al. 1999 (keine erwarteten,
kontingenten Belohnungen).
Wenn überhaupt: **rückblickende Anerkennung** („100 Aufgaben erledigt", „erste Completion
in jeder Kategorie") statt angekündigter Belohnungen für Leistung.
- Daten: ableitbar aus `task_completions`; persistieren nur, wenn „erstmals erreicht"-Datum
  angezeigt werden soll → `achievements(user_id, key, achieved_at)`.
- Achtung: Badges pro Person in einer 2er-WG erzeugen erneut Vergleich → besser
  Haushalts-Badges.

**P6 — Wertschätzung sichtbar machen**
Evidenz: Gordon et al. 2022 (Puffer-Effekt), Deci et al. 1999 (verbales Feedback wirkt
positiv, anders als greifbare Belohnungen).
Ein „Danke"-Tap auf fremde Completions in `HistoryView`.
- Daten: `completion_reactions(completion_id, user_id, kind)`, klein und RLS-trivial.
- Genau die Sorte Feedback, die laut Meta-Analyse **nicht** untergräbt.

### B.3 Nicht bauen (bzw. bewusst dagegen entscheiden)

| Idee | Grund |
|---|---|
| **Streaks mit Reset auf 0** | Kernannahme („ein Fehltag zerstört") wird von Lally et al. 2010 widerlegt; in einer WG bestraft der Reset zudem Urlaub/Krankheit. Falls überhaupt: „X von letzten 7 Tagen" ohne harten Bruch. |
| **XP + Level** | Mekler et al. 2017: erhöht Menge, nicht Motivation. Zusätzlich: es gäbe eine **dritte** Punkteformel neben Edge Function und Frontend — TODO.md Z. 184ff („Punkteberechnung als ein Modul") ist ein Blocker davor. |
| **Kompetitive Leaderboards prominent** | Hanus & Fox 2015; bei n=2 ist Wettbewerb Beziehungsrisiko. |
| **Materielle Belohnungen an Punktschwellen** | Deci et al. 1999, d≈−0.36 — exakt der untersuchte Schadensfall. |
| **Variable/Zufallsbelohnungen** | Keine belastbare Primärevidenz in dieser Domäne (A.4). |

### B.4 Reihenfolge

1. P3 (Stat-Kacheln) — billig, gut belegt, keine Migration
2. P2 (Rangliste entschärfen) — reine UI-Änderung, entfernt ein belegtes Risiko
3. P1 (Haushaltsziel) — größter Evidenzhebel, kleine Migration
4. P6 (Wertschätzung) — kleine Migration, gute Domänenpassung
5. P4 (Implementation Intentions) — braucht Push-Infrastruktur
6. P5 (Badges) — erst nach Konsolidierung der Punktelogik

### B.5 Wo die Evidenz dünn ist

- Fast alle Meta-Analysen stammen aus **Bildungskontexten**; Übertragung auf
  Haushaltsaufgaben unter 4 Personen ist eine Analogie, kein Beleg.
- Für **Zweier-Haushalte** gibt es praktisch keine Gamification-Studien; die
  Leaderboard-Warnung ist aus Klassenkontexten extrapoliert.
- **Streaks** und **variable Rewards** sind in dieser Domäne empirisch schlicht ungeklärt.
- Langzeiteffekte: außer Hamari 2017 (2 Jahre), van Roy & Zaman 2018 und Patel 2019
  (24 Wochen) sind fast alle Studien kurz — Novelty Effect (Koivisto & Hamari 2014) ist
  daher in vielen positiven Befunden mit drin.
