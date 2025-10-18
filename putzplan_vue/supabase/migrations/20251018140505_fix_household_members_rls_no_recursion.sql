-- Fix infinite recursion in household_members RLS
-- Problem: household_members SELECT policy can't reference household_members (infinite recursion)
-- Solution: Use SECURITY DEFINER function to bypass RLS for the lookup

-- ============================================================================
-- EXPLANATION
-- ============================================================================
-- household_members can't reference itself in RLS policies (causes infinite recursion).
-- Solution: Create a SECURITY DEFINER function that bypasses RLS to get user's household_id(s)
--
-- SECURITY DEFINER = Function runs with creator's privileges (bypasses RLS)
-- This is safe because the function ONLY returns the current user's household_id
-- ============================================================================

-- Step 1: Create helper function to get user's household_id (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_household_ids()
RETURNS TABLE(household_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT hm.household_id
  FROM household_members hm
  WHERE hm.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with elevated privileges, bypasses RLS
SET search_path = public, pg_temp;  -- Security: prevent schema injection


-- Step 2: Use helper function in RLS policy (no recursion!)
DROP POLICY IF EXISTS "Users can view household members" ON household_members;
CREATE POLICY "Users can view household members"
ON household_members FOR SELECT
USING (
  household_id IN (SELECT get_user_household_ids())
);