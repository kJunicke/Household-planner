-- =================================================================
-- PACKING REDESIGN - Categories, Quantities, Progress, List Notes
-- =================================================================
-- Adds per-item category (free text), target quantity and a packed
-- counter (decoupled from the existing `packed` done-flag), plus a
-- free-text notes field on the list itself.
--
-- Semantics:
--   packed        BOOLEAN  -> canonical "done" flag (body-tap / auto)
--   quantity      INT      -> target amount (>= 1)
--   packed_count  INT      -> progress 0..quantity; hitting quantity
--                            auto-sets packed=true (handled client-side)
--   category      TEXT     -> NULL = "Unkategorisiert" bucket
--   notes         TEXT     -> free-text trip notes on the list
-- =================================================================

-- ----------------------------------------------------------------
-- 1. NEW COLUMNS
-- ----------------------------------------------------------------

ALTER TABLE packing_items
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS packed_count INT NOT NULL DEFAULT 0;

ALTER TABLE packing_lists
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ----------------------------------------------------------------
-- 2. CONSTRAINTS (idempotent guards for safe re-push)
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packing_items_quantity_positive') THEN
    ALTER TABLE packing_items
      ADD CONSTRAINT packing_items_quantity_positive CHECK (quantity >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packing_items_packed_count_range') THEN
    ALTER TABLE packing_items
      ADD CONSTRAINT packing_items_packed_count_range
      CHECK (packed_count >= 0 AND packed_count <= quantity);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packing_items_category_length') THEN
    ALTER TABLE packing_items
      ADD CONSTRAINT packing_items_category_length
      CHECK (category IS NULL OR length(category) <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packing_lists_notes_length') THEN
    ALTER TABLE packing_lists
      ADD CONSTRAINT packing_lists_notes_length
      CHECK (notes IS NULL OR length(notes) <= 5000);
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. INDEX (category grouping queries within a list)
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_packing_items_list_category
  ON packing_items(list_id, category);
