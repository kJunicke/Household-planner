-- =================================================================
-- GASTLINKS: live für alle Mitglieder
-- =================================================================
-- CONTEXT.md § Gastlink.
--
-- Erzeugt, erneuert oder beendet ein Mitglied einen Gastlink, sehen die
-- anderen Mitglieder das sofort (Liste bearbeiten, Topf, Einstellungen) —
-- nicht erst nach dem Neuladen. Dafür kommt `guest_shares` in die
-- Realtime-Publikation.
--
-- Realtime wendet die SELECT-Policy je Abonnent an: nur Mitglieder des
-- Haushalts bekommen Zeilen samt Geheimnis, Gäste nie. Bewusst KEIN
-- REPLICA IDENTITY FULL: DELETE-Ereignisse tragen so nur `share_id` (kein
-- Geheimnis); der Client hört DELETE ungefiltert und räumt per Kennung ab.
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'guest_shares'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_shares;
  END IF;
END $$;

COMMIT;

-- =================================================================
-- RÜCKROLL (von Hand):
--
-- BEGIN;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.guest_shares;
-- COMMIT;
-- npx supabase migration repair --status reverted 20261120123321
-- =================================================================
