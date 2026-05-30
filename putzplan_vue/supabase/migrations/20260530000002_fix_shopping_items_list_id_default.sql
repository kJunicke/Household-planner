-- =================================================================
-- FIX: shopping_items list_id backwards compatibility
-- =================================================================
-- The list_id column was added as NOT NULL, but old frontend code
-- (still deployed) does not send list_id on INSERT.
-- Fix: add a BEFORE INSERT trigger that auto-assigns the household's
-- first shopping list when list_id is not provided.
-- =================================================================

-- Make list_id nullable so old inserts don't hard-fail
ALTER TABLE shopping_items ALTER COLUMN list_id DROP NOT NULL;

-- Trigger function: auto-assign list_id to first list of household
CREATE OR REPLACE FUNCTION assign_default_shopping_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  default_list_id UUID;
BEGIN
  -- Only auto-assign if list_id was not provided
  IF NEW.list_id IS NULL THEN
    SELECT list_id INTO default_list_id
    FROM shopping_lists
    WHERE household_id = NEW.household_id
    ORDER BY sort_order ASC, created_at ASC
    LIMIT 1;

    IF default_list_id IS NOT NULL THEN
      NEW.list_id := default_list_id;
    ELSE
      -- No list exists yet: create a default one on-the-fly
      INSERT INTO shopping_lists (household_id, name, sort_order)
      VALUES (NEW.household_id, 'Einkauf', 0)
      RETURNING list_id INTO default_list_id;

      NEW.list_id := default_list_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_default_shopping_list
  BEFORE INSERT ON shopping_items
  FOR EACH ROW
  EXECUTE FUNCTION assign_default_shopping_list();
