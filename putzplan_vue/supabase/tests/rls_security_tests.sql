-- =================================================================
-- RLS-/RPC-Prüfskript — Haushalts-Grenzen
-- =================================================================
-- Ein einfaches SQL-Skript, kein pgTAP und kein Test-Framework: es läuft in
-- EINER Transaktion, bricht beim ersten Verstoß mit „FAILED …“ ab und rollt
-- am Ende immer zurück. Jeder bestandene Fall meldet eine NOTICE „ok …“.
--
-- Prüft den Endstand NACH 20261102120000, 20261102120100 und
-- 20261102120200 (alle drei Security-Stufen).
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

-- =================================================================
-- Gäste (Anonymanmeldung) und Gastlinks
-- =================================================================
-- E, E2: anonyme Sitzungen (Supabase-Anonymanmeldung = Rolle authenticated
-- plus Claim is_anonymous). Sie sind nie Haushaltsmitglieder; ein Gastlink
-- gewährt genau eine Liste.
INSERT INTO auth.users (id, is_anonymous) VALUES
  ('e0000000-0000-0000-0000-00000000000e', true),
  ('e2000000-0000-0000-0000-0000000000e2', true);

SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated","is_anonymous":true}', true);

DO $$
BEGIN
  BEGIN
    PERFORM create_household('Gasthaus', 'E');
    RAISE EXCEPTION 'FAILED 21: Gast legt Haushalt an';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'anonymous_not_allowed' THEN RAISE EXCEPTION 'FAILED 21: Meldung %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM join_household('TESTAAAA', 'E');
    RAISE EXCEPTION 'FAILED 21: Gast tritt Haushalt bei';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'anonymous_not_allowed' THEN RAISE EXCEPTION 'FAILED 21: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 21: Gast kann keinen Haushalt anlegen und keinem beitreten';
END $$;

-- Auch ohne die RPCs: keine Mitgliedschaft für ein anonymes Konto, egal auf
-- welchem Weg (hier als Eigentümer, an RLS vorbei).
RESET ROLE;

DO $$
BEGIN
  BEGIN
    INSERT INTO household_members (user_id, household_id, display_name)
    VALUES ('e0000000-0000-0000-0000-00000000000e', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'E');
    RAISE EXCEPTION 'FAILED 22: anonymes Konto als Mitglied eingetragen';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'anonymous_not_allowed' THEN RAISE EXCEPTION 'FAILED 22: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 22: Mitgliedschaft für anonyme Konten auf keinem Weg';
END $$;

-- Listen für die Gastlinks: HA hat zwei Einkaufslisten (LA1 wird geteilt,
-- LA2 nicht), zwei Packlisten und eine To-do-Liste; HB eine Einkaufsliste.
INSERT INTO shopping_lists (list_id, household_id, name) VALUES
  ('5a000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LA1'),
  ('5a000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LA2'),
  ('5b000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'LB1');
INSERT INTO shopping_items (shopping_item_id, household_id, list_id, name) VALUES
  ('51000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a1', 'Milch'),
  ('51000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a2', 'Geheim');
INSERT INTO shopping_categories (category_id, household_id, list_id, name) VALUES
  ('5c000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a1', 'Kühlung'),
  ('5c000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a2', 'Geheimfach');
INSERT INTO packing_lists (list_id, household_id, name) VALUES
  ('9a000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PA1'),
  ('9a000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PA2');
INSERT INTO packing_items (item_id, list_id, name) VALUES
  ('91000000-0000-0000-0000-0000000000a1', '9a000000-0000-0000-0000-0000000000a1', 'Zelt'),
  ('91000000-0000-0000-0000-0000000000a2', '9a000000-0000-0000-0000-0000000000a2', 'Pass');
INSERT INTO todo_lists (list_id, household_id, name) VALUES
  ('7a000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TA1');

-- -----------------------------------------------------------------
-- Als A (Mitglied HA): Freigaben anlegen
-- -----------------------------------------------------------------
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

DO $$
DECLARE s guest_shares; s2 guest_shares;
BEGIN
  s := create_guest_share('shopping_list', '5a000000-0000-0000-0000-0000000000a1');
  IF s.household_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' OR length(s.secret) < 22 THEN
    RAISE EXCEPTION 'FAILED 23: Freigabe %', s;
  END IF;
  s2 := create_guest_share('shopping_list', '5a000000-0000-0000-0000-0000000000a1');
  IF s2.share_id <> s.share_id OR s2.secret <> s.secret THEN
    RAISE EXCEPTION 'FAILED 23: zweites Teilen legt eine zweite Freigabe an';
  END IF;
  PERFORM set_config('test.secret_la1', s.secret, true);
  PERFORM set_config('test.share_la1', s.share_id::text, true);
  s := create_guest_share('packing_list', '9a000000-0000-0000-0000-0000000000a1');
  PERFORM set_config('test.secret_pa1', s.secret, true);
  PERFORM set_config('test.share_pa1', s.share_id::text, true);
  s := create_guest_share('todo_list', '7a000000-0000-0000-0000-0000000000a1');
  BEGIN
    PERFORM create_guest_share('shopping_list', '5b000000-0000-0000-0000-0000000000b1');
    RAISE EXCEPTION 'FAILED 23: A teilt eine Liste aus HB';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'share_target_not_found' THEN RAISE EXCEPTION 'FAILED 23: Meldung %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM create_guest_share('shopping_list', '9a000000-0000-0000-0000-0000000000a1');
    RAISE EXCEPTION 'FAILED 23: Packliste als Einkaufsliste geteilt';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'share_target_not_found' THEN RAISE EXCEPTION 'FAILED 23: Meldung %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM create_guest_share('household', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAILED 23: unbekannte Zielart angenommen';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (SELECT count(*) FROM guest_shares) <> 3 THEN
    RAISE EXCEPTION 'FAILED 23: A sieht % Freigaben (erwartet 3)', (SELECT count(*) FROM guest_shares);
  END IF;
  RAISE NOTICE 'ok 23: Mitglied teilt jede Listenart genau einmal, nur im eigenen Haushalt';
END $$;

-- -----------------------------------------------------------------
-- Als B (Mitglied HB): fremde Freigaben
-- -----------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM guest_shares) <> 0 THEN RAISE EXCEPTION 'FAILED 24: B sieht Freigaben aus HA'; END IF;
  BEGIN
    PERFORM renew_guest_share(current_setting('test.share_la1')::uuid);
    RAISE EXCEPTION 'FAILED 24: B erneuert Freigabe aus HA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'share_not_found' THEN RAISE EXCEPTION 'FAILED 24: Meldung %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM end_guest_share(current_setting('test.share_la1')::uuid);
    RAISE EXCEPTION 'FAILED 24: B beendet Freigabe aus HA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'share_not_found' THEN RAISE EXCEPTION 'FAILED 24: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 24: fremde Freigaben unsichtbar und nicht verwaltbar';
END $$;

-- -----------------------------------------------------------------
-- Als Gast E
-- -----------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated","is_anonymous":true}', true);

DO $$
DECLARE n integer;
BEGIN
  SELECT (SELECT count(*) FROM shopping_lists) + (SELECT count(*) FROM shopping_items)
       + (SELECT count(*) FROM packing_lists) + (SELECT count(*) FROM guest_shares) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 25: Gast sieht vor dem Einlösen % Zeilen', n; END IF;
  BEGIN
    PERFORM redeem_guest_link('falsch');
    RAISE EXCEPTION 'FAILED 25: falsches Geheimnis eingelöst';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_guest_link' THEN RAISE EXCEPTION 'FAILED 25: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 25: ohne eingelösten Link sieht der Gast nichts';
END $$;

DO $$
DECLARE r record; n integer;
BEGIN
  SELECT * INTO r FROM redeem_guest_link(current_setting('test.secret_la1'));
  IF r.target_kind <> 'shopping_list' OR r.target_id <> '5a000000-0000-0000-0000-0000000000a1'
     OR r.household_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' OR r.household_name <> 'Haushalt A' THEN
    RAISE EXCEPTION 'FAILED 26: Einlösen liefert %', r;
  END IF;
  -- Zweimal einlösen schadet nicht (Neuladen der Seite).
  PERFORM redeem_guest_link(current_setting('test.secret_la1'));

  SELECT count(*) INTO n FROM shopping_lists;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 26: Gast sieht % Einkaufslisten (erwartet 1)', n; END IF;
  SELECT count(*) INTO n FROM shopping_items;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 26: Gast sieht % Artikel (erwartet 1)', n; END IF;
  SELECT count(*) INTO n FROM shopping_categories;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 26: Gast sieht % Kategorien (erwartet 1)', n; END IF;
  SELECT (SELECT count(*) FROM households) + (SELECT count(*) FROM household_members)
       + (SELECT count(*) FROM tasks) + (SELECT count(*) FROM task_completions)
       + (SELECT count(*) FROM notes) + (SELECT count(*) FROM settlements)
       + (SELECT count(*) FROM point_benchmarks)
       + (SELECT count(*) FROM packing_lists) + (SELECT count(*) FROM packing_items)
       + (SELECT count(*) FROM packing_categories)
       + (SELECT count(*) FROM todo_lists) + (SELECT count(*) FROM todo_items)
       + (SELECT count(*) FROM todo_categories)
       + (SELECT count(*) FROM guest_shares) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 26: Gast sieht % fremde Zeilen', n; END IF;
  BEGIN
    PERFORM count(*) FROM guest_grants;
    RAISE EXCEPTION 'FAILED 26: Gast liest guest_grants';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 26: eingelöster Link öffnet genau diese Liste und nichts sonst';
END $$;

DO $$
DECLARE n integer;
BEGIN
  -- Einträge: anlegen, abhaken, bearbeiten, einsortieren, löschen
  INSERT INTO shopping_items (shopping_item_id, household_id, list_id, name)
  VALUES ('51000000-0000-0000-0000-0000000000e1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a1', 'Brot');
  UPDATE shopping_items
  SET purchased = true, name = 'Vollkornbrot', category = 'Kühlung',
      last_purchased_by = 'e0000000-0000-0000-0000-00000000000e'
  WHERE shopping_item_id = '51000000-0000-0000-0000-0000000000e1';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED 27: Gast kann Eintrag nicht ändern'; END IF;
  DELETE FROM shopping_items WHERE shopping_item_id = '51000000-0000-0000-0000-0000000000e1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 27: Gast kann Eintrag nicht löschen'; END IF;
  INSERT INTO shopping_categories (category_id, household_id, list_id, name)
  VALUES ('5c000000-0000-0000-0000-0000000000e1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a1', 'Brot');
  UPDATE shopping_categories SET sort_order = 3 WHERE category_id = '5c000000-0000-0000-0000-0000000000e1';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED 27: Gast kann Kategorie nicht einsortieren'; END IF;
  DELETE FROM shopping_categories WHERE category_id = '5c000000-0000-0000-0000-0000000000e1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 27: Gast kann Kategorie nicht löschen'; END IF;
  RAISE NOTICE 'ok 27: Gast schreibt Einträge und Kategorien der geteilten Liste';
END $$;

DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO shopping_items (household_id, list_id, name)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a2', 'Einbruch');
    RAISE EXCEPTION 'FAILED 28: Gast schreibt in nicht geteilte Liste';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO shopping_items (household_id, list_id, name)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '5a000000-0000-0000-0000-0000000000a1', 'Falscher Haushalt');
    RAISE EXCEPTION 'FAILED 28: Gast schreibt Zeile mit fremder household_id';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE shopping_items SET list_id = '5a000000-0000-0000-0000-0000000000a2'
    WHERE shopping_item_id = '51000000-0000-0000-0000-0000000000a1';
    RAISE EXCEPTION 'FAILED 28: Gast verschiebt Eintrag in nicht geteilte Liste';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO shopping_categories (household_id, list_id, name)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a2', 'Einbruch');
    RAISE EXCEPTION 'FAILED 28: Gast legt Kategorie in nicht geteilter Liste an';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE shopping_items SET name = 'gehackt' WHERE shopping_item_id = '51000000-0000-0000-0000-0000000000a2';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 28: Gast ändert Eintrag einer nicht geteilten Liste'; END IF;
  UPDATE shopping_lists SET name = 'Umbenannt' WHERE list_id = '5a000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 28: Gast benennt die Liste um'; END IF;
  DELETE FROM shopping_lists WHERE list_id = '5a000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 28: Gast löscht die Liste'; END IF;
  BEGIN
    INSERT INTO shopping_lists (household_id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Neu');
    RAISE EXCEPTION 'FAILED 28: Gast legt Liste an';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 28: Gast bleibt in der geteilten Liste, die Liste selbst ist schreibgeschützt';
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM create_guest_share('shopping_list', '5a000000-0000-0000-0000-0000000000a2');
    RAISE EXCEPTION 'FAILED 29: Gast teilt eine Liste';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM renew_guest_share(current_setting('test.share_la1')::uuid);
    RAISE EXCEPTION 'FAILED 29: Gast erneuert den Link';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM end_guest_share(current_setting('test.share_la1')::uuid);
    RAISE EXCEPTION 'FAILED 29: Gast beendet die Freigabe';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 29: Gast verwaltet keine Freigaben';
END $$;

-- Packliste: Einträge ohne eigene household_id, Zugriff über die Liste.
DO $$
DECLARE n integer;
BEGIN
  PERFORM redeem_guest_link(current_setting('test.secret_pa1'));
  SELECT count(*) INTO n FROM packing_items;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 30: Gast sieht % Packeinträge (erwartet 1)', n; END IF;
  INSERT INTO packing_items (list_id, name, created_by)
  VALUES ('9a000000-0000-0000-0000-0000000000a1', 'Schlafsack', 'e0000000-0000-0000-0000-00000000000e');
  UPDATE packing_items SET packed = true WHERE item_id = '91000000-0000-0000-0000-0000000000a1';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED 30: Gast hakt Packeintrag nicht ab'; END IF;
  BEGIN
    INSERT INTO packing_items (list_id, name) VALUES ('9a000000-0000-0000-0000-0000000000a2', 'Einbruch');
    RAISE EXCEPTION 'FAILED 30: Gast schreibt in nicht geteilte Packliste';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE packing_items SET list_id = '9a000000-0000-0000-0000-0000000000a2'
    WHERE item_id = '91000000-0000-0000-0000-0000000000a1';
    RAISE EXCEPTION 'FAILED 30: Gast verschiebt Packeintrag';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT count(*) FROM todo_lists) <> 0 THEN RAISE EXCEPTION 'FAILED 30: Gast sieht To-do-Liste'; END IF;
  RAISE NOTICE 'ok 30: Packliste per Link, To-do-Liste ohne Link unsichtbar';
END $$;

-- Ein zweiter Gast mit demselben Link sieht dasselbe; ohne Link nichts.
SELECT set_config('request.jwt.claims', '{"sub":"e2000000-0000-0000-0000-0000000000e2","role":"authenticated","is_anonymous":true}', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM shopping_items) <> 0 THEN RAISE EXCEPTION 'FAILED 31: E2 erbt die Gewährung von E'; END IF;
  PERFORM redeem_guest_link(current_setting('test.secret_la1'));
  IF (SELECT count(*) FROM shopping_items) <> 1 THEN RAISE EXCEPTION 'FAILED 31: E2 sieht die Liste nicht'; END IF;
  RAISE NOTICE 'ok 31: jede Sitzung braucht den Link selbst';
END $$;

-- -----------------------------------------------------------------
-- Als A: erneuern und beenden
-- -----------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

DO $$
DECLARE s guest_shares;
BEGIN
  s := renew_guest_share(current_setting('test.share_la1')::uuid);
  IF s.secret = current_setting('test.secret_la1') THEN RAISE EXCEPTION 'FAILED 32: Geheimnis unverändert'; END IF;
  PERFORM set_config('test.secret_la1_neu', s.secret, true);
  PERFORM end_guest_share(current_setting('test.share_pa1')::uuid);
  IF (SELECT count(*) FROM guest_shares) <> 2 THEN RAISE EXCEPTION 'FAILED 32: Freigabe nicht beendet'; END IF;
  RAISE NOTICE 'ok 32: Mitglied erneuert und beendet';
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated","is_anonymous":true}', true);

DO $$
DECLARE n integer;
BEGIN
  SELECT (SELECT count(*) FROM shopping_lists) + (SELECT count(*) FROM shopping_items)
       + (SELECT count(*) FROM shopping_categories)
       + (SELECT count(*) FROM packing_lists) + (SELECT count(*) FROM packing_items) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 33: nach Erneuern/Beenden sieht der Gast noch % Zeilen', n; END IF;
  BEGIN
    INSERT INTO shopping_items (household_id, list_id, name)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a1', 'Zu spät');
    RAISE EXCEPTION 'FAILED 33: Gast schreibt nach dem Erneuern';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM redeem_guest_link(current_setting('test.secret_la1'));
    RAISE EXCEPTION 'FAILED 33: alter Link nach Erneuern gültig';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_guest_link' THEN RAISE EXCEPTION 'FAILED 33: Meldung %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM redeem_guest_link(current_setting('test.secret_pa1'));
    RAISE EXCEPTION 'FAILED 33: beendeter Link gültig';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_guest_link' THEN RAISE EXCEPTION 'FAILED 33: Meldung %', SQLERRM; END IF;
  END;
  PERFORM redeem_guest_link(current_setting('test.secret_la1_neu'));
  IF (SELECT count(*) FROM shopping_items) <> 1 THEN RAISE EXCEPTION 'FAILED 33: neuer Link öffnet nichts'; END IF;
  RAISE NOTICE 'ok 33: erneuerter oder beendeter Link gewährt nichts mehr, der neue schon';
END $$;

-- Mitglieder lösen keine Gastlinks ein.
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM redeem_guest_link(current_setting('test.secret_la1_neu'));
    RAISE EXCEPTION 'FAILED 34: Mitglied aus HB löst Gastlink ein';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'not_a_guest' THEN RAISE EXCEPTION 'FAILED 34: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 34: nur anonyme Sitzungen lösen Gastlinks ein';
END $$;

-- Eine gelöschte Liste nimmt ihre Freigabe mit.
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

DO $$
BEGIN
  DELETE FROM todo_lists WHERE list_id = '7a000000-0000-0000-0000-0000000000a1';
  IF EXISTS (SELECT 1 FROM guest_shares WHERE target_id = '7a000000-0000-0000-0000-0000000000a1') THEN
    RAISE EXCEPTION 'FAILED 35: Freigabe überlebt die gelöschte Liste';
  END IF;
  RAISE NOTICE 'ok 35: Liste gelöscht → Freigabe weg';
END $$;

-- Nicht angemeldet erreicht niemand Freigaben oder Gastlink-RPCs.
SELECT set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'SELECT create_guest_share(''shopping_list'', ''5a000000-0000-0000-0000-0000000000a1'')',
    'SELECT renew_guest_share(''5a000000-0000-0000-0000-0000000000a1'')',
    'SELECT end_guest_share(''5a000000-0000-0000-0000-0000000000a1'')',
    'SELECT redeem_guest_link(''x'')',
    'SELECT guest_target_household(''shopping_list'', ''5a000000-0000-0000-0000-0000000000a1'')',
    'SELECT count(*) FROM guest_shares'
  ] LOOP
    BEGIN
      EXECUTE f;
      RAISE EXCEPTION 'FAILED 36: anon darf: %', f;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RAISE NOTICE 'ok 36: anon erreicht weder Freigaben noch Gastlink-RPCs';
END $$;

RESET ROLE;

ROLLBACK;
