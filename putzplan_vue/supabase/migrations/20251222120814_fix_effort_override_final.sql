-- Final fix: Ensure ALL task_completions have effort_override set
-- Previous migrations may have missed some rows or not worked correctly

-- Step 1: Backfill effort_override with actual task.effort for NULL values
UPDATE task_completions tc
SET effort_override = t.effort
FROM tasks t
WHERE tc.task_id = t.task_id
  AND tc.effort_override IS NULL;

-- Step 2: Fallback for orphaned completions (task deleted) or still NULL
UPDATE task_completions
SET effort_override = 1
WHERE effort_override IS NULL;

-- Step 3: Ensure NOT NULL constraint exists (idempotent)
DO $$
BEGIN
    -- Check if column is already NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'task_completions'
        AND column_name = 'effort_override'
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE task_completions ALTER COLUMN effort_override SET NOT NULL;
    END IF;
END $$;

-- Step 4: Ensure constraint allows 0-5 range (idempotent)
ALTER TABLE task_completions
DROP CONSTRAINT IF EXISTS task_completions_effort_override_check;

ALTER TABLE task_completions
ADD CONSTRAINT task_completions_effort_override_check
CHECK (effort_override >= 0 AND effort_override <= 5);
