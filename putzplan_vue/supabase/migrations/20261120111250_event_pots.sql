-- =================================================================
-- EREIGNISTÖPFE: anlegen, Teilnehmer eintragen, abschließen, löschen
-- =================================================================
-- CONTEXT.md § Topf.
--
-- 1. `create_event_pot` — ein Mitglied legt einen Topf für einen Anlass an:
--    Topf und Teilnehmer in einem Zug (beides oder nichts). Mitglieder kommen
--    mit ihrem Anzeigenamen hinein, weitere per Namen. Direkt in `pots`
--    einfügen kann der Client weiterhin nicht.
-- 2. Teilnehmer per Namen nachtragen: nur in offene Ereignistöpfe. In den
--    Haushaltstopf trägt nur die Datenbank Mitglieder ein.
-- 3. Abschließen, wieder öffnen, löschen: nur Ereignistöpfe, nur Mitglieder.
--    Änderbar ist allein `closed_at`. Ein abgeschlossener Topf nimmt keine
--    Teilnehmer, Ausgaben oder Rückzahlungen an und ändert keine (die
--    Policies auf Ausgaben und Rückzahlungen prüfen das schon); löschen lässt
--    er sich trotzdem, samt Inhalt.
--
-- Mitglieder-Policies hängen an `get_user_household_id`: eine anonyme
-- Sitzung ist nie Mitglied, kommt hier also nie durch. Rechte für Gäste
-- kommen als eigene Policies dazu und dürfen nie abschließen.
--
-- Ehemalige Mitglieder bleiben Teilnehmer des Haushaltstopfs (ihre
-- Geschichte hängt daran, ein Wiederkehrer findet seinen Saldo wieder).
-- Neue Ausgaben „gleich auf alle“ tragen sie nicht: welche Teilnehmer des
-- Haushaltstopfs heute Mitglieder sind, entscheidet der Client nach der
-- Mitgliederliste.
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. Anlegen
-- -----------------------------------------------------------------
-- Freier Teilnehmername im Topf: heißt schon jemand so (Groß-/Kleinschreibung
-- egal), bekommt der Name eine Nummer („Kim 2“). Nur für Mitglieder, deren
-- Anzeigenamen niemand im Topf gewählt hat; ein doppelter Name, den jemand
-- eintippt, wird abgewiesen.
CREATE OR REPLACE FUNCTION public.free_pot_participant_name(p_pot_id uuid, p_base text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base text := left(coalesce(nullif(btrim(p_base), ''), 'Mitglied'), 50);
  v_name text := v_base;
  v_n    integer := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.pot_participants WHERE pot_id = p_pot_id AND lower(name) = lower(v_name)) LOOP
    v_n := v_n + 1;
    v_name := left(v_base, 50 - length(v_n::text) - 1) || ' ' || v_n;
  END LOOP;
  RETURN v_name;
END;
$$;
REVOKE ALL ON FUNCTION public.free_pot_participant_name(uuid, text) FROM PUBLIC, anon, authenticated;

-- Die Kennung des Topfs vergibt der Client (optimistische Anzeige). Die
-- Teilnehmer bekommen aufsteigende Anlage-Zeiten in der übergebenen
-- Reihenfolge: erst die Mitglieder, dann die Namen. Nach ihr verteilt die
-- Topf-Rechnung Cent-Reste.
CREATE OR REPLACE FUNCTION public.create_event_pot(
  p_pot_id uuid, p_name text, p_member_ids uuid[], p_guest_names text[]
)
RETURNS public.pots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_household uuid;
  v_pot       public.pots;
  v_member    uuid;
  v_display   text;
  v_guest     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;
  v_household := public.get_user_household_id(v_uid);
  IF v_household IS NULL THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(p_member_ids), 0) + coalesce(cardinality(p_guest_names), 0) = 0 THEN
    RAISE EXCEPTION 'pot_without_participants' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_member_ids) AS m(user_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.user_id = m.user_id AND hm.household_id = v_household
    )
  ) THEN
    RAISE EXCEPTION 'participant_not_member' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pots (pot_id, household_id, name, kind, created_by)
  VALUES (coalesce(p_pot_id, gen_random_uuid()), v_household, btrim(p_name), 'event', v_uid)
  RETURNING * INTO v_pot;

  FOREACH v_member IN ARRAY coalesce(p_member_ids, ARRAY[]::uuid[]) LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.pot_participants WHERE pot_id = v_pot.pot_id AND user_id = v_member
    );
    SELECT display_name INTO v_display FROM public.household_members WHERE user_id = v_member;
    INSERT INTO public.pot_participants (pot_id, household_id, name, user_id, created_at)
    VALUES (v_pot.pot_id, v_household, public.free_pot_participant_name(v_pot.pot_id, v_display),
            v_member, clock_timestamp());
  END LOOP;

  FOREACH v_guest IN ARRAY coalesce(p_guest_names, ARRAY[]::text[]) LOOP
    INSERT INTO public.pot_participants (pot_id, household_id, name, created_at)
    VALUES (v_pot.pot_id, v_household, btrim(v_guest), clock_timestamp());
  END LOOP;

  RETURN v_pot;
END;
$$;
REVOKE ALL ON FUNCTION public.create_event_pot(uuid, text, uuid[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_event_pot(uuid, text, uuid[], text[]) TO authenticated;

-- -----------------------------------------------------------------
-- 2. Teilnehmer nachtragen
-- -----------------------------------------------------------------
-- Ein Mitglied als Teilnehmer nur aus dem eigenen Haushalt; sonst ein Name
-- ohne Konto. Eindeutigkeit des Namens prüft der Index aus der Töpfe-Migration.
DROP POLICY IF EXISTS "Members add participants to open event pots" ON public.pot_participants;
CREATE POLICY "Members add participants to open event pots"
  ON public.pot_participants FOR INSERT TO authenticated
  WITH CHECK (
    household_id = get_user_household_id((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.pots p
      WHERE p.pot_id = pot_participants.pot_id AND p.kind = 'event' AND p.closed_at IS NULL
    )
    AND (
      user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.household_members m
        WHERE m.user_id = pot_participants.user_id AND m.household_id = pot_participants.household_id
      )
    )
  );

-- -----------------------------------------------------------------
-- 3. Abschließen, wieder öffnen, löschen
-- -----------------------------------------------------------------
-- Der Haushaltstopf fällt hier heraus; abschließen verbietet ihm zusätzlich
-- der CHECK `pots_household_never_closed`.
DROP POLICY IF EXISTS "Members close and reopen event pots" ON public.pots;
CREATE POLICY "Members close and reopen event pots"
  ON public.pots FOR UPDATE TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())) AND kind = 'event')
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())) AND kind = 'event');

REVOKE UPDATE ON public.pots FROM authenticated;
GRANT UPDATE (closed_at) ON public.pots TO authenticated;

DROP POLICY IF EXISTS "Members delete event pots" ON public.pots;
CREATE POLICY "Members delete event pots"
  ON public.pots FOR DELETE TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())) AND kind = 'event');

COMMIT;

-- -----------------------------------------------------------------
-- Rückroll (von Hand; angelegte Ereignistöpfe bleiben stehen):
-- -----------------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS "Members delete event pots" ON public.pots;
-- DROP POLICY IF EXISTS "Members close and reopen event pots" ON public.pots;
-- DROP POLICY IF EXISTS "Members add participants to open event pots" ON public.pot_participants;
-- DROP FUNCTION IF EXISTS public.create_event_pot(uuid, text, uuid[], text[]);
-- DROP FUNCTION IF EXISTS public.free_pot_participant_name(uuid, text);
-- COMMIT;
-- npx supabase migration repair --status reverted 20261120111250
