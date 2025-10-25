-- Fix circular RLS policy in household_members SELECT
-- Problem: SELECT policy checks household_members table recursively (chicken-egg)
-- Solution: Users can see members from their household OR their own member row

-- ============================================================================
-- EXPLANATION
-- ============================================================================
-- Old (BROKEN):
--   SELECT FROM household_members WHERE household_id IN (
--     SELECT household_id FROM household_members WHERE user_id = auth.uid()  L CIRCULAR!
--   )
--   This fails because to read household_members, we need to read household_members!
--
-- New (FIXED):
--   SELECT FROM household_members WHERE:
--     - user_id = auth.uid() (always see your own row)
--     OR
--     - household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
--
--   The OR clause allows the initial read to succeed, then the household_id check works
-- ============================================================================

DROP POLICY IF EXISTS "Users can view household members" ON household_members;
CREATE POLICY "Users can view household members"
ON household_members FOR SELECT
USING (
  -- User can always see their own member row (breaks circular dependency)
  user_id = (SELECT auth.uid())
  OR
  -- User can see other members in their household
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())
  )
);