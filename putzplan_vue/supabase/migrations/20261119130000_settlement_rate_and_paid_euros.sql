-- =================================================================
-- Geld-Ausgleich mit Kurs (CONTEXT.md § Umrechnung, § Ausgleich)
-- =================================================================
-- households.euros_per_point  Kurs des Haushalts, Euro je Punkt. Jedes Mitglied
--                             darf ihn ändern, wie das Wochenziel.
-- settlements.paid_euros      Was bei einem Geld-Ausgleich tatsächlich floss.
--                             Unabhängig von points_settled und vom Kurs: eine
--                             spätere Kursänderung verändert ihn nicht. Nur bei
--                             method = 'money'; alte Geld-Ausgleiche bleiben
--                             leer (der Betrag stand damals im Freitext).
-- households liegt seit 20260816170000 in der Realtime-Publikation, die
-- Kursänderung kommt darüber auf dem anderen Gerät an.
-- =================================================================

BEGIN;

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS euros_per_point NUMERIC(6, 2) NOT NULL DEFAULT 1.00
    CONSTRAINT households_euros_per_point_positive CHECK (euros_per_point > 0);

COMMENT ON COLUMN public.households.euros_per_point IS
  'Kurs für den Euro-Vorschlag beim Geld-Ausgleich: Euro je Punkt.';

-- Spaltenrecht neben weekly_goal_points (Sicherheitsstufe 2,
-- 20261102120100): ohne GRANT lehnt PostgREST das UPDATE ab.
GRANT UPDATE (euros_per_point) ON public.households TO authenticated;

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS paid_euros NUMERIC(10, 2)
    CONSTRAINT settlements_paid_euros_non_negative CHECK (paid_euros >= 0);

ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_paid_euros_only_money
    CHECK (paid_euros IS NULL OR method = 'money');

COMMENT ON COLUMN public.settlements.paid_euros IS
  'Gezahlter Betrag eines Geld-Ausgleichs in Euro; sonst NULL.';

COMMIT;

-- =================================================================
-- RÜCKROLL (manuell):
--
-- ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_paid_euros_only_money;
-- ALTER TABLE public.settlements DROP COLUMN IF EXISTS paid_euros;
-- REVOKE UPDATE (euros_per_point) ON public.households FROM authenticated;
-- ALTER TABLE public.households DROP COLUMN IF EXISTS euros_per_point;
--
-- Danach: `npx supabase migration repair --status reverted 20261119130000`
-- =================================================================
