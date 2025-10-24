-- Fix infinite recursion in household_members RLS policy
-- Problem: Previous policy queried household_members while checking household_members
-- Solution: Direct check via user_id (since user_id is now PK)

-- 1. Drop old policy that causes recursion
DROP POLICY IF EXISTS "Users can view members of their household" ON household_members;

-- 2. New policy without recursion
-- Users can see members of their household (direct check via user_id)
CREATE POLICY "Users can view members of their household"
ON household_members FOR SELECT
USING (
  -- User can see themselves (user_id is PK)
  user_id = auth.uid()
  OR
  -- User can see other members in the same household
  household_id = (
    SELECT household_id
    FROM household_members
    WHERE user_id = auth.uid()
    LIMIT 1
  )
);
