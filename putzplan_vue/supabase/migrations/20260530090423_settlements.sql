-- =================================================================
-- SETTLEMENTS FEATURE - Points compensation between household members
-- =================================================================
-- Settlements log when one user compensates another for a point
-- difference (via activity, money, surprise, or other means).
-- The open balance = gross point difference (from task_completions)
-- minus the sum of already settled points between the pair.
-- =================================================================

-- ----------------------------------------------------------------
-- 1. SETTLEMENTS TABLE
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settlements (
  settlement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points_settled INT NOT NULL CHECK (points_settled > 0),
  method TEXT NOT NULL CHECK (method IN ('activity', 'money', 'surprise', 'other')),
  description TEXT CHECK (length(description) <= 500),
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_different_users CHECK (from_user_id != to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_settlements_household_id
  ON settlements(household_id);

CREATE INDEX IF NOT EXISTS idx_settlements_users
  ON settlements(from_user_id, to_user_id);

-- ----------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household settlements"
  ON settlements FOR SELECT TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

CREATE POLICY "Users can create settlements in their household"
  ON settlements FOR INSERT TO authenticated
  WITH CHECK (
    household_id = get_user_household_id((SELECT auth.uid()))
    AND created_by = (SELECT auth.uid())
  );

-- Only the creator can delete, and only within 5 minutes
CREATE POLICY "Users can delete their own recent settlements"
  ON settlements FOR DELETE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND created_at > NOW() - INTERVAL '5 minutes'
  );

-- ----------------------------------------------------------------
-- 3. REALTIME
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'settlements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE settlements;
  END IF;
END $$;
