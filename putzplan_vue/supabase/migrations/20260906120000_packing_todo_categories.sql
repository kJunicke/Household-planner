-- =================================================================
-- PERSISTENTE KATEGORIEN FÜR PACKLISTE UND TO-DO
-- =================================================================
-- Analog zu 20260802201201_shopping_categories_table.sql: Kategorien
-- waren bisher nur implizit als Text auf den Einträgen vorhanden und
-- verschwanden, sobald der letzte Eintrag gepackt/erledigt bzw.
-- gelöscht wurde. Diese Migration macht sie zu eigenständigen
-- Objekten je Liste — `packing_categories` für Packlisten,
-- `todo_categories` für To-do-Listen — die leer bestehen bleiben und
-- nur explizit gelöscht werden.
--
-- Namenskopplung (wie beim Einkauf): `packing_items.category` bzw.
-- `todo_items.category` bleiben die freitextliche Zuordnung, NULL =
-- "Unkategorisiert". Der Abgleich läuft über den getrimmten Namen,
-- case-insensitive eindeutig je Liste (`lower(name)`), nicht über
-- eine FK von den Items — so bleiben Bestandsdaten gültig und ein
-- Rename ist ein reines Text-Update auf beiden Seiten.
--
-- Unterschied zu shopping_categories (B2 aus plan-etappe2.md):
-- `packing_items` und `todo_items` haben KEINE eigene `household_id`
-- (ihre RLS läuft über `list_id IN (SELECT … FROM *_lists WHERE
-- household_id = …)`). Der Backfill kann `household_id` daher nicht
-- direkt aus der Item-Tabelle lesen, sondern muss über die jeweilige
-- Listen-Tabelle (`packing_lists` / `todo_lists`) joinen, um die neue,
-- denormalisierte `household_id`-Spalte der Kategorientabelle zu
-- füllen — sie dient hier wie bei shopping_categories dazu, dass RLS
-- und der Realtime-Filter (`household_id=eq.…`) identisch bleiben.
-- Der Backfill fügt ausschließlich Zeilen ein (INSERT … ON CONFLICT
-- DO NOTHING); an Produktdaten in *_items/*_lists wird nichts
-- verändert.
--
-- REPLICA IDENTITY FULL (B8): Ohne sie fehlt einem am `household_id`
-- gefilterten Realtime-Kanal beim DELETE einer Zeile die alte
-- household_id, weil Postgres beim DELETE-Event nur die Spalten der
-- REPLICA IDENTITY mitschickt (per Default nur der PK). Damit
-- Löschungen von Kategorien bei Mitbewohnern ankommen, wird sie hier
-- für beide neuen Tabellen gesetzt — und, nach Entscheidung E3 des
-- Leads (plan-etappe2.md, Abschnitt 6), im selben Aufwasch auch für
-- `shopping_categories` nachgezogen, das denselben gefilterten Kanal
-- benutzt (siehe 20260802201201_shopping_categories_table.sql).
-- =================================================================

-- ================================================================
-- TEIL A: packing_categories
-- ================================================================

-- ----------------------------------------------------------------
-- A.1 TABELLE
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS packing_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES packing_lists(list_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packing_categories_list_id
  ON packing_categories(list_id);

-- Namen sind je Liste eindeutig (case-insensitive) — verhindert Doppel-Sektionen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_categories_list_name
  ON packing_categories(list_id, lower(name));

-- ----------------------------------------------------------------
-- A.2 BACKFILL: bestehende Item-Kategorien übernehmen
-- ----------------------------------------------------------------
-- Reihenfolge = wann die Kategorie zum ersten Mal benutzt wurde.
-- household_id kommt aus der Liste, da packing_items keine eigene hat.

INSERT INTO packing_categories (household_id, list_id, name, sort_order)
SELECT
  l.household_id,
  src.list_id,
  src.name,
  (row_number() OVER (PARTITION BY src.list_id ORDER BY src.first_used))::int - 1
FROM (
  SELECT
    list_id,
    min(trim(category)) AS name,
    min(created_at) AS first_used
  FROM packing_items
  WHERE category IS NOT NULL AND length(trim(category)) > 0
  GROUP BY list_id, lower(trim(category))
) src
JOIN packing_lists l ON l.list_id = src.list_id
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- A.3 RLS
-- ----------------------------------------------------------------

ALTER TABLE packing_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their household packing categories" ON packing_categories;
CREATE POLICY "Users can view their household packing categories"
  ON packing_categories
  FOR SELECT
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can create packing categories for their household" ON packing_categories;
CREATE POLICY "Users can create packing categories for their household"
  ON packing_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can update their household packing categories" ON packing_categories;
CREATE POLICY "Users can update their household packing categories"
  ON packing_categories
  FOR UPDATE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())))
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can delete their household packing categories" ON packing_categories;
CREATE POLICY "Users can delete their household packing categories"
  ON packing_categories
  FOR DELETE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- ----------------------------------------------------------------
-- A.4 REALTIME
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'packing_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE packing_categories;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- A.5 REPLICA IDENTITY (B8: DELETEs am household_id-Filter empfangbar)
-- ----------------------------------------------------------------

ALTER TABLE packing_categories REPLICA IDENTITY FULL;

-- ================================================================
-- TEIL B: todo_categories
-- ================================================================

-- ----------------------------------------------------------------
-- B.1 TABELLE
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS todo_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES todo_lists(list_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todo_categories_list_id
  ON todo_categories(list_id);

-- Namen sind je Liste eindeutig (case-insensitive) — verhindert Doppel-Sektionen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_todo_categories_list_name
  ON todo_categories(list_id, lower(name));

-- ----------------------------------------------------------------
-- B.2 BACKFILL: bestehende Item-Kategorien übernehmen
-- ----------------------------------------------------------------
-- Reihenfolge = wann die Kategorie zum ersten Mal benutzt wurde.
-- household_id kommt aus der Liste, da todo_items keine eigene hat.

INSERT INTO todo_categories (household_id, list_id, name, sort_order)
SELECT
  l.household_id,
  src.list_id,
  src.name,
  (row_number() OVER (PARTITION BY src.list_id ORDER BY src.first_used))::int - 1
FROM (
  SELECT
    list_id,
    min(trim(category)) AS name,
    min(created_at) AS first_used
  FROM todo_items
  WHERE category IS NOT NULL AND length(trim(category)) > 0
  GROUP BY list_id, lower(trim(category))
) src
JOIN todo_lists l ON l.list_id = src.list_id
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- B.3 RLS
-- ----------------------------------------------------------------

ALTER TABLE todo_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their household todo categories" ON todo_categories;
CREATE POLICY "Users can view their household todo categories"
  ON todo_categories
  FOR SELECT
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can create todo categories for their household" ON todo_categories;
CREATE POLICY "Users can create todo categories for their household"
  ON todo_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can update their household todo categories" ON todo_categories;
CREATE POLICY "Users can update their household todo categories"
  ON todo_categories
  FOR UPDATE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())))
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can delete their household todo categories" ON todo_categories;
CREATE POLICY "Users can delete their household todo categories"
  ON todo_categories
  FOR DELETE
  TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- ----------------------------------------------------------------
-- B.4 REALTIME
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'todo_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE todo_categories;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- B.5 REPLICA IDENTITY (B8: DELETEs am household_id-Filter empfangbar)
-- ----------------------------------------------------------------

ALTER TABLE todo_categories REPLICA IDENTITY FULL;

-- ================================================================
-- TEIL C: shopping_categories nachziehen (Entscheidung E3, B8)
-- ================================================================
-- Derselbe Kanal-Fehler betrifft den bereits bestehenden Kategorie-
-- Kanal des Einkaufs (shopping_categories, siehe
-- 20260802201201_shopping_categories_table.sql), der ebenfalls nach
-- household_id filtert. ALTER TABLE … REPLICA IDENTITY FULL ist
-- idempotent (wiederholtes Setzen ist ein No-Op), daher hier ohne
-- weitere Wächter angehängt.

ALTER TABLE shopping_categories REPLICA IDENTITY FULL;
