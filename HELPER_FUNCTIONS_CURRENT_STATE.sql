-- =================================================================
-- HELPER FUNCTIONS - Current State (Pre-Consolidation)
-- =================================================================
-- Extracted: 2025-10-26
-- These functions are critical for RLS and Cron functionality
-- =================================================================

-- ================================================================
-- 1. get_user_household_id() - RLS Helper
-- =================================================================
-- Source: 20251024205322_fix_rls_no_subquery.sql
-- Purpose: Bypass RLS recursion in household_members SELECT policy
-- Security: SECURITY DEFINER runs with owner permissions
-- Used in: household_members SELECT policy

CREATE OR REPLACE FUNCTION get_user_household_id(user_uuid UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT household_id
  FROM household_members
  WHERE user_id = user_uuid
  LIMIT 1;
$$;

-- =================================================================
-- 2. reset_recurring_tasks() - Cron Function
-- =================================================================
-- Source: 20251019121735_fix_recurrence_calendar_days.sql
-- Purpose: Reset recurring tasks when recurrence period passed
-- Logic: Calendar Days (not 24h periods)
-- Schedule: Daily at 3:00 AM UTC via pg_cron
-- Returns: Count of reset tasks + their IDs

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

COMMENT ON FUNCTION reset_recurring_tasks() IS
'Resets recurring tasks to incomplete status when their recurrence period has passed.
Uses CALENDAR DAYS (not 24h periods) for user-friendly behavior.
Example: A task completed on Oct 18 at 14:00 with 1-day recurrence will be reset
on Oct 19 at 03:00 (cron time), not at 14:00.
Returns count of reset tasks and their IDs.';

-- =================================================================
-- 3. update_last_completed_at() - Trigger Function
-- =================================================================
-- Source: 20251018131353_add_last_completed_at_with_trigger.sql
-- Purpose: Auto-update tasks.last_completed_at from task_completions
-- Trigger: ON task_completions INSERT
-- Ensures: task_completions is single source of truth

CREATE OR REPLACE FUNCTION update_task_last_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the task's last_completed_at with the new completion timestamp
  UPDATE tasks
  SET last_completed_at = NEW.completed_at
  WHERE task_id = NEW.task_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- NOTES
-- =================================================================
-- All functions use:
-- - SECURITY DEFINER: Run with owner permissions (careful!)
-- - SET search_path = public, pg_temp: Prevent search_path attacks
-- - Language: plpgsql or sql depending on complexity
