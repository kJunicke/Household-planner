-- Fix: PostgREST schema cache issue after column rename
-- Solution: Revert rename, add new column, migrate data, drop old column
-- This triggers a proper schema cache reload

-- Step 1: If completion_note exists, revert it back to override_reason temporarily
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'task_completions'
        AND column_name = 'completion_note'
    ) THEN
        ALTER TABLE task_completions RENAME COLUMN completion_note TO override_reason;
    END IF;
END $$;

-- Step 2: Add new completion_note column (nullable, independent of effort_override)
ALTER TABLE task_completions
ADD COLUMN IF NOT EXISTS completion_note TEXT;

-- Step 3: Migrate non-empty override_reason values to completion_note
UPDATE task_completions
SET completion_note = override_reason
WHERE override_reason IS NOT NULL AND override_reason != '';

-- Step 4: Drop old override_reason column
ALTER TABLE task_completions
DROP COLUMN IF EXISTS override_reason;

-- Step 5: Update comments
COMMENT ON COLUMN task_completions.completion_note IS
'Optional user note when completing a task. Can explain why effort was adjusted, or just document extra work done. Independent of effort_override - both can be set separately.';

-- Notify PostgREST schema cache reload (automatic on DDL changes)
NOTIFY pgrst, 'reload schema';
