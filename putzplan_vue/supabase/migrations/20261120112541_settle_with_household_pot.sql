-- =================================================================
-- VERRECHNEN MIT DEM HAUSHALTSTOPF
-- =================================================================
-- CONTEXT.md § Ausgleich, § Rückzahlung, § Umrechnung.
--
-- Wer in der Bilanz hinten liegt und im Haushaltstopf Geld gut hat, gleicht
-- Punkte gegen dieses Guthaben aus. Es entstehen zugleich
--   - ein Ausgleich der neuen Art 'pot' (Punkte, gezahlter Betrag in Euro)
--   - eine Rückzahlung im Haushaltstopf (Cent), vom Ausgleichs-Empfänger an
--     den, der ausgleicht: sie senkt dessen Guthaben im Topf.
-- Beides oder nichts: nur die Funktion `settle_with_household_pot` legt
-- beides in einer Transaktion an. Direkt kann der Client weder einen
-- Ausgleich der Art 'pot' noch eine an einen Ausgleich gehängte Rückzahlung
-- anlegen; eine verknüpfte Rückzahlung lässt sich nicht ändern und nicht
-- allein löschen — sie geht mit ihrem Ausgleich.
--
-- Ereignistöpfe werden nie verrechnet: die Funktion nimmt keinen Topf
-- entgegen, sie sucht den Haushaltstopf des Aufrufers selbst.
--
-- Wie viel jemand im Topf gut hat, rechnet die Topf-Rechnung im Client; die
-- Datenbank prüft deshalb nicht, ob Punkte oder Betrag das Guthaben
-- übersteigen. Sie prüft Mitgliedschaft und Zusammenhalt.
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. Neue Art 'pot'; sie trägt wie Geld den gezahlten Betrag
-- -----------------------------------------------------------------
ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_method_check;
ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_method_check
  CHECK (method IN ('activity', 'money', 'surprise', 'other', 'pot'));

ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_paid_euros_only_money;
ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_paid_euros_only_money
  CHECK (paid_euros IS NULL OR method IN ('money', 'pot'));

-- Direkt (am Client) keine Art 'pot': sonst gäbe es den Ausgleich ohne
-- Rückzahlung. Die Funktion unten schreibt als Eigentümer an RLS vorbei.
DROP POLICY IF EXISTS "Users can create settlements in their household" ON public.settlements;
CREATE POLICY "Users can create settlements in their household"
  ON public.settlements FOR INSERT TO authenticated
  WITH CHECK (
    household_id = get_user_household_id((SELECT auth.uid()))
    AND created_by = (SELECT auth.uid())
    AND method <> 'pot'
  );

-- -----------------------------------------------------------------
-- 2. Rückzahlung kennt ihren Ausgleich
-- -----------------------------------------------------------------
ALTER TABLE public.pot_repayments
  ADD COLUMN IF NOT EXISTS settlement_id UUID UNIQUE
    REFERENCES public.settlements(settlement_id) ON DELETE CASCADE;

-- Anlegen: eine Rückzahlung hängt nur an einem Ausgleich der Art 'pot' im
-- selben Haushalt. Solche Ausgleiche legt nur die Funktion unten an, und zwar
-- samt Rückzahlung; UNIQUE lässt keine zweite zu. Der Client darf die Spalte
-- mitschicken (null), etwa wenn Rückgängig eine Zeile unverändert neu anlegt.
-- Ändern und löschen: eine verknüpfte Rückzahlung gar nicht, solange ihr
-- Ausgleich besteht. Beim Kaskaden-Löschen ist er schon weg — dann darf sie
-- gehen. (UPDATE ist ohnehin auf Spalten ohne `settlement_id` beschränkt.)
CREATE OR REPLACE FUNCTION public.guard_settlement_repayment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.settlement_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.settlements s
         WHERE s.settlement_id = NEW.settlement_id
           AND s.method = 'pot' AND s.household_id = NEW.household_id) THEN
      RAISE EXCEPTION 'repayment_settlement_mismatch' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.settlement_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.settlements s WHERE s.settlement_id = OLD.settlement_id) THEN
    RAISE EXCEPTION 'repayment_belongs_to_settlement' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_settlement_repayment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_settlement_repayment ON public.pot_repayments;
CREATE TRIGGER trg_guard_settlement_repayment
  BEFORE INSERT OR UPDATE OR DELETE ON public.pot_repayments
  FOR EACH ROW EXECUTE FUNCTION public.guard_settlement_repayment();

-- -----------------------------------------------------------------
-- 3. Die Funktion: Ausgleich und Rückzahlung in einer Transaktion
-- -----------------------------------------------------------------
-- `p_from_user_id` gleicht Punkte an `p_to_user_id` aus und bekommt dafür
-- `p_amount_cents` im Haushaltstopf zurück. Die Grenzen von Punkten und
-- Betrag prüfen die CHECKs der beiden Tabellen; scheitert einer, rollt die
-- ganze Funktion zurück.
CREATE OR REPLACE FUNCTION public.settle_with_household_pot(
  p_from_user_id uuid,
  p_to_user_id   uuid,
  p_points       integer,
  p_amount_cents integer,
  p_description  text,
  p_settled_at   timestamptz
)
RETURNS public.settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_household  uuid;
  v_pot        uuid;
  v_from_part  uuid;
  v_to_part    uuid;
  v_me_part    uuid;
  v_settlement public.settlements;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'anonymous_not_allowed' USING ERRCODE = '42501';
  END IF;
  v_household := public.get_user_household_id(v_uid);
  IF v_household IS NULL THEN
    RAISE EXCEPTION 'not_household_member' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_members
                 WHERE user_id = p_from_user_id AND household_id = v_household)
     OR NOT EXISTS (SELECT 1 FROM public.household_members
                    WHERE user_id = p_to_user_id AND household_id = v_household) THEN
    RAISE EXCEPTION 'settlement_party_not_in_household' USING ERRCODE = '23514';
  END IF;

  SELECT pot_id INTO v_pot FROM public.pots
  WHERE household_id = v_household AND kind = 'household';
  SELECT participant_id INTO v_from_part FROM public.pot_participants
  WHERE pot_id = v_pot AND user_id = p_from_user_id;
  SELECT participant_id INTO v_to_part FROM public.pot_participants
  WHERE pot_id = v_pot AND user_id = p_to_user_id;
  SELECT participant_id INTO v_me_part FROM public.pot_participants
  WHERE pot_id = v_pot AND user_id = v_uid;
  IF v_from_part IS NULL OR v_to_part IS NULL THEN
    RAISE EXCEPTION 'household_pot_participant_missing' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.settlements
    (household_id, from_user_id, to_user_id, points_settled, method, paid_euros,
     description, settled_at, created_by)
  VALUES
    (v_household, p_from_user_id, p_to_user_id, p_points, 'pot', p_amount_cents / 100.0,
     nullif(btrim(p_description), ''), coalesce(p_settled_at, now()), v_uid)
  RETURNING * INTO v_settlement;

  INSERT INTO public.pot_repayments
    (pot_id, household_id, from_participant_id, to_participant_id, amount_cents, paid_on,
     updated_by_participant_id, settlement_id)
  VALUES
    (v_pot, v_household, v_to_part, v_from_part, p_amount_cents,
     (v_settlement.settled_at AT TIME ZONE 'Europe/Berlin')::date,
     v_me_part, v_settlement.settlement_id);

  RETURN v_settlement;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_with_household_pot(uuid, uuid, integer, integer, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_with_household_pot(uuid, uuid, integer, integer, text, timestamptz)
  TO authenticated;

COMMIT;

-- -----------------------------------------------------------------
-- Rückroll (von Hand; erst alle Ausgleiche der Art 'pot' samt
-- Rückzahlungen löschen):
-- -----------------------------------------------------------------
-- BEGIN;
-- DELETE FROM public.settlements WHERE method = 'pot';
-- DROP FUNCTION IF EXISTS public.settle_with_household_pot(uuid, uuid, integer, integer, text, timestamptz);
-- DROP TRIGGER IF EXISTS trg_guard_settlement_repayment ON public.pot_repayments;
-- DROP FUNCTION IF EXISTS public.guard_settlement_repayment();
-- ALTER TABLE public.pot_repayments DROP COLUMN IF EXISTS settlement_id;
-- DROP POLICY IF EXISTS "Users can create settlements in their household" ON public.settlements;
-- CREATE POLICY "Users can create settlements in their household"
--   ON public.settlements FOR INSERT TO authenticated
--   WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())) AND created_by = (SELECT auth.uid()));
-- ALTER TABLE public.settlements DROP CONSTRAINT settlements_paid_euros_only_money;
-- ALTER TABLE public.settlements ADD CONSTRAINT settlements_paid_euros_only_money
--   CHECK (paid_euros IS NULL OR method = 'money');
-- ALTER TABLE public.settlements DROP CONSTRAINT settlements_method_check;
-- ALTER TABLE public.settlements ADD CONSTRAINT settlements_method_check
--   CHECK (method IN ('activity', 'money', 'surprise', 'other'));
-- COMMIT;
-- npx supabase migration repair --status reverted 20261120112541
