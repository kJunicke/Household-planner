-- Unified Solution: Make effort_override the Single Source of Truth for historical points
-- Previously: effort_override was only set when user manually changed effort OR subtask calculations
-- NOW: effort_override is ALWAYS set (even for standard completions) to preserve historical data

-- Step 1: Drop old CHECK constraint (required BOTH NULL or BOTH NOT NULL)
ALTER TABLE task_completions
DROP CONSTRAINT IF EXISTS task_completions_check;

-- Step 2: Make effort_override NOT NULL (ALWAYS set, even for standard completions)
-- First set default for existing NULL values (use 1 as fallback, will be fixed by app)
UPDATE task_completions SET effort_override = 1 WHERE effort_override IS NULL;

ALTER TABLE task_completions
ALTER COLUMN effort_override SET NOT NULL;

-- Step 3: Update constraints to allow effort_override range 0-5 (was 1-5, now includes 0 for checklist subtasks)
ALTER TABLE task_completions
DROP CONSTRAINT IF EXISTS task_completions_effort_override_check;

ALTER TABLE task_completions
ADD CONSTRAINT task_completions_effort_override_check CHECK (effort_override >= 0 AND effort_override <= 5);

-- Step 4: Rename override_reason to completion_note (optional, user-provided note)
ALTER TABLE task_completions
RENAME COLUMN override_reason TO completion_note;

-- Ensure completion_note is optional (was already nullable after Step 3)
ALTER TABLE task_completions
ALTER COLUMN completion_note DROP NOT NULL;

COMMENT ON COLUMN task_completions.effort_override IS
'ALWAYS set to final effort value at completion time (either task.effort or custom value). Preserves historical data when task.effort changes. Single Source of Truth for points calculation.';

COMMENT ON COLUMN task_completions.completion_note IS
'Optional user note when completing a task. Can explain why effort was adjusted, or just document extra work done. Independent of effort_override - both can be set separately.';
