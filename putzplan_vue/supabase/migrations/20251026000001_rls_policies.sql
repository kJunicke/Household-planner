-- =================================================================
-- ROW LEVEL SECURITY POLICIES - Consolidated
-- =================================================================
-- Consolidated from 13 RLS-related migrations on 2025-10-26
-- Source migrations in: archive/
--
-- SECURITY MODEL:
-- - Household-based isolation (users see only their household's data)
-- - Helper function bypasses RLS recursion (SECURITY DEFINER)
-- - Public household SELECT (needed for invite-code lookup)
--
-- TABLES:
-- - households (4 policies)
-- - household_members (4 policies)
-- - tasks (4 policies)
-- - task_completions (3 policies)
--
-- Total: 15 RLS Policies
-- =================================================================

SET search_path = public, pg_temp;

-- =================================================================
-- HELPER FUNCTIONS
-- =================================================================

-- Get user's household_id (bypasses RLS to prevent recursion)
-- Source: archive/20251024205322_fix_rls_no_subquery.sql
-- Used in: household_members SELECT policy
-- SECURITY DEFINER: Runs with owner permissions (bypasses RLS)
-- Why needed: Cannot query household_members IN household_members policy (infinite recursion)
CREATE OR REPLACE FUNCTION get_user_household_id(user_uuid UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT household_id
  FROM household_members
  WHERE user_id = user_uuid
  LIMIT 1;
$$;

-- =================================================================
-- HOUSEHOLDS TABLE
-- =================================================================

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - Public read access
-- Source: archive/20251019140500_fix_households_select_policy.sql
-- SECURITY CONSIDERATION:
-- - Allows ANY authenticated user to read ALL households
-- - Necessary for invite-code lookup BEFORE joining
-- - Safe because: tasks/members have strict RLS, household table has no sensitive data
-- - Only exposes: household_id, name, invite_code
DROP POLICY IF EXISTS "Users can view households" ON households;
DROP POLICY IF EXISTS "Users can view their households" ON households;
CREATE POLICY "Users can view households"
ON households FOR SELECT
TO authenticated
USING (true);

-- Policy: INSERT - Anyone can create
-- Used during: User registration (create or join household flow)
DROP POLICY IF EXISTS "Users can create households" ON households;
CREATE POLICY "Users can create households"
ON households FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: UPDATE - Members only
-- Members can update household name/settings
-- Note: (SELECT auth.uid()) wrapper for query optimization (initPlan caching)
DROP POLICY IF EXISTS "Users can update their household" ON households;
CREATE POLICY "Users can update their household"
ON households FOR UPDATE
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

-- Policy: DELETE - Members only
-- ⚠️ WARNING: ANY member can delete household!
-- TODO: Consider admin-role requirement in future
DROP POLICY IF EXISTS "Users can delete their household" ON households;
CREATE POLICY "Users can delete their household"
ON households FOR DELETE
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

-- =================================================================
-- HOUSEHOLD_MEMBERS TABLE
-- =================================================================

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - Same household only
-- Uses SECURITY DEFINER function to bypass recursion
-- (Cannot query household_members in household_members policy directly)
DROP POLICY IF EXISTS "Users can view members of their household" ON household_members;
DROP POLICY IF EXISTS "Users can view household members" ON household_members;
CREATE POLICY "Users can view household members"
ON household_members FOR SELECT
TO authenticated
USING (
  household_id = get_user_household_id((SELECT auth.uid()))
);

-- Policy: INSERT - Self only
-- Users can add themselves to household (via invite code)
DROP POLICY IF EXISTS "Users can join households" ON household_members;
DROP POLICY IF EXISTS "Users can insert themselves into a household" ON household_members;
CREATE POLICY "Users can join households"
ON household_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
);

-- Policy: UPDATE - Self only
-- Users can update their own display_name
-- Source: archive/20251022215559_add_household_members_update_policy.sql
DROP POLICY IF EXISTS "Users can update their own member profile" ON household_members;
DROP POLICY IF EXISTS "Users can update their own member record" ON household_members;
CREATE POLICY "Users can update their own member profile"
ON household_members FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- Policy: DELETE - Self only
-- Users can leave household (delete own membership)
DROP POLICY IF EXISTS "Users can leave household" ON household_members;
DROP POLICY IF EXISTS "Users can delete their own member record" ON household_members;
CREATE POLICY "Users can leave household"
ON household_members FOR DELETE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
);

-- =================================================================
-- TASKS TABLE
-- =================================================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - Household tasks only
DROP POLICY IF EXISTS "Users can view household tasks" ON tasks;
CREATE POLICY "Users can view household tasks"
ON tasks FOR SELECT
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

-- Policy: INSERT - Household members can create tasks
DROP POLICY IF EXISTS "Users can create household tasks" ON tasks;
CREATE POLICY "Users can create household tasks"
ON tasks FOR INSERT
TO authenticated
WITH CHECK (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

-- Policy: UPDATE - Household members can update tasks
-- ⚠️ NOTE: ANY member can edit ANY task in household
-- Design decision: Communal ownership vs. creator-ownership
DROP POLICY IF EXISTS "Users can update household tasks" ON tasks;
CREATE POLICY "Users can update household tasks"
ON tasks FOR UPDATE
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

-- Policy: DELETE - Household members can delete tasks
-- ⚠️ NOTE: ANY member can delete ANY task
DROP POLICY IF EXISTS "Users can delete household tasks" ON tasks;
CREATE POLICY "Users can delete household tasks"
ON tasks FOR DELETE
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);

-- =================================================================
-- TASK_COMPLETIONS TABLE
-- =================================================================

ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - View completions in own household
-- 2-hop check: completions → tasks → household
-- Source: archive/20250108230002_task_completions_rls.sql
DROP POLICY IF EXISTS "Users can view completions in their household" ON task_completions;
CREATE POLICY "Users can view completions in their household"
ON task_completions FOR SELECT
TO authenticated
USING (
  task_id IN (
    SELECT task_id FROM tasks
    WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
    )
  )
);

-- Policy: INSERT - Create completions for household tasks
-- Must be completion by authenticated user (prevents spoofing)
DROP POLICY IF EXISTS "Users can create completions in their household" ON task_completions;
CREATE POLICY "Users can create completions in their household"
ON task_completions FOR INSERT
TO authenticated
WITH CHECK (
  -- Task must belong to user's household
  task_id IN (
    SELECT task_id FROM tasks
    WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
    )
  )
  AND
  -- user_id must be the authenticated user (prevent spoofing)
  user_id = (SELECT auth.uid())
);

-- Policy: DELETE - Delete own completions only
-- Allows users to remove accidental completions
-- ⚠️ CONSIDERATION: Should completions be immutable? (no DELETE policy)
-- Current: Deletable for error-correction, but enables stat-manipulation
DROP POLICY IF EXISTS "Users can delete their own completions" ON task_completions;
CREATE POLICY "Users can delete their own completions"
ON task_completions FOR DELETE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND
  task_id IN (
    SELECT task_id FROM tasks
    WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
    )
  )
);

-- NO UPDATE POLICY: Completions are append-only history (immutable)

-- =================================================================
-- PERFORMANCE NOTES
-- =================================================================
-- Indexes created in: 20251026000000_consolidated_schema.sql
-- - idx_household_members_user_household (composite for RLS)
-- - idx_tasks_household_id
-- - All FK indexes
--
-- Best Practices Applied:
-- ✅ (SELECT auth.uid()) wrapper for query optimization (initPlan caching)
-- ✅ TO authenticated explicit (prevents unnecessary 'anon' role checks)
-- ✅ SECURITY DEFINER function with SET search_path (prevents attacks)
-- ✅ Composite indexes for subquery patterns
--
-- SECURITY DEFINER function used to prevent RLS recursion:
-- - get_user_household_id() in household_members SELECT policy
