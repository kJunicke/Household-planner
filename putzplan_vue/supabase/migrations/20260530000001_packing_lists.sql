-- =================================================================
-- PACKING LISTS FEATURE - Household Packing Lists
-- =================================================================
-- Creates packing_lists and packing_items tables.
-- Packing lists are household-wide (shared by all members).
-- Future: category + assigned_to columns for trip planning.
-- =================================================================

-- ----------------------------------------------------------------
-- 1. PACKING LISTS TABLE
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS packing_lists (
  list_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_packing_lists_household_id
  ON packing_lists(household_id);

-- ----------------------------------------------------------------
-- 2. PACKING ITEMS TABLE
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS packing_items (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES packing_lists(list_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 200),
  packed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
  -- Future: category TEXT, assigned_to UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_packing_items_list_id
  ON packing_items(list_id);

-- ----------------------------------------------------------------
-- 3. RLS - packing_lists
-- ----------------------------------------------------------------

ALTER TABLE packing_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household packing lists"
  ON packing_lists FOR SELECT TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

CREATE POLICY "Users can create packing lists for their household"
  ON packing_lists FOR INSERT TO authenticated
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

CREATE POLICY "Users can update their household packing lists"
  ON packing_lists FOR UPDATE TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())))
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

CREATE POLICY "Users can delete their household packing lists"
  ON packing_lists FOR DELETE TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- ----------------------------------------------------------------
-- 4. RLS - packing_items (via list → household join)
-- ----------------------------------------------------------------

ALTER TABLE packing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household packing items"
  ON packing_items FOR SELECT TO authenticated
  USING (
    list_id IN (
      SELECT list_id FROM packing_lists
      WHERE household_id = get_user_household_id((SELECT auth.uid()))
    )
  );

CREATE POLICY "Users can create packing items in their household lists"
  ON packing_items FOR INSERT TO authenticated
  WITH CHECK (
    list_id IN (
      SELECT list_id FROM packing_lists
      WHERE household_id = get_user_household_id((SELECT auth.uid()))
    )
  );

CREATE POLICY "Users can update packing items in their household lists"
  ON packing_items FOR UPDATE TO authenticated
  USING (
    list_id IN (
      SELECT list_id FROM packing_lists
      WHERE household_id = get_user_household_id((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    list_id IN (
      SELECT list_id FROM packing_lists
      WHERE household_id = get_user_household_id((SELECT auth.uid()))
    )
  );

CREATE POLICY "Users can delete packing items in their household lists"
  ON packing_items FOR DELETE TO authenticated
  USING (
    list_id IN (
      SELECT list_id FROM packing_lists
      WHERE household_id = get_user_household_id((SELECT auth.uid()))
    )
  );

-- ----------------------------------------------------------------
-- 5. REALTIME
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'packing_lists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE packing_lists;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'packing_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE packing_items;
  END IF;
END $$;
