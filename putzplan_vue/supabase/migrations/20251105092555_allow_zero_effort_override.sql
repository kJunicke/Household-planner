-- Allow effort_override = 0 for subtask calculations
-- When all subtasks are "deduct" mode and sum up to parent effort,
-- the parent task completion should award 0 points (not fail)

ALTER TABLE task_completions
DROP CONSTRAINT IF EXISTS task_completions_effort_override_check;

ALTER TABLE task_completions
ADD CONSTRAINT task_completions_effort_override_check
CHECK (effort_override BETWEEN 0 AND 5);
