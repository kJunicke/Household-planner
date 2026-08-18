-- Nachdruck (Ticket 09a) — Persistenz und Zurücksetzen
--
-- Nachdruck ist die von Hand gesetzte Aussage "diesmal ist es wichtig"
-- (→ CONTEXT.md, "Nachdruck"). Nicht zu verwechseln mit der berechneten
-- Dringlichkeit. Ein Gummistempel in der Fußzeile des Zettels schaltet
-- durch: 0 (kein Nachdruck) → 1 WICHTIG → 2 DRINGEND → 0. Rein optisch:
-- ändert weder Gruppe noch Reihenfolge der Zettel.
--
-- Der CHECK-Constraint hält die Spalte auf die drei gültigen Automat-Stufen
-- fest — auch wenn der Automat selbst (0→1→2→0) im Store liegt
-- (taskStore.cycleEmphasisLevel), nicht in der Datenbank.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS emphasis_level INTEGER NOT NULL DEFAULT 0
    CHECK (emphasis_level BETWEEN 0 AND 2);

COMMENT ON COLUMN tasks.emphasis_level IS
'Nachdruck: von Hand gesetzte Aussage "diesmal ist es wichtig", unabhängig von der
berechneten Dringlichkeit (→ CONTEXT.md, "Nachdruck"). 0 = kein Nachdruck,
1 = WICHTIG, 2 = DRINGEND. Rein optisch — beeinflusst weder Gruppe noch
Reihenfolge auf der Pinnwand.
Reset-Regeln (drei Fälle, siehe reset_recurring_tasks() und complete-task):
- normale/einmalige Aufgabe erledigt → zurück auf 0 (Edge Function complete-task)
- tägliche Aufgabe → zurück auf 0 beim nächtlichen Cron (reset_recurring_tasks),
  NICHT beim Erledigen, weil tägliche Aufgaben nie "completed" werden und
  mehrfach am Tag erledigt werden können
- Projekt → nie zurückgesetzt, Projekte werden nie fertig';

-- Keine RLS-Änderung nötig: die bestehende Policy "Users can update household
-- tasks" (20251026000001_rls_policies.sql) prüft nur household_id auf
-- Zeilenebene, keine Spaltenliste — sie deckt emphasis_level bereits ab, genau
-- wie jede andere Spalte auf tasks.

-- =================================================================
-- Nächtlicher Reset für tägliche Aufgaben
-- =================================================================
-- reset_recurring_tasks() ist der einzige nächtliche Vorgang im System
-- (pg_cron, täglich 3:00 UTC, siehe 20251026000003_cron_jobs.sql). Tägliche
-- Aufgaben (task_type = 'daily') laufen NIE durch die Kadenz-Klausel oben
-- (sie haben recurrence_days = 0 und completed bleibt dauerhaft false, siehe
-- complete-task/index.ts), deshalb bekommen sie hier einen eigenen, von der
-- Kadenz-Logik unabhängigen Schritt.
CREATE OR REPLACE FUNCTION reset_recurring_tasks()
RETURNS TABLE (
  tasks_reset_count INTEGER,
  reset_task_ids TEXT[]
)
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reset_count INTEGER;
  reset_ids TEXT[];
  parent_task_ids UUID[];
BEGIN
  -- Step 1: Parent-Aufgaben wecken — aus zwei unabhängigen Gründen
  WITH updated_parents AS (
    UPDATE tasks
    SET completed = false,
        -- Der Weckruf ist verbraucht, sobald er gewirkt hat. Bei der
        -- Kadenz-Klausel ist die Spalte ohnehin schon NULL.
        postponed_until = NULL
    WHERE completed = true
      AND parent_task_id IS NULL  -- Only parent tasks
      AND (
        -- (a) Verschiebe-Datum erreicht oder überschritten.
        -- BEWUSST OHNE Kadenz-Filter: auch einmalige Aufgaben müssen geweckt
        -- werden, sie haben kein recurrence_days.
        (postponed_until IS NOT NULL AND postponed_until <= CURRENT_DATE)

        -- (b) Kadenz abgelaufen — wie bisher, aber NUR wenn keine Verschiebung
        -- vorliegt. Ohne diese Zusatzbedingung weckt das alte last_completed_at
        -- die gerade verschobene Aufgabe in derselben Nacht wieder auf und das
        -- Verschieben wäre wirkungslos.
        OR (
          postponed_until IS NULL
          AND recurrence_days > 0
          AND last_completed_at IS NOT NULL
          AND (CURRENT_DATE - DATE(last_completed_at)) >= recurrence_days
        )
      )
    RETURNING task_id
  )
  SELECT ARRAY_AGG(task_id) INTO parent_task_ids FROM updated_parents;

  -- Step 2: Reset all subtasks of the reset parent tasks
  IF parent_task_ids IS NOT NULL THEN
    UPDATE tasks
    SET completed = false
    WHERE parent_task_id = ANY(parent_task_ids);
  END IF;

  -- Step 3: Count total reset tasks (parents + subtasks)
  WITH all_reset_tasks AS (
    SELECT task_id FROM tasks
    WHERE (task_id = ANY(parent_task_ids))  -- Reset parent tasks
       OR (parent_task_id = ANY(parent_task_ids))  -- Reset subtasks
  )
  SELECT
    COUNT(*)::INTEGER,
    ARRAY_AGG(task_id::TEXT)
  INTO reset_count, reset_ids
  FROM all_reset_tasks;

  RAISE NOTICE 'Reset % tasks (including subtasks)', reset_count;

  -- Step 4: Nachdruck (emphasis_level) täglicher Aufgaben zurücksetzen.
  -- Unabhängig von Step 1-3 (die hängen an completed=true, tägliche Aufgaben
  -- erreichen das nie) und unabhängig vom Rückgabewert oben — Nachdruck ist
  -- rein optisch und zählt nicht als "Aufgabe zurückgesetzt" im bisherigen
  -- Sinn dieser Funktion (kein completed-Übergang, keine Fälligkeit).
  -- Projekte (task_type = 'project') sind hier bewusst NICHT eingeschlossen:
  -- sie werden nie fertig, ihr Nachdruck bleibt stehen.
  UPDATE tasks
  SET emphasis_level = 0
  WHERE task_type = 'daily'
    AND emphasis_level > 0;

  RETURN QUERY SELECT reset_count, reset_ids;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_recurring_tasks() IS
'Setzt erledigte Aufgaben wieder auf dran, aus zwei Gründen:
(a) das Verschiebe-Datum (postponed_until) ist erreicht — ohne Kadenz-Filter,
    damit auch einmalige Aufgaben zurückkommen; die Spalte wird dabei geleert.
(b) die Kadenz ist abgelaufen — nur wenn KEINE Verschiebung vorliegt.
Setzt außerdem alle Subtasks der geweckten Parent-Aufgaben zurück.
Rechnet in KALENDERTAGEN (nicht 24h-Perioden).
Setzt zusätzlich den Nachdruck (emphasis_level) aller täglichen Aufgaben
(task_type = daily) zurück auf 0 — das ist ihr "nächtliches Zurücksetzen"
für Nachdruck, weil sie nie completed=true durchlaufen und daher Schritt 1-3
sie nie erfasst. Projekte sind davon ausdrücklich ausgenommen.
Gibt Anzahl und IDs der geweckten Aufgaben zurück (unverändert gegenüber
vorherigen Versionen — der Nachdruck-Reset zählt nicht mit).';
