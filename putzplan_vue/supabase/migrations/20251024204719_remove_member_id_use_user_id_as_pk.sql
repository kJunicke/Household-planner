-- Refactoring: Remove redundant member_id, use user_id as Primary Key
-- Benefits: Simpler JOINs, one ID per user across all tables

-- 1. Create new table with user_id as PK (no member_id anymore)
CREATE TABLE household_members_new (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id) -- User can only be in one household
);

-- 2. Migrate data (member_id is dropped)
INSERT INTO household_members_new (user_id, household_id, display_name, joined_at)
SELECT user_id, household_id, display_name, joined_at
FROM household_members;

-- 3. Drop old table and rename new one
DROP TABLE household_members;
ALTER TABLE household_members_new RENAME TO household_members;

-- 4. Recreate indexes
CREATE INDEX idx_household_members_household_id ON household_members(household_id);

-- 5. Re-apply RLS policies (from 20251018135010_add_rls_for_all_tables.sql)
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Users can only see members of their own household
CREATE POLICY "Users can view members of their household"
ON household_members FOR SELECT
USING (
  household_id IN (
    SELECT household_id
    FROM household_members
    WHERE user_id = auth.uid()
  )
);

-- Users can insert themselves into a household (via invite code join)
CREATE POLICY "Users can insert themselves into a household"
ON household_members FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own display_name
CREATE POLICY "Users can update their own member record"
ON household_members FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can delete themselves from household (leave)
CREATE POLICY "Users can delete their own member record"
ON household_members FOR DELETE
USING (user_id = auth.uid());
