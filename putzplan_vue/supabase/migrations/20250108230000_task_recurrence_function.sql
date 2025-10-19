-- Task Recurrence System: Check if task is currently completed
-- Calculates completion status based on last completion and recurrence_days
--
-- Returns:
--   TRUE  - Task was completed and is still valid (within recurrence period)
--   FALSE - Task was never completed or recurrence period expired
--
-- Examples:
--   - One-time task (recurrence_days = 0): Always completed once done
--   - Recurring task (recurrence_days = 3): Completed if done within last 3 days

CREATE OR REPLACE FUNCTION is_task_completed(
  p_task_id UUID,
  p_recurrence_days INTEGER
) RETURNS BOOLEAN AS $$

DECLARE
  last_completion TIMESTAMPTZ;

BEGIN
  -- Find most recent completion for this task
  SELECT completed_at INTO last_completion
  FROM task_completions
  WHERE task_id = p_task_id
  ORDER BY completed_at DESC
  LIMIT 1;

  -- No completion found
  IF last_completion IS NULL THEN
    RETURN FALSE;
  END IF;

  -- One-time tasks stay completed forever
  IF p_recurrence_days = 0 THEN
    RETURN TRUE;
  END IF;

  -- Check if completion is still within recurrence period
  RETURN (NOW() - last_completion) < (p_recurrence_days || ' days')::INTERVAL;

END;
$$ LANGUAGE plpgsql;
