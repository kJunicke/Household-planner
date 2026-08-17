# Datenmodell & Business-Logik

**Source of Truth**: Supabase Schema.
*Frontend-Types können temporär abweichen für MVP-Geschwindigkeit.*

## Tabellen & Primary Keys

Wichtig für `.eq()`-Queries — die PKs heißen nicht `id`.

- `households` — PK: `household_id`
  - `weekly_goal_points` (INTEGER, Default 30) — gemeinsames **Wochenziel** in Punkten,
    gilt sofort für die laufende Woche
  - `week_start_day` (SMALLINT, Default 1 = Montag) — der Wochenstart, der **gerade
    gilt**, in JS-`getDay()`-Konvention (0 = Sonntag)
  - `week_start_day_pending` (SMALLINT, nullable) + `week_start_pending_from` (DATE,
    nullable) — der **nächste** Wochenstart und der Kalendertag, ab dem er gilt.
    Beide NULL, solange nichts ansteht. Ein geänderter Wochenstart darf die laufende
    Woche nicht neu zuschneiden, sonst verschwänden gesammelte Punkte scheinbar; der
    Wechseltag wird deshalb **einmal beim Speichern** berechnet (erstes Auftreten des
    neuen Wochentags am oder nach dem Ende der laufenden Woche) und liegt am Haushalt,
    nicht am Gerät — zwei Mitglieder müssen dasselbe Wochenfenster sehen.
    Die Übergangswoche ist dadurch einmalig länger (bis 13 Tage); nichts verschwindet,
    nichts zählt doppelt. Das Fortschreiben Pending → Aktiv erledigen die Clients beim
    Laden und ist idempotent — die Leseregel wendet ein fälliges Pending ohnehin schon
    an, das Fortschreiben ist reines Aufräumen.
  - `households` steht in der Publikation `supabase_realtime`, damit die Änderung des
    einen Mitglieds beim anderen ohne Reload ankommt
  - Beide gehören dem Haushalt, jedes Mitglied darf sie ändern. **Keine Historie** —
    sichtbar ist immer nur die laufende Woche (→ `CONTEXT.md`, „Wochenziel")
- `household_members` — PK: `user_id` (**One ID per user!** — referenziert `auth.users.id`)
  - Hat `display_name` (Email-Prefix als Fallback beim Join/Create)
  - Keine redundante `member_id` mehr (wurde entfernt für einfacheres Datenmodell)
- `tasks` — PK: `task_id` (Task-Templates mit `recurrence_days`, `last_completed_at`, `task_type`)
  - **Soft Delete**: `deleted_at` Column (NULL = aktiv, Timestamp = gelöscht)
    - Gelöschte Tasks bleiben für Historie erhalten (Task-Namen sichtbar in HistoryView)
    - `loadTasks()` filtert mit `.is('deleted_at', null)`
    - `deleteTask()` setzt `deleted_at` statt echtem DELETE
  - `task_type` — Enum mit Subtask-Verhalten:
    - `'recurring'`: Zeitbasiert, **alle Subtask-Modi erlaubt** (checklist/deduct/bonus)
    - `'daily'`: Immer sichtbar, **nur 'bonus' Subtasks** (eigenständige Belohnungen)
    - `'one-time'`: Einmalig, **alle Subtask-Modi erlaubt**
    - `'project'`: Langfristig, **nur 'checklist' + 'bonus'** (kein deduct)
- `task_completions` — PK: `completion_id` (Append-only Historie, **Single Source of Truth**)
  - `user_id` referenziert direkt `auth.users.id`
  - `is_quick` — Boolean (Default `FALSE`): markiert Quick-Aufgaben (einmalig + sofort
    abgeschlossen, nur in Historie sichtbar). HistoryView zeigt dafür ein „Quick"-Badge
    statt des „Gelöscht"-Badges (obwohl der Task soft-deleted ist)
  - **Ausnahme vom Append-only**: **Zurückkleben** (Pinnwand) löscht die eigene jüngste
    Zeile einer Aufgabe wieder. Solange der Fetzen hängt, sagt der Nutzer, dass die
    Erledigung ein Fehlgriff war — sie beschreibt keine Tatsache. Eine Gegenbuchung wäre
    ein erfundenes zweites Ereignis; `effort_override` ist als Punktwert einer Leistung
    definiert, nicht als Vorzeichen. Abgesichert über die bestehende RLS-Policy, die
    `DELETE` auf eigene Zeilen im eigenen Haushalt begrenzt. Zurückgeschrieben wird dabei
    auch ein Schnappschuss der Aufgabe — insbesondere `last_completed_at`, weil es den
    Kadenz-Anker bildet
- `shopping_items` — PK: `shopping_item_id` (Einkaufsliste mit Purchase-Tracking)
  - `times_purchased` — Counter für Kaufhäufigkeit
  - `last_purchased_at`, `last_purchased_by` — Tracking von letztem Einkauf
  - `purchased` — Boolean für aktuellen Status (gekauft/nicht gekauft)
  - `category` — Freitext-Kategorie (nullable, `NULL` = „Unkategorisiert"); nur „Zu kaufen" gruppiert
  - `quantity` — Menge (INT, `>= 1`, Default 1); reines ×N-Label
- `notes` — PK: `note_id` (Haushalt-Notizen)
  - `content` — Textinhalt der Notiz
  - `created_by` — User der die Notiz erstellt hat
  - `created_at`, `updated_at` — Timestamps

## Task Recurrence & Completion

- Frontend: `completeTask()` ruft Edge Function auf, `markAsDirty()` setzt nur `tasks.completed`
- **Edge Function** (`complete-task`): TypeScript-Business-Logik für Task-Completion
  - Schreibt in `task_completions` Historie
  - Updated `tasks.completed` + `tasks.last_completed_at`
  - Ersetzt alten DB-Trigger (besseres Debugging, TypeScript statt SQL)
  - ✅ CORS-Headers für localhost Development
- **Backend Cron**: SQL Function `reset_recurring_tasks()` + pg_cron (täglich 3:00 UTC) setzt
  überfällige Tasks automatisch auf dreckig
  - **Calendar Days Logic**: `CURRENT_DATE - DATE(last_completed_at)` für ganze Tage (nicht 24h-Perioden)
  - Beispiel: Task completed am 18.10. um 14:00 → Reset am 19.10. um 3:00 (1 ganzer Tag vergangen)

## Subtask Points Modes (Task-Type-abhängig)

**Erlaubte Modi je Task Type:**

- **Daily (`task_type: 'daily'`)**: nur `bonus`
  - Grund: Daily tasks werden nie completed → Subtasks nie resettet → nur Bonus verhindert Doppelpunkte
- **Project (`task_type: 'project'`)**: nur `checklist` + `bonus` (kein `deduct`)
  - Grund: Projects haben „Am Projekt arbeiten"-Subtask mit custom Effort-Logging
- **Recurring / One-time**: alle Modi (`checklist`, `deduct`, `bonus`)

**Modus-Bedeutung:**

- `'checklist'`: 0 Punkte (nur Tracking, Fortschritts-Anzeige)
- `'deduct'`: Aufwand wird von Parent-Effort abgezogen (Parent − Deduct = finale Punkte)
- `'bonus'`: Volle Punkte zusätzlich zum Parent (eigenständige Belohnung)

**Business Logic (Daily Tasks):**

1. Daily task completed → `tasks.completed` bleibt `false` (Edge Function)
2. `task_completions` wird trotzdem geschrieben (History-Tracking)
3. Subtasks werden NICHT resettet (kein Parent-Complete-Trigger)
4. Lösung: nur Bonus-Subtasks → User versteht „Extra-Belohnung", kein Doppelpunkt-Problem

**UI-Verhalten:**

- SubtaskManagementModal: bei Daily kein Modus-Selector (auto-select bonus)
- TaskCard: bei Daily keine Gruppierung (flache Liste, alle Subtasks = Bonus)
