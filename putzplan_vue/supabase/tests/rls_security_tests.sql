-- =================================================================
-- RLS-/RPC-Prüfskript — Haushalts-Grenzen
-- =================================================================
-- Ein einfaches SQL-Skript, kein pgTAP und kein Test-Framework: es läuft in
-- EINER Transaktion, bricht beim ersten Verstoß mit „FAILED …“ ab und rollt
-- am Ende immer zurück. Jeder bestandene Fall meldet eine NOTICE „ok …“.
--
-- Prüft den Endstand NACH 20261102120000, 20261102120100 und
-- 20261102120200 (security-rollout).
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
  EXCEPTION WHEN no_data_found THEN
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
    'SELECT join_household(''TESTAAAA'', ''y'')'
  ] LOOP
    BEGIN
      EXECUTE f;
      RAISE EXCEPTION 'FAILED 20: anon darf: %', f;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RAISE NOTICE 'ok 20: anon erreicht keine der RPCs';
END $$;

RESET ROLE;

ROLLBACK;
