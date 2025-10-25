-- Rollback: Remove auto-update triggers for tasks.completed
-- These triggers are replaced by:
--   1. Frontend: Direct UPDATE on tasks.completed for immediate UI feedback
--   2. Backend: Daily cron job for automatic recurrence (TRUE to FALSE only)
--
-- Rationale:
--   - Frontend has full control over task status
--   - task_completions remains append-only history (never deleted)
--   - Simpler architecture with clear separation of concerns

-- Drop triggers
DROP TRIGGER IF EXISTS task_completion_insert_trigger ON task_completions;
DROP TRIGGER IF EXISTS task_completion_delete_trigger ON task_completions;

-- Drop trigger functions
DROP FUNCTION IF EXISTS update_task_completed_on_insert();
DROP FUNCTION IF EXISTS update_task_completed_on_delete();

-- Keep is_task_completed() function - will be used by daily cron job later
-- (See: supabase/functions/daily-recurrence-check)
