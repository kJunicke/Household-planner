-- Hotfix: Backfill effort_override with actual task.effort values from tasks table
-- Previous migration set all NULLs to 1, but this should use the actual task effort
-- This preserves historical accuracy for stats calculations

-- Update all completions where effort_override = 1 (default from previous migration)
-- Use the actual task.effort value from the tasks table
UPDATE task_completions tc
SET effort_override = COALESCE(t.effort, 1)
FROM tasks t
WHERE tc.task_id = t.task_id
  AND tc.effort_override = 1;

-- For any orphaned completions (task deleted), ensure effort_override is at least 1
UPDATE task_completions
SET effort_override = 1
WHERE effort_override IS NULL OR effort_override = 0;
