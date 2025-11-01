-- Extend reset_recurring_tasks() to also reset subtasks
-- When a parent task is reset, all its subtasks should also be reset

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
  -- Step 1: Reset parent tasks that have exceeded their recurrence period
  WITH updated_parents AS (
    UPDATE tasks
    SET completed = false
    WHERE recurrence_days > 0
      AND completed = true
      AND last_completed_at IS NOT NULL
      AND parent_task_id IS NULL  -- Only parent tasks
      AND (CURRENT_DATE - DATE(last_completed_at)) >= recurrence_days
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

  RAISE NOTICE 'Reset % recurring tasks (including subtasks)', reset_count;

  RETURN QUERY SELECT reset_count, reset_ids;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_recurring_tasks() IS
'Resets recurring tasks to incomplete status when their recurrence period has passed.
Also resets all subtasks of the reset parent tasks.
Uses CALENDAR DAYS (not 24h periods) for user-friendly behavior.
Returns count of reset tasks (parents + subtasks) and their IDs.';
