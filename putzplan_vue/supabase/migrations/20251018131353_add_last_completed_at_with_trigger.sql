-- Add last_completed_at to tasks table
-- This field is automatically updated via trigger from task_completions table
-- Ensures consistency: task_completions is single source of truth

-- Step 1: Add column to tasks table
ALTER TABLE tasks
ADD COLUMN last_completed_at TIMESTAMPTZ DEFAULT NULL;

-- Step 2: Backfill existing data from task_completions
-- For each task, find the most recent completion and set last_completed_at
UPDATE tasks
SET last_completed_at = (
  SELECT completed_at
  FROM task_completions
  WHERE task_completions.task_id = tasks.task_id
  ORDER BY completed_at DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM task_completions WHERE task_completions.task_id = tasks.task_id
);

-- Step 3: Create trigger function to auto-update last_completed_at
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

-- Step 4: Create trigger on task_completions INSERT
CREATE TRIGGER trigger_update_task_last_completed_at
AFTER INSERT ON task_completions
FOR EACH ROW
EXECUTE FUNCTION update_task_last_completed_at();

-- Index for performance on last_completed_at queries
CREATE INDEX IF NOT EXISTS idx_tasks_last_completed_at ON tasks(last_completed_at);