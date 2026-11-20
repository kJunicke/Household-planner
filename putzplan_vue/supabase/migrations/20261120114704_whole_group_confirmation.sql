-- =================================================================
-- TÖPFE: Ganze Gruppe mit Bestätigung
-- =================================================================
-- CONTEXT.md § ganze Gruppe, § Topf, § Gast.
--
-- Eine Ausgabe „ganze Gruppe“ trägt, wer beim Anlegen der Ausgabe schon
-- Teilnehmer war. Wer später beitritt (Gast über „Ich bin neu“ oder von einem
-- Mitglied nachgetragen), trägt die früheren Ausgaben „ganze Gruppe“ erst,
-- wenn ein Haushaltsmitglied seine Aufnahme bestätigt; bis dahin bleiben die
-- Salden, wie sie sind. Ausgaben „ganze Gruppe“, die nach seinem Beitritt
-- angelegt werden, trägt er sofort — er gehört dann ja zur Gruppe. Gerechnet
-- wird in der Topf-Rechnung (src/lib/potLedger.ts, `wholeGroupCarriers`).
--
-- 1. `pot_participants.rejected`: die Ablehnung bleibt gespeichert, damit die
--    Meldung nicht wiederkommt. `confirmed` und `rejected` schließen sich aus;
--    beide falsch heißt: noch offen.
-- 2. Jeder neue Teilnehmer beginnt offen, auf jedem Weg (`join_pot_as_guest`,
--    Nachtragen durch ein Mitglied, `create_event_pot`, Haushaltstopf). Für
--    die Gründer eines Topfs ist das ohne Wirkung: vor ihnen gibt es keine
--    Ausgaben, die sie bestätigen müssten.
-- 3. `decide_whole_group_join`: bestätigen oder ablehnen, nur Haushalts-
--    mitglieder, nie Gäste (ADR-0006: ohne Anmeldung könnte jeder jeder
--    sein), nur im offenen Topf, einmal und endgültig. Direkt ändern lässt
--    sich `pot_participants` von niemandem (keine UPDATE-Policy).
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. Ablehnung speichern
-- -----------------------------------------------------------------
ALTER TABLE public.pot_participants
  ADD COLUMN IF NOT EXISTS rejected BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.pot_participants DROP CONSTRAINT IF EXISTS pot_participants_one_decision;
ALTER TABLE public.pot_participants
  ADD CONSTRAINT pot_participants_one_decision CHECK (NOT (confirmed AND rejected));

-- -----------------------------------------------------------------
-- 2. Neue Teilnehmer beginnen offen
-- -----------------------------------------------------------------
ALTER TABLE public.pot_participants ALTER COLUMN confirmed SET DEFAULT FALSE;

-- Auch wer beim Nachtragen `confirmed = true` mitschickt, beginnt offen:
-- bestätigt wird nur über `decide_whole_group_join`.
CREATE OR REPLACE FUNCTION public.new_pot_participant_undecided()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.confirmed := false;
  NEW.rejected := false;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.new_pot_participant_undecided() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_new_pot_participant_undecided ON public.pot_participants;
CREATE TRIGGER trg_new_pot_participant_undecided
  BEFORE INSERT ON public.pot_participants
  FOR EACH ROW EXECUTE FUNCTION public.new_pot_participant_undecided();

-- -----------------------------------------------------------------
-- 3. Bestätigen oder ablehnen
-- -----------------------------------------------------------------
-- Dieselbe Entscheidung ein zweites Mal (zweites Gerät, Doppeltipp) gibt den
-- Teilnehmer unverändert zurück; die andere scheitert mit `already_decided`.
--
-- Fehler: not_authenticated · anonymous_not_allowed · not_a_member (42501) ·
-- participant_not_found · pot_closed · already_decided (P0001).
CREATE OR REPLACE FUNCTION public.decide_whole_group_join(p_participant_id uuid, p_confirm boolean)
RETURNS public.pot_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_household   uuid;
  v_participant public.pot_participants;
  v_closed_at   timestamptz;
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

  SELECT * INTO v_participant FROM public.pot_participants
  WHERE participant_id = p_participant_id AND household_id = v_household
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found' USING ERRCODE = 'P0001';
  END IF;
  SELECT closed_at INTO v_closed_at FROM public.pots WHERE pot_id = v_participant.pot_id;
  IF v_closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'pot_closed' USING ERRCODE = 'P0001';
  END IF;

  IF v_participant.confirmed OR v_participant.rejected THEN
    IF v_participant.confirmed = coalesce(p_confirm, false) THEN
      RETURN v_participant;
    END IF;
    RAISE EXCEPTION 'already_decided' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.pot_participants
  SET confirmed = coalesce(p_confirm, false), rejected = NOT coalesce(p_confirm, false)
  WHERE participant_id = p_participant_id
  RETURNING * INTO v_participant;
  RETURN v_participant;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_whole_group_join(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_whole_group_join(uuid, boolean) TO authenticated;

COMMIT;

-- =================================================================
-- RÜCKROLL (von Hand; Ablehnungen gehen verloren):
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.decide_whole_group_join(uuid, boolean);
-- DROP TRIGGER IF EXISTS trg_new_pot_participant_undecided ON public.pot_participants;
-- DROP FUNCTION IF EXISTS public.new_pot_participant_undecided();
-- ALTER TABLE public.pot_participants ALTER COLUMN confirmed SET DEFAULT TRUE;
-- ALTER TABLE public.pot_participants DROP CONSTRAINT IF EXISTS pot_participants_one_decision;
-- ALTER TABLE public.pot_participants DROP COLUMN IF EXISTS rejected;
-- COMMIT;
-- npx supabase migration repair --status reverted 20261120114704
-- =================================================================
