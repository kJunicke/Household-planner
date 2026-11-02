-- =================================================================
-- SECURITY STUFE 1 (additiv) — RPCs für Anlegen/Beitreten, Grants,
-- Längenlimits, Typwechsel-Sperre
-- =================================================================
-- Erste von drei Stufen; wird VOR dem Frontend-Deploy angewandt. So geschnitten,
-- dass das Frontend von VOR der Umstellung weiter funktioniert: sie legt nur
-- an und entzieht nur Rechte, die kein Client braucht. Die schließenden
-- Policies kommen in 20261102120100 — erst NACH dem Frontend-Deploy.
--
-- Idempotent: jede Anweisung darf zweimal laufen.
-- Rückroll-SQL: am Dateiende als Kommentar.
--
-- Prod-Stand vorher (02.11.2026, lesend erhoben): UNIQUE auf invite_code
-- existiert in Prod schon (nicht im Repo-Endstand), 0 Duplikate, 0 Zeilen
-- über den neuen Längenlimits, 0 deduct-Kinder unter Projekten.
-- =================================================================

SET search_path = public, pg_temp;

-- -----------------------------------------------------------------
-- 1. invite_code eindeutig
-- -----------------------------------------------------------------
-- Ohne UNIQUE legt ein Angreifer einen Haushalt mit fremdem Code an, und der
-- Beitritt per Code trifft zwei Zeilen. In Prod existiert der Constraint
-- bereits (Drift), im Repo nicht — deshalb nur anlegen, wenn er fehlt.
-- Bei Duplikaten bricht die Migration bewusst ab: ein mehrdeutiger Code darf
-- nicht still bestehen bleiben.
DO $$
DECLARE
  v_dups integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.households'::regclass
      AND i.indisunique
      AND i.indnatts = 1
      AND i.indkey[0] = (
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = 'public.households'::regclass AND a.attname = 'invite_code'
      )
  ) THEN
    SELECT count(*) INTO v_dups
    FROM (SELECT invite_code FROM public.households GROUP BY invite_code HAVING count(*) > 1) d;
    IF v_dups > 0 THEN
      RAISE EXCEPTION 'households.invite_code: % doppelte Codes — vor dieser Migration bereinigen', v_dups;
    END IF;
    ALTER TABLE public.households ADD CONSTRAINT households_invite_code_key UNIQUE (invite_code);
  END IF;
END $$;

-- -----------------------------------------------------------------
-- 2. RPC create_household
-- -----------------------------------------------------------------
-- Legt Haushalt und eigene Mitgliedschaft in EINER Transaktion an. Nötig,
-- weil nach Stufe 2 weder households noch household_members ein Client-INSERT
-- erlauben und `insert().select()` das RETURNING unter der Mitglieder-SELECT-
-- Policy nicht mehr sähe.
--
-- Fehler als feste, maschinenlesbare Meldungen (Frontend vergleicht darauf):
--   not_authenticated · invalid_household_name · already_in_household
-- SQLSTATE: fachliche Fehler P0001 bzw. 22023 (PostgREST → HTTP 400),
-- not_authenticated 42501. Nicht P0002: das wäre HTTP 500.
--
-- Farbe des Gründers: erste Palettenfarbe, gespiegelt aus
-- src/lib/memberColors.ts (MEMBER_COLORS[0]).
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
  IF length(v_name) < 1 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'invalid_household_name' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'already_in_household' USING ERRCODE = 'P0001';
  END IF;

  -- Der Code kommt aus dem Spalten-Default (8 Hex-Zeichen). Bei einer
  -- Kollision mit UNIQUE neu würfeln statt dem Nutzer einen Fehler zu zeigen.
  FOR v_try IN 1..5 LOOP
    BEGIN
      INSERT INTO public.households (name) VALUES (v_name) RETURNING * INTO v_house;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try = 5 THEN RAISE; END IF;
    END;
  END LOOP;

  -- PK auf user_id fängt den gleichzeitigen Doppelaufruf ab: der zweite
  -- scheitert hier, seine ganze Transaktion (samt Haushalt) rollt zurück.
  INSERT INTO public.household_members (user_id, household_id, display_name, user_color)
  VALUES (v_uid, v_house.household_id, v_display, '#4A90E2');

  RETURN v_house;
END;
$$;

-- -----------------------------------------------------------------
-- 3. RPC join_household
-- -----------------------------------------------------------------
-- Einziger Weg in einen fremden Haushalt: prüft den Code serverseitig.
-- Ein falscher Code verrät nichts über andere Haushalte.
--
-- Fehler: not_authenticated · already_in_household · invalid_invite_code
-- (die beiden fachlichen als P0001 → HTTP 400, wie bei create_household).
--
-- Farbe: erste Palettenfarbe, die im Haushalt noch frei ist; sind alle
-- vergeben, zyklisch nach Anzahl der belegten Farben. Palette gespiegelt aus
-- MEMBER_COLORS in src/lib/memberColors.ts (gleiche Reihenfolge) — wer sie
-- dort ändert, ändert sie hier per neuer Migration. Die Regel ist die des
-- bisherigen Client-Helfers pickMemberColor(), der damit entfällt (der Client
-- konnte die belegten Farben vor dem Beitritt gar nicht lesen; RLS lieferte
-- 0 Zeilen, es kam immer die erste Farbe heraus).
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
  IF EXISTS (SELECT 1 FROM public.household_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'already_in_household' USING ERRCODE = 'P0001';
  END IF;

  -- FOR UPDATE: zwei gleichzeitige Beitritte wählen ihre Farbe nacheinander.
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

-- Supabase vergibt EXECUTE auf neue Funktionen per Default-Privileges an
-- anon und authenticated, Postgres zusätzlich an PUBLIC. Nur angemeldete
-- Nutzer dürfen diese beiden aufrufen.
REVOKE ALL ON FUNCTION public.create_household(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_household(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_household(text, text) TO authenticated;

-- -----------------------------------------------------------------
-- 4. SECURITY-DEFINER-Funktionen nicht mehr per /rpc erreichbar
-- -----------------------------------------------------------------
-- Der Cron-Job läuft als postgres (Eigentümer) und braucht kein GRANT.
REVOKE EXECUTE ON FUNCTION public.reset_recurring_tasks() FROM PUBLIC, anon, authenticated;

-- get_user_household_id: wird in 43 Policies aufgerufen, dort IMMER mit
-- (SELECT auth.uid()). Der Wächter `user_uuid = auth.uid()` schließt das
-- Orakel „Haushalt zu beliebiger User-ID“, ohne eine Policy zu ändern.
-- STABLE statt VOLATILE: liest nur, darf innerhalb einer Abfrage gecacht
-- werden. authenticated braucht EXECUTE weiter (Policies laufen mit der
-- Rolle des Aufrufers), anon nicht.
CREATE OR REPLACE FUNCTION public.get_user_household_id(user_uuid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT household_id
  FROM household_members
  WHERE user_id = user_uuid
    AND user_uuid = auth.uid()
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_household_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_household_id(uuid) TO authenticated;

-- Dazu: fester search_path am INVOKER-Trigger, und der
-- notes-Trigger braucht keine Definer-Rechte (setzt nur NEW.updated_at).
ALTER FUNCTION public.remove_priority_on_purchase() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_notes_updated_at() SECURITY INVOKER;

-- -----------------------------------------------------------------
-- 5. Längenlimits
-- -----------------------------------------------------------------
-- NOT VALID: gilt sofort für neue und geänderte Zeilen, Bestandsdaten
-- brechen die Migration nicht. Danach VALIDATE; schlägt das fehl, bleibt der
-- Constraint NOT VALID stehen (NOTICE) — in Prod waren es 0 Verstöße.
-- Die Frontend-Grenzen (maxlength, src/lib/limits.ts) sind dieselben Zahlen.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('tasks',             'tasks_title_len',            'CHECK (length(title) BETWEEN 1 AND 200)'),
      ('notes',             'notes_content_len',          'CHECK (length(content) <= 10000)'),
      ('task_completions',  'task_completions_note_len',  'CHECK (completion_note IS NULL OR length(completion_note) <= 1000)'),
      ('shopping_items',    'shopping_items_name_len',    'CHECK (length(name) BETWEEN 1 AND 200)'),
      ('households',        'households_name_len',        'CHECK (length(name) BETWEEN 1 AND 100)'),
      ('household_members', 'household_members_display_name_len', 'CHECK (length(display_name) BETWEEN 1 AND 50)')
    ) AS t(tbl, con, def)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = r.con AND conrelid = format('public.%I', r.tbl)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s NOT VALID', r.tbl, r.con, r.def);
    END IF;
    BEGIN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', r.tbl, r.con);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE '%.%: Bestandsdaten verletzen das Limit, Constraint bleibt NOT VALID', r.tbl, r.con;
    END;
  END LOOP;
END $$;

-- -----------------------------------------------------------------
-- 6. Typwechsel und Punktemodus in der DB absichern
-- -----------------------------------------------------------------
-- (a) `project` ist kein Wechselziel und keine Wechselquelle — die UI sperrt
--     das schon (TaskEditModal), jetzt auch die DB. Ein umgestelltes Projekt
--     hätte keine „Am Projekt arbeiten“-Unteraufgabe.
-- (b) Kein `deduct`-Kind unter einem Projekt (Projekte kennen nur checklist
--     und bonus). Geprüft nur, wenn Modus oder Elternteil sich wirklich
--     ändern — Bestandszeilen bleiben bearbeitbar.
-- Bewusst NICHT: deduct unter `daily`. In Prod gibt es davon 6 (3 nicht
-- gelöscht), sie entstehen legitim durch den Typwechsel wiederkehrend →
-- täglich. Ob das verboten werden soll, ist eine Fachfrage (Maintainer).
-- INVOKER: der Elternteil liegt im selben Haushalt und ist per RLS sichtbar.
CREATE OR REPLACE FUNCTION public.guard_task_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.task_type IS DISTINCT FROM OLD.task_type
     AND (OLD.task_type = 'project' OR NEW.task_type = 'project') THEN
    RAISE EXCEPTION 'task_type_project_not_switchable'
      USING ERRCODE = '23514',
            DETAIL = 'Ein Projekt kann nicht in einen anderen Typ umgestellt werden und umgekehrt.';
  END IF;

  IF NEW.parent_task_id IS NOT NULL
     AND NEW.subtask_points_mode = 'deduct'
     AND (TG_OP = 'INSERT'
          OR NEW.subtask_points_mode IS DISTINCT FROM OLD.subtask_points_mode
          OR NEW.parent_task_id IS DISTINCT FROM OLD.parent_task_id)
     AND EXISTS (
       SELECT 1 FROM public.tasks p
       WHERE p.task_id = NEW.parent_task_id AND p.task_type = 'project'
     ) THEN
    RAISE EXCEPTION 'deduct_not_allowed_under_project'
      USING ERRCODE = '23514',
            DETAIL = 'Unteraufgaben eines Projekts sind checklist oder bonus.';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_task_type() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_task_type ON public.tasks;
CREATE TRIGGER trg_guard_task_type
  BEFORE INSERT OR UPDATE OF task_type, subtask_points_mode, parent_task_id
  ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_task_type();

-- Fehlende Indizes: bewusst nicht. Prod hat 4 Haushalte, die fehlenden Indizes
-- sind dort nicht messbar. Kommt mit dem Umbau auf current_household_id().

-- =================================================================
-- RÜCKROLL (manuell, in dieser Reihenfolge; erst NACH einem Rückroll von
-- 20261102120100, falls die schon lief — sonst kann niemand mehr anlegen
-- oder beitreten):
--
-- DROP TRIGGER IF EXISTS trg_guard_task_type ON public.tasks;
-- DROP FUNCTION IF EXISTS public.guard_task_type();
--
-- ALTER TABLE public.tasks             DROP CONSTRAINT IF EXISTS tasks_title_len;
-- ALTER TABLE public.notes             DROP CONSTRAINT IF EXISTS notes_content_len;
-- ALTER TABLE public.task_completions  DROP CONSTRAINT IF EXISTS task_completions_note_len;
-- ALTER TABLE public.shopping_items    DROP CONSTRAINT IF EXISTS shopping_items_name_len;
-- ALTER TABLE public.households        DROP CONSTRAINT IF EXISTS households_name_len;
-- ALTER TABLE public.household_members DROP CONSTRAINT IF EXISTS household_members_display_name_len;
--
-- ALTER FUNCTION public.update_notes_updated_at() SECURITY DEFINER;
-- ALTER FUNCTION public.remove_priority_on_purchase() RESET search_path;
--
-- CREATE OR REPLACE FUNCTION public.get_user_household_id(user_uuid uuid)
-- RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
-- AS $f$ SELECT household_id FROM household_members WHERE user_id = user_uuid LIMIT 1; $f$;
-- GRANT EXECUTE ON FUNCTION public.get_user_household_id(uuid) TO PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.reset_recurring_tasks() TO PUBLIC, anon, authenticated;
--
-- DROP FUNCTION IF EXISTS public.join_household(text, text);
-- DROP FUNCTION IF EXISTS public.create_household(text, text);
--
-- households_invite_code_key: in Prod existierte er VOR dieser Migration —
-- dort NICHT droppen. Nur auf einer DB, auf der diese Migration ihn angelegt
-- hat: ALTER TABLE public.households DROP CONSTRAINT IF EXISTS households_invite_code_key;
--
-- Danach: DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261102120000';
-- (oder `npx supabase migration repair --status reverted 20261102120000`)
-- =================================================================
