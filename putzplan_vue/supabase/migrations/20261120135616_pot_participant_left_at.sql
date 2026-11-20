-- =================================================================
-- TÖPFE: Austritt aus dem Haushalt im Haushaltstopf vermerken
-- =================================================================
-- CONTEXT.md § Topf, § ganze Gruppe.
--
-- Wer den Haushalt verlässt, bleibt Teilnehmer des Haushaltstopfs (seine
-- Geschichte und sein Saldo hängen daran), trägt aber nichts Neues mehr.
-- Für Ausgaben „ganze Gruppe“ muss die Topf-Rechnung (src/lib/potLedger.ts,
-- `wholeGroupCarriers`) dafür wissen, WANN er gegangen ist: was vorher
-- angelegt wurde, trägt er weiter, was danach kam, nicht. Ohne den
-- Zeitpunkt fiel er aus allen früheren Ausgaben heraus, und sein Anteil
-- wanderte still auf die anderen.
--
-- 1. `pot_participants.left_at`: Zeitpunkt des Austritts, nur im
--    Haushaltstopf. Töpfe für einen Anlass kennen keinen Austritt.
-- 2. Gesetzt beim Löschen der Mitgliedschaft (Austritt, auch per Kaskade
--    beim Löschen des Kontos) und, falls die Kaskade das Konto zuerst vom
--    Teilnehmer löst, beim Leeren von `user_id`.
-- 3. Geleert bei der Rückkehr in denselben Haushalt
--    (`add_member_to_household_pot`). Ausgaben „ganze Gruppe“ aus der
--    Zwischenzeit trägt der Rückkehrer dann mit — ein Zeitraum je Teilnehmer
--    reicht für die Rechnung, mehrere Austritte merkt sie sich nicht.
-- 4. Neue Teilnehmer beginnen ohne Austritt, egal was der Client schickt.
-- 5. Bestehende Ehemalige (Teilnehmer ohne Mitgliedschaft im Haushalt):
--    Austritt jetzt, der echte Zeitpunkt ist nicht bekannt.
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. Spalte
-- -----------------------------------------------------------------
ALTER TABLE public.pot_participants
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- -----------------------------------------------------------------
-- 2. Austritt vermerken
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_household_pot_departure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.pot_participants pp
  SET left_at = now()
  FROM public.pots p
  WHERE p.pot_id = pp.pot_id
    AND p.kind = 'household'
    AND p.household_id = OLD.household_id
    AND pp.user_id = OLD.user_id
    AND pp.left_at IS NULL;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_household_pot_departure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mark_household_pot_departure ON public.household_members;
CREATE TRIGGER trg_mark_household_pot_departure
  AFTER DELETE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.mark_household_pot_departure();

-- Konto gelöscht: Postgres löst `user_id` am Teilnehmer und die
-- Mitgliedschaft in beliebiger Reihenfolge. Läuft das Lösen zuerst, findet
-- der Trigger oben den Teilnehmer nicht mehr; dann vermerkt es dieser.
CREATE OR REPLACE FUNCTION public.mark_household_pot_departure_on_unlink()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.user_id IS NOT NULL AND NEW.user_id IS NULL AND NEW.left_at IS NULL
     AND EXISTS (SELECT 1 FROM public.pots WHERE pot_id = NEW.pot_id AND kind = 'household') THEN
    NEW.left_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_household_pot_departure_on_unlink() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mark_household_pot_departure_on_unlink ON public.pot_participants;
CREATE TRIGGER trg_mark_household_pot_departure_on_unlink
  BEFORE UPDATE OF user_id ON public.pot_participants
  FOR EACH ROW EXECUTE FUNCTION public.mark_household_pot_departure_on_unlink();

-- -----------------------------------------------------------------
-- 3. Rückkehr leert den Austritt (sonst wie 20261120110224)
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_member_to_household_pot(
  p_user_id uuid, p_household_id uuid, p_display_name text, p_since timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pot  uuid;
  v_base text := left(coalesce(nullif(btrim(p_display_name), ''), 'Mitglied'), 50);
  v_name text := v_base;
  v_n    integer := 1;
BEGIN
  SELECT pot_id INTO v_pot FROM public.pots WHERE household_id = p_household_id AND kind = 'household';
  IF v_pot IS NULL THEN
    RAISE EXCEPTION 'household_pot_missing' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pot_participants WHERE pot_id = v_pot AND user_id = p_user_id) THEN
    UPDATE public.pot_participants SET left_at = NULL
    WHERE pot_id = v_pot AND user_id = p_user_id AND left_at IS NOT NULL;
    RETURN;
  END IF;
  WHILE EXISTS (SELECT 1 FROM public.pot_participants WHERE pot_id = v_pot AND lower(name) = lower(v_name)) LOOP
    v_n := v_n + 1;
    v_name := left(v_base, 50 - length(v_n::text) - 1) || ' ' || v_n;
  END LOOP;
  INSERT INTO public.pot_participants (pot_id, household_id, name, user_id, created_at)
  VALUES (v_pot, p_household_id, v_name, p_user_id, coalesce(p_since, now()));
END;
$$;
REVOKE ALL ON FUNCTION public.add_member_to_household_pot(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------
-- 4. Neue Teilnehmer beginnen offen und ohne Austritt
--    (sonst wie 20261120114704)
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.new_pot_participant_undecided()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.confirmed := false;
  NEW.rejected := false;
  NEW.left_at := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.new_pot_participant_undecided() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------
-- 5. Bestehende Ehemalige
-- -----------------------------------------------------------------
UPDATE public.pot_participants pp
SET left_at = now()
FROM public.pots p
WHERE p.pot_id = pp.pot_id
  AND p.kind = 'household'
  AND pp.left_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.user_id = pp.user_id AND m.household_id = p.household_id
  );

COMMIT;

-- -----------------------------------------------------------------
-- Rückroll (von Hand):
-- -----------------------------------------------------------------
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_mark_household_pot_departure ON public.household_members;
-- DROP TRIGGER IF EXISTS trg_mark_household_pot_departure_on_unlink ON public.pot_participants;
-- DROP FUNCTION IF EXISTS public.mark_household_pot_departure();
-- DROP FUNCTION IF EXISTS public.mark_household_pot_departure_on_unlink();
-- -- add_member_to_household_pot und new_pot_participant_undecided aus
-- -- 20261120110224 bzw. 20261120114704 wieder einspielen.
-- ALTER TABLE public.pot_participants DROP COLUMN IF EXISTS left_at;
-- COMMIT;
-- npx supabase migration repair --status reverted 20261120135616
