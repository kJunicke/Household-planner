-- =================================================================
-- TO-DO LISTS FEATURE - Household To-do Lists (Etappe 5, Teil B)
-- =================================================================
-- Creates todo_lists and todo_items as an exact copy of the packing
-- column set, so both can share the Checkliste data layer
-- (`createChecklistStore`) without any field mapping.
--
-- Deliberate: `packed` / `packed_count` keep their packing names even
-- though a To-do "Eintrag" is abgehakt, not gepackt. Any renaming here
-- would force a mapping layer into the shared store.
--
-- Semantics (identical to packing_items):
--   packed        BOOLEAN  -> canonical "erledigt" flag
--   quantity      INT      -> target amount (>= 1)
--   packed_count  INT      -> progress 0..quantity
--   category      TEXT     -> free text, NULL = "Unkategorisiert" bucket
--   notes         TEXT     -> free-text notes on the list itself
-- =================================================================

-- ----------------------------------------------------------------
-- 1. TODO LISTS TABLE
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS todo_lists (
  list_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  icon TEXT,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 5000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_todo_lists_household_id
  ON todo_lists(household_id);

-- ----------------------------------------------------------------
-- 2. TODO ITEMS TABLE
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS todo_items (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES todo_lists(list_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 200),
  category TEXT CHECK (category IS NULL OR length(category) <= 100),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  packed_count INT NOT NULL DEFAULT 0 CHECK (packed_count >= 0 AND packed_count <= quantity),
  packed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_todo_items_list_id
  ON todo_items(list_id);

CREATE INDEX IF NOT EXISTS idx_todo_items_list_category
  ON todo_items(list_id, category);

-- ----------------------------------------------------------------
-- 3. RLS - todo_lists
-- ----------------------------------------------------------------

ALTER TABLE todo_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household todo lists"
  ON todo_lists FOR SELECT TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

CREATE POLICY "Users can create todo lists for their household"
  ON todo_lists FOR INSERT TO authenticated
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

CREATE POLICY "Users can update their household todo lists"
  ON todo_lists FOR UPDATE TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())))
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

CREATE POLICY "Users can delete their household todo lists"
  ON todo_lists FOR DELETE TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- ----------------------------------------------------------------
-- 4. RLS - todo_items (via list → household join)
-- ----------------------------------------------------------------

ALTER TABLE todo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household todo items"
  ON todo_items FOR SELECT TO authenticated
  USING (
    list_id IN (
      SELECT list_id FROM todo_lists
      WHERE household_id = get_user_household_id((SELECT auth.uid()))
    )
  );

CREATE POLICY "Users can create todo items in their household lists"
  ON todo_items FOR INSERT TO authenticated
  WITH CHECK (
    list_id IN (
      SELECT list_id FROM todo_lists
      WHERE household_id = get_user_household_id((SELECT auth.uid()))
    )
  );

CREATE POLICY "Users can update todo items in their household lists"
  ON todo_items FOR UPDATE TO authenticated
  USING (
    list_id IN (
      SELECT list_id FROM todo_lists
      WHERE household_id = get_user_household_id((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    list_id IN (
      SELECT list_id FROM todo_lists
      WHERE household_id = get_user_household_id((SELECT auth.uid()))
    )
  );

CREATE POLICY "Users can delete todo items in their household lists"
  ON todo_items FOR DELETE TO authenticated
  USING (
    list_id IN (
      SELECT list_id FROM todo_lists
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
    WHERE pubname = 'supabase_realtime' AND tablename = 'todo_lists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE todo_lists;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'todo_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE todo_items;
  END IF;
END $$;
