-- Fix Task Recurrence: Use Calendar Days instead of Decimal Days
-- 
-- PROBLEM: Old logic used decimal days (e.g., 0.91, 1.54) which means:
--   - Task completed: 18.10. at 14:00
--   - Cron runs: 19.10. at 03:00
--   - Time passed: 13 hours = 0.54 days → NOT reset (❌)
--
-- SOLUTION: Use calendar days (integers) which means:
--   - Task completed: 18.10. (any time)
--   - Cron runs: 19.10. at 03:00
--   - Days passed: 1 full calendar day → RESET (✅)
--
-- This is what users expect: "daily tasks" should reset every calendar day,
-- not every 24-hour period!

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
BEGIN
  -- Update tasks that have exceeded their recurrence period
  -- using CALENDAR DAYS instead of decimal days
  WITH updated_tasks AS (
    UPDATE tasks
    SET completed = false
    WHERE recurrence_days > 0                                    -- Only recurring tasks
      AND completed = true                                       -- Only completed tasks
      AND last_completed_at IS NOT NULL                          -- Must have been completed before
      AND (CURRENT_DATE - DATE(last_completed_at)) >= recurrence_days  -- Calendar days (NOT decimal!)
    RETURNING task_id
  )
  SELECT
    COUNT(*)::INTEGER,
    ARRAY_AGG(task_id::TEXT)
  INTO reset_count, reset_ids
  FROM updated_tasks;

  -- Return statistics
  RETURN QUERY SELECT reset_count, reset_ids;
END;
$$ LANGUAGE plpgsql;

-- Update comment for documentation
COMMENT ON FUNCTION reset_recurring_tasks() IS
'Resets recurring tasks to incomplete status when their recurrence period has passed.
Uses CALENDAR DAYS (not 24h periods) for user-friendly behavior.
Example: A task completed on Oct 18 at 14:00 with 1-day recurrence will be reset
on Oct 19 at 03:00 (cron time), not at 14:00.
Returns count of reset tasks and their IDs.';

-- Test the new logic immediately
DO $$
DECLARE
  result RECORD;
BEGIN
  RAISE NOTICE '=== Testing new calendar days logic ===';
  
  -- Call the function
  SELECT * INTO result FROM reset_recurring_tasks();
  
  RAISE NOTICE 'Tasks reset: %', result.tasks_reset_count;
  
  IF result.tasks_reset_count > 0 THEN
    RAISE NOTICE 'Reset task IDs: %', result.reset_task_ids;
  ELSE
    RAISE NOTICE 'No tasks needed to be reset';
  END IF;
END $$;
