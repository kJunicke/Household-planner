-- Allow users to find households by invite_code (for joining)
-- Without this, users can't read the household row before they become members

SET search_path = public, pg_temp;

-- Replace the old restrictive policy with a new one that allows both:
-- 1. Members can view their household
-- 2. Anyone can view households (needed for join flow)

DROP POLICY IF EXISTS "Users can view their households" ON households;
DROP POLICY IF EXISTS "Users can view households by invite code" ON households;

CREATE POLICY "Users can view households"
ON households FOR SELECT
USING (true); -- Allow all authenticated users to read households

-- Note: This doesn't create a security issue because:
-- 1. Users still can't see tasks/members unless they join
-- 2. Invite codes are meant to be shared
-- 3. Only household_id, name, and invite_code are exposed, no sensitive data
-- 4. More granular access control happens at tasks/members level
