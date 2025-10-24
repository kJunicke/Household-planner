-- Fix infinite recursion by using SECURITY DEFINER function instead of subquery
-- Problem: Cannot query household_members in household_members RLS policy (causes recursion)
-- Solution: Use a helper function with SECURITY DEFINER to bypass RLS during check

-- 1. Drop problematic policy
DROP POLICY IF EXISTS "Users can view members of their household" ON household_members;

-- 2. Create helper function to get user's household (bypasses RLS)
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

-- 3. New policy using the helper function (no recursion!)
CREATE POLICY "Users can view members of their household"
ON household_members FOR SELECT
USING (
  household_id = get_user_household_id(auth.uid())
);
