-- Row Level Security for all tables
-- Ensures users can only access data from their own household

-- ============================================================================
-- 1. HOUSEHOLDS TABLE
-- ============================================================================

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Users can view households they are members of
DROP POLICY IF EXISTS "Users can view their households" ON households;
CREATE POLICY "Users can view their households"
ON households FOR SELECT
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- Users can create new households (signup flow)
DROP POLICY IF EXISTS "Users can create households" ON households;
CREATE POLICY "Users can create households"
ON households FOR INSERT
WITH CHECK (true); -- Anyone can create a household

-- Users can update their own household
DROP POLICY IF EXISTS "Users can update their household" ON households;
CREATE POLICY "Users can update their household"
ON households FOR UPDATE
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- Users can delete their household (if they're a member)
DROP POLICY IF EXISTS "Users can delete their household" ON households;
CREATE POLICY "Users can delete their household"
ON households FOR DELETE
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);


-- ============================================================================
-- 2. HOUSEHOLD_MEMBERS TABLE
-- ============================================================================

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Users can view members of their household
DROP POLICY IF EXISTS "Users can view household members" ON household_members;
CREATE POLICY "Users can view household members"
ON household_members FOR SELECT
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- Users can add themselves to a household (join via invite code)
DROP POLICY IF EXISTS "Users can join households" ON household_members;
CREATE POLICY "Users can join households"
ON household_members FOR INSERT
WITH CHECK (
  user_id = auth.uid() -- Can only add yourself
);

-- Users can remove themselves from a household
DROP POLICY IF EXISTS "Users can leave household" ON household_members;
CREATE POLICY "Users can leave household"
ON household_members FOR DELETE
USING (
  user_id = auth.uid() -- Can only remove yourself
);

-- No UPDATE policy - membership is immutable except household_id (handled by INSERT/DELETE)


-- ============================================================================
-- 3. TASKS TABLE
-- ============================================================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Users can view tasks in their household
DROP POLICY IF EXISTS "Users can view household tasks" ON tasks;
CREATE POLICY "Users can view household tasks"
ON tasks FOR SELECT
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- Users can create tasks in their household
DROP POLICY IF EXISTS "Users can create household tasks" ON tasks;
CREATE POLICY "Users can create household tasks"
ON tasks FOR INSERT
WITH CHECK (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- Users can update tasks in their household
DROP POLICY IF EXISTS "Users can update household tasks" ON tasks;
CREATE POLICY "Users can update household tasks"
ON tasks FOR UPDATE
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- Users can delete tasks in their household
DROP POLICY IF EXISTS "Users can delete household tasks" ON tasks;
CREATE POLICY "Users can delete household tasks"
ON tasks FOR DELETE
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);


-- ============================================================================
-- 4. PERFORMANCE INDEXES FOR RLS QUERIES
-- ============================================================================

-- These indexes optimize the subquery `household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())`
-- They already exist from base schema, but adding IF NOT EXISTS for safety

CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household_id ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_tasks_household_id ON tasks(household_id);

-- Additional composite index for faster RLS checks
CREATE INDEX IF NOT EXISTS idx_household_members_user_household ON household_members(user_id, household_id);


-- ============================================================================
-- 5. VERIFY RLS IS ENABLED
-- ============================================================================

-- This will show all tables with RLS status
-- Run manually: SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';