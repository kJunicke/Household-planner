-- Optimize RLS Policy Performance
-- Fixes auth_rls_initplan warnings by wrapping auth.uid() in SELECT subqueries
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ============================================================================
-- PERFORMANCE EXPLANATION
-- ============================================================================
-- Problem: auth.uid() is re-evaluated for EACH ROW when used directly
--   Example: WHERE user_id = auth.uid()  L Runs 1000x for 1000 rows
--
-- Solution: Wrap in SELECT to evaluate ONCE and cache the result
--   Example: WHERE user_id = (SELECT auth.uid())   Runs 1x, cached
--
-- This is called "InitPlan" optimization in PostgreSQL query planning.
-- ============================================================================


-- ============================================================================
-- 1. HOUSEHOLDS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their households" ON households;
CREATE POLICY "Users can view their households"
ON households FOR SELECT
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update their household" ON households;
CREATE POLICY "Users can update their household"
ON households FOR UPDATE
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can delete their household" ON households;
CREATE POLICY "Users can delete their household"
ON households FOR DELETE
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);


-- ============================================================================
-- 2. HOUSEHOLD_MEMBERS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view household members" ON household_members;
CREATE POLICY "Users can view household members"
ON household_members FOR SELECT
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can join households" ON household_members;
CREATE POLICY "Users can join households"
ON household_members FOR INSERT
WITH CHECK (
  user_id = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "Users can leave household" ON household_members;
CREATE POLICY "Users can leave household"
ON household_members FOR DELETE
USING (
  user_id = (SELECT auth.uid())
);


-- ============================================================================
-- 3. TASKS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view household tasks" ON tasks;
CREATE POLICY "Users can view household tasks"
ON tasks FOR SELECT
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can create household tasks" ON tasks;
CREATE POLICY "Users can create household tasks"
ON tasks FOR INSERT
WITH CHECK (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update household tasks" ON tasks;
CREATE POLICY "Users can update household tasks"
ON tasks FOR UPDATE
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can delete household tasks" ON tasks;
CREATE POLICY "Users can delete household tasks"
ON tasks FOR DELETE
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);


-- ============================================================================
-- 4. TASK_COMPLETIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view completions in their household" ON task_completions;
CREATE POLICY "Users can view completions in their household"
ON task_completions FOR SELECT
USING (
  task_id IN (
    SELECT task_id FROM tasks WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Users can create completions in their household" ON task_completions;
CREATE POLICY "Users can create completions in their household"
ON task_completions FOR INSERT
WITH CHECK (
  task_id IN (
    SELECT task_id FROM tasks WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
    )
  )
  AND
  user_id = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "Users can delete their own completions" ON task_completions;
CREATE POLICY "Users can delete their own completions"
ON task_completions FOR DELETE
USING (
  user_id = (SELECT auth.uid())
  AND
  task_id IN (
    SELECT task_id FROM tasks WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
    )
  )
);