-- =================================================================
-- CRON JOBS - Recurring Tasks Reset
-- =================================================================
-- Automatically resets recurring tasks to "dirty" after X days
-- Source: archive/20251019121735_fix_recurrence_calendar_days.sql
--         archive/20251018161912_add_recurring_tasks_cron_job.sql
--
-- Logic: Calendar Days (not 24h periods)
-- Example: Task completed 18.10 14:00 → Reset 19.10 3:00 (1 calendar day passed)
--
-- Cron Schedule: Daily at 3:00 AM UTC
-- =================================================================

-- Function: Reset recurring tasks that are overdue
-- Returns: Count of reset tasks + their IDs for logging
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

  -- Log for debugging (visible in Supabase logs)
  RAISE NOTICE 'Reset % recurring tasks', reset_count;

  -- Return statistics
  RETURN QUERY SELECT reset_count, reset_ids;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_recurring_tasks() IS
'Resets recurring tasks to incomplete status when their recurrence period has passed.
Uses CALENDAR DAYS (not 24h periods) for user-friendly behavior.
Example: A task completed on Oct 18 at 14:00 with 1-day recurrence will be reset
on Oct 19 at 03:00 (cron time), not at 14:00.
Returns count of reset tasks and their IDs.';

-- Cron Job: Run reset_recurring_tasks() daily at 3:00 AM UTC
-- Note: pg_cron extension must be enabled in Supabase project settings
-- Alternative: Supabase Edge Functions + scheduled invocations
SELECT cron.schedule(
  'reset-recurring-tasks-daily',  -- Job name
  '0 3 * * *',                    -- Cron expression: 3:00 AM UTC daily
  $$ SELECT reset_recurring_tasks(); $$
);

-- =================================================================
-- VERIFICATION
-- =================================================================
-- Check if cron job is registered:
-- SELECT * FROM cron.job WHERE jobname = 'reset-recurring-tasks-daily';
--
-- Check cron job runs:
-- SELECT * FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'reset-recurring-tasks-daily')
-- ORDER BY start_time DESC LIMIT 10;
--
-- Manual trigger for testing:
-- SELECT * FROM reset_recurring_tasks();
--
-- Expected output:
-- tasks_reset_count | reset_task_ids
-- ------------------+----------------
--                 3 | {uuid1,uuid2,uuid3}
