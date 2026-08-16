-- Aufgabe verschieben (Etappe 4)
--
-- Verschieben heißt: die Aufgabe ist bis zu einem gewählten Datum nicht dran,
-- ohne dass jemand sie erledigt hat und ohne dass Punkte vergeben werden. Ihr
-- Intervall bleibt unverändert, last_completed_at bleibt unangetastet.
--
-- postponed_until ist AUSDRÜCKLICH KEINE zweite Quelle für "dran" — die Frage
-- beantwortet weiterhin allein tasks.completed (ADR-0001). Die Spalte ist nur
-- der Weckruf für den nächtlichen Cron.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS postponed_until DATE;

COMMENT ON COLUMN tasks.postponed_until IS
'Datum, an dem eine verschobene Aufgabe wieder dran sein soll. NULL = nicht verschoben.
Keine Dranheits-Quelle (das bleibt tasks.completed), sondern der Weckruf für
reset_recurring_tasks(). Wird beim Wecken und beim manuellen "wieder dreckig" geleert.';

-- Der Cron bekommt eine zweite Weck-Klausel und die Kadenz-Klausel eine
-- Zusatzbedingung.
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
Gibt Anzahl und IDs der geweckten Aufgaben zurück.';
