-- =================================================================
-- WOCHENSTART-WECHSEL AM HAUSHALT (Pinnwand-Redesign, Etappe 3 / Ticket 08)
-- =================================================================
-- Ein geänderter Wochenstart darf die **laufende** Woche nicht neu
-- zuschneiden — sonst verschwänden bereits gesammelte Punkte scheinbar.
-- Der Wechselzeitpunkt gehört deshalb an den Haushalt, nicht an ein
-- einzelnes Gerät: der Balken ist ein gemeinsamer Balken, und zwei
-- Mitglieder dürfen in derselben Woche nicht verschiedene Zahlen sehen.
--
--   week_start_day          der Tag, der GERADE GILT
--   week_start_day_pending  der Tag, der als nächstes gelten soll
--   week_start_pending_from Kalendertag, ab dem er gilt
--
-- Beide Zusatzfelder sind NULL, solange nichts ansteht. Gerechnet wird
-- der Wechseltag einmalig beim Speichern (erstes Auftreten des neuen
-- Wochentags am oder nach dem Ende der laufenden Woche) — jeder Client
-- liest danach nur noch ab, statt selbst zu schließen.
--
-- Das Fortschreiben Pending -> Aktiv passiert beim Laden durch die
-- Clients und ist idempotent: der UPDATE trägt seine Bedingung selbst
-- (`week_start_day_pending IS NOT NULL`), ein zweiter Lauf trifft keine
-- Zeile mehr. Das Wochenfenster verschiebt sich dadurch nie, weil die
-- Leseregel eine fällige Änderung ohnehin schon anwendet — vorher und
-- nachher kommt derselbe Wochentag heraus.
--
-- RLS: `households` hat RLS aktiv, inklusive UPDATE-Policy für alle
-- Mitglieder des Haushalts (20251026000001_rls_policies.sql). Policies
-- gelten je Zeile, nicht je Spalte — neue Spalten sind damit abgedeckt.
-- =================================================================

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS week_start_day_pending SMALLINT
    CHECK (week_start_day_pending BETWEEN 0 AND 6);

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS week_start_pending_from DATE;

COMMENT ON COLUMN households.week_start_day_pending IS
  'Anstehender Wochenstart, 0 = Sonntag … 6 = Samstag. NULL = nichts anstehend.';

COMMENT ON COLUMN households.week_start_pending_from IS
  'Kalendertag, ab dem week_start_day_pending gilt. Beim Speichern einmalig berechnet.';

-- Realtime: bisher stand `households` nicht in der Publikation, deshalb
-- erfuhr ein Mitglied nie von der Änderung des anderen. Ohne diese Zeile
-- bleibt der gemeinsame Balken still auseinanderlaufen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'households'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE households;
  END IF;
END $$;
