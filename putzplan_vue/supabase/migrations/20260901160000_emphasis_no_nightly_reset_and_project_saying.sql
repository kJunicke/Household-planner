-- Überstempeln: der Verfall wird zurückgebaut + Projektspruch bekommt eine Spalte
--
-- Zwei Aufgaben in einer Migration, weil beide denselben Produktionszugriff
-- kosten — nicht, weil sie inhaltlich zusammengehören.
--
-- (1) Das nächtliche Zurücksetzen des Nachdrucks entfällt ersatzlos.
--     Zurückgesetzt wird beim Erledigen, sonst nie — auch bei täglichen
--     Aufgaben (→ CONTEXT.md, "Überstempeln"; ADR-0002). Die alte Regel kam
--     aus einer Spec, die ADR-0002 umgekehrt hat, ohne es zu kennen;
--     aufgelöst am 01.09.2026 zugunsten des ADR.
--     Migrations sind append-only: 20260818114407_add_task_emphasis_level.sql
--     bleibt unangetastet, Schritt 4 verschwindet hier per CREATE OR REPLACE.
--
-- (2) Der Projektspruch braucht eine eigene Spalte. Er wird gespeichert, nicht
--     gerechnet — sonst sähe das zweite Haushaltsmitglied ein anderes Wort und
--     nach dem Neuladen stünde wieder das alte da (→ CONTEXT.md,
--     "Projektspruch").
--
-- Am CHECK-Constraint auf emphasis_level (BETWEEN 0 AND 2) ändert sich nichts.

-- =================================================================
-- (1) reset_recurring_tasks() ohne Nachdruck-Reset
-- =================================================================
-- Schritt 1-3 (Kadenz, Verschiebung, Subtasks) sind wörtlich unverändert
-- gegenüber 20260818114407_add_task_emphasis_level.sql. Weg ist allein der
-- frühere Schritt 4 (UPDATE tasks SET emphasis_level = 0 WHERE task_type =
-- 'daily'). Die Funktion fasst emphasis_level ab jetzt überhaupt nicht mehr an.
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
Fasst emphasis_level NICHT an: der Nachdruck verfällt beim Erledigen, sonst nie
(→ CONTEXT.md, "Überstempeln"). Ein nächtliches Zurücksetzen gibt es nicht —
der frühere Schritt 4 ist am 01.09.2026 ersatzlos entfallen.
Gibt Anzahl und IDs der geweckten Aufgaben zurück.';

COMMENT ON COLUMN tasks.emphasis_level IS
'Überstempeln: von Hand gesetzte Aussage "diesmal ist es wichtig", unabhängig von der
berechneten Dringlichkeit (→ CONTEXT.md, "Überstempeln"). 0 = nur Grundabdruck,
1 = WICHTIG, 2 = DRINGEND. Rein optisch — beeinflusst weder Gruppe noch
Reihenfolge auf der Pinnwand.
Zurückgesetzt wird beim Erledigen, sonst nie — auch bei täglichen Aufgaben.
Ausgenommen sind allein Projekte (task_type = project): sie werden nie fertig,
ihr Stapel bleibt stehen. Die Regel greift nach dem EIGENEN task_type, nicht nach
dem Elternknoten.
Im Code steht sie an ZWEI Stellen: Edge Function complete-task und optimistischer
Pfad im Store (taskStore.ts). Nicht mehr in dieser Datenbank — reset_recurring_tasks()
rührt die Spalte seit dem 01.09.2026 nicht mehr an.';

-- =================================================================
-- (2) Projektspruch: der Listenplatz wird gespeichert
-- =================================================================
-- Der Grundabdruck eines Projekts ist ein Spruch aus einer festen Liste von 100.
-- Gespeichert wird nur sein Listenplatz (0-99), nicht der Text: die Liste lebt
-- im Frontend, und ein Umbenennen eines Spruchs soll keine Migration kosten.
-- emphasis_level kann den Platz nicht tragen, die Spalte hält nur 0 bis 2.
--
-- Bewusst in drei Schritten (nullable → UPDATE → NOT NULL + Default), statt sich
-- darauf zu verlassen, wie Postgres einen volatilen Default beim Hinzufügen einer
-- Spalte auswertet: seit PG 11 wird ein Default beim ADD COLUMN EINMAL berechnet
-- und für alle bestehenden Zeilen als derselbe Wert hinterlegt. Alle Projekte
-- trügen dann denselben Spruch. Das UPDATE unten wertet random() dagegen pro
-- Zeile aus.
--
-- Die Spalte sitzt auf allen Zeilen, nicht nur auf Projekten. Ein NOT NULL auf
-- einer Spalte, die nur für einen task_type gilt, ist billiger als überall
-- NULL-Prüfungen — und ein ungenutzter Listenplatz auf einem normalen Zettel
-- kostet nichts.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS project_saying_index INTEGER;

UPDATE tasks
SET project_saying_index = floor(random() * 100)::INTEGER
WHERE project_saying_index IS NULL;

ALTER TABLE tasks
  ALTER COLUMN project_saying_index SET DEFAULT floor(random() * 100)::INTEGER;

ALTER TABLE tasks
  ALTER COLUMN project_saying_index SET NOT NULL;

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_project_saying_index_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_project_saying_index_check
    CHECK (project_saying_index BETWEEN 0 AND 99);

COMMENT ON COLUMN tasks.project_saying_index IS
'Projektspruch: Listenplatz (0-99) des Spruchs, den ein Projekt gerade trägt
(→ CONTEXT.md, "Projektspruch"). Der Spruch selbst steht im Frontend; hier liegt
nur sein Platz in der Liste von 100.
Wird bei der Anlage eines Projekts zufällig gezogen und bleibt stehen, während der
Stapel darüber wächst. Beim Abräumen des Stapels wird ein neuer gezogen, nie
derselbe zweimal hintereinander.
Er gehört dem Haushalt, nicht dem Gerät — deshalb gespeichert und nicht gerechnet.
Nur für task_type = project bedeutsam; auf allen anderen Zeilen steht ein Wert,
der nie gelesen wird. Bestehende Zeilen wurden bei Einführung zufällig befüllt.';

-- Keine RLS-Änderung nötig: die bestehende Policy "Users can update household
-- tasks" (20251026000001_rls_policies.sql) prüft nur household_id auf
-- Zeilenebene, keine Spaltenliste — sie deckt project_saying_index bereits ab.
