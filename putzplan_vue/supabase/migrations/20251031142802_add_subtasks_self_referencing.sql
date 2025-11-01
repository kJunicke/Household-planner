-- Add parent_task_id column (self-referencing FK)
-- NULL = regular parent task, NOT NULL = subtask
ALTER TABLE tasks
ADD COLUMN parent_task_id UUID REFERENCES tasks(task_id) ON DELETE CASCADE;

-- Add order_index for sorting subtasks within a parent task
ALTER TABLE tasks
ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;

-- Create index for fast subtask queries
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_task_id);

-- Create composite index for ordered subtask queries
CREATE INDEX IF NOT EXISTS idx_tasks_parent_order ON tasks(parent_task_id, order_index);
