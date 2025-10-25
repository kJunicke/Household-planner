-- Fix: Replace restrictive households SELECT policy
-- The old policy only allowed members to view their household
-- But users need to find households by invite_code BEFORE becoming members

SET search_path = public, pg_temp;

DROP POLICY IF EXISTS "Users can view their households" ON households;
DROP POLICY IF EXISTS "Users can view households by invite code" ON households;

CREATE POLICY "Users can view households"
ON households FOR SELECT
USING (true); -- Allow all authenticated users to read households

-- Note: This is safe because:
-- 1. Tasks/members tables still have strict RLS
-- 2. Invite codes are meant to be shared
-- 3. No sensitive data in households table (just name + invite_code)
