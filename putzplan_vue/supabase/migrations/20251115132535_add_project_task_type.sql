-- Add 'project' to task_type CHECK constraint
-- Remove old constraint
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;

-- Add new constraint with 'project' option
ALTER TABLE tasks
ADD CONSTRAINT tasks_task_type_check
CHECK (task_type IN ('recurring', 'daily', 'one-time', 'project'));

-- No additional columns needed - using existing last_completed_at for project completion timestamp
