-- Fix function_search_path_mutable security warning
-- Sets explicit search_path to prevent schema injection attacks
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

-- ============================================================================
-- SECURITY EXPLANATION
-- ============================================================================
-- Without SET search_path, a malicious user could create a table/function
-- in their own schema that shadows legitimate objects, causing the function
-- to access the wrong data.
--
-- Example Attack without search_path:
--   1. Attacker creates schema "evil" and table "evil.tasks"
--   2. Attacker sets their session search_path to "evil, public"
--   3. Function runs and reads from evil.tasks instead of public.tasks!
--
-- Fix: SET search_path = public, pg_temp
--   - Forces function to ALWAYS use public schema first
--   - pg_temp last to allow temp tables but prevent shadowing
-- ============================================================================


-- Fix 1: is_task_completed function
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
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;  -- SECURITY FIX


-- Fix 2: update_task_last_completed_at trigger function
CREATE OR REPLACE FUNCTION update_task_last_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the task's last_completed_at with the new completion timestamp
  UPDATE tasks
  SET last_completed_at = NEW.completed_at
  WHERE task_id = NEW.task_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;  -- SECURITY FIX