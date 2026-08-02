-- =================================================================
-- PERSISTENTE EINKAUFS-KATEGORIEN
-- =================================================================
-- Bisher existierten Kategorien nur implizit als Text auf den Items: sobald
-- das letzte Item einer Kategorie gekauft oder gelöscht war, verschwand die
-- Kategorie. Diese Tabelle macht Kategorien zu eigenständigen Objekten je
-- Liste — sie bleiben leer bestehen und werden nur explizit gelöscht.
--
-- shopping_items.category bleibt die (freitextliche) Zuordnung: NULL =
-- "Unkategorisiert". Der Abgleich läuft über den Namen (case-insensitive
-- eindeutig je Liste), nicht über eine FK — so bleiben Bestandsdaten gültig
-- und ein Rename ist ein reines Text-Update auf beiden Seiten.
-- =================================================================

-- ----------------------------------------------------------------
-- 1. TABELLE
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shopping_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES shopping_lists(list_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_categories_list_id
  ON shopping_categories(list_id);

-- Namen sind je Liste eindeutig (case-insensitive) — verhindert Doppel-Sektionen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_categories_list_name
  ON shopping_categories(list_id, lower(name));

-- ----------------------------------------------------------------
-- 2. BACKFILL: bestehende Item-Kategorien übernehmen
-- ----------------------------------------------------------------
-- Reihenfolge = wann die Kategorie zum ersten Mal benutzt wurde.

INSERT INTO shopping_categories (household_id, list_id, name, sort_order)
SELECT
  src.household_id,
  src.list_id,
  src.name,
  (row_number() OVER (PARTITION BY src.list_id ORDER BY src.first_used))::int - 1
FROM (
  SELECT
    household_id,
    list_id,
    min(trim(category)) AS name,
    min(created_at) AS first_used
  FROM shopping_items
  WHERE category IS NOT NULL AND length(trim(category)) > 0
  GROUP BY household_id, list_id, lower(trim(category))
) src
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------

ALTER TABLE shopping_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their household shopping categories" ON shopping_categories;
CREATE POLICY "Users can view their household shopping categories"
  ON shopping_categories
  FOR SELECT
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can create shopping categories for their household" ON shopping_categories;
CREATE POLICY "Users can create shopping categories for their household"
  ON shopping_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can update their household shopping categories" ON shopping_categories;
CREATE POLICY "Users can update their household shopping categories"
  ON shopping_categories
  FOR UPDATE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())))
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can delete their household shopping categories" ON shopping_categories;
CREATE POLICY "Users can delete their household shopping categories"
  ON shopping_categories
  FOR DELETE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- ----------------------------------------------------------------
-- 4. REALTIME
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'shopping_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE shopping_categories;
  END IF;
END $$;
