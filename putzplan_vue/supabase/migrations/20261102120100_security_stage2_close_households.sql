-- =================================================================
-- SECURITY STUFE 2 (schließend) — Haushalte nur für Mitglieder,
-- Beitritt nur per RPC, kein hartes DELETE auf tasks/households
-- =================================================================
-- Rollout: security-rollout.md, Schritt 3. NUR ausrollen, wenn
--   (1) 20261102120000 in Prod angewandt ist und
--   (2) das Frontend mit create_household/join_household-RPC live ist.
-- Vorher angewandt, brechen Anlegen und Beitreten im alten Frontend
-- (`insert().select()` auf households, Code-Suche per SELECT).
--
-- Idempotent: DROP … IF EXISTS vor jedem CREATE; REVOKE/GRANT sind wiederholbar.
-- Rückroll-SQL: am Dateiende als Kommentar.
-- =================================================================

SET search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. households: nur das eigene Haus ist lesbar (B1 / Ticket 01)
-- -----------------------------------------------------------------
-- Ausdruck wie die übrigen households-Policies in Prod. Die Unterabfrage auf
-- household_members läuft unter deren SELECT-Policy, die über die
-- DEFINER-Funktion get_user_household_id geht → keine Rekursion.
-- Realtime: households bleibt in supabase_realtime (das Frontend abonniert
-- die eigene Zeile). postgres_changes prüft für jeden Abonnenten die
-- SELECT-Policy — fremde Haushaltszeilen samt Invite-Code kommen damit
-- nicht mehr an.
DROP POLICY IF EXISTS "Users can view households" ON public.households;
DROP POLICY IF EXISTS "Members can view their household" ON public.households;
CREATE POLICY "Members can view their household"
ON public.households FOR SELECT
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM public.household_members WHERE user_id = (SELECT auth.uid())
  )
);

-- Anlegen nur noch über create_household() (SECURITY DEFINER).
DROP POLICY IF EXISTS "Users can create households" ON public.households;

-- Ticket 07 / B2: kein Mitglied löscht den Haushalt (DELETE kaskadiert auf
-- alles). Das Frontend ruft households.delete() nirgends auf.
DROP POLICY IF EXISTS "Users can delete their household" ON public.households;

-- UPDATE bleibt für Mitglieder, aber nur auf den Spalten, die das Frontend
-- schreibt (Wochenziel, Wochenstart; name für eine spätere Umbenennung).
-- household_id und invite_code sind damit nicht mehr per REST änderbar.
-- Reihenfolge wichtig: das REVOKE auf Tabellenebene nimmt auch Spaltenrechte
-- mit, deshalb danach die Spalten-GRANTs.
REVOKE UPDATE ON public.households FROM anon, authenticated;
GRANT UPDATE (name, weekly_goal_points, week_start_day, week_start_day_pending, week_start_pending_from)
  ON public.households TO authenticated;

-- -----------------------------------------------------------------
-- 2. household_members: Beitritt nur per RPC, UPDATE nur Name/Farbe
-- -----------------------------------------------------------------
-- Ohne INSERT-Policy kann kein Client sich selbst in einen fremden Haushalt
-- eintragen; join_household() prüft den Code.
DROP POLICY IF EXISTS "Users can join households" ON public.household_members;

-- Die UPDATE-Policy (user_id = auth.uid()) bleibt; dazu Spaltenrechte, damit
-- household_id nicht mehr umgesetzt werden kann („Haushalt wechseln“).
REVOKE UPDATE ON public.household_members FROM anon, authenticated;
GRANT UPDATE (display_name, user_color) ON public.household_members TO authenticated;

-- Verlassen (DELETE der eigenen Zeile) bleibt unverändert erlaubt.

-- -----------------------------------------------------------------
-- 3. tasks: kein hartes DELETE (B2)
-- -----------------------------------------------------------------
-- Das Frontend löscht nur weich (deleted_at, taskStore.deleteTask). In Prod
-- hängt task_completions.task_id mit ON DELETE SET NULL an tasks: ein hartes
-- DELETE verwaist die Erledigungen ALLER Mitglieder, sie fallen aus Verlauf
-- und Wochenziel. 21 solche Zeilen gibt es, alle vor dem Soft-Delete
-- (03.01.2026). Ohne DELETE-Policy lehnt RLS jedes Client-DELETE ab
-- (0 Zeilen); service_role/postgres bleiben unberührt.
DROP POLICY IF EXISTS "Users can delete household tasks" ON public.tasks;

-- =================================================================
-- RÜCKROLL (manuell). Stellt exakt den Prod-Stand vom 02.11.2026 her:
--
-- DROP POLICY IF EXISTS "Members can view their household" ON public.households;
-- CREATE POLICY "Users can view households" ON public.households
--   FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Users can create households" ON public.households
--   FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "Users can delete their household" ON public.households
--   FOR DELETE TO authenticated USING (household_id IN (
--     SELECT household_id FROM public.household_members WHERE user_id = (SELECT auth.uid())));
-- GRANT UPDATE ON public.households TO anon, authenticated;
--
-- CREATE POLICY "Users can join households" ON public.household_members
--   FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
-- GRANT UPDATE ON public.household_members TO anon, authenticated;
--
-- CREATE POLICY "Users can delete household tasks" ON public.tasks
--   FOR DELETE TO authenticated USING (household_id IN (
--     SELECT household_id FROM public.household_members WHERE user_id = (SELECT auth.uid())));
--
-- Danach: `npx supabase migration repair --status reverted 20261102120100`
-- =================================================================
