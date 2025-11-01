-- Add subtask_points_mode column to tasks table
-- Determines how subtasks affect parent task points calculation
-- 'checklist': Subtasks count 0 points (only parent completion counts) - DEFAULT
-- 'deduct': Subtask effort is deducted from parent effort
-- 'bonus': Subtasks count in addition to parent (double points possible)

-- Create ENUM type for subtask_points_mode
CREATE TYPE subtask_points_mode AS ENUM ('checklist', 'deduct', 'bonus');

-- Add column with default 'checklist' (backwards compatible)
ALTER TABLE tasks
ADD COLUMN subtask_points_mode subtask_points_mode NOT NULL DEFAULT 'checklist';

COMMENT ON COLUMN tasks.subtask_points_mode IS
'Determines how subtasks affect parent task points:
- checklist: Subtasks count 0 points (only parent gives points)
- deduct: Parent effort - SUM(completed subtask efforts)
- bonus: Subtasks give full points in addition to parent';
