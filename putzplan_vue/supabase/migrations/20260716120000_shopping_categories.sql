-- =================================================================
-- SHOPPING CATEGORIES & QUANTITY
-- =================================================================
-- Brings the shopping list in line with the packing redesign: a free-text
-- per-item category (NULL = "Unkategorisiert") and a target quantity used as a
-- plain ×N annotation (no stepper — buying is a single done-flip).
--
-- Semantics:
--   category   TEXT  -> NULL = "Unkategorisiert" bucket; only groups "Zu kaufen"
--   quantity   INT   -> desired amount (>= 1), shown as ×N next to the name
-- =================================================================

-- ----------------------------------------------------------------
-- 1. NEW COLUMNS
-- ----------------------------------------------------------------

ALTER TABLE shopping_items
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;

-- ----------------------------------------------------------------
-- 2. CONSTRAINTS (idempotent guards for safe re-push)
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopping_items_quantity_positive') THEN
    ALTER TABLE shopping_items
      ADD CONSTRAINT shopping_items_quantity_positive CHECK (quantity >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shopping_items_category_length') THEN
    ALTER TABLE shopping_items
      ADD CONSTRAINT shopping_items_category_length
      CHECK (category IS NULL OR length(category) <= 100);
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. INDEX (category grouping queries within a list)
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_shopping_items_list_category
  ON shopping_items(list_id, category);
