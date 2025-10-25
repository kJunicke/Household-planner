-- Optimize RLS Architecture - Best Practices
-- Consolidates helper functions and improves all RLS policies

-- ============================================================================
-- BEST PRACTICES APPLIED
-- ============================================================================
-- 1. Move SECURITY DEFINER function to 'private' schema (Supabase recommendation)
-- 2. Use single helper function across ALL policies (DRY principle)
-- 3. Optimize all policies to use the centralized function
-- 4. Add proper performance optimizations
-- ============================================================================

-- Step 1: Drop all policies that depend on the old function
DROP POLICY IF EXISTS "Users can view household members" ON household_members;
DROP POLICY IF EXISTS "Users can view their households" ON households;
DROP POLICY IF EXISTS "Users can update their household" ON households;
DROP POLICY IF EXISTS "Users can delete their household" ON households;
DROP POLICY IF EXISTS "Users can view household tasks" ON tasks;
DROP POLICY IF EXISTS "Users can create household tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update household tasks" ON tasks;
DROP POLICY IF EXISTS "Users can delete household tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view completions in their household" ON task_completions;
DROP POLICY IF EXISTS "Users can create completions in their household" ON task_completions;
DROP POLICY IF EXISTS "Users can delete their own completions" ON task_completions;

-- Step 2: Create private schema if not exists (for security definer functions)
CREATE SCHEMA IF NOT EXISTS private;

-- Step 3: Drop old function and create new one in private schema
DROP FUNCTION IF EXISTS public.get_user_household_ids();
CREATE OR REPLACE FUNCTION private.get_user_household_ids()
RETURNS TABLE(household_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT hm.household_id
  FROM household_members hm
  WHERE hm.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================================================
-- Step 3: Update ALL policies to use the centralized helper function
-- This is MORE PERFORMANT than inline subqueries at scale
-- ============================================================================

-- HOUSEHOLDS
DROP POLICY IF EXISTS "Users can view their households" ON households;
CREATE POLICY "Users can view their households"
ON households FOR SELECT
USING (household_id IN (SELECT private.get_user_household_ids()));

DROP POLICY IF EXISTS "Users can update their household" ON households;
CREATE POLICY "Users can update their household"
ON households FOR UPDATE
USING (household_id IN (SELECT private.get_user_household_ids()));

DROP POLICY IF EXISTS "Users can delete their household" ON households;
CREATE POLICY "Users can delete their household"
ON households FOR DELETE
USING (household_id IN (SELECT private.get_user_household_ids()));


-- HOUSEHOLD_MEMBERS
-- Already updated in previous migration, but using private schema now
DROP POLICY IF EXISTS "Users can view household members" ON household_members;
CREATE POLICY "Users can view household members"
ON household_members FOR SELECT
USING (household_id IN (SELECT private.get_user_household_ids()));


-- TASKS
DROP POLICY IF EXISTS "Users can view household tasks" ON tasks;
CREATE POLICY "Users can view household tasks"
ON tasks FOR SELECT
USING (household_id IN (SELECT private.get_user_household_ids()));

DROP POLICY IF EXISTS "Users can create household tasks" ON tasks;
CREATE POLICY "Users can create household tasks"
ON tasks FOR INSERT
WITH CHECK (household_id IN (SELECT private.get_user_household_ids()));

DROP POLICY IF EXISTS "Users can update household tasks" ON tasks;
CREATE POLICY "Users can update household tasks"
ON tasks FOR UPDATE
USING (household_id IN (SELECT private.get_user_household_ids()));

DROP POLICY IF EXISTS "Users can delete household tasks" ON tasks;
CREATE POLICY "Users can delete household tasks"
ON tasks FOR DELETE
USING (household_id IN (SELECT private.get_user_household_ids()));


-- TASK_COMPLETIONS
-- More complex - needs to check via tasks.household_id
DROP POLICY IF EXISTS "Users can view completions in their household" ON task_completions;
CREATE POLICY "Users can view completions in their household"
ON task_completions FOR SELECT
USING (
  task_id IN (
    SELECT task_id FROM tasks
    WHERE household_id IN (SELECT private.get_user_household_ids())
  )
);

DROP POLICY IF EXISTS "Users can create completions in their household" ON task_completions;
CREATE POLICY "Users can create completions in their household"
ON task_completions FOR INSERT
WITH CHECK (
  task_id IN (
    SELECT task_id FROM tasks
    WHERE household_id IN (SELECT private.get_user_household_ids())
  )
  AND user_id = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "Users can delete their own completions" ON task_completions;
CREATE POLICY "Users can delete their own completions"
ON task_completions FOR DELETE
USING (
  user_id = (SELECT auth.uid())
  AND task_id IN (
    SELECT task_id FROM tasks
    WHERE household_id IN (SELECT private.get_user_household_ids())
  )
);


-- ============================================================================
-- Step 4: Performance Summary
-- ============================================================================
-- Benefits of this architecture:
-- 1. Single SECURITY DEFINER function = easier to audit & maintain
-- 2. private schema = follows Supabase security recommendations
-- 3. Reusable across all policies = DRY principle
-- 4. PostgreSQL can cache the function result per query = faster
-- 5. No infinite recursion = stable & predictable
-- ============================================================================