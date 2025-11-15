-- =================================================================
-- SHOPPING LIST PRIORITY FEATURE
-- =================================================================
-- Adds is_priority column to shopping_items table
-- Priority items are displayed at the top with orange highlight
-- Priority is automatically removed when item is purchased
-- =================================================================

-- Add is_priority column
ALTER TABLE shopping_items
  ADD COLUMN is_priority BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for priority sorting performance
CREATE INDEX IF NOT EXISTS idx_shopping_items_priority
  ON shopping_items(is_priority, purchased);

-- =================================================================
-- TRIGGER: Auto-remove priority when item is purchased
-- =================================================================

-- Function to remove priority when item is marked as purchased
CREATE OR REPLACE FUNCTION remove_priority_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
  -- If item was just marked as purchased, remove priority
  IF NEW.purchased = TRUE AND OLD.purchased = FALSE THEN
    NEW.is_priority = FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger that runs before UPDATE on shopping_items
CREATE TRIGGER trigger_remove_priority_on_purchase
  BEFORE UPDATE ON shopping_items
  FOR EACH ROW
  EXECUTE FUNCTION remove_priority_on_purchase();
