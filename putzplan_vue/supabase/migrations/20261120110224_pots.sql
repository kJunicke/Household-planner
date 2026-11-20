-- =================================================================
-- TÖPFE: Topf, Teilnehmer, Ausgabe, Rückzahlung, Haushaltstopf
-- =================================================================
-- CONTEXT.md § Topf, § Ausgabe, § Aufteilung, § ganze Gruppe, § Rückzahlung.
--
-- 1. `pots` — ein Topf je Anlass oder der Haushaltstopf (`kind`), genau ein
--    Haushaltstopf je Haushalt, der nie abgeschlossen wird.
-- 2. `pot_participants` — Teilnehmer eines Topfs: Name (je Topf eindeutig ohne
--    Groß-/Kleinschreibung), optional das Haushaltsmitglied, `confirmed` für
--    Ausgaben auf die ganze Gruppe.
-- 3. `pot_expenses` — Ausgaben in Cent mit den ROHWERTEN der Aufteilung
--    (`split_kind` + `split_values`), nicht den errechneten Euro: die rechnet
--    die Topf-Rechnung im Client (src/lib/potLedger.ts). Nur so trägt ein
--    später bestätigter Teilnehmer an Ausgaben „ganze Gruppe“ mit.
-- 4. `pot_repayments` — Rückzahlungen in Cent.
-- 5. Haushaltstopf für jeden neuen und bestehenden Haushalt; jedes Mitglied
--    wird Teilnehmer, beim Anlegen, beim Beitritt und hier rückwirkend.
--
-- Jede Zeile trägt `household_id`, RLS prüft den Haushalt wie überall. Ein
-- zusammengesetzter Fremdschlüssel (pot_id, household_id) hält ihn gleich dem
-- des Topfs, (pot_id, *_participant_id) hält Zahler und Rückzahler im selben
-- Topf. Abgeschlossene Töpfe nehmen in RLS keine Schreibzugriffe an.
--
-- `split_values` ist ein JSON-Objekt Teilnehmer-Kennung → Rohwert:
--   equal        gewählte Teilnehmer → 1 („gleich auf alle“ wählt alle)
--   whole_group  {} (wer trägt, ergibt sich aus den bestätigten Teilnehmern)
--   ratio        Teilnehmer → Gewicht
--   percent      Teilnehmer → Prozent
--   exact        Teilnehmer → Cent
-- =================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. Topf
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pots (
  pot_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(household_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  closed_at    TIMESTAMPTZ,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pots_name_len CHECK (length(name) BETWEEN 1 AND 100),
  CONSTRAINT pots_kind_check CHECK (kind IN ('household', 'event')),
  CONSTRAINT pots_household_never_closed CHECK (kind <> 'household' OR closed_at IS NULL),
  -- Ziel der zusammengesetzten Fremdschlüssel unten.
  CONSTRAINT pots_pot_household_key UNIQUE (pot_id, household_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pots_one_household_pot
  ON public.pots (household_id) WHERE kind = 'household';

-- -----------------------------------------------------------------
-- 2. Teilnehmer
-- -----------------------------------------------------------------
-- `confirmed`: zählt der Teilnehmer bei Ausgaben „ganze Gruppe“ mit? Wer
-- später beitritt, kommt unbestätigt hinein, bis ein Haushaltsmitglied
-- bestätigt. Mitglieder im Haushaltstopf sind bestätigt.
-- `user_id` bleibt nach dem Austritt stehen: die Geschichte des Topfs hängt
-- am Teilnehmer, nicht an der Mitgliedschaft.
CREATE TABLE IF NOT EXISTS public.pot_participants (
  participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id         UUID NOT NULL,
  household_id   UUID NOT NULL,
  name           TEXT NOT NULL,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pot_participants_name_len CHECK (length(name) BETWEEN 1 AND 50),
  CONSTRAINT pot_participants_pot_fkey FOREIGN KEY (pot_id, household_id)
    REFERENCES public.pots (pot_id, household_id) ON DELETE CASCADE,
  CONSTRAINT pot_participants_pot_participant_key UNIQUE (pot_id, participant_id),
  CONSTRAINT pot_participants_pot_user_key UNIQUE (pot_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pot_participants_name_key
  ON public.pot_participants (pot_id, lower(name));

-- -----------------------------------------------------------------
-- 3. Ausgabe
-- -----------------------------------------------------------------
-- Betrag bis 999.999,99 €. `updated_by_participant_id` ist ein Teilnehmer,
-- kein Konto: auch Gäste ändern Einträge (CONTEXT.md § Gast).
CREATE TABLE IF NOT EXISTS public.pot_expenses (
  expense_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id                    UUID NOT NULL,
  household_id              UUID NOT NULL,
  payer_participant_id      UUID NOT NULL,
  amount_cents              INTEGER NOT NULL,
  spent_on                  DATE NOT NULL DEFAULT CURRENT_DATE,
  description               TEXT NOT NULL,
  split_kind                TEXT NOT NULL,
  split_values              JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_participant_id UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pot_expenses_amount_range CHECK (amount_cents BETWEEN 1 AND 99999999),
  CONSTRAINT pot_expenses_description_len CHECK (length(description) BETWEEN 1 AND 200),
  CONSTRAINT pot_expenses_split_kind_check
    CHECK (split_kind IN ('equal', 'whole_group', 'ratio', 'percent', 'exact')),
  CONSTRAINT pot_expenses_split_values_object CHECK (jsonb_typeof(split_values) = 'object'),
  CONSTRAINT pot_expenses_pot_fkey FOREIGN KEY (pot_id, household_id)
    REFERENCES public.pots (pot_id, household_id) ON DELETE CASCADE,
  CONSTRAINT pot_expenses_payer_fkey FOREIGN KEY (pot_id, payer_participant_id)
    REFERENCES public.pot_participants (pot_id, participant_id),
  CONSTRAINT pot_expenses_updated_by_fkey FOREIGN KEY (pot_id, updated_by_participant_id)
    REFERENCES public.pot_participants (pot_id, participant_id) ON DELETE SET NULL (updated_by_participant_id)
);

CREATE INDEX IF NOT EXISTS pot_expenses_pot_idx ON public.pot_expenses (pot_id);

-- -----------------------------------------------------------------
-- 4. Rückzahlung
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pot_repayments (
  repayment_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id                    UUID NOT NULL,
  household_id              UUID NOT NULL,
  from_participant_id       UUID NOT NULL,
  to_participant_id         UUID NOT NULL,
  amount_cents              INTEGER NOT NULL,
  paid_on                   DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_by_participant_id UUID,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pot_repayments_amount_range CHECK (amount_cents BETWEEN 1 AND 99999999),
  CONSTRAINT pot_repayments_different_participants CHECK (from_participant_id <> to_participant_id),
  CONSTRAINT pot_repayments_pot_fkey FOREIGN KEY (pot_id, household_id)
    REFERENCES public.pots (pot_id, household_id) ON DELETE CASCADE,
  CONSTRAINT pot_repayments_from_fkey FOREIGN KEY (pot_id, from_participant_id)
    REFERENCES public.pot_participants (pot_id, participant_id),
  CONSTRAINT pot_repayments_to_fkey FOREIGN KEY (pot_id, to_participant_id)
    REFERENCES public.pot_participants (pot_id, participant_id),
  CONSTRAINT pot_repayments_updated_by_fkey FOREIGN KEY (pot_id, updated_by_participant_id)
    REFERENCES public.pot_participants (pot_id, participant_id) ON DELETE SET NULL (updated_by_participant_id)
);

CREATE INDEX IF NOT EXISTS pot_repayments_pot_idx ON public.pot_repayments (pot_id);

-- `updated_at` setzt die Datenbank, nicht der Client.
CREATE OR REPLACE FUNCTION public.touch_pot_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_pot_entry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_pot_expense ON public.pot_expenses;
CREATE TRIGGER trg_touch_pot_expense
  BEFORE UPDATE ON public.pot_expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_pot_entry();

DROP TRIGGER IF EXISTS trg_touch_pot_repayment ON public.pot_repayments;
CREATE TRIGGER trg_touch_pot_repayment
  BEFORE UPDATE ON public.pot_repayments
  FOR EACH ROW EXECUTE FUNCTION public.touch_pot_entry();

-- -----------------------------------------------------------------
-- RLS: Mitglieder lesen alles im eigenen Haushalt. Töpfe und Teilnehmer
-- legt hier nur die Datenbank an (Haushaltstopf); Ausgaben und
-- Rückzahlungen darf jedes Mitglied anlegen, ändern und löschen, auch
-- fremde (CONTEXT.md § Topf) — solange der Topf offen ist.
-- -----------------------------------------------------------------
ALTER TABLE public.pots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pot_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pot_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pot_repayments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their household pots" ON public.pots;
CREATE POLICY "Members read their household pots"
  ON public.pots FOR SELECT TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Members read their household pot participants" ON public.pot_participants;
CREATE POLICY "Members read their household pot participants"
  ON public.pot_participants FOR SELECT TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Members read their household pot expenses" ON public.pot_expenses;
CREATE POLICY "Members read their household pot expenses"
  ON public.pot_expenses FOR SELECT TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Members add expenses to open pots" ON public.pot_expenses;
CREATE POLICY "Members add expenses to open pots"
  ON public.pot_expenses FOR INSERT TO authenticated
  WITH CHECK (
    household_id = get_user_household_id((SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.pots p WHERE p.pot_id = pot_expenses.pot_id AND p.closed_at IS NULL)
  );

DROP POLICY IF EXISTS "Members update expenses in open pots" ON public.pot_expenses;
CREATE POLICY "Members update expenses in open pots"
  ON public.pot_expenses FOR UPDATE TO authenticated
  USING (
    household_id = get_user_household_id((SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.pots p WHERE p.pot_id = pot_expenses.pot_id AND p.closed_at IS NULL)
  )
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Members delete expenses in open pots" ON public.pot_expenses;
CREATE POLICY "Members delete expenses in open pots"
  ON public.pot_expenses FOR DELETE TO authenticated
  USING (
    household_id = get_user_household_id((SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.pots p WHERE p.pot_id = pot_expenses.pot_id AND p.closed_at IS NULL)
  );

DROP POLICY IF EXISTS "Members read their household pot repayments" ON public.pot_repayments;
CREATE POLICY "Members read their household pot repayments"
  ON public.pot_repayments FOR SELECT TO authenticated
  USING (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Members add repayments to open pots" ON public.pot_repayments;
CREATE POLICY "Members add repayments to open pots"
  ON public.pot_repayments FOR INSERT TO authenticated
  WITH CHECK (
    household_id = get_user_household_id((SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.pots p WHERE p.pot_id = pot_repayments.pot_id AND p.closed_at IS NULL)
  );

DROP POLICY IF EXISTS "Members update repayments in open pots" ON public.pot_repayments;
CREATE POLICY "Members update repayments in open pots"
  ON public.pot_repayments FOR UPDATE TO authenticated
  USING (
    household_id = get_user_household_id((SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.pots p WHERE p.pot_id = pot_repayments.pot_id AND p.closed_at IS NULL)
  )
  WITH CHECK (household_id = get_user_household_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Members delete repayments in open pots" ON public.pot_repayments;
CREATE POLICY "Members delete repayments in open pots"
  ON public.pot_repayments FOR DELETE TO authenticated
  USING (
    household_id = get_user_household_id((SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.pots p WHERE p.pot_id = pot_repayments.pot_id AND p.closed_at IS NULL)
  );

-- Topf, Haushalt und Anlage-Zeit eines Eintrags ändert niemand: ein Eintrag
-- wandert nicht in einen anderen Topf.
REVOKE UPDATE ON public.pot_expenses FROM authenticated;
GRANT UPDATE (payer_participant_id, amount_cents, spent_on, description, split_kind, split_values,
              updated_by_participant_id)
  ON public.pot_expenses TO authenticated;
REVOKE UPDATE ON public.pot_repayments FROM authenticated;
GRANT UPDATE (from_participant_id, to_participant_id, amount_cents, paid_on, updated_by_participant_id)
  ON public.pot_repayments TO authenticated;

-- anon braucht keine der Tabellen (Gäste sind angemeldete anonyme Sitzungen).
REVOKE ALL ON public.pots, public.pot_participants, public.pot_expenses, public.pot_repayments FROM anon;

-- Realtime: Einträge des Partners kommen ohne Neuladen an. DELETE-Ereignisse
-- tragen sonst nur den PK, und der `household_id`-Filter verwürfe sie.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pots', 'pot_participants', 'pot_expenses', 'pot_repayments'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------
-- 5. Haushaltstopf
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_household_pot(p_household_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.pots (household_id, name, kind)
  VALUES (p_household_id, 'Haushaltstopf', 'household')
  ON CONFLICT (household_id) WHERE kind = 'household' DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.ensure_household_pot(uuid) FROM PUBLIC, anon, authenticated;

-- Mitglied als Teilnehmer in den Haushaltstopf. Heißt schon jemand so
-- (Groß-/Kleinschreibung egal), bekommt der Name eine Nummer („Kim 2“),
-- statt den Beitritt scheitern zu lassen. Wer schon Teilnehmer ist (Austritt
-- und Wiederkehr), bleibt es mit seiner Geschichte.
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

-- Neue Haushalte und Mitglieder: per Trigger, damit jeder Weg (heute die
-- RPCs `create_household` und `join_household`) sie mitnimmt.
CREATE OR REPLACE FUNCTION public.create_household_pot_for_new_household()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.ensure_household_pot(NEW.household_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_household_pot_for_new_household() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_create_household_pot ON public.households;
CREATE TRIGGER trg_create_household_pot
  AFTER INSERT ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.create_household_pot_for_new_household();

CREATE OR REPLACE FUNCTION public.add_new_member_to_household_pot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.ensure_household_pot(NEW.household_id);
  PERFORM public.add_member_to_household_pot(NEW.user_id, NEW.household_id, NEW.display_name, now());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.add_new_member_to_household_pot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_add_member_to_household_pot ON public.household_members;
CREATE TRIGGER trg_add_member_to_household_pot
  AFTER INSERT ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.add_new_member_to_household_pot();

-- Bestehende Haushalte und Mitglieder, in Beitrittsreihenfolge: sie ist die
-- feste Reihenfolge der Teilnehmer, nach der Cent-Reste verteilt werden.
SELECT public.ensure_household_pot(household_id) FROM public.households;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT user_id, household_id, display_name, joined_at
    FROM public.household_members
    ORDER BY joined_at NULLS LAST, user_id
  LOOP
    PERFORM public.add_member_to_household_pot(r.user_id, r.household_id, r.display_name, r.joined_at);
  END LOOP;
END $$;

COMMIT;

-- -----------------------------------------------------------------
-- Rückroll (von Hand; löscht alle Töpfe samt Ausgaben):
-- -----------------------------------------------------------------
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_add_member_to_household_pot ON public.household_members;
-- DROP TRIGGER IF EXISTS trg_create_household_pot ON public.households;
-- DROP FUNCTION IF EXISTS public.add_new_member_to_household_pot();
-- DROP FUNCTION IF EXISTS public.create_household_pot_for_new_household();
-- DROP FUNCTION IF EXISTS public.add_member_to_household_pot(uuid, uuid, text, timestamptz);
-- DROP FUNCTION IF EXISTS public.ensure_household_pot(uuid);
-- DROP TABLE IF EXISTS public.pot_repayments, public.pot_expenses, public.pot_participants, public.pots;
-- DROP FUNCTION IF EXISTS public.touch_pot_entry();
-- COMMIT;
-- npx supabase migration repair --status reverted 20261120110224
