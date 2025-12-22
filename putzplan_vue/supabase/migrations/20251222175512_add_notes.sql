-- =================================================================
-- NOTES FEATURE - Household Notes Table
-- =================================================================
-- Creates notes table for household-scoped notes
-- All members can create, view, edit, and delete any note
-- =================================================================

-- Notes table
CREATE TABLE IF NOT EXISTS notes (
  note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- INDEXES
-- =================================================================

-- Performance index for household filtering
CREATE INDEX IF NOT EXISTS idx_notes_household_id
  ON notes(household_id);

-- Index for sorting by date
CREATE INDEX IF NOT EXISTS idx_notes_created_at
  ON notes(created_at DESC);

-- =================================================================
-- TRIGGER - Auto-update updated_at
-- =================================================================

CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_notes_updated_at ON notes;
CREATE TRIGGER trigger_update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_notes_updated_at();

-- =================================================================
-- RLS (Row Level Security) POLICIES
-- =================================================================

-- Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Users can see their household's notes
CREATE POLICY "Users can view their household notes"
  ON notes
  FOR SELECT
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- INSERT Policy: Users can create notes for their household
CREATE POLICY "Users can create notes for their household"
  ON notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = get_user_household_id((SELECT auth.uid()))
    AND created_by = (SELECT auth.uid())
  );

-- UPDATE Policy: All household members can update any note
CREATE POLICY "Users can update their household notes"
  ON notes
  FOR UPDATE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())))
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

-- DELETE Policy: All household members can delete any note
CREATE POLICY "Users can delete their household notes"
  ON notes
  FOR DELETE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- =================================================================
-- REALTIME
-- =================================================================

-- Enable Realtime for notes (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE notes;
