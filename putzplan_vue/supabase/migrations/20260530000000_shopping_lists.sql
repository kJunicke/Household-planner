-- =================================================================
-- SHOPPING LISTS FEATURE - Multiple Shopping Lists per Household
-- =================================================================
-- Adds shopping_lists table and list_id FK to shopping_items.
-- Existing items are migrated to a default list "Einkauf" per household.
-- =================================================================

-- ----------------------------------------------------------------
-- 1. SHOPPING LISTS TABLE
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shopping_lists (
  list_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_household_id
  ON shopping_lists(household_id);

-- ----------------------------------------------------------------
-- 2. ADD list_id TO shopping_items
-- ----------------------------------------------------------------

ALTER TABLE shopping_items
  ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES shopping_lists(list_id) ON DELETE CASCADE;

-- ----------------------------------------------------------------
-- 3. MIGRATE EXISTING ITEMS: Create default list per household
-- ----------------------------------------------------------------

-- For each household that has shopping items, create a "Einkauf" list
-- and assign all existing items to it.
DO $$
DECLARE
  hh RECORD;
  new_list_id UUID;
BEGIN
  FOR hh IN
    SELECT DISTINCT household_id FROM shopping_items WHERE list_id IS NULL
  LOOP
    INSERT INTO shopping_lists (household_id, name, sort_order, created_at)
    VALUES (hh.household_id, 'Einkauf', 0, NOW())
    RETURNING list_id INTO new_list_id;

    UPDATE shopping_items
    SET list_id = new_list_id
    WHERE household_id = hh.household_id AND list_id IS NULL;
  END LOOP;
END $$;

-- Now make list_id NOT NULL (all rows have been backfilled)
ALTER TABLE shopping_items
  ALTER COLUMN list_id SET NOT NULL;

-- Index for filtering items by list
CREATE INDEX IF NOT EXISTS idx_shopping_items_list_id
  ON shopping_items(list_id);

-- ----------------------------------------------------------------
-- 4. RLS POLICIES - shopping_lists
-- ----------------------------------------------------------------

ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household shopping lists"
  ON shopping_lists
  FOR SELECT
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

CREATE POLICY "Users can create shopping lists for their household"
  ON shopping_lists
  FOR INSERT
  TO authenticated
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

CREATE POLICY "Users can update their household shopping lists"
  ON shopping_lists
  FOR UPDATE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())))
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

CREATE POLICY "Users can delete their household shopping lists"
  ON shopping_lists
  FOR DELETE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- ----------------------------------------------------------------
-- 5. REALTIME
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'shopping_lists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shopping_lists;
  END IF;
END $$;
