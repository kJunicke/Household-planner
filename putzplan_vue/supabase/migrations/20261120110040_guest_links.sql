-- =================================================================
-- GÄSTE: Gastlinks ohne Anmeldung
-- =================================================================
-- CONTEXT.md § Gast, § Gastlink; Entscheidung docs/adr/0006-gastlink-ohne-anmeldung.md.
--
-- Ein Gast ist eine Supabase-Anonymanmeldung: Rolle `authenticated` mit dem
-- Claim `is_anonymous`. Damit gilt jede bestehende `TO authenticated`-Regel
-- auch für ihn. Die Tabellen-Policies lassen ihn ohnehin nicht herein
-- (`get_user_household_id` liefert für ihn NULL), aber die RPCs
-- `create_household`/`join_household` hätten ihn zum Mitglied gemacht.
--
-- 1. Anonyme Konten werden nie Haushaltsmitglied: die beiden RPCs weisen sie
--    ab, und ein Trigger auf household_members sperrt jeden anderen Weg.
-- 2. Freigaben (`guest_shares`): je geteiltem Ziel eine Zeile mit einem
--    zufälligen Link-Geheimnis. Ziel ist heute eine Einkaufs-, Pack- oder
--    To-do-Liste; die Art (`target_kind`) ist offen für weitere Ziele.
-- 3. Gewährungen (`guest_grants`): eine anonyme Sitzung, die ein gültiges
--    Geheimnis eingelöst hat. Erneuern tauscht das Geheimnis und löscht alle
--    Gewährungen; Beenden löscht die Freigabe samt Gewährungen.
-- 4. RLS: zusätzliche (ODER-verknüpfte) Policies lassen einen Gast genau die
--    gewährte Liste lesen und ihre Einträge und Kategorien schreiben. Die
--    Liste selbst (Name, Notiz) bleibt für ihn schreibgeschützt.
--
-- Die Anonymanmeldung selbst ist eine Projekt-Einstellung und wird erst
-- NACH dieser Migration eingeschaltet — vorher könnte jeder anonyme Konten
-- anlegen und mit ihnen Haushalte gründen.
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. Anonyme Konten sind keine Haushaltsmitglieder
-- -----------------------------------------------------------------
-- Prüft das Konto in auth.users, nicht den Claim: so greift die Sperre auch
-- auf Wegen ohne JWT (Trigger, künftige Funktionen).
CREATE OR REPLACE FUNCTION public.guard_member_not_anonymous()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id AND is_anonymous) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_member_not_anonymous() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_member_not_anonymous ON public.household_members;
CREATE TRIGGER trg_guard_member_not_anonymous
  BEFORE INSERT OR UPDATE OF user_id ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_not_anonymous();

-- Die beiden RPCs melden den Fall selbst, mit eigener Meldung und 42501
-- (PostgREST → HTTP 403), bevor sie irgendetwas anlegen. Rumpf sonst
-- unverändert aus 20261102120000.
CREATE OR REPLACE FUNCTION public.create_household(p_name text, p_display_name text)
RETURNS public.households
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_name    text := btrim(coalesce(p_name, ''));
  v_display text := coalesce(left(nullif(btrim(coalesce(p_display_name, '')), ''), 50), 'Unbekannt');
  v_house   public.households;
  v_try     integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) < 1 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid_household_name' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'already_in_household' USING ERRCODE = 'P0001';
  END IF;

  FOR v_try IN 1..5 LOOP
    BEGIN
      INSERT INTO public.households (name) VALUES (v_name) RETURNING * INTO v_house;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try = 5 THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO public.household_members (user_id, household_id, display_name, user_color)
  VALUES (v_uid, v_house.household_id, v_display, '#4A90E2');

  RETURN v_house;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_household(p_invite_code text, p_display_name text)
RETURNS public.households
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_code    text := upper(btrim(coalesce(p_invite_code, '')));
  v_display text := coalesce(left(nullif(btrim(coalesce(p_display_name, '')), ''), 50), 'Unbekannt');
  v_palette text[] := ARRAY[
    '#4A90E2', '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C',
    '#E67E22', '#34495E', '#3498DB', '#E91E63', '#16A085', '#C0392B'
  ];
  v_used    text[];
  v_color   text;
  v_house   public.households;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'already_in_household' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_house FROM public.households WHERE invite_code = v_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invite_code' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(DISTINCT upper(m.user_color)), ARRAY[]::text[]) INTO v_used
  FROM public.household_members m
  WHERE m.household_id = v_house.household_id AND m.user_color IS NOT NULL;

  SELECT c INTO v_color
  FROM unnest(v_palette) WITH ORDINALITY AS p(c, ord)
  WHERE upper(c) <> ALL (v_used)
  ORDER BY ord
  LIMIT 1;

  IF v_color IS NULL THEN
    v_color := v_palette[(coalesce(array_length(v_used, 1), 0) % array_length(v_palette, 1)) + 1];
  END IF;

  INSERT INTO public.household_members (user_id, household_id, display_name, user_color)
  VALUES (v_uid, v_house.household_id, v_display, v_color);

  RETURN v_house;
END;
$$;

REVOKE ALL ON FUNCTION public.create_household(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_household(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_household(text, text) TO authenticated;

-- -----------------------------------------------------------------
-- 2. Freigaben und Gewährungen
-- -----------------------------------------------------------------
-- Ziel als Art + ID statt einer FK-Spalte je Zielart: so kommt eine weitere
-- Art (Topf) ohne Umbau dazu — nur die CHECK-Liste, die Zielprüfung in
-- create_guest_share und die Policies wachsen. Das Aufräumen beim Löschen des
-- Ziels übernimmt ein Trigger je Zieltabelle (Abschnitt 4).
--
-- Das Geheimnis liegt im Klartext: Mitglieder müssen den Link später wieder
-- kopieren können. Lesen dürfen es nur Mitglieder des Haushalts.
CREATE TABLE IF NOT EXISTS public.guest_shares (
  share_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(household_id) ON DELETE CASCADE,
  target_kind  text NOT NULL
    CONSTRAINT guest_shares_target_kind_check
    CHECK (target_kind IN ('shopping_list', 'packing_list', 'todo_list')),
  target_id    uuid NOT NULL,
  secret       text NOT NULL UNIQUE,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  renewed_at   timestamptz,
  CONSTRAINT guest_shares_one_per_target UNIQUE (target_kind, target_id)
);
CREATE INDEX IF NOT EXISTS idx_guest_shares_household_id ON public.guest_shares(household_id);

ALTER TABLE public.guest_shares ENABLE ROW LEVEL SECURITY;
-- Schreiben nur über die RPCs unten; Gäste lesen nie mit (für sie liefert
-- get_user_household_id NULL).
REVOKE ALL ON public.guest_shares FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.guest_shares FROM authenticated;
DROP POLICY IF EXISTS "Members read their household guest shares" ON public.guest_shares;
CREATE POLICY "Members read their household guest shares"
  ON public.guest_shares FOR SELECT TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

-- Wer (welche anonyme Sitzung) welche Freigabe eingelöst hat. Kein Client
-- liest oder schreibt hier; das tun nur die SECURITY-DEFINER-Funktionen.
CREATE TABLE IF NOT EXISTS public.guest_grants (
  share_id   uuid NOT NULL REFERENCES public.guest_shares(share_id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (share_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_guest_grants_user_id ON public.guest_grants(user_id);

ALTER TABLE public.guest_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_grants FROM anon, authenticated;

-- Zufälliges Link-Geheimnis: 18 Byte, base64url, 24 Zeichen ohne Füllzeichen.
CREATE OR REPLACE FUNCTION public.new_guest_secret()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  SELECT translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
$$;
REVOKE ALL ON FUNCTION public.new_guest_secret() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------
-- 3. RPCs
-- -----------------------------------------------------------------
-- Verwalten dürfen nur Mitglieder mit Konto (ADR-0006); anonyme Sitzungen
-- weisen alle drei ausdrücklich ab, auch wenn sie ohne Haushalt ohnehin an
-- `not_a_member` scheiterten.
--
-- Fehler: anonymous_not_allowed · not_a_member (42501) · invalid_share_kind
-- (22023) · share_target_not_found · share_not_found (P0001).

-- Teilt ein Ziel. Ist es schon geteilt, kommt die bestehende Freigabe zurück
-- (gleicher Link) — zweimal tippen erzeugt keinen zweiten.
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
  ELSE
    RAISE EXCEPTION 'invalid_share_kind' USING ERRCODE = '22023';
  END IF;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'share_target_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- ON CONFLICT: zwei Mitglieder teilen gleichzeitig → beide bekommen dieselbe.
  INSERT INTO public.guest_shares (household_id, target_kind, target_id, secret, created_by)
  VALUES (v_house, p_kind, v_target, public.new_guest_secret(), v_uid)
  ON CONFLICT ON CONSTRAINT guest_shares_one_per_target DO NOTHING;

  SELECT * INTO v_share FROM public.guest_shares s
  WHERE s.target_kind = p_kind AND s.target_id = v_target;
  RETURN v_share;
END;
$$;

-- Neues Geheimnis, alle Gewährungen weg: der alte Link öffnet sofort nichts
-- mehr, auch nicht für Gäste, die ihn schon eingelöst hatten.
CREATE OR REPLACE FUNCTION public.renew_guest_share(p_share_id uuid)
RETURNS public.guest_shares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_share public.guest_shares;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.guest_shares s
  SET secret = public.new_guest_secret(), renewed_at = now()
  WHERE s.share_id = p_share_id
    AND s.household_id = public.get_user_household_id(v_uid)
  RETURNING * INTO v_share;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_not_found' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.guest_grants g WHERE g.share_id = p_share_id;
  RETURN v_share;
END;
$$;

-- Beendet die Freigabe; die Gewährungen fallen per CASCADE mit.
CREATE OR REPLACE FUNCTION public.end_guest_share(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.guest_shares s
  WHERE s.share_id = p_share_id
    AND s.household_id = public.get_user_household_id(v_uid);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'share_not_found' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Löst ein Link-Geheimnis für die aufrufende anonyme Sitzung ein. Mehrfaches
-- Einlösen (Neuladen) ist harmlos. Liefert, was die Gastansicht braucht —
-- auch den Haushaltsnamen für „geteilt von …“, den der Gast per RLS nicht
-- lesen darf.
--
-- Fehler: not_authenticated · not_a_guest (42501) · invalid_guest_link (P0001).
-- Ein falsches Geheimnis verrät nichts über andere Freigaben.
CREATE OR REPLACE FUNCTION public.redeem_guest_link(p_secret text)
RETURNS TABLE (target_kind text, target_id uuid, household_id uuid, household_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_share public.guest_shares;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'not_a_guest' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_share FROM public.guest_shares s WHERE s.secret = p_secret;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_guest_link' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.guest_grants (share_id, user_id)
  VALUES (v_share.share_id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  SELECT v_share.target_kind, v_share.target_id, h.household_id, h.name
  FROM public.households h
  WHERE h.household_id = v_share.household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_share(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.renew_guest_share(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_guest_share(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_guest_link(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_guest_share(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_guest_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_guest_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_guest_link(text) TO authenticated;

-- -----------------------------------------------------------------
-- 4. Aufräumen: gelöschtes Ziel nimmt seine Freigabe mit
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.drop_guest_share_of_deleted_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.guest_shares s
  WHERE s.target_kind = TG_ARGV[0] AND s.target_id = OLD.list_id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.drop_guest_share_of_deleted_target() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_drop_guest_share ON public.shopping_lists;
CREATE TRIGGER trg_drop_guest_share AFTER DELETE ON public.shopping_lists
  FOR EACH ROW EXECUTE FUNCTION public.drop_guest_share_of_deleted_target('shopping_list');
DROP TRIGGER IF EXISTS trg_drop_guest_share ON public.packing_lists;
CREATE TRIGGER trg_drop_guest_share AFTER DELETE ON public.packing_lists
  FOR EACH ROW EXECUTE FUNCTION public.drop_guest_share_of_deleted_target('packing_list');
DROP TRIGGER IF EXISTS trg_drop_guest_share ON public.todo_lists;
CREATE TRIGGER trg_drop_guest_share AFTER DELETE ON public.todo_lists
  FOR EACH ROW EXECUTE FUNCTION public.drop_guest_share_of_deleted_target('todo_list');

-- -----------------------------------------------------------------
-- 5. RLS für Gäste
-- -----------------------------------------------------------------
-- Haushalt des Ziels, wenn die aufrufende Sitzung es per Gastlink eingelöst
-- hat, sonst NULL. Die Gast-Policies vergleichen die household_id einer Zeile
-- damit — so landet keine Zeile mit fremder household_id in einer geteilten
-- Liste. Verrät nur, was die Sitzung selbst darf.
CREATE OR REPLACE FUNCTION public.guest_target_household(p_kind text, p_target_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.household_id
  FROM public.guest_grants g
  JOIN public.guest_shares s ON s.share_id = g.share_id
  WHERE g.user_id = auth.uid()
    AND s.target_kind = p_kind
    AND s.target_id = p_target_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.guest_target_household(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guest_target_household(text, uuid) TO authenticated;

-- Zusätzliche Policies (ODER-verknüpft mit denen der Mitglieder): die Liste
-- nur lesen; Einträge und Kategorien lesen und schreiben. Pack- und
-- To-do-Einträge haben keine household_id, dort reicht die Gewährung der Liste.
DO $$
DECLARE
  v_prefix text;
  v_kind   text;
BEGIN
  FOREACH v_prefix IN ARRAY ARRAY['shopping', 'packing', 'todo'] LOOP
    v_kind := v_prefix || '_list';

    EXECUTE format('DROP POLICY IF EXISTS "Guests read their shared list" ON public.%I', v_prefix || '_lists');
    EXECUTE format(
      'CREATE POLICY "Guests read their shared list" ON public.%I FOR SELECT TO authenticated
         USING (household_id = public.guest_target_household(%L, list_id))',
      v_prefix || '_lists', v_kind);

    EXECUTE format('DROP POLICY IF EXISTS "Guests use categories of their shared list" ON public.%I', v_prefix || '_categories');
    EXECUTE format(
      'CREATE POLICY "Guests use categories of their shared list" ON public.%I FOR ALL TO authenticated
         USING (household_id = public.guest_target_household(%L, list_id))
         WITH CHECK (household_id = public.guest_target_household(%L, list_id))',
      v_prefix || '_categories', v_kind, v_kind);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Guests use items of their shared list" ON public.shopping_items;
CREATE POLICY "Guests use items of their shared list" ON public.shopping_items FOR ALL TO authenticated
  USING (household_id = public.guest_target_household('shopping_list', list_id))
  WITH CHECK (household_id = public.guest_target_household('shopping_list', list_id));

DROP POLICY IF EXISTS "Guests use items of their shared list" ON public.packing_items;
CREATE POLICY "Guests use items of their shared list" ON public.packing_items FOR ALL TO authenticated
  USING (public.guest_target_household('packing_list', list_id) IS NOT NULL)
  WITH CHECK (public.guest_target_household('packing_list', list_id) IS NOT NULL);

DROP POLICY IF EXISTS "Guests use items of their shared list" ON public.todo_items;
CREATE POLICY "Guests use items of their shared list" ON public.todo_items FOR ALL TO authenticated
  USING (public.guest_target_household('todo_list', list_id) IS NOT NULL)
  WITH CHECK (public.guest_target_household('todo_list', list_id) IS NOT NULL);

COMMIT;

-- =================================================================
-- RÜCKROLL (von Hand; vorher die Anonymanmeldung im Projekt ausschalten):
--
-- BEGIN;
-- DROP POLICY IF EXISTS "Guests use items of their shared list" ON public.shopping_items;
-- DROP POLICY IF EXISTS "Guests use items of their shared list" ON public.packing_items;
-- DROP POLICY IF EXISTS "Guests use items of their shared list" ON public.todo_items;
-- DROP POLICY IF EXISTS "Guests read their shared list" ON public.shopping_lists;
-- DROP POLICY IF EXISTS "Guests read their shared list" ON public.packing_lists;
-- DROP POLICY IF EXISTS "Guests read their shared list" ON public.todo_lists;
-- DROP POLICY IF EXISTS "Guests use categories of their shared list" ON public.shopping_categories;
-- DROP POLICY IF EXISTS "Guests use categories of their shared list" ON public.packing_categories;
-- DROP POLICY IF EXISTS "Guests use categories of their shared list" ON public.todo_categories;
-- DROP FUNCTION IF EXISTS public.guest_target_household(text, uuid);
-- DROP TRIGGER IF EXISTS trg_drop_guest_share ON public.shopping_lists;
-- DROP TRIGGER IF EXISTS trg_drop_guest_share ON public.packing_lists;
-- DROP TRIGGER IF EXISTS trg_drop_guest_share ON public.todo_lists;
-- DROP FUNCTION IF EXISTS public.drop_guest_share_of_deleted_target();
-- DROP FUNCTION IF EXISTS public.redeem_guest_link(text);
-- DROP FUNCTION IF EXISTS public.end_guest_share(uuid);
-- DROP FUNCTION IF EXISTS public.renew_guest_share(uuid);
-- DROP FUNCTION IF EXISTS public.create_guest_share(text, uuid);
-- DROP FUNCTION IF EXISTS public.new_guest_secret();
-- DROP TABLE IF EXISTS public.guest_grants;
-- DROP TABLE IF EXISTS public.guest_shares;
-- DROP TRIGGER IF EXISTS trg_guard_member_not_anonymous ON public.household_members;
-- DROP FUNCTION IF EXISTS public.guard_member_not_anonymous();
-- -- create_household/join_household: Fassung aus 20261102120000 erneut einspielen.
-- COMMIT;
-- Danach: npx supabase migration repair --status reverted 20261120110040
-- =================================================================
