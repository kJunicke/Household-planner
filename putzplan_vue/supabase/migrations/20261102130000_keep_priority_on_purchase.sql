-- Der Stern (is_priority) bleibt beim Kaufen erhalten.
-- Bisher setzte ein Trigger is_priority beim Kaufen auf false. Gekaufte Artikel zeigen den
-- Stern nicht an; bleibt er gespeichert, ist er beim Zurückholen des Artikels wieder da.
-- Das alte Frontend setzt is_priority beim Kaufen selbst auf false: für dieses ändert sich nichts.
--
-- Idempotent: mehrfaches Ausführen ist unschädlich.

DROP TRIGGER IF EXISTS trigger_remove_priority_on_purchase ON public.shopping_items;
DROP FUNCTION IF EXISTS public.remove_priority_on_purchase();

-- =================================================================
-- RÜCKROLL (manuell im SQL-Editor; stellt den Stand nach der Sicherheitsstufe 1 wieder her)
-- =================================================================
-- CREATE OR REPLACE FUNCTION public.remove_priority_on_purchase()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   -- If item was just marked as purchased, remove priority
--   IF NEW.purchased = TRUE AND OLD.purchased = FALSE THEN
--     NEW.is_priority = FALSE;
--   END IF;
--
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql SET search_path = public, pg_temp;
--
-- DROP TRIGGER IF EXISTS trigger_remove_priority_on_purchase ON public.shopping_items;
-- CREATE TRIGGER trigger_remove_priority_on_purchase
--   BEFORE UPDATE ON public.shopping_items
--   FOR EACH ROW
--   EXECUTE FUNCTION public.remove_priority_on_purchase();
