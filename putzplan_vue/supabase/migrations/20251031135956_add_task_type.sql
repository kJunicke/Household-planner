-- =========================================================================
-- ADD TASK_TYPE FIELD - General/Daily Tasks Feature
-- =========================================================================
-- Adds task_type enum to differentiate between task categories:
-- - 'recurring': Tasks with recurrence_days logic (e.g., "Clean bathroom every 3 days")
-- - 'daily': Daily general tasks without recurrence (e.g., "Empty dishwasher", "Wipe surfaces")
-- - 'one-time': One-time tasks (e.g., "Fix broken lamp")
--
-- Migration Strategy:
-- - Existing tasks default to 'recurring' to preserve current behavior
-- - Daily tasks are always visible in UI, never auto-reset by cron
-- - Cron job ignores daily tasks (no automatic dirty marking)
-- =========================================================================

-- Add task_type column with CHECK constraint
ALTER TABLE tasks
ADD COLUMN task_type TEXT NOT NULL DEFAULT 'recurring'
CHECK (task_type IN ('recurring', 'daily', 'one-time'));

-- Create index for filtering by task_type
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);

-- COMMENT: Existing tasks are set to 'recurring' by DEFAULT
-- COMMENT: Daily tasks should be manually created with task_type = 'daily'
