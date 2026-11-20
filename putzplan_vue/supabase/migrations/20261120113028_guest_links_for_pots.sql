-- =================================================================
-- GÄSTE: Gastlink für Töpfe
-- =================================================================
-- CONTEXT.md § Gast, § Gastlink, § Topf; Entscheidung
-- docs/adr/0006-gastlink-ohne-anmeldung.md.
--
-- Ein Mitglied teilt einen Topf für einen Anlass per Gastlink; der
-- Haushaltstopf lässt sich nie teilen. Der Gast darf im Topf, was ein
-- Teilnehmer darf: lesen, Ausgaben und Rückzahlungen anlegen, ändern und
-- löschen — solange der Topf offen ist. Abschließen, löschen, Teilnehmer
-- umbenennen, Links verwalten darf er nie; die Policies der Mitglieder hängen
-- an `get_user_household_id`, das für ihn NULL liefert.
--
-- 1. Zielart `pot` in `guest_shares`, Zielprüfung in `create_guest_share`
--    (nur Ereignistöpfe des eigenen Haushalts).
-- 2. Gelöschter Topf nimmt seine Freigabe mit.
-- 3. RLS für Gäste: Topf und Teilnehmer lesen, Einträge lesen und — im
--    offenen Topf — schreiben. Ein abgeschlossener Topf bleibt lesbar
--    (Endstand), nimmt aber nichts an.
-- 4. `join_pot_as_guest` („Ich bin neu“): der einzige Weg, auf dem ein Gast
--    einen Teilnehmer anlegt. Ein schon vorhandener Name (Groß-/Klein-
--    schreibung egal) scheitert am eindeutigen Index (23505).
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. Zielart Topf
-- -----------------------------------------------------------------
ALTER TABLE public.guest_shares DROP CONSTRAINT IF EXISTS guest_shares_target_kind_check;
ALTER TABLE public.guest_shares ADD CONSTRAINT guest_shares_target_kind_check
  CHECK (target_kind IN ('shopping_list', 'packing_list', 'todo_list', 'pot'));

-- Rumpf wie in 20261120110040, dazu der Zweig `pot`: nur ein Topf für einen
-- Anlass; der Haushaltstopf gilt als nicht gefunden.
CREATE OR REPLACE FUNCTION public.create_guest_share(p_kind text, p_target_id uuid)
RETURNS public.guest_shares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_house  uuid;
  v_target uuid;
  v_share  public.guest_shares;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;
  v_house := public.get_user_household_id(v_uid);
  IF v_house IS NULL THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'shopping_list' THEN
    SELECT list_id INTO v_target FROM public.shopping_lists WHERE list_id = p_target_id AND household_id = v_house;
  ELSIF p_kind = 'packing_list' THEN
    SELECT list_id INTO v_target FROM public.packing_lists WHERE list_id = p_target_id AND household_id = v_house;
  ELSIF p_kind = 'todo_list' THEN
    SELECT list_id INTO v_target FROM public.todo_lists WHERE list_id = p_target_id AND household_id = v_house;
  ELSIF p_kind = 'pot' THEN
    SELECT pot_id INTO v_target FROM public.pots
    WHERE pot_id = p_target_id AND household_id = v_house AND kind = 'event';
  ELSE
    RAISE EXCEPTION 'invalid_share_kind' USING ERRCODE = '22023';
  END IF;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'share_target_not_found' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.guest_shares (household_id, target_kind, target_id, secret, created_by)
  VALUES (v_house, p_kind, v_target, public.new_guest_secret(), v_uid)
  ON CONFLICT ON CONSTRAINT guest_shares_one_per_target DO NOTHING;

  SELECT * INTO v_share FROM public.guest_shares s
  WHERE s.target_kind = p_kind AND s.target_id = v_target;
  RETURN v_share;
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_share(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_guest_share(text, uuid) TO authenticated;

-- -----------------------------------------------------------------
-- 2. Aufräumen: gelöschter Topf nimmt seine Freigabe mit
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.drop_guest_share_of_deleted_pot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.guest_shares s
  WHERE s.target_kind = 'pot' AND s.target_id = OLD.pot_id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.drop_guest_share_of_deleted_pot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_drop_guest_share ON public.pots;
CREATE TRIGGER trg_drop_guest_share AFTER DELETE ON public.pots
  FOR EACH ROW EXECUTE FUNCTION public.drop_guest_share_of_deleted_pot();

-- -----------------------------------------------------------------
-- 3. RLS für Gäste
-- -----------------------------------------------------------------
-- `guest_target_household('pot', pot_id)` liefert den Haushalt des Topfs nur,
-- wenn die Sitzung seinen Link eingelöst hat; der Vergleich mit der
-- household_id der Zeile hält fremde Haushalte draußen. Schreiben nur in den
-- offenen Topf.
DROP POLICY IF EXISTS "Guests read their shared pot" ON public.pots;
CREATE POLICY "Guests read their shared pot"
  ON public.pots FOR SELECT TO authenticated
  USING (household_id = public.guest_target_household('pot', pot_id));

DROP POLICY IF EXISTS "Guests read participants of their shared pot" ON public.pot_participants;
CREATE POLICY "Guests read participants of their shared pot"
  ON public.pot_participants FOR SELECT TO authenticated
  USING (household_id = public.guest_target_household('pot', pot_id));

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['pot_expenses', 'pot_repayments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Guests read entries of their shared pot" ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY "Guests read entries of their shared pot" ON public.%I FOR SELECT TO authenticated
         USING (household_id = public.guest_target_household(''pot'', pot_id))',
      v_table);

    EXECUTE format('DROP POLICY IF EXISTS "Guests add entries to their open shared pot" ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY "Guests add entries to their open shared pot" ON public.%I FOR INSERT TO authenticated
         WITH CHECK (
           household_id = public.guest_target_household(''pot'', pot_id)
           AND EXISTS (SELECT 1 FROM public.pots p WHERE p.pot_id = %I.pot_id AND p.closed_at IS NULL)
         )',
      v_table, v_table);

    EXECUTE format('DROP POLICY IF EXISTS "Guests update entries in their open shared pot" ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY "Guests update entries in their open shared pot" ON public.%I FOR UPDATE TO authenticated
         USING (
           household_id = public.guest_target_household(''pot'', pot_id)
           AND EXISTS (SELECT 1 FROM public.pots p WHERE p.pot_id = %I.pot_id AND p.closed_at IS NULL)
         )
         WITH CHECK (household_id = public.guest_target_household(''pot'', pot_id))',
      v_table, v_table);

    EXECUTE format('DROP POLICY IF EXISTS "Guests delete entries in their open shared pot" ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY "Guests delete entries in their open shared pot" ON public.%I FOR DELETE TO authenticated
         USING (
           household_id = public.guest_target_household(''pot'', pot_id)
           AND EXISTS (SELECT 1 FROM public.pots p WHERE p.pot_id = %I.pot_id AND p.closed_at IS NULL)
         )',
      v_table, v_table);
  END LOOP;
END $$;

-- -----------------------------------------------------------------
-- 4. „Ich bin neu“
-- -----------------------------------------------------------------
-- Der Gast trägt sich selbst als Teilnehmer ein: ohne Konto dahinter, nur in
-- den Topf, dessen Link die Sitzung eingelöst hat, nur solange er offen ist.
-- Es ist der einzige Weg, auf dem ein Gast einen Teilnehmer anlegt: Regeln
-- für Nachzügler (etwa bei Ausgaben auf die ganze Gruppe) gehören hierher.
--
-- Fehler: not_authenticated · not_a_guest (42501) · pot_not_shared ·
-- pot_closed (P0001) · leerer oder zu langer Name (23514 aus dem CHECK) ·
-- Name vergeben (23505 aus dem eindeutigen Index).
CREATE OR REPLACE FUNCTION public.join_pot_as_guest(p_pot_id uuid, p_name text)
RETURNS public.pot_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_household   uuid;
  v_pot         public.pots;
  v_participant public.pot_participants;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'not_a_guest' USING ERRCODE = '42501';
  END IF;
  v_household := public.guest_target_household('pot', p_pot_id);
  IF v_household IS NULL THEN
    RAISE EXCEPTION 'pot_not_shared' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_pot FROM public.pots
  WHERE pot_id = p_pot_id AND household_id = v_household AND kind = 'event'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pot_not_shared' USING ERRCODE = 'P0001';
  END IF;
  IF v_pot.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'pot_closed' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.pot_participants (pot_id, household_id, name, created_at)
  VALUES (v_pot.pot_id, v_household, btrim(coalesce(p_name, '')), clock_timestamp())
  RETURNING * INTO v_participant;
  RETURN v_participant;
END;
$$;
REVOKE ALL ON FUNCTION public.join_pot_as_guest(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_pot_as_guest(uuid, text) TO authenticated;

COMMIT;

-- =================================================================
-- RÜCKROLL (von Hand; vorher bestehende Topf-Freigaben beenden):
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.join_pot_as_guest(uuid, text);
-- DROP POLICY IF EXISTS "Guests read their shared pot" ON public.pots;
-- DROP POLICY IF EXISTS "Guests read participants of their shared pot" ON public.pot_participants;
-- DROP POLICY IF EXISTS "Guests read entries of their shared pot" ON public.pot_expenses;
-- DROP POLICY IF EXISTS "Guests add entries to their open shared pot" ON public.pot_expenses;
-- DROP POLICY IF EXISTS "Guests update entries in their open shared pot" ON public.pot_expenses;
-- DROP POLICY IF EXISTS "Guests delete entries in their open shared pot" ON public.pot_expenses;
-- DROP POLICY IF EXISTS "Guests read entries of their shared pot" ON public.pot_repayments;
-- DROP POLICY IF EXISTS "Guests add entries to their open shared pot" ON public.pot_repayments;
-- DROP POLICY IF EXISTS "Guests update entries in their open shared pot" ON public.pot_repayments;
-- DROP POLICY IF EXISTS "Guests delete entries in their open shared pot" ON public.pot_repayments;
-- DROP TRIGGER IF EXISTS trg_drop_guest_share ON public.pots;
-- DROP FUNCTION IF EXISTS public.drop_guest_share_of_deleted_pot();
-- DELETE FROM public.guest_shares WHERE target_kind = 'pot';
-- ALTER TABLE public.guest_shares DROP CONSTRAINT guest_shares_target_kind_check;
-- ALTER TABLE public.guest_shares ADD CONSTRAINT guest_shares_target_kind_check
--   CHECK (target_kind IN ('shopping_list', 'packing_list', 'todo_list'));
-- -- create_guest_share: Fassung aus 20261120110040 erneut einspielen.
-- COMMIT;
-- Danach: npx supabase migration repair --status reverted 20261120113028
-- =================================================================
