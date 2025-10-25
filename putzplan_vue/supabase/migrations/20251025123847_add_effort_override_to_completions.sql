-- Add effort_override and override_reason to task_completions
-- Allows users to override the task effort for a specific completion with a reason

ALTER TABLE task_completions
ADD COLUMN effort_override INTEGER CHECK (effort_override IS NULL OR (effort_override BETWEEN 1 AND 5)),
ADD COLUMN override_reason TEXT CHECK (override_reason IS NULL OR LENGTH(TRIM(override_reason)) > 0);

-- Add comment for documentation
COMMENT ON COLUMN task_completions.effort_override IS 'Optional override of task effort (1-5) for this specific completion. NULL means use task default effort.';
COMMENT ON COLUMN task_completions.override_reason IS 'Required reason when effort_override is set. Explains why the effort was different this time.';

-- Add constraint: if effort_override is set, override_reason must be provided
ALTER TABLE task_completions
ADD CONSTRAINT effort_override_requires_reason
CHECK (
  (effort_override IS NULL AND override_reason IS NULL) OR
  (effort_override IS NOT NULL AND override_reason IS NOT NULL AND LENGTH(TRIM(override_reason)) > 0)
);
