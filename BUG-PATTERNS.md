# Bug Patterns & Solutions

Dokumentation häufiger Bugs und deren Lösungen zur Vermeidung wiederkehrender Probleme.

---

## 🐛 Bug #1: PostgREST Schema Cache nach Column Rename (15.12.2025)

### Problem
Nach Umbenennung einer Spalte (`override_reason` → `completion_note`) in einer Migration funktionierte die Edge Function nicht mehr. Fehler:
```
"Could not find the 'completion_note' column of 'task_completions' in the schema cache"
```

### Root Cause
- **PostgREST cached das DB-Schema** und aktualisiert es nicht automatisch bei `ALTER TABLE ... RENAME COLUMN`
- DDL-Änderungen (DROP/ADD) triggern Schema-Reload, aber RENAME nicht zuverlässig

### Symptome
- Edge Function wirft 500-Error
- Frontend-Requests mit neuen Spaltennamen schlagen fehl
- Migration läuft erfolgreich durch, aber Schema Cache ist veraltet
- Logs zeigen: "Column not found in schema cache"

### Lösung (Professionell)
**NIE Spalten umbenennen in Production!** Stattdessen:

```sql
-- ❌ FALSCH (verursacht Schema Cache Issues)
ALTER TABLE task_completions RENAME COLUMN override_reason TO completion_note;

-- ✅ RICHTIG (3-Step Migration)
-- Step 1: Add new column
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS completion_note TEXT;

-- Step 2: Migrate data
UPDATE task_completions
SET completion_note = override_reason
WHERE override_reason IS NOT NULL;

-- Step 3: Drop old column (triggers schema reload!)
ALTER TABLE task_completions DROP COLUMN IF EXISTS override_reason;
```

### Warum funktioniert das?
- `DROP COLUMN` triggert DDL-Change-Event → PostgREST reloads schema
- `ADD COLUMN` ist safe (neue Spalte ist sofort verfügbar)
- Zero-Downtime: Frontend kann während Migration weiterlaufen

### Prävention
- **CLAUDEMD-Regel**: "Nie `RENAME COLUMN` in Production-Migrations verwenden"
- **Alternative**: Wenn rename nötig → 3-Step-Migration (ADD → MIGRATE → DROP)
- **Testing**: Nach Migration Edge Function deployen UND testen, nicht nur Migration pushen

### Verwandte Patterns
- Schema Cache gilt auch für PostgREST REST API
- Bei RLS-Policy-Änderungen ähnliches Problem möglich
- `NOTIFY pgrst, 'reload schema'` funktioniert nur bei direktem DB-Access, nicht über Supabase-Dashboard

---

## 🐛 Bug #2: Unified Effort System - Unvollständige Migration (15.12.2025)

### Problem
Nach Implementierung des "Unified Effort Systems" (effort_override immer setzen) funktionierten Frontend-Berechnungen nicht mehr korrekt.

### Root Cause
**Inkonsistente Migration über 3 Layer:**
1. ✅ **DB**: Migration `effort_override NOT NULL` lief durch
2. ❌ **Edge Function**: Code aktualisiert, aber **nicht deployed**
3. ❌ **Frontend**: Noch alte Fallback-Logik (`effort_override ?? task.effort`)

### Symptome
- Tasks lassen sich nicht completieren (Edge Function Fehler)
- StatsView zeigt falsche Punktzahlen
- Type-Errors in Frontend (wegen `number | null` vs `number`)

### Lösung
**Alle 3 Layer synchron aktualisieren:**

```bash
# 1. Migration pushen
npx supabase db push

# 2. Edge Function deployen (WICHTIG!)
npx supabase functions deploy complete-task

# 3. Frontend-Code updaten (alle Views!)
# - TaskStore: completeTask() Parameter
# - HistoryView: Fallback-Logik entfernen
# - StatsView: Fallback-Logik entfernen
# - Types: effort_override: number (nicht number | null)
```

### Warum passiert das?
- **DB Migrations** und **Edge Function Deployments** sind getrennte Befehle
- Supabase CLI pusht Migrations automatisch, aber deployed Functions NICHT automatisch
- Frontend-Type-Änderungen müssen manuell in allen betroffenen Files gemacht werden

### Prävention
- **Checklist für DB-Schema-Änderungen:**
  1. [ ] Migration schreiben
  2. [ ] Edge Function Code anpassen
  3. [ ] Frontend Types updaten
  4. [ ] Alle Views mit betroffenen Queries updaten
  5. [ ] Migration pushen (`db push`)
  6. [ ] Edge Function deployen (`functions deploy`)
  7. [ ] Type-Check + Lint (`npm run type-check && npm run lint`)
  8. [ ] E2E-Tests (Playwright)

### Related Pattern
- **Parameter-Renames** (z.B. `reason` → `note`): IMMER alle Call-Sites im Frontend suchen (Glob/Grep)
- **Type-Änderungen** (`number | null` → `number`): IMMER TypeScript errors checken

---

## 🐛 Bug #3: Deduct-Subtask Overflow blockiert Parent-Task-Completion (22.12.2025)

### Problem
Wenn die Summe der abgeschlossenen Deduct-Subtasks größer war als der Parent-Task-Effort, konnte der Parent-Task nicht mehr abgeschlossen werden. Die Edge Function gab einen 400-Error zurück.

### Root Cause
Die Edge Function hatte eine strenge Validation, die negative Punkte komplett blockierte:
```typescript
// VORHER: Blockierte den Task komplett
if (finalEffort < 0) {
  return new Response(
    JSON.stringify({ error: 'Nicht genug Punkte!' }),
    { status: 400, ... }
  )
}
```

### Symptome
- Console-Error: `FunctionsHttpError: Edge Function returned a non-2xx status code`
- POST zu `complete-task` gibt 400 Bad Request
- Parent-Task mit abgeschlossenen Deduct-Subtasks kann nicht completed werden
- Problem tritt bei recurring Tasks (nicht daily) auf

### Lösung
Graceful Handling statt Blocking:
```typescript
// NACHHER: Gibt minimum 0 Punkte statt zu blocken
finalEffort = Math.max(0, taskDetails.effort - deductSum)

// Warnung wird geloggt für Debugging
if (taskDetails.effort - deductSum < 0) {
  console.warn(`[Deduct Overflow] Parent effort exceeded...`)
}
```

### Prävention
- Bei Subtask-Erstellung könnte Frontend validieren, dass Deduct-Sum ≤ Parent-Effort
- Edge Function sollte graceful sein und Edge Cases behandeln statt zu blocken
- User bekommt 0 Punkte für Parent wenn Deducts übersteigen (mathematisch korrekt)

---

## 🐛 Bug #4: Zwei Regeln für „ist die Aufgabe dran?" (03.08.2026)

### Problem
Eine noch nie erledigte wiederkehrende Aufgabe galt auf ihrer Karte als maximal dringend,
fiel aber aus der „Jetzt dran"-Sektion heraus. Überfällig-Tage wurden ab der letzten
Erledigung gezählt statt ab der Kadenz: Kadenz 7, zuletzt vor 10 Tagen → „10 Tage
überfällig" statt 3. Dadurch war die Rot-Färbung praktisch immer voll ausgereizt.

### Root Cause
Die Frage „ist diese Aufgabe dran?" wurde an fünf Stellen im Frontend unabhängig
beantwortet — jeweils mit eigener Datumsmathematik auf `last_completed_at`. Dieselbe Regel
stand zusätzlich in SQL (`reset_recurring_tasks()`). Zwei Antworten auf eine Frage laufen
zwangsläufig auseinander; jede Kopie hatte ihren eigenen Sonderfall für „nie erledigt".

### Symptome
- Karte und Sektion bewerten dieselbe Aufgabe widersprüchlich
- Zwischen lokal Mitternacht und dem Cron-Lauf um 03:00 UTC: „überfällig" bei
  gleichzeitig `completed = true`
- Ein Fallback im Code mit dem Kommentar „Sollte nicht vorkommen"

### Lösung
Zuständigkeiten getrennt: **ob** eine Aufgabe dran ist, entscheidet allein `tasks.completed`
in der DB; **wie dringend** sie ist, berechnet das Modul `src/lib/taskSchedule.ts` aus
Kadenz und letzter Erledigung. Die Kadenz-Grenze `Tage >= recurrence_days` führt nur noch in
`reset_recurring_tasks()` zu einer Zustandsänderung. Siehe
[ADR 0001](docs/adr/0001-completed-ist-zustand-keine-ableitung.md).

### Prävention
- Eine Frage, eine Antwortstelle. Wenn dieselbe Regel in SQL **und** im Frontend steht, ist
  eine davon zu viel — nicht beide „richtig" halten wollen.
- Der naheliegende Aufräumgedanke (Cron abschaffen, alles im Frontend ableiten) bricht
  „wieder dreckig" und „verschieben". Das ADR ist der Grund, es nicht zu tun.
- Vor dem Kopieren einer Hilfsfunktion prüfen, ob die Quelle noch lebt: `TaskList.vue` war
  seit dem Kopieren tot und trug trotzdem eine dritte Garnitur derselben Rechnung.

### Related Patterns
Bug #2 (unvollständige Migration) — auch dort lag der Fehler nicht in einer Zeile, sondern
darin, dass nicht alle Aufrufer mitgezogen wurden.

---

## 🐛 Bug #5: Eingabefeld überlebt den Listenwechsel (03.08.2026)

### Problem
Nach dem Umbau der oberen Leiste der Einkaufsliste (Produktname · Menge · Zielkategorie)
blieb deren Inhalt beim Wechsel von „Einkauf" auf „Asia markt" stehen. Tippen hängte an
den alten Namen an („JoghurtSojasauce"), und die stehengebliebene Zielkategorie hätte beim
Hinzufügen in der neuen Liste eine gleichnamige Kategorie angelegt.

### Root Cause
Der Watcher auf `currentListId` in `ShoppingView.vue` räumte die Zustände der Sektionen auf
(Entwürfe, Mengen, Grace), kannte die neue obere Leiste aber nicht. Der Umbau hat Zustand
hinzugefügt, ohne die vorhandene Aufräumstelle mitzuziehen.

### Symptome
- Produktname der alten Liste steht nach dem Wechsel noch im Feld
- Kategorie-Chip zeigt eine Kategorie, die es in der neuen Liste gar nicht gibt

### Lösung
`resetTopBar()` im Listenwechsel-Watcher aufrufen — dieselbe Stelle, die schon die
Sektionsfelder leert.

### Prävention
Neuer Ansichtszustand, der zu *einer Liste* gehört, gehört in denselben Reset wie der alte.
Beim Anlegen eines `ref` in einer View die Frage stellen: Was passiert damit beim Wechsel
der Liste? Wenn die Antwort „nichts" ist, ist das fast immer ein Fehler.

### Related Patterns
Bug #2 — auch hier war nicht die neue Zeile falsch, sondern die alte Stelle, die nicht
mitgezogen wurde.

---

## 🐛 Bug #6: Eine per `classList` gesetzte Klasse überlebt kein Vue-Update (18.08.2026)

### Problem
`WallView.relayout` misst jeden Zettel und entscheidet dabei, ob der Punkte-Sticker
in die obere rechte Ecke wandert (`zettel--meta-top`). Die Entscheidung stand korrekt
im Vue-Zustand — **im DOM kam sie nie an**: `metaTopIds.size = 30`, DOM-Anzahl **0**.

### Root Cause
Der Messlauf setzte und entfernte die Klasse per `classList`, obwohl sie **auch** an
einer Vue-Bindung hing. Vue vergleicht bei jedem Patch nur den von **ihm** zuletzt
berechneten Klassen-String mit dem neu berechneten — der tatsächliche DOM-Zustand
kommt in diesem Vergleich nicht vor. Blieb die Entscheidung über zwei Läufe gleich
(der Normalfall), hielt Vue seinen String für unverändert und schrieb `className` gar
nicht neu. Die extern entfernte Klasse kam **nie** zurück.

### Symptome
- Eine Klasse ist im Vue-Zustand gesetzt, `classList.contains` sagt `false`
- Sie erscheint **manchmal** wieder — nämlich wenn sich am selben Element eine
  völlig unabhängige Bindung ändert, weil Vue dann den ganzen String neu schreibt
- Genau das macht den Fehler so zäh: er sieht sporadisch aus, ist aber deterministisch

### Lösung
**Eine Klasse gehört entweder Vue oder dem imperativen Code — nie beiden.**
`zettel--meta-top` gehört jetzt ausschließlich einem Prop. Was der Messlauf früher
durch Umschalten der Klasse erzwang, wird arithmetisch aus dem gerade gerenderten
Zustand rekonstruiert.

### Prävention
- Vor jedem `classList.add/remove/toggle` prüfen, ob dieselbe Klasse in einer
  `:class`-Bindung vorkommt. **Auch `remove` ist betroffen**, nicht nur `add`.
- Der Beleg ist immer derselbe: DOM-Anzahl gegen die Größe der Zustandsmenge.
  Und eine **Negativkontrolle** — Klasse von Hand entfernen und zeigen, dass die
  Messung anschlägt und die Klasse über zwei erzwungene Renders **nicht** zurückkommt.

---

## 🐛 Bug #7: Content-Box gemessen, Border-Box gesetzt (18.08.2026)

### Problem
Zettel auf der Pinnwand wurden systematisch **18 px zu schmal** gesetzt. Sichtbare
Folge: die Fußzeile lief über den Bearbeiten-Stift und das Eselsohr hinaus und wurde
vom Zettelrand abgeschnitten — der Dringlichkeits-Stempel las sich als „FALLIG" ohne G.

### Root Cause
Der Messlauf bildete `natural`/`minimum` aus den Rechteckbreiten der **Kindelemente**
`.title` und `.foot` — das sind Content-Box-Maße des Zettels — und setzte sie als
**Border-Box**-Breite (`box-sizing: border-box` gilt global). Rahmen und Innenabstand
(2×2 + 2×7 = 18 px) fehlten nie berechnet. Die Sicherheitsmarge von 4 px deckte
weniger als ein Viertel davon und kaschierte den Rest so weit, dass es lange nicht auffiel.

### Symptome
- Ein Element ragt um einen **konstanten** Betrag über seinen Container hinaus
  (hier: 14,72 px an allen fußzeilengebundenen Zetteln)
- Konstant ist der Hinweis: ein Rechenfehler skaliert nicht mit dem Inhalt

### Lösung
Chrome per `getComputedStyle` je Element messen (`border*Width` + `padding*`) und zur
gemessenen Content-Breite addieren. **Gemessen statt verdrahtet**: eine Konstante 18
läuft still auseinander, sobald jemand das Polster ändert.

### Prävention
- Wer eine Kindbreite misst und sie am Elternelement setzt, muss die Differenz
  zwischen beiden Box-Modellen bewusst überbrücken.
- Der Beleg für „richtig" ist **nicht** „0 Überstände" — das käme auch bei einer zu
  großzügigen Rechnung heraus. Es ist `gesetzte Breite − (Bedarf + Chrome)`: hier
  4,00…4,86 px, also exakt die Marge plus Aufrundungsrest, kein Loch und kein Überschuss.

---

## 🐛 Bug #8: `completed` unterscheidet nicht zwischen erledigt und verschoben (18.08.2026)

### Problem
Das Verschieben wurde an bereits **erledigten** Aufgaben angeboten. Die Vorauswahl
rechnete dann von heute statt von der letzten Erledigung, und `postponed_until` schaltet
gleichzeitig die Kadenz-Weckklausel ab — die Aufgabe kam Wochen zu früh zurück.

### Root Cause
`postponeTask` setzt **selbst** `completed: true`. Auf der Spalte `tasks.completed` sind
„erledigt" und „verschoben" damit ununterscheidbar. Wer `completed` als Wächter benutzt,
trifft immer beide Zustände.

### Symptome
- Ein Wächter auf `completed` wirkt richtig und schaltet trotzdem den falschen Fall ab
- Fünf aufeinanderfolgende Ursachenerzählungen zu **einem** korrekt gemessenen
  Endzustand — drei davon rückwärts aus Zahlen und Code rekonstruiert

### Lösung
An der **Aufrufstelle** entschieden, nicht in der Prüffunktion:
`canPostpone(task) && (!task.completed || task.postponed_until !== null)`.
Der erste Entwurf (`&& !completed`) hätte im klassischen Aussehen das Ändern eines
gesetzten Verschiebe-Datums ersatzlos gestrichen.

### Prävention
- **Ein Ersatzsignal dort nachlesen, wo es geschrieben wird**, nicht wo es gelesen wird.
- Folgt eine gemessene Zahl nicht aus dem Code, ist die fehlende **Bedienreihenfolge**
  die erste Hypothese — und die steht im Verlauf, nicht im Bericht. Die 87 Tage dieses
  Falls waren am Ende ein Testartefakt (Kadenz nach dem Verschieben geändert).

---

## 🐛 Bug #9: Edge Function seit acht Monaten nicht deployt (18.08.2026) — Wiederholung von Bug #2

### Problem
`complete-task` lief in Produktion als **v21 vom 22.12.2025**. Der ausgelieferte
Funktionsrumpf enthielt **null** Vorkommen des neuen Feldes `emphasis_level`. Der
häufigste Reset-Pfad — jede normale und einmalige Aufgabe — hat nie gefeuert.

### Root Cause
`npx supabase db push` deployt keine Edge Functions. **Bug #2 wusste das bereits** und
führt „Edge Function deployen" als Schritt 6 seiner Checkliste — die Erkenntnis stand
aber nur hier, nicht in `docs/migrations.md` oder `CLAUDE.md`, also nicht dort, wo beim
Arbeiten nachgeschlagen wird. Mit dem Nachhol-Deploy ging außerdem ein Commit vom
02.01.2026 live, der ebenfalls nie deployt war.

### Symptome
- **Der Fehler ist still**: die Function antwortet weiter mit `HTTP 200`, schreibt alles
  Alte korrekt und lässt nur das Neue weg
- Mit optimistischer Anzeige sieht es kurz sogar richtig aus, bis das Nachladen den
  alten Serverwert zurückholt und der Wert sichtbar zurückspringt
- Ein Prüfschritt kann dadurch „bestanden" heißen, weil seine **Vorbedingung nie
  eintrat** — hier: „Zurückkleben stellt den Wert wieder her", wo der Wert nie 0 wurde

### Lösung
`npx supabase functions deploy complete-task`. Der Schritt steht jetzt in
`docs/migrations.md` **und** `CLAUDE.md`, samt Prüfanweisung.

### Prävention
- Nach dem Deploy die Version aus `npx supabase functions list` gegen das Commit-Datum
  halten. **Ein Deploy, der durchlief, ist nicht dasselbe wie eine Function, die das
  Neue enthält.**
- Vor der Deutung eines Messergebnisses prüfen, ob der geänderte Code überhaupt
  ausgeliefert wird — sonst misst man denselben stillen Fehlzustand zweimal und deutet
  ihn beim zweiten Mal falsch herum.
- **Eine Lehre gehört dorthin, wo gearbeitet wird.** Dass sie in dieser Datei steht,
  hat die Wiederholung nicht verhindert.

---

## 🐛 Bug #10: Ein `overflow: hidden`-Kasten fließt nicht um einen Float (18.08.2026)

### Problem
Der Zetteltitel sollte um den gefloateten Punkte-Sticker herumfließen — kurzer Titel
daneben, langer darunter weiter. Zwei Kommentare in `WallNote.vue` beschrieben es so.
Er tut es nicht: 21 von 60 Zetteln setzten ihren Titel mehrzeilig, obwohl sie ihre
volle gemessene Breite hatten.

### Root Cause
`.title` trägt `overflow: hidden` und öffnet damit einen eigenen
**Block-Formatierungskontext**. Ein BFC-Kasten darf den Float-Margin-Kasten nach
CSS 2.1 § 9.5 nicht überlappen — der Titelkasten wird deshalb über seine **ganze
Höhe** verengt, nicht nur in den Zeilen neben dem Float. Der Text steht in einer
schmaleren Spalte, jede Zeile gleich kurz.

### Symptome
- Gemessen: `head.clientWidth − title.clientWidth` = 41 px bei jedem Zettel mit
  Sticker oben, 0 bei allen anderen. Bei einem Float wäre die Differenz 0.
- Die Breitenmessung an `.title` allein beschrieb einen Titel, den es so nie gab.
- Zweiter, gefährlicherer Teil: die Untergrenze `minimum`. Bei einem Float rutscht
  ein zu langes Wort unter ihn und ist vollständig sichtbar; im BFC wird es still
  mit Ellipse abgeschnitten — gemessen 14, 23 und 35 px.

### Lösung
Die Sticker-Breite plus ihre Ränder zählt in `natural` **und** in `minimum`.

### Prävention
- **Eine Layout-Annahme ist erst dann bekannt, wenn sie gemessen ist.** Der Unterschied
  zwischen „fließt herum" und „steht daneben" ist eine einzige Zahl:
  `parent.clientWidth − child.clientWidth`.
- **`overflow: hidden` ist nie nur Clipping.** Es erzeugt einen BFC und ändert damit,
  wie der Kasten auf Floats reagiert. Wer es setzt oder entfernt, ändert Layout.
- Der falsche Kommentar stand hier **zweimal** und hat die Fehlannahme über Monate
  getragen. Ein Kommentar, der ein Verhalten behauptet, gehört an eine Messung geknüpft.

### Related Patterns
Bug #7 (Content-Box gemessen, Border-Box gesetzt) — dieselbe Klasse: die Messung
beschreibt eine andere Größe als die, die am Ende gesetzt wird.

---

## 🐛 Bug #11: Entschieden nach der gewünschten Breite, gebunden wird die geplante (18.08.2026)

### Problem
Eine Regel wählt zwischen zwei Zettel-Varianten die schmalere. Ergebnis: die Wand
wurde **13,4 % höher**, obwohl die Zettel zusammen kürzer und flächengleich waren —
reiner Packverlust.

### Root Cause
Verglichen wurden die **gewünschten** Breiten. Gebunden wird aber die **geplante**:
`defaultNoteWidth` klemmt jede Breite auf einen 45-%-Deckel. Lagen beide Varianten
über dem Deckel, waren sie in Wahrheit gleich breit — die Regel wählte trotzdem die
mit dem nominell kleineren Wunsch und nahm dem Titel dabei 41 px pro Zeile weg.
13 Zettel wurden dadurch 13…20 px breiter, **ohne eine Zeile zu gewinnen**.

### Symptome
- Summe der Zettelhöhen sinkt um 5 %, Wandhöhe steigt um 13,4 %.
- Einzelne Zettel: 145 px / 2 Zeilen → 161 px / 2 Zeilen. Breiter, gleich hoch.

### Lösung
Beide Varianten durch die **echte** Regel schicken (`defaultNoteWidth`) statt den
Deckel an der Entscheidungsstelle nachzubauen, und die Ergebnisse vergleichen.

### Prävention
- **Vergleiche nie Eingaben, wenn die Ausgabe nichtlinear ist.** Ein Deckel, ein
  `Math.max`, ein Runden — alles davon macht zwei verschiedene Wünsche zu einem
  gleichen Ergebnis.
- **Die Entscheidung nicht zweimal schreiben.** Eine nachgebaute Kopie der Regel an
  der Entscheidungsstelle läuft irgendwann auseinander; importieren ist billiger.
- Belegt wird so etwas nur mit einem A/B auf **identischem** Bestand. Am Einzelbeispiel
  sieht der breitere Zettel harmlos aus.

### Related Patterns
Bug #10 — beide fielen im selben Ticket an, beide betreffen die Kette
„messen → planen → setzen".

---

## 🐛 Bug #12: `getBoundingClientRect` an einem gedrehten Element (18.08.2026)

### Problem
Die Breite des Punkte-Stickers wurde mit `getBoundingClientRect().width` gemessen.
`.points` trägt `transform: rotate(-6deg)` (beim Fünf-Punkte-Stern −10°). Gemessen
wurden 37,37 px statt der Layoutbreite 34,00 px — jeder betroffene Zettel war
3 px zu breit, und der Wert speiste zusätzlich eine Entscheidungsregel.

### Root Cause
`getBoundingClientRect` liefert das **achsenparallele Umschließungsrechteck nach
der Transformation**. Eine Drehung bläht es auf. `transform` ändert das Layout
aber nicht — für eine Layoutrechnung ist der Wert schlicht falsch.

### Symptome
Systematischer Aufschlag, kein Ausreißer: bei −6° rund +10 %, bei −10° rund +16 %.
Fällt in keinem Klickpfad auf, weil das Ergebnis nur zu großzügig ist, nie zu knapp.

### Lösung
Die Neigung für den Moment der Messung per Inline-`transform: none` abschalten und
danach auf `''` zurücksetzen. **Nicht** `offsetWidth`: das rundet auf ganze Zahlen
ab und erzeugt die Umbrüche, gegen die derselbe Messblock schon `Math.ceil` einsetzt.

### Prävention
- Diese Falle stand als Falle 3 in `docs/testing.md` — als **Messfalle für QC-Agenten**.
  Sie ist dann im Produktivcode gelandet. Eine Lehre, die nur in der Testanleitung
  steht, schützt den Code nicht.
- Faustregel: `getBoundingClientRect` für Positionen auf dem Bildschirm,
  `getComputedStyle` / entdrehte Messung für Layoutbreiten.

### Related Patterns
Bug #7, Bug #10 — alle drei sind „gemessen wurde etwas anderes als das, was gesetzt wird".

---

## 📝 Template für neue Bug-Einträge

```markdown
## 🐛 Bug #X: [Kurze Beschreibung] (DD.MM.YYYY)

### Problem
[Was ist kaputt gegangen?]

### Root Cause
[Warum ist es kaputt gegangen?]

### Symptome
[Wie erkennt man das Problem?]
- Symptom 1
- Symptom 2

### Lösung
[Wie wurde es gefixt?]

### Prävention
[Wie vermeidet man das in Zukunft?]

### Related Patterns
[Ähnliche Probleme, die damit zusammenhängen]
```

---

## 🎯 Lessons Learned

### PostgREST / Supabase Specifics
- Schema Cache wird bei `RENAME` nicht zuverlässig aktualisiert
- Edge Functions müssen separat deployed werden (nicht Teil von `db push`)
- RLS-Policies cached PostgREST auch (bei Changes immer testen!)

### Migration Best Practices
- Column Renames: 3-Step-Migration (ADD → MIGRATE → DROP)
- NOT NULL Constraints: Erst Default-Werte setzen, dann Constraint
- Backfill-Scripts: Immer mit korrekten Daten (nicht 1 als Fallback)

### Full-Stack Consistency
- DB + Edge Function + Frontend müssen synchron sein
- Type-Änderungen: Alle Files mit Grep durchsuchen
- Parameter-Renames: Alle Call-Sites finden (nicht nur Type-Definitionen)
