-- =================================================================
-- RLS-/RPC-Prüfskript — Haushalts-Grenzen
-- =================================================================
-- Ein einfaches SQL-Skript, kein pgTAP und kein Test-Framework: es läuft in
-- EINER Transaktion, bricht beim ersten Verstoß mit „FAILED …“ ab und rollt
-- am Ende immer zurück. Jeder bestandene Fall meldet eine NOTICE „ok …“.
--
-- Prüft den Endstand NACH 20261102120000, 20261102120100 und
-- 20261102120200 (alle drei Security-Stufen) sowie die Töpfe (ab 21).
--
-- Ausführen — NIE gegen Prod (legt Test-User in auth.users an; zwar mit
-- ROLLBACK, aber trotzdem nicht):
--   lokal:  psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_security_tests.sql
--   oder:   SQL-Editor eines Wegwerf-/Branch-Projekts, ganzen Inhalt ausführen
-- Läuft als Rolle mit Superuser- bzw. postgres-Rechten (für das Setup);
-- die Fälle selbst wechseln per set_config('role', …) in authenticated/anon.
-- =================================================================

BEGIN;

-- -----------------------------------------------------------------
-- SETUP
-- A, A2: Haushalt HA · B: Haushalt HB · C, D: ohne Haushalt
-- -----------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'a@test.invalid'),
  ('a2000000-0000-0000-0000-0000000000a2', 'a2@test.invalid'),
  ('b0000000-0000-0000-0000-00000000000b', 'b@test.invalid'),
  ('c0000000-0000-0000-0000-00000000000c', 'c@test.invalid'),
  ('d0000000-0000-0000-0000-00000000000d', 'd@test.invalid');

INSERT INTO households (household_id, name, invite_code) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Haushalt A', 'TESTAAAA'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Haushalt B', 'TESTBBBB');

INSERT INTO household_members (user_id, household_id, display_name, user_color) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A',  '#4A90E2'),
  ('a2000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A2', '#E74C3C'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B',  '#4A90E2');

INSERT INTO tasks (task_id, household_id, title, effort, recurrence_days, task_type) VALUES
  ('11111111-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Task A',    3, 7, 'recurring'),
  ('22222222-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Projekt A', 1, 0, 'project'),
  ('11111111-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Task B',    2, 7, 'recurring');

INSERT INTO task_completions (completion_id, task_id, user_id, effort_override) VALUES
  ('cccccccc-0000-0000-0000-0000000000a2', '11111111-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-0000000000a2', 3),
  ('cccccccc-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 3);

-- =================================================================
-- Als C (angemeldet, ohne Haushalt)
-- =================================================================
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM households;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 01: C sieht % Haushalte (erwartet 0)', n; END IF;
  RAISE NOTICE 'ok 01: Haushalte ohne Mitgliedschaft unsichtbar';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO household_members (user_id, household_id, display_name)
    VALUES ('c0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Eindringling');
    RAISE EXCEPTION 'FAILED 02: C trägt sich ohne Code in HA ein';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok 02: direkter Mitglieds-INSERT abgewiesen';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO households (name) VALUES ('Direkt angelegt');
    RAISE EXCEPTION 'FAILED 03: direkter households-INSERT möglich';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok 03: direkter households-INSERT abgewiesen';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM join_household('FALSCH12', 'C');
    RAISE EXCEPTION 'FAILED 04: falscher Code akzeptiert';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_invite_code' THEN RAISE EXCEPTION 'FAILED 04: Meldung %', SQLERRM; END IF;
    RAISE NOTICE 'ok 04: falscher Code → invalid_invite_code';
  END;
END $$;

DO $$
BEGIN
  IF get_user_household_id('a0000000-0000-0000-0000-00000000000a') IS NOT NULL THEN
    RAISE EXCEPTION 'FAILED 05: get_user_household_id verrät fremden Haushalt';
  END IF;
  RAISE NOTICE 'ok 05: get_user_household_id(fremde ID) = NULL';
END $$;

DO $$
DECLARE h households; c text;
BEGIN
  h := join_household('  testaaaa ', 'C');
  IF h.household_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN
    RAISE EXCEPTION 'FAILED 06: falscher Haushalt %', h.household_id;
  END IF;
  SELECT user_color INTO c FROM household_members WHERE user_id = 'c0000000-0000-0000-0000-00000000000c';
  IF c IS DISTINCT FROM '#2ECC71' THEN
    RAISE EXCEPTION 'FAILED 06: Farbe % (erwartet #2ECC71, erste freie)', c;
  END IF;
  RAISE NOTICE 'ok 06: Beitritt per Code (Trim, Kleinschreibung), erste freie Farbe';
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM join_household('TESTBBBB', 'C');
    RAISE EXCEPTION 'FAILED 07: zweiter Beitritt möglich';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'already_in_household' THEN RAISE EXCEPTION 'FAILED 07: Meldung %', SQLERRM; END IF;
    RAISE NOTICE 'ok 07: zweiter Beitritt → already_in_household';
  END;
END $$;

-- =================================================================
-- Als D (ohne Haushalt): Anlegen
-- =================================================================
SELECT set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM create_household(repeat('x', 101), 'D');
    RAISE EXCEPTION 'FAILED 08: überlanger Haushaltsname angenommen';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'ok 08: Haushaltsname > 100 → invalid_household_name';
  END;
END $$;

DO $$
DECLARE h households; n integer; c text;
BEGIN
  h := create_household('  Haus D  ', repeat('d', 80));
  IF h.name <> 'Haus D' OR length(h.invite_code) <> 8 THEN
    RAISE EXCEPTION 'FAILED 09: Zeile %', h;
  END IF;
  SELECT count(*) INTO n FROM households;
  SELECT user_color INTO c FROM household_members WHERE user_id = 'd0000000-0000-0000-0000-00000000000d';
  IF n <> 1 OR c <> '#4A90E2' THEN RAISE EXCEPTION 'FAILED 09: sichtbar % / Farbe %', n, c; END IF;
  IF (SELECT length(display_name) FROM household_members WHERE user_id = 'd0000000-0000-0000-0000-00000000000d') <> 50 THEN
    RAISE EXCEPTION 'FAILED 09: display_name nicht auf 50 gekürzt';
  END IF;
  RAISE NOTICE 'ok 09: create_household legt an, macht zum Mitglied, eigene Zeile sichtbar';
END $$;

-- =================================================================
-- Als A (Mitglied HA)
-- =================================================================
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM households;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 10: A sieht % Haushalte', n; END IF;
  SELECT count(*) INTO n FROM tasks WHERE household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 10: A sieht Aufgaben aus HB'; END IF;
  SELECT count(*) INTO n FROM household_members WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 10: A sieht Mitglied B'; END IF;
  IF get_user_household_id('a0000000-0000-0000-0000-00000000000a') <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN
    RAISE EXCEPTION 'FAILED 10: get_user_household_id(eigene ID) falsch';
  END IF;
  RAISE NOTICE 'ok 10: A sieht nur das eigene Haus';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO tasks (household_id, title, effort) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Fremd', 1);
    RAISE EXCEPTION 'FAILED 11: Aufgabe in HB angelegt';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok 11: Aufgabe in fremdem Haushalt abgewiesen';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE household_members SET household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'FAILED 12: A wechselt per UPDATE den Haushalt';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok 12: household_members.household_id nicht änderbar';
  END;
  UPDATE household_members SET display_name = 'A neu', user_color = '#9B59B6'
  WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED 12: Name/Farbe nicht änderbar'; END IF;
  RAISE NOTICE 'ok 12: Name und Farbe bleiben änderbar';
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE households SET invite_code = 'GEKAPERT' WHERE household_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    RAISE EXCEPTION 'FAILED 13: invite_code per REST änderbar';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok 13: invite_code nicht änderbar';
  END;
  UPDATE households SET weekly_goal_points = 40, week_start_day_pending = 0, week_start_pending_from = CURRENT_DATE
  WHERE household_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED 13: Wochenziel nicht änderbar'; END IF;
  RAISE NOTICE 'ok 13: Wochenziel/Wochenstart bleiben änderbar';
END $$;

DO $$
DECLARE n integer;
BEGIN
  DELETE FROM households WHERE household_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 14: Haushalt gelöscht'; END IF;
  DELETE FROM tasks WHERE task_id = '11111111-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 14: Aufgabe hart gelöscht'; END IF;
  UPDATE tasks SET deleted_at = now() WHERE task_id = '11111111-0000-0000-0000-00000000000a';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED 14: Soft-Delete geht nicht mehr'; END IF;
  UPDATE tasks SET deleted_at = NULL WHERE task_id = '11111111-0000-0000-0000-00000000000a';
  RAISE NOTICE 'ok 14: kein hartes DELETE auf households/tasks, Soft-Delete geht';
END $$;

DO $$
DECLARE n integer;
BEGIN
  DELETE FROM task_completions WHERE completion_id = 'cccccccc-0000-0000-0000-0000000000a2';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 15: fremde Erledigung gelöscht'; END IF;
  DELETE FROM task_completions WHERE completion_id = 'cccccccc-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 15: eigene Erledigung nicht löschbar'; END IF;
  RAISE NOTICE 'ok 15: nur eigene Erledigungen löschbar (DB löscht fremde still mit 0 Zeilen)';
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM reset_recurring_tasks();
    RAISE EXCEPTION 'FAILED 16: authenticated darf reset_recurring_tasks';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok 16: reset_recurring_tasks für authenticated gesperrt';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO tasks (household_id, title, effort) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', repeat('t', 201), 1);
    RAISE EXCEPTION 'FAILED 17: Titel > 200 angenommen';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO notes (household_id, content, created_by)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', repeat('n', 10001), 'a0000000-0000-0000-0000-00000000000a');
    RAISE EXCEPTION 'FAILED 17: Notiz > 10000 angenommen';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE household_members SET display_name = repeat('x', 51) WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'FAILED 17: display_name > 50 angenommen';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 17: Längenlimits greifen';
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE tasks SET task_type = 'recurring' WHERE task_id = '22222222-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'FAILED 18: Projekt umgestellt';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE tasks SET task_type = 'project' WHERE task_id = '11111111-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'FAILED 18: Aufgabe zum Projekt gemacht';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO tasks (household_id, title, effort, task_type, parent_task_id, subtask_points_mode)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kind', 1, 'daily', '22222222-0000-0000-0000-00000000000a', 'deduct');
    RAISE EXCEPTION 'FAILED 18: deduct unter Projekt angelegt';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- erlaubt: deduct unter wiederkehrender Aufgabe, Typwechsel recurring → daily
  INSERT INTO tasks (household_id, title, effort, task_type, parent_task_id, subtask_points_mode)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kind', 1, 'recurring', '11111111-0000-0000-0000-00000000000a', 'deduct');
  UPDATE tasks SET task_type = 'daily' WHERE task_id = '11111111-0000-0000-0000-00000000000a';
  UPDATE tasks SET task_type = 'recurring' WHERE task_id = '11111111-0000-0000-0000-00000000000a';
  RAISE NOTICE 'ok 18: project ist kein Wechselziel, kein deduct unter Projekt';
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE tasks SET assigned_to = 'b0000000-0000-0000-0000-00000000000b' WHERE task_id = '11111111-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'FAILED 19: Nicht-Mitglied zugewiesen';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE tasks SET assigned_to = 'a2000000-0000-0000-0000-0000000000a2' WHERE task_id = '11111111-0000-0000-0000-00000000000a';
  BEGIN
    INSERT INTO settlements (household_id, from_user_id, to_user_id, points_settled, method, created_by)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-00000000000a',
            'b0000000-0000-0000-0000-00000000000b', 5, 'money', 'a0000000-0000-0000-0000-00000000000a');
    RAISE EXCEPTION 'FAILED 19: Ausgleich mit Nicht-Mitglied';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO settlements (household_id, from_user_id, to_user_id, points_settled, method, created_by, created_at)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-00000000000a',
          'a2000000-0000-0000-0000-0000000000a2', 5, 'money', 'a0000000-0000-0000-0000-00000000000a',
          now() + interval '10 years');
  IF (SELECT max(created_at) FROM settlements) > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'FAILED 19: created_at vom Client übernommen';
  END IF;
  RAISE NOTICE 'ok 19: Zuweisung/Ausgleich nur unter Mitgliedern, created_at = Serverzeit';
END $$;

-- =================================================================
-- Töpfe (CONTEXT.md § Topf): Haushaltstopf, Ausgaben, Rückzahlungen
-- Stand hier: HA = A, A2, C (Beitritt in 06) · HB = B · HD = D (Anlage in 09)
-- =================================================================
-- Fremde Zeilen in HB als postgres anlegen, damit „sieht nichts“ etwas
-- zu verbergen hat.
RESET ROLE;
INSERT INTO pot_expenses (expense_id, pot_id, household_id, payer_participant_id, amount_cents, description, split_kind, split_values)
SELECT 'eeeeeeee-0000-0000-0000-00000000000b', p.pot_id, p.household_id, t.participant_id, 1000, 'Einkauf B',
       'equal', jsonb_build_object(t.participant_id::text, 1)
FROM pots p JOIN pot_participants t USING (pot_id)
WHERE p.household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
INSERT INTO pot_participants (participant_id, pot_id, household_id, name)
SELECT 'fb000000-0000-0000-0000-00000000000b', pot_id, household_id, 'Gast in B'
FROM pots WHERE household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
INSERT INTO pot_repayments (repayment_id, pot_id, household_id, from_participant_id, to_participant_id, amount_cents)
SELECT 'ffffffff-0000-0000-0000-00000000000b', p.pot_id, p.household_id, 'fb000000-0000-0000-0000-00000000000b', t.participant_id, 500
FROM pots p JOIN pot_participants t USING (pot_id)
WHERE p.household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND t.user_id IS NOT NULL;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pots WHERE kind = 'household';
  IF n <> 3 THEN RAISE EXCEPTION 'FAILED 21: % Haushaltstöpfe (erwartet 3: HA, HB, HD)', n; END IF;
  SELECT count(*) INTO n FROM (
    SELECT household_id FROM pots WHERE kind = 'household' GROUP BY household_id HAVING count(*) = 1
  ) x;
  IF n <> 3 THEN RAISE EXCEPTION 'FAILED 21: nicht genau ein Haushaltstopf je Haushalt'; END IF;
  SELECT count(*) INTO n FROM pot_participants t JOIN pots p USING (pot_id)
  WHERE p.household_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND p.kind = 'household'
    AND t.user_id IN ('a0000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-0000000000a2',
                      'c0000000-0000-0000-0000-00000000000c');
  IF n <> 3 THEN RAISE EXCEPTION 'FAILED 21: Haushaltstopf HA hat % Mitglieder als Teilnehmer (erwartet 3)', n; END IF;
  SELECT count(*) INTO n FROM pot_participants t JOIN pots p USING (pot_id)
  WHERE p.kind = 'household'
    AND p.household_id = (SELECT household_id FROM household_members WHERE user_id = 'd0000000-0000-0000-0000-00000000000d');
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 21: Haushaltstopf des neuen Haushalts von D hat % Teilnehmer', n; END IF;
  BEGIN
    INSERT INTO pots (household_id, name, kind) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Zweiter', 'household');
    RAISE EXCEPTION 'FAILED 21: zweiter Haushaltstopf angelegt';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 21: Haushaltstopf genau einmal je Haushalt (neu und bestehend), Mitglieder sind Teilnehmer';
END $$;

-- Gleicher Anzeigename wie ein Teilnehmer (Groß-/Kleinschreibung egal) bricht
-- den Beitritt nicht, der Name bekommt eine Nummer.
DO $$
DECLARE v text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES ('a3000000-0000-0000-0000-0000000000a3', 'a3@test.invalid');
  INSERT INTO household_members (user_id, household_id, display_name, user_color)
  VALUES ('a3000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2', '#F39C12');
  SELECT name INTO v FROM pot_participants WHERE user_id = 'a3000000-0000-0000-0000-0000000000a3';
  IF v IS DISTINCT FROM 'a2 2' THEN RAISE EXCEPTION 'FAILED 22: Teilnehmername % (erwartet „a2 2“)', v; END IF;
  BEGIN
    INSERT INTO pot_participants (pot_id, household_id, name)
    SELECT pot_id, household_id, 'A2' FROM pots WHERE household_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    RAISE EXCEPTION 'FAILED 22: doppelter Teilnehmername angenommen';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 22: Teilnehmernamen je Topf eindeutig ohne Groß-/Kleinschreibung, Beitritt nummeriert';
END $$;

SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pots;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 23: A sieht % Töpfe (erwartet 1)', n; END IF;
  SELECT count(*) INTO n FROM pot_participants WHERE household_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 23: A sieht % fremde Teilnehmer', n; END IF;
  SELECT count(*) INTO n FROM pot_expenses;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 23: A sieht % fremde Ausgaben', n; END IF;
  SELECT count(*) INTO n FROM pot_repayments;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 23: A sieht % fremde Rückzahlungen', n; END IF;
  RAISE NOTICE 'ok 23: A sieht nur Topf und Teilnehmer des eigenen Hauses';
END $$;

-- Die Kennungen aus HB sind A unsichtbar; der Test kennt sie als feste
-- Werte bzw. setzt erfundene ein — RLS muss beides abweisen.
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO pot_expenses (pot_id, household_id, payer_participant_id, amount_cents, description, split_kind, split_values)
    VALUES (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'fb000000-0000-0000-0000-00000000000b',
            100, 'Fremd', 'equal', '{}');
    RAISE EXCEPTION 'FAILED 24: Ausgabe in HB angelegt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO pot_repayments (pot_id, household_id, from_participant_id, to_participant_id, amount_cents)
    VALUES (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', gen_random_uuid(), gen_random_uuid(), 100);
    RAISE EXCEPTION 'FAILED 24: Rückzahlung in HB angelegt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO pot_participants (pot_id, household_id, name)
    VALUES (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Eindringling');
    RAISE EXCEPTION 'FAILED 24: Teilnehmer in HB angelegt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO pots (household_id, name, kind) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Fremd', 'event');
    RAISE EXCEPTION 'FAILED 24: Topf in HB angelegt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE pot_expenses SET amount_cents = 1 WHERE expense_id = 'eeeeeeee-0000-0000-0000-00000000000b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 24: fremde Ausgabe geändert'; END IF;
  DELETE FROM pot_expenses WHERE expense_id = 'eeeeeeee-0000-0000-0000-00000000000b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 24: fremde Ausgabe gelöscht'; END IF;
  UPDATE pot_repayments SET amount_cents = 1 WHERE repayment_id = 'ffffffff-0000-0000-0000-00000000000b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 24: fremde Rückzahlung geändert'; END IF;
  DELETE FROM pot_repayments WHERE repayment_id = 'ffffffff-0000-0000-0000-00000000000b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 24: fremde Rückzahlung gelöscht'; END IF;
  UPDATE pot_participants SET name = 'Gekapert' WHERE participant_id = 'fb000000-0000-0000-0000-00000000000b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 24: fremder Teilnehmer geändert'; END IF;
  DELETE FROM pots WHERE household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 24: fremder Topf gelöscht'; END IF;
  RAISE NOTICE 'ok 24: A schreibt nichts in Töpfe von HB';
END $$;

-- Eigenes Haus: Ausgabe und Rückzahlung anlegen, ändern, löschen; Teilnehmer
-- und Haushalt müssen zum Topf passen.
DO $$
DECLARE
  n integer;
  my_pot uuid := (SELECT pot_id FROM pots WHERE kind = 'household');
  pa uuid := (SELECT participant_id FROM pot_participants WHERE user_id = 'a0000000-0000-0000-0000-00000000000a');
  pa2 uuid := (SELECT participant_id FROM pot_participants WHERE user_id = 'a2000000-0000-0000-0000-0000000000a2');
BEGIN
  INSERT INTO pot_expenses (expense_id, pot_id, household_id, payer_participant_id, amount_cents, description,
                            split_kind, split_values, updated_by_participant_id)
  VALUES ('eeeeeeee-0000-0000-0000-00000000000a', my_pot, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pa, 1000, 'Wocheneinkauf',
          'equal', jsonb_build_object(pa::text, 1, pa2::text, 1), pa);
  UPDATE pot_expenses SET amount_cents = 1200, updated_by_participant_id = pa2
  WHERE expense_id = 'eeeeeeee-0000-0000-0000-00000000000a';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED 25: eigene Ausgabe nicht änderbar'; END IF;
  INSERT INTO pot_repayments (repayment_id, pot_id, household_id, from_participant_id, to_participant_id, amount_cents)
  VALUES ('ffffffff-0000-0000-0000-00000000000a', my_pot, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pa2, pa, 600);
  BEGIN
    UPDATE pot_expenses SET household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    WHERE expense_id = 'eeeeeeee-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'FAILED 25: Ausgabe in fremden Haushalt verschoben';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO pot_expenses (pot_id, household_id, payer_participant_id, amount_cents, description, split_kind, split_values)
    VALUES (my_pot, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fb000000-0000-0000-0000-00000000000b',
            100, 'Zahler aus HB', 'equal', '{}');
    RAISE EXCEPTION 'FAILED 25: Zahler aus fremdem Topf angenommen';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO pot_expenses (pot_id, household_id, payer_participant_id, amount_cents, description, split_kind, split_values)
    VALUES (my_pot, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pa, 0, 'Null', 'equal', '{}');
    RAISE EXCEPTION 'FAILED 25: Betrag 0 angenommen';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO pot_repayments (pot_id, household_id, from_participant_id, to_participant_id, amount_cents)
    VALUES (my_pot, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pa, pa, 100);
    RAISE EXCEPTION 'FAILED 25: Rückzahlung an sich selbst angenommen';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  DELETE FROM pot_repayments WHERE repayment_id = 'ffffffff-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 25: eigene Rückzahlung nicht löschbar'; END IF;
  RAISE NOTICE 'ok 25: Ausgaben und Rückzahlungen im eigenen Topf schreibbar, Bezüge bleiben im Topf';
END $$;

-- Haushaltstopf und seine Teilnehmer legt nur die Datenbank an; abschließen
-- und löschen lässt sich der Haushaltstopf nicht.
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO pots (household_id, name, kind) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Zweiter', 'household');
    RAISE EXCEPTION 'FAILED 26: Haushaltstopf vom Client angelegt';
  EXCEPTION WHEN insufficient_privilege OR unique_violation THEN NULL;
  END;
  DELETE FROM pots WHERE kind = 'household';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 26: Haushaltstopf gelöscht'; END IF;
  BEGIN
    UPDATE pots SET closed_at = now() WHERE kind = 'household';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAILED 26: Haushaltstopf abgeschlossen'; END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 26: Haushaltstopf weder anlegbar noch löschbar noch abschließbar';
END $$;

-- Abgeschlossener Topf nimmt nichts mehr an (Ereignistopf, als postgres angelegt).
RESET ROLE;
INSERT INTO pots (pot_id, household_id, name, kind, closed_at)
VALUES ('99999999-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Urlaub', 'event', now());
INSERT INTO pot_participants (participant_id, pot_id, household_id, name, user_id) VALUES
  ('9a000000-0000-0000-0000-00000000000a', '99999999-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'A', 'a0000000-0000-0000-0000-00000000000a'),
  ('9a200000-0000-0000-0000-0000000000a2', '99999999-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'A2', 'a2000000-0000-0000-0000-0000000000a2');
INSERT INTO pot_expenses (expense_id, pot_id, household_id, payer_participant_id, amount_cents, description, split_kind, split_values)
VALUES ('eeeeeeee-0000-0000-0000-0000000000ae', '99999999-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '9a000000-0000-0000-0000-00000000000a', 500, 'Fähre', 'equal', '{}');
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO pot_expenses (pot_id, household_id, payer_participant_id, amount_cents, description, split_kind, split_values)
    VALUES ('99999999-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '9a000000-0000-0000-0000-00000000000a', 100, 'Nachzügler', 'equal', '{}');
    RAISE EXCEPTION 'FAILED 27: Ausgabe in abgeschlossenem Topf angelegt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO pot_repayments (pot_id, household_id, from_participant_id, to_participant_id, amount_cents)
    VALUES ('99999999-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '9a200000-0000-0000-0000-0000000000a2', '9a000000-0000-0000-0000-00000000000a', 100);
    RAISE EXCEPTION 'FAILED 27: Rückzahlung in abgeschlossenem Topf angelegt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE pot_expenses SET amount_cents = 1 WHERE expense_id = 'eeeeeeee-0000-0000-0000-0000000000ae';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 27: Ausgabe in abgeschlossenem Topf geändert'; END IF;
  DELETE FROM pot_expenses WHERE expense_id = 'eeeeeeee-0000-0000-0000-0000000000ae';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 27: Ausgabe in abgeschlossenem Topf gelöscht'; END IF;
  SELECT count(*) INTO n FROM pot_expenses WHERE expense_id = 'eeeeeeee-0000-0000-0000-0000000000ae';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 27: abgeschlossener Topf nicht mehr lesbar'; END IF;
  RAISE NOTICE 'ok 27: abgeschlossener Topf lesbar, aber schreibgeschützt';
END $$;

-- Fremde Einträge: A legt an, A2 ändert und löscht sie. Rückgängig legt die
-- gelöschte Zeile mit derselben Kennung und denselben Zeitstempeln wieder an.
DO $$
DECLARE
  my_pot uuid := (SELECT pot_id FROM pots WHERE kind = 'household');
  pa uuid := (SELECT participant_id FROM pot_participants WHERE pot_id = my_pot AND user_id = 'a0000000-0000-0000-0000-00000000000a');
  pa2 uuid := (SELECT participant_id FROM pot_participants WHERE pot_id = my_pot AND user_id = 'a2000000-0000-0000-0000-0000000000a2');
BEGIN
  INSERT INTO pot_expenses (expense_id, pot_id, household_id, payer_participant_id, amount_cents, description,
                            split_kind, split_values, updated_by_participant_id)
  VALUES ('eeeeeeee-0000-0000-0000-0000000000a8', my_pot, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pa, 900, 'Strom',
          'equal', jsonb_build_object(pa::text, 1, pa2::text, 1), pa);
  INSERT INTO pot_repayments (repayment_id, pot_id, household_id, from_participant_id, to_participant_id, amount_cents,
                              updated_by_participant_id)
  VALUES ('ffffffff-0000-0000-0000-0000000000a8', my_pot, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pa2, pa, 450, pa);
END $$;

SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

DO $$
DECLARE
  n integer;
  pa2 uuid := (SELECT participant_id FROM pot_participants p JOIN pots USING (pot_id)
               WHERE pots.kind = 'household' AND p.user_id = 'a2000000-0000-0000-0000-0000000000a2');
  e pot_expenses;
  r pot_repayments;
BEGIN
  UPDATE pot_expenses SET amount_cents = 1000, description = 'Strom Oktober', updated_by_participant_id = pa2
  WHERE expense_id = 'eeeeeeee-0000-0000-0000-0000000000a8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 28: A2 kann die Ausgabe von A nicht ändern'; END IF;
  UPDATE pot_repayments SET amount_cents = 500, updated_by_participant_id = pa2
  WHERE repayment_id = 'ffffffff-0000-0000-0000-0000000000a8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 28: A2 kann die Rückzahlung von A nicht ändern'; END IF;

  SELECT * INTO e FROM pot_expenses WHERE expense_id = 'eeeeeeee-0000-0000-0000-0000000000a8';
  IF e.updated_by_participant_id IS DISTINCT FROM pa2 THEN
    RAISE EXCEPTION 'FAILED 28: „zuletzt geändert von“ nicht A2';
  END IF;
  SELECT * INTO r FROM pot_repayments WHERE repayment_id = 'ffffffff-0000-0000-0000-0000000000a8';

  DELETE FROM pot_expenses WHERE expense_id = 'eeeeeeee-0000-0000-0000-0000000000a8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 28: A2 kann die Ausgabe von A nicht löschen'; END IF;
  DELETE FROM pot_repayments WHERE repayment_id = 'ffffffff-0000-0000-0000-0000000000a8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 28: A2 kann die Rückzahlung von A nicht löschen'; END IF;

  -- Rückgängig: dieselbe Zeile wieder einfügen, wie der Client sie vorher hatte.
  INSERT INTO pot_expenses (expense_id, pot_id, household_id, payer_participant_id, amount_cents, spent_on, description,
                            split_kind, split_values, updated_by_participant_id, created_at, updated_at)
  VALUES (e.expense_id, e.pot_id, e.household_id, e.payer_participant_id, e.amount_cents, e.spent_on, e.description,
          e.split_kind, e.split_values, e.updated_by_participant_id, e.created_at, e.updated_at);
  INSERT INTO pot_repayments (repayment_id, pot_id, household_id, from_participant_id, to_participant_id, amount_cents,
                              paid_on, updated_by_participant_id, created_at, updated_at)
  VALUES (r.repayment_id, r.pot_id, r.household_id, r.from_participant_id, r.to_participant_id, r.amount_cents,
          r.paid_on, r.updated_by_participant_id, r.created_at, r.updated_at);
  SELECT count(*) INTO n FROM pot_expenses
  WHERE expense_id = e.expense_id AND created_at = e.created_at AND updated_at = e.updated_at
    AND amount_cents = 1000 AND updated_by_participant_id = pa2;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 28: gelöschte Ausgabe nicht unverändert wiederhergestellt'; END IF;
  SELECT count(*) INTO n FROM pot_repayments
  WHERE repayment_id = r.repayment_id AND created_at = r.created_at AND amount_cents = 500;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 28: gelöschte Rückzahlung nicht wiederhergestellt'; END IF;
  RAISE NOTICE 'ok 28: Mitglied ändert und löscht fremde Einträge, Rückgängig stellt sie wieder her';
END $$;

-- =================================================================
-- Als anon (nicht angemeldet)
-- =================================================================
SELECT set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'SELECT reset_recurring_tasks()',
    'SELECT get_user_household_id(''a0000000-0000-0000-0000-00000000000a'')',
    'SELECT create_household(''x'', ''y'')',
    'SELECT join_household(''TESTAAAA'', ''y'')',
    'SELECT count(*) FROM pots',
    'SELECT count(*) FROM pot_participants',
    'SELECT count(*) FROM pot_expenses',
    'SELECT count(*) FROM pot_repayments'
  ] LOOP
    BEGIN
      EXECUTE f;
      RAISE EXCEPTION 'FAILED 20: anon darf: %', f;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RAISE NOTICE 'ok 20: anon erreicht keine der RPCs und keine Topf-Tabelle';
END $$;

RESET ROLE;

ROLLBACK;
