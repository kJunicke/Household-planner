-- =================================================================
-- SHOPPING LIST FEATURE - Shopping Items Table
-- =================================================================
-- Creates shopping_items table for household shopping lists
-- with purchase tracking (times_purchased counter)
-- =================================================================

-- Shopping Items - Einkaufsliste für Haushalte
CREATE TABLE IF NOT EXISTS shopping_items (
  shopping_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purchased BOOLEAN NOT NULL DEFAULT FALSE,
  times_purchased INTEGER NOT NULL DEFAULT 0,
  last_purchased_at TIMESTAMPTZ,
  last_purchased_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- INDEXES
-- =================================================================

-- Performance indexes für Queries
CREATE INDEX IF NOT EXISTS idx_shopping_items_household_id
  ON shopping_items(household_id);

CREATE INDEX IF NOT EXISTS idx_shopping_items_purchased
  ON shopping_items(purchased);

CREATE INDEX IF NOT EXISTS idx_shopping_items_name
  ON shopping_items(name);

-- Composite index für Autocomplete (household + name lookup)
CREATE INDEX IF NOT EXISTS idx_shopping_items_household_name
  ON shopping_items(household_id, name);

-- =================================================================
-- RLS (Row Level Security) POLICIES
-- =================================================================

-- Enable RLS
ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;

-- Helper Function: Get user's household_id (bypasses RLS for recursive queries)
-- Already exists from tasks setup (see: 20251026000001_rls_policies.sql)
-- No need to recreate: get_user_household_id()

-- SELECT Policy: Users can see their household's shopping items
CREATE POLICY "Users can view their household shopping items"
  ON shopping_items
  FOR SELECT
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- INSERT Policy: Users can create shopping items for their household
CREATE POLICY "Users can create shopping items for their household"
  ON shopping_items
  FOR INSERT
  TO authenticated
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

-- UPDATE Policy: Users can update their household's shopping items
CREATE POLICY "Users can update their household shopping items"
  ON shopping_items
  FOR UPDATE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())))
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

-- DELETE Policy: Users can delete their household's shopping items
CREATE POLICY "Users can delete their household shopping items"
  ON shopping_items
  FOR DELETE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- =================================================================
-- REALTIME
-- =================================================================

-- Enable Realtime for shopping_items (für Live-Updates)
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_items;
