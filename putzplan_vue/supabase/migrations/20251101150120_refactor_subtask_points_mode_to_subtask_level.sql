-- Refactor: Move subtask_points_mode from parent-level to individual subtask level
-- This allows each subtask to have its own points calculation mode

-- STEP 1: Drop old parent-level column (was only used for all subtasks collectively)
ALTER TABLE tasks
DROP COLUMN IF EXISTS subtask_points_mode;

-- STEP 2: Drop old ENUM type
DROP TYPE IF EXISTS subtask_points_mode;

-- STEP 3: Create new ENUM type for individual subtask points mode
CREATE TYPE subtask_points_mode AS ENUM ('checklist', 'deduct', 'bonus');

-- STEP 4: Add subtask_points_mode to EACH task (applies to subtasks only)
-- For parent tasks (parent_task_id IS NULL), this column is ignored
-- For subtasks (parent_task_id IS NOT NULL), this determines points calculation
ALTER TABLE tasks
ADD COLUMN subtask_points_mode subtask_points_mode NOT NULL DEFAULT 'checklist';

COMMENT ON COLUMN tasks.subtask_points_mode IS
'Determines how this INDIVIDUAL subtask affects points calculation when completed:
- checklist: This subtask counts 0 points (only for tracking completion)
- deduct: This subtask effort is deducted from parent effort when completed
- bonus: This subtask gives full effort points in addition to parent

Note: This column is only relevant for subtasks (parent_task_id IS NOT NULL).
For parent tasks, this value is ignored.';
