-- =================================================================
-- REMOVE TRIGGER: update_last_completed_at
-- =================================================================
-- Migration: Move logic from DB trigger to Edge Function
-- Reason: Better developer experience (TypeScript vs SQL debugging)
-- Date: 2025-10-26
--
-- What changes:
-- - DROP trigger that auto-updates tasks.last_completed_at
-- - DROP function update_last_completed_at()
-- - Edge Function 'complete-task' now handles this logic
--
-- Security: No change - RLS policies remain identical
-- =================================================================

SET search_path = public, pg_temp;

-- Drop trigger first (depends on function)
DROP TRIGGER IF EXISTS trigger_update_last_completed_at ON task_completions;

-- Drop function
DROP FUNCTION IF EXISTS update_last_completed_at();

-- =================================================================
-- NOTES
-- =================================================================
-- After this migration:
-- - Frontend must use Edge Function for completeTask()
-- - Direct INSERT into task_completions will NOT auto-update tasks.last_completed_at
-- - Edge Function handles both: INSERT completion + UPDATE task
