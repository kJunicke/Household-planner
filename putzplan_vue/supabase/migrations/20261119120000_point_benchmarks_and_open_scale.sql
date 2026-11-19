-- =================================================================
-- PUNKTE: offene Skala und Richtwerte
-- =================================================================
-- Spec „Punkte und Ausgleich“ (CONTEXT.md § Punkte … § Schnelloption):
--
-- 1. Standardpunkte (`tasks.effort`) 1–999 statt 1–5.
-- 2. Erledigungen (`task_completions.effort_override`) 0–999 statt 0–5.
--    Beide bleiben nicht-leer; „unbewertet“ (effort NULL) kommt mit eigener
--    Migration. Die Grenze 999 fängt Tippfehler wie „50000“ ab; dieselbe Zahl
--    steht im Client (`POINTS_MAX` in src/lib/taskPoints.ts) und in der Edge
--    Function `complete-task`.
-- 3. Neue Tabelle `point_benchmarks` (Richtwerte je Haushalt, Schalter
--    Schnelloption, Beispiele als Textliste) mit RLS, Realtime und Startbestand
--    1, 2, 3, 5, 8, 12 — für jeden bestehenden und jeden neuen Haushalt.
--
-- Alte Zeilen bleiben unverändert (ADR-0005): die neuen Grenzen sind weiter
-- als die alten, jede bestehende Zeile erfüllt sie.
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. Standardpunkte 1–999
-- -----------------------------------------------------------------
-- `tasks_effort_check` ist der automatische Name des Spalten-CHECKs aus
-- 20251026000000 (`effort BETWEEN 1 AND 5`).
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_effort_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_effort_check CHECK (effort BETWEEN 1 AND 999);

-- -----------------------------------------------------------------
-- 2. Erledigungen 0–999
-- -----------------------------------------------------------------
ALTER TABLE public.task_completions DROP CONSTRAINT IF EXISTS task_completions_effort_override_check;
ALTER TABLE public.task_completions
  ADD CONSTRAINT task_completions_effort_override_check CHECK (effort_override BETWEEN 0 AND 999);

-- Kein zweiter, älterer CHECK darf die Punkte weiter auf 5 deckeln (Drift
-- zwischen Repo und Prod). Gibt es einen, bricht die Migration ab und rollt
-- ganz zurück, statt eine Skala zu hinterlassen, die 7 still abweist.
DO $$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(conrelid::regclass::text || '.' || conname, ', ') INTO v_left
  FROM pg_constraint
  WHERE contype = 'c'
    AND (
      (conrelid = 'public.tasks'::regclass
        AND pg_get_constraintdef(oid) ~ '\meffort\M'
        AND conname <> 'tasks_effort_check')
      OR
      (conrelid = 'public.task_completions'::regclass
        AND pg_get_constraintdef(oid) ~ '\meffort_override\M'
        AND conname <> 'task_completions_effort_override_check')
    );
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'Weitere Punkte-CHECKs vorhanden, erst prüfen: %', v_left;
  END IF;
END $$;

-- -----------------------------------------------------------------
-- 3. Richtwerte
-- -----------------------------------------------------------------
-- Eine Punktzahl je Haushalt höchstens einmal (Beispiele sollen nicht auf
-- zwei Einträge verteilt werden). `examples` ist eine Textliste; die Grenzen
-- halten eine einzelne Zeile klein, die Pflege-Oberfläche liest sie nicht nach.
CREATE TABLE IF NOT EXISTS public.point_benchmarks (
  benchmark_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    UUID NOT NULL REFERENCES public.households(household_id) ON DELETE CASCADE,
  points          INTEGER NOT NULL CHECK (points BETWEEN 1 AND 999),
  is_quick_option BOOLEAN NOT NULL DEFAULT FALSE,
  examples        TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT point_benchmarks_household_points_key UNIQUE (household_id, points),
  CONSTRAINT point_benchmarks_examples_size CHECK (
    cardinality(examples) <= 50
    AND length(array_to_string(examples, '')) <= 5000
  )
);

-- RLS wie bei `settlements`, aber jedes Mitglied darf ändern und löschen:
-- die Richtwerte gehören dem Haushalt, nicht dem, der sie angelegt hat.
ALTER TABLE public.point_benchmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their household benchmarks" ON public.point_benchmarks;
CREATE POLICY "Members read their household benchmarks"
  ON public.point_benchmarks FOR SELECT TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Members create benchmarks in their household" ON public.point_benchmarks;
CREATE POLICY "Members create benchmarks in their household"
  ON public.point_benchmarks FOR INSERT TO authenticated
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Members update their household benchmarks" ON public.point_benchmarks;
CREATE POLICY "Members update their household benchmarks"
  ON public.point_benchmarks FOR UPDATE TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())))
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Members delete their household benchmarks" ON public.point_benchmarks;
CREATE POLICY "Members delete their household benchmarks"
  ON public.point_benchmarks FOR DELETE TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- anon braucht die Tabelle nie.
REVOKE ALL ON public.point_benchmarks FROM anon;

-- Realtime: die Änderung des Partners kommt ohne Neuladen an.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'point_benchmarks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.point_benchmarks;
  END IF;
END $$;

-- DELETE-Ereignisse tragen sonst nur den PK, und der `household_id`-Filter
-- des Realtime-Kanals verwürfe sie (wie bei den Kategorien, 20260906120000).
ALTER TABLE public.point_benchmarks REPLICA IDENTITY FULL;

-- -----------------------------------------------------------------
-- 4. Startbestand 1, 2, 3, 5, 8, 12 als Schnelloption, ohne Beispiele
-- -----------------------------------------------------------------
-- Dieselben Zahlen stehen im Client als Rückfall, solange die Richtwerte noch
-- nicht geladen sind (`STARTER_QUICK_OPTIONS` in src/stores/pointBenchmarkStore.ts).
CREATE OR REPLACE FUNCTION public.seed_point_benchmarks(p_household_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.point_benchmarks (household_id, points, is_quick_option)
  SELECT p_household_id, p, TRUE
  FROM unnest(ARRAY[1, 2, 3, 5, 8, 12]) AS p
  ON CONFLICT (household_id, points) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.seed_point_benchmarks(uuid) FROM PUBLIC, anon, authenticated;

-- Neue Haushalte: per Trigger, damit jeder Anlegeweg (heute nur die RPC
-- `create_household`) den Startbestand bekommt.
CREATE OR REPLACE FUNCTION public.seed_point_benchmarks_for_new_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.seed_point_benchmarks(NEW.household_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_point_benchmarks_for_new_household() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_point_benchmarks ON public.households;
CREATE TRIGGER trg_seed_point_benchmarks
  AFTER INSERT ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.seed_point_benchmarks_for_new_household();

-- Bestehende Haushalte.
SELECT public.seed_point_benchmarks(household_id) FROM public.households;

COMMIT;

-- -----------------------------------------------------------------
-- Rückroll (von Hand, nur solange keine Punkte über 5 gespeichert sind):
-- -----------------------------------------------------------------
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_seed_point_benchmarks ON public.households;
-- DROP FUNCTION IF EXISTS public.seed_point_benchmarks_for_new_household();
-- DROP FUNCTION IF EXISTS public.seed_point_benchmarks(uuid);
-- DROP TABLE IF EXISTS public.point_benchmarks;
-- ALTER TABLE public.task_completions DROP CONSTRAINT task_completions_effort_override_check;
-- ALTER TABLE public.task_completions ADD CONSTRAINT task_completions_effort_override_check
--   CHECK (effort_override >= 0 AND effort_override <= 5);
-- ALTER TABLE public.tasks DROP CONSTRAINT tasks_effort_check;
-- ALTER TABLE public.tasks ADD CONSTRAINT tasks_effort_check CHECK (effort BETWEEN 1 AND 5);
-- COMMIT;
