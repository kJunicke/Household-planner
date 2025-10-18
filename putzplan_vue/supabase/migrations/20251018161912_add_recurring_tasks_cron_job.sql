-- Automatic Task Recurrence Reset via Cron Job
-- This migration creates a SQL function and schedules it to run daily via pg_cron

-- Step 1: Create the reset function
-- This function resets tasks to "dreckig" (completed = false) when their recurrence period has passed
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
  -- and collect the IDs of reset tasks
  WITH updated_tasks AS (
    UPDATE tasks
    SET completed = false
    WHERE recurrence_days > 0                    -- Only recurring tasks
      AND completed = true                       -- Only completed tasks
      AND last_completed_at IS NOT NULL          -- Must have been completed before
      AND (EXTRACT(EPOCH FROM (NOW() - last_completed_at)) / 86400) >= recurrence_days  -- Time exceeded
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

-- Add comment for documentation
COMMENT ON FUNCTION reset_recurring_tasks() IS
'Resets recurring tasks to incomplete status when their recurrence period has passed.
Returns count of reset tasks and their IDs.';

-- Step 2: Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 3: Schedule the cron job to run daily at 3:00 AM UTC
-- First, unschedule any existing job with the same name (for migration idempotency)
SELECT cron.unschedule('reset-recurring-tasks-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reset-recurring-tasks-daily'
);

-- Then schedule the new job
SELECT cron.schedule(
  'reset-recurring-tasks-daily',  -- Job name
  '0 3 * * *',                     -- Cron expression: Daily at 3:00 AM UTC
  'SELECT reset_recurring_tasks();' -- SQL command to execute
);

-- Verify the cron job was created
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-recurring-tasks-daily') THEN
    RAISE EXCEPTION 'Failed to create cron job: reset-recurring-tasks-daily';
  END IF;

  RAISE NOTICE 'Cron job "reset-recurring-tasks-daily" successfully scheduled to run daily at 3:00 AM UTC';
END $$;