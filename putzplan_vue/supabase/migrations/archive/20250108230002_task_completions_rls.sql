-- Row Level Security for task_completions
-- Ensures users can only access completions from their own household

ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;


-- Policy: Users can view completions in their household
DROP POLICY IF EXISTS "Users can view completions in their household" ON task_completions;

CREATE POLICY "Users can view completions in their household"
ON task_completions FOR SELECT
USING (
  task_id IN (
    SELECT task_id FROM tasks WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
);


-- Policy: Users can create completions for household tasks
DROP POLICY IF EXISTS "Users can create completions in their household" ON task_completions;

CREATE POLICY "Users can create completions in their household"
ON task_completions FOR INSERT
WITH CHECK (
  -- Task must belong to user's household
  task_id IN (
    SELECT task_id FROM tasks WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
  AND
  -- user_id must be the authenticated user
  user_id = auth.uid()
);


-- Policy: Users can delete their own completions only
DROP POLICY IF EXISTS "Users can delete their own completions" ON task_completions;

CREATE POLICY "Users can delete their own completions"
ON task_completions FOR DELETE
USING (
  user_id = auth.uid()
  AND
  task_id IN (
    SELECT task_id FROM tasks WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
);

-- Note: UPDATE is intentionally not permitted to preserve completion history
