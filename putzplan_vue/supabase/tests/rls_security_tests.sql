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
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 44: A2 kann die Ausgabe von A nicht ändern'; END IF;
  UPDATE pot_repayments SET amount_cents = 500, updated_by_participant_id = pa2
  WHERE repayment_id = 'ffffffff-0000-0000-0000-0000000000a8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 44: A2 kann die Rückzahlung von A nicht ändern'; END IF;

  SELECT * INTO e FROM pot_expenses WHERE expense_id = 'eeeeeeee-0000-0000-0000-0000000000a8';
  IF e.updated_by_participant_id IS DISTINCT FROM pa2 THEN
    RAISE EXCEPTION 'FAILED 44: „zuletzt geändert von“ nicht A2';
  END IF;
  SELECT * INTO r FROM pot_repayments WHERE repayment_id = 'ffffffff-0000-0000-0000-0000000000a8';

  DELETE FROM pot_expenses WHERE expense_id = 'eeeeeeee-0000-0000-0000-0000000000a8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 44: A2 kann die Ausgabe von A nicht löschen'; END IF;
  DELETE FROM pot_repayments WHERE repayment_id = 'ffffffff-0000-0000-0000-0000000000a8';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 44: A2 kann die Rückzahlung von A nicht löschen'; END IF;

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
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 44: gelöschte Ausgabe nicht unverändert wiederhergestellt'; END IF;
  SELECT count(*) INTO n FROM pot_repayments
  WHERE repayment_id = r.repayment_id AND created_at = r.created_at AND amount_cents = 500;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 44: gelöschte Rückzahlung nicht wiederhergestellt'; END IF;
  RAISE NOTICE 'ok 44: Mitglied ändert und löscht fremde Einträge, Rückgängig stellt sie wieder her';
END $$;

SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- -----------------------------------------------------------------
-- Ereignistöpfe (ab 50): anlegen, Teilnehmer eintragen, abschließen,
-- wieder öffnen, löschen. Weiter als A in HA (A, A2, C, A3).
-- -----------------------------------------------------------------

-- Anlegen per RPC: Topf und Teilnehmer in einem Zug, Mitglieder mit ihrem
-- Anzeigenamen, weitere per Namen.
DO $$
DECLARE
  n integer;
  v_pot pots;
BEGIN
  SELECT * INTO v_pot FROM create_event_pot(
    '50000000-0000-0000-0000-00000000000a', 'Urlaub Sylt',
    ARRAY['a0000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-0000000000a2']::uuid[],
    ARRAY['Kim']);
  IF v_pot.pot_id IS DISTINCT FROM '50000000-0000-0000-0000-00000000000a' OR v_pot.kind <> 'event'
     OR v_pot.closed_at IS NOT NULL OR v_pot.household_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     OR v_pot.created_by IS DISTINCT FROM 'a0000000-0000-0000-0000-00000000000a' THEN
    RAISE EXCEPTION 'FAILED 50: Topf falsch angelegt: %', v_pot;
  END IF;
  SELECT count(*) INTO n FROM pot_participants WHERE pot_id = v_pot.pot_id;
  IF n <> 3 THEN RAISE EXCEPTION 'FAILED 50: % Teilnehmer (erwartet 3)', n; END IF;
  SELECT count(*) INTO n FROM pot_participants
  WHERE pot_id = v_pot.pot_id AND user_id = 'a2000000-0000-0000-0000-0000000000a2' AND name = 'A2';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 50: Mitglied A2 nicht mit Anzeigenamen eingetragen'; END IF;
  SELECT count(*) INTO n FROM pot_participants WHERE pot_id = v_pot.pot_id AND name = 'Kim' AND user_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 50: Kim nicht eingetragen'; END IF;

  BEGIN
    PERFORM create_event_pot(gen_random_uuid(), 'Doppelt', ARRAY[]::uuid[], ARRAY['Kim', 'kim']);
    RAISE EXCEPTION 'FAILED 50: doppelter Name beim Anlegen angenommen';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM create_event_pot(gen_random_uuid(), 'Mit Fremdem',
      ARRAY['b0000000-0000-0000-0000-00000000000b']::uuid[], ARRAY[]::text[]);
    RAISE EXCEPTION 'FAILED 50: Mitglied eines fremden Haushalts als Teilnehmer angenommen';
  EXCEPTION WHEN raise_exception OR check_violation OR invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM create_event_pot(gen_random_uuid(), '', ARRAY[]::uuid[], ARRAY['Kim']);
    RAISE EXCEPTION 'FAILED 50: leerer Topfname angenommen';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM create_event_pot(gen_random_uuid(), 'Ohne Leute', ARRAY[]::uuid[], ARRAY[]::text[]);
    RAISE EXCEPTION 'FAILED 50: Topf ohne Teilnehmer angenommen';
  EXCEPTION WHEN raise_exception OR check_violation OR invalid_parameter_value THEN NULL;
  END;
  -- Nichts von den abgewiesenen Versuchen bleibt liegen.
  SELECT count(*) INTO n FROM pots WHERE kind = 'event';
  IF n <> 2 THEN RAISE EXCEPTION 'FAILED 50: % Ereignistöpfe (erwartet 2)', n; END IF;
  -- Direkt anlegen geht nicht, nur per RPC.
  BEGIN
    INSERT INTO pots (household_id, name, kind) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Direkt', 'event');
    RAISE EXCEPTION 'FAILED 50: Ereignistopf direkt angelegt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 50: Ereignistopf mit Mitgliedern und Namen angelegt, Ungültiges abgewiesen';
END $$;

-- Teilnehmer per Namen nachtragen: nur in offene Ereignistöpfe des eigenen
-- Hauses, Name eindeutig ohne Groß-/Kleinschreibung, nur eigene Mitglieder.
DO $$
DECLARE n integer;
BEGIN
  INSERT INTO pot_participants (pot_id, household_id, name)
  VALUES ('50000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea');
  BEGIN
    INSERT INTO pot_participants (pot_id, household_id, name)
    VALUES ('50000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LEA');
    RAISE EXCEPTION 'FAILED 51: doppelter Name LEA angenommen';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO pot_participants (pot_id, household_id, name)
    SELECT pot_id, household_id, 'Gast' FROM pots WHERE kind = 'household';
    RAISE EXCEPTION 'FAILED 51: Gast in den Haushaltstopf eingetragen';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO pot_participants (pot_id, household_id, name, user_id)
    VALUES ('50000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'B',
            'b0000000-0000-0000-0000-00000000000b');
    RAISE EXCEPTION 'FAILED 51: Mitglied eines fremden Haushalts als Teilnehmer eingetragen';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO pot_participants (pot_id, household_id, name, user_id)
  VALUES ('50000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'C',
          'c0000000-0000-0000-0000-00000000000c');
  SELECT count(*) INTO n FROM pot_participants WHERE pot_id = '50000000-0000-0000-0000-00000000000a';
  IF n <> 5 THEN RAISE EXCEPTION 'FAILED 51: % Teilnehmer (erwartet 5)', n; END IF;
  RAISE NOTICE 'ok 51: Teilnehmer per Namen nachgetragen, doppelt und fremd abgewiesen';
END $$;

-- Abschließen macht den Topf samt Teilnehmern und Einträgen schreibgeschützt;
-- wieder öffnen hebt das auf. Nur `closed_at` ist änderbar.
DO $$
DECLARE
  n integer;
  pa uuid := (SELECT participant_id FROM pot_participants
              WHERE pot_id = '50000000-0000-0000-0000-00000000000a' AND user_id = 'a0000000-0000-0000-0000-00000000000a');
  pk uuid := (SELECT participant_id FROM pot_participants
              WHERE pot_id = '50000000-0000-0000-0000-00000000000a' AND name = 'Kim');
BEGIN
  INSERT INTO pot_expenses (expense_id, pot_id, household_id, payer_participant_id, amount_cents, description,
                            split_kind, split_values)
  VALUES ('e5000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pa, 3000, 'Fähre', 'equal', jsonb_build_object(pa::text, 1, pk::text, 1));
  INSERT INTO pot_repayments (repayment_id, pot_id, household_id, from_participant_id, to_participant_id, amount_cents)
  VALUES ('f5000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-00000000000a',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pk, pa, 1000);

  UPDATE pots SET closed_at = now() WHERE pot_id = '50000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 52: Ereignistopf nicht abschließbar'; END IF;

  BEGIN
    INSERT INTO pot_participants (pot_id, household_id, name)
    VALUES ('50000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nachzügler');
    RAISE EXCEPTION 'FAILED 52: Teilnehmer in abgeschlossenen Topf eingetragen';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE pot_participants SET name = 'Kimberly' WHERE participant_id = pk;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 52: Teilnehmer in abgeschlossenem Topf umbenannt'; END IF;
  DELETE FROM pot_participants WHERE participant_id = pk;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 52: Teilnehmer aus abgeschlossenem Topf entfernt'; END IF;
  UPDATE pot_repayments SET amount_cents = 1 WHERE repayment_id = 'f5000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 52: Rückzahlung in abgeschlossenem Topf geändert'; END IF;
  DELETE FROM pot_repayments WHERE repayment_id = 'f5000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 52: Rückzahlung in abgeschlossenem Topf gelöscht'; END IF;
  UPDATE pot_expenses SET amount_cents = 1 WHERE expense_id = 'e5000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 52: Ausgabe in abgeschlossenem Topf geändert'; END IF;
  BEGIN
    UPDATE pots SET name = 'Umbenannt' WHERE pot_id = '50000000-0000-0000-0000-00000000000a';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAILED 52: abgeschlossener Topf umbenannt'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE pots SET kind = 'household', household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    WHERE pot_id = '50000000-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'FAILED 52: Art oder Haushalt eines Topfs geändert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE pots SET closed_at = NULL WHERE pot_id = '50000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 52: abgeschlossener Topf nicht wieder zu öffnen'; END IF;
  UPDATE pot_repayments SET amount_cents = 1500 WHERE repayment_id = 'f5000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 52: wieder geöffneter Topf nimmt nichts an'; END IF;
  RAISE NOTICE 'ok 52: abschließen sperrt Teilnehmer, Ausgaben, Rückzahlungen; wieder öffnen entsperrt';
END $$;

-- Ein fremder Haushalt schließt und öffnet nichts; der Haushaltstopf wird nie
-- abgeschlossen (26), die Ereignistöpfe lassen sich löschen — offen wie
-- abgeschlossen, samt Teilnehmern und Einträgen.
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

DO $$
DECLARE n integer;
BEGIN
  UPDATE pots SET closed_at = now() WHERE pot_id = '50000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 53: B schließt Topf von HA ab'; END IF;
  UPDATE pots SET closed_at = NULL WHERE pot_id = '99999999-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 53: B öffnet Topf von HA wieder'; END IF;
  BEGIN
    PERFORM create_event_pot(gen_random_uuid(), 'B in A', ARRAY['a0000000-0000-0000-0000-00000000000a']::uuid[],
                             ARRAY[]::text[]);
    RAISE EXCEPTION 'FAILED 53: B legt Topf mit Mitglied aus HA an';
  EXCEPTION WHEN raise_exception OR check_violation OR invalid_parameter_value THEN NULL;
  END;
  RAISE NOTICE 'ok 53: fremder Haushalt schließt, öffnet und belegt nichts';
END $$;

SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

DO $$
DECLARE n integer;
BEGIN
  DELETE FROM pots WHERE pot_id IN ('50000000-0000-0000-0000-00000000000a', '99999999-0000-0000-0000-00000000000a');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'FAILED 54: % Ereignistöpfe gelöscht (erwartet 2)', n; END IF;
  SELECT count(*) INTO n FROM pot_participants
  WHERE pot_id IN ('50000000-0000-0000-0000-00000000000a', '99999999-0000-0000-0000-00000000000a');
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 54: Teilnehmer gelöschter Töpfe übrig'; END IF;
  SELECT count(*) INTO n FROM pot_expenses
  WHERE pot_id IN ('50000000-0000-0000-0000-00000000000a', '99999999-0000-0000-0000-00000000000a');
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 54: Ausgaben gelöschter Töpfe übrig'; END IF;
  SELECT count(*) INTO n FROM pots WHERE kind = 'household';
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 54: Haushaltstopf weg'; END IF;
  RAISE NOTICE 'ok 54: Ereignistöpfe samt Inhalt löschbar, offen wie abgeschlossen';
END $$;

-- Ohne Haushalt (C ist in 06 beigetreten; D hat einen eigenen) — eine
-- anonyme Sitzung legt keinen Topf an.
RESET ROLE;
INSERT INTO auth.users (id, is_anonymous) VALUES ('e5000000-0000-0000-0000-00000000000e', true);
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"e5000000-0000-0000-0000-00000000000e","role":"authenticated","is_anonymous":true}', true);

DO $$
BEGIN
  BEGIN
    PERFORM create_event_pot(gen_random_uuid(), 'Gasttopf', ARRAY[]::uuid[], ARRAY['Gast']);
    RAISE EXCEPTION 'FAILED 55: anonyme Sitzung legt Topf an';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 55: anonyme Sitzung legt keinen Topf an';
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
    'SELECT create_event_pot(gen_random_uuid(), ''x'', ARRAY[]::uuid[], ARRAY[''y''])',
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
    RAISE EXCEPTION 'FAILED 28: Gast legt Haushalt an';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'anonymous_not_allowed' THEN RAISE EXCEPTION 'FAILED 28: Meldung %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM join_household('TESTAAAA', 'E');
    RAISE EXCEPTION 'FAILED 28: Gast tritt Haushalt bei';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'anonymous_not_allowed' THEN RAISE EXCEPTION 'FAILED 28: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 28: Gast kann keinen Haushalt anlegen und keinem beitreten';
END $$;

-- Auch ohne die RPCs: keine Mitgliedschaft für ein anonymes Konto, egal auf
-- welchem Weg (hier als Eigentümer, an RLS vorbei).
RESET ROLE;

DO $$
BEGIN
  BEGIN
    INSERT INTO household_members (user_id, household_id, display_name)
    VALUES ('e0000000-0000-0000-0000-00000000000e', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'E');
    RAISE EXCEPTION 'FAILED 29: anonymes Konto als Mitglied eingetragen';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'anonymous_not_allowed' THEN RAISE EXCEPTION 'FAILED 29: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 29: Mitgliedschaft für anonyme Konten auf keinem Weg';
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
    RAISE EXCEPTION 'FAILED 30: Freigabe %', s;
  END IF;
  s2 := create_guest_share('shopping_list', '5a000000-0000-0000-0000-0000000000a1');
  IF s2.share_id <> s.share_id OR s2.secret <> s.secret THEN
    RAISE EXCEPTION 'FAILED 30: zweites Teilen legt eine zweite Freigabe an';
  END IF;
  PERFORM set_config('test.secret_la1', s.secret, true);
  PERFORM set_config('test.share_la1', s.share_id::text, true);
  s := create_guest_share('packing_list', '9a000000-0000-0000-0000-0000000000a1');
  PERFORM set_config('test.secret_pa1', s.secret, true);
  PERFORM set_config('test.share_pa1', s.share_id::text, true);
  s := create_guest_share('todo_list', '7a000000-0000-0000-0000-0000000000a1');
  BEGIN
    PERFORM create_guest_share('shopping_list', '5b000000-0000-0000-0000-0000000000b1');
    RAISE EXCEPTION 'FAILED 30: A teilt eine Liste aus HB';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'share_target_not_found' THEN RAISE EXCEPTION 'FAILED 30: Meldung %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM create_guest_share('shopping_list', '9a000000-0000-0000-0000-0000000000a1');
    RAISE EXCEPTION 'FAILED 30: Packliste als Einkaufsliste geteilt';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'share_target_not_found' THEN RAISE EXCEPTION 'FAILED 30: Meldung %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM create_guest_share('household', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAILED 30: unbekannte Zielart angenommen';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (SELECT count(*) FROM guest_shares) <> 3 THEN
    RAISE EXCEPTION 'FAILED 30: A sieht % Freigaben (erwartet 3)', (SELECT count(*) FROM guest_shares);
  END IF;
  RAISE NOTICE 'ok 30: Mitglied teilt jede Listenart genau einmal, nur im eigenen Haushalt';
END $$;

-- -----------------------------------------------------------------
-- Als B (Mitglied HB): fremde Freigaben
-- -----------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM guest_shares) <> 0 THEN RAISE EXCEPTION 'FAILED 31: B sieht Freigaben aus HA'; END IF;
  BEGIN
    PERFORM renew_guest_share(current_setting('test.share_la1')::uuid);
    RAISE EXCEPTION 'FAILED 31: B erneuert Freigabe aus HA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'share_not_found' THEN RAISE EXCEPTION 'FAILED 31: Meldung %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM end_guest_share(current_setting('test.share_la1')::uuid);
    RAISE EXCEPTION 'FAILED 31: B beendet Freigabe aus HA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'share_not_found' THEN RAISE EXCEPTION 'FAILED 31: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 31: fremde Freigaben unsichtbar und nicht verwaltbar';
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
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 32: Gast sieht vor dem Einlösen % Zeilen', n; END IF;
  BEGIN
    PERFORM redeem_guest_link('falsch');
    RAISE EXCEPTION 'FAILED 32: falsches Geheimnis eingelöst';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_guest_link' THEN RAISE EXCEPTION 'FAILED 32: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 32: ohne eingelösten Link sieht der Gast nichts';
END $$;

DO $$
DECLARE r record; n integer;
BEGIN
  SELECT * INTO r FROM redeem_guest_link(current_setting('test.secret_la1'));
  IF r.target_kind <> 'shopping_list' OR r.target_id <> '5a000000-0000-0000-0000-0000000000a1'
     OR r.household_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' OR r.household_name <> 'Haushalt A' THEN
    RAISE EXCEPTION 'FAILED 33: Einlösen liefert %', r;
  END IF;
  -- Zweimal einlösen schadet nicht (Neuladen der Seite).
  PERFORM redeem_guest_link(current_setting('test.secret_la1'));

  SELECT count(*) INTO n FROM shopping_lists;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 33: Gast sieht % Einkaufslisten (erwartet 1)', n; END IF;
  SELECT count(*) INTO n FROM shopping_items;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 33: Gast sieht % Artikel (erwartet 1)', n; END IF;
  SELECT count(*) INTO n FROM shopping_categories;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 33: Gast sieht % Kategorien (erwartet 1)', n; END IF;
  SELECT (SELECT count(*) FROM households) + (SELECT count(*) FROM household_members)
       + (SELECT count(*) FROM tasks) + (SELECT count(*) FROM task_completions)
       + (SELECT count(*) FROM notes) + (SELECT count(*) FROM settlements)
       + (SELECT count(*) FROM point_benchmarks)
       + (SELECT count(*) FROM packing_lists) + (SELECT count(*) FROM packing_items)
       + (SELECT count(*) FROM packing_categories)
       + (SELECT count(*) FROM todo_lists) + (SELECT count(*) FROM todo_items)
       + (SELECT count(*) FROM todo_categories)
       + (SELECT count(*) FROM pots) + (SELECT count(*) FROM pot_participants)
       + (SELECT count(*) FROM pot_expenses) + (SELECT count(*) FROM pot_repayments)
       + (SELECT count(*) FROM guest_shares) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 33: Gast sieht % fremde Zeilen', n; END IF;
  BEGIN
    PERFORM count(*) FROM guest_grants;
    RAISE EXCEPTION 'FAILED 33: Gast liest guest_grants';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 33: eingelöster Link öffnet genau diese Liste und nichts sonst';
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
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED 34: Gast kann Eintrag nicht ändern'; END IF;
  DELETE FROM shopping_items WHERE shopping_item_id = '51000000-0000-0000-0000-0000000000e1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 34: Gast kann Eintrag nicht löschen'; END IF;
  INSERT INTO shopping_categories (category_id, household_id, list_id, name)
  VALUES ('5c000000-0000-0000-0000-0000000000e1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a1', 'Brot');
  UPDATE shopping_categories SET sort_order = 3 WHERE category_id = '5c000000-0000-0000-0000-0000000000e1';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED 34: Gast kann Kategorie nicht einsortieren'; END IF;
  DELETE FROM shopping_categories WHERE category_id = '5c000000-0000-0000-0000-0000000000e1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 34: Gast kann Kategorie nicht löschen'; END IF;
  RAISE NOTICE 'ok 34: Gast schreibt Einträge und Kategorien der geteilten Liste';
END $$;

DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO shopping_items (household_id, list_id, name)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a2', 'Einbruch');
    RAISE EXCEPTION 'FAILED 35: Gast schreibt in nicht geteilte Liste';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO shopping_items (household_id, list_id, name)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '5a000000-0000-0000-0000-0000000000a1', 'Falscher Haushalt');
    RAISE EXCEPTION 'FAILED 35: Gast schreibt Zeile mit fremder household_id';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE shopping_items SET list_id = '5a000000-0000-0000-0000-0000000000a2'
    WHERE shopping_item_id = '51000000-0000-0000-0000-0000000000a1';
    RAISE EXCEPTION 'FAILED 35: Gast verschiebt Eintrag in nicht geteilte Liste';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO shopping_categories (household_id, list_id, name)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a2', 'Einbruch');
    RAISE EXCEPTION 'FAILED 35: Gast legt Kategorie in nicht geteilter Liste an';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE shopping_items SET name = 'gehackt' WHERE shopping_item_id = '51000000-0000-0000-0000-0000000000a2';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 35: Gast ändert Eintrag einer nicht geteilten Liste'; END IF;
  UPDATE shopping_lists SET name = 'Umbenannt' WHERE list_id = '5a000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 35: Gast benennt die Liste um'; END IF;
  DELETE FROM shopping_lists WHERE list_id = '5a000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 35: Gast löscht die Liste'; END IF;
  BEGIN
    INSERT INTO shopping_lists (household_id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Neu');
    RAISE EXCEPTION 'FAILED 35: Gast legt Liste an';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 35: Gast bleibt in der geteilten Liste, die Liste selbst ist schreibgeschützt';
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM create_guest_share('shopping_list', '5a000000-0000-0000-0000-0000000000a2');
    RAISE EXCEPTION 'FAILED 36: Gast teilt eine Liste';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM renew_guest_share(current_setting('test.share_la1')::uuid);
    RAISE EXCEPTION 'FAILED 36: Gast erneuert den Link';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM end_guest_share(current_setting('test.share_la1')::uuid);
    RAISE EXCEPTION 'FAILED 36: Gast beendet die Freigabe';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 36: Gast verwaltet keine Freigaben';
END $$;

-- Packliste: Einträge ohne eigene household_id, Zugriff über die Liste.
DO $$
DECLARE n integer;
BEGIN
  PERFORM redeem_guest_link(current_setting('test.secret_pa1'));
  SELECT count(*) INTO n FROM packing_items;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 37: Gast sieht % Packeinträge (erwartet 1)', n; END IF;
  INSERT INTO packing_items (list_id, name, created_by)
  VALUES ('9a000000-0000-0000-0000-0000000000a1', 'Schlafsack', 'e0000000-0000-0000-0000-00000000000e');
  UPDATE packing_items SET packed = true WHERE item_id = '91000000-0000-0000-0000-0000000000a1';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED 37: Gast hakt Packeintrag nicht ab'; END IF;
  BEGIN
    INSERT INTO packing_items (list_id, name) VALUES ('9a000000-0000-0000-0000-0000000000a2', 'Einbruch');
    RAISE EXCEPTION 'FAILED 37: Gast schreibt in nicht geteilte Packliste';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE packing_items SET list_id = '9a000000-0000-0000-0000-0000000000a2'
    WHERE item_id = '91000000-0000-0000-0000-0000000000a1';
    RAISE EXCEPTION 'FAILED 37: Gast verschiebt Packeintrag';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT count(*) FROM todo_lists) <> 0 THEN RAISE EXCEPTION 'FAILED 37: Gast sieht To-do-Liste'; END IF;
  RAISE NOTICE 'ok 37: Packliste per Link, To-do-Liste ohne Link unsichtbar';
END $$;

-- Ein zweiter Gast mit demselben Link sieht dasselbe; ohne Link nichts.
SELECT set_config('request.jwt.claims', '{"sub":"e2000000-0000-0000-0000-0000000000e2","role":"authenticated","is_anonymous":true}', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM shopping_items) <> 0 THEN RAISE EXCEPTION 'FAILED 38: E2 erbt die Gewährung von E'; END IF;
  PERFORM redeem_guest_link(current_setting('test.secret_la1'));
  IF (SELECT count(*) FROM shopping_items) <> 1 THEN RAISE EXCEPTION 'FAILED 38: E2 sieht die Liste nicht'; END IF;
  RAISE NOTICE 'ok 38: jede Sitzung braucht den Link selbst';
END $$;

-- -----------------------------------------------------------------
-- Als A: erneuern und beenden
-- -----------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

DO $$
DECLARE s guest_shares;
BEGIN
  s := renew_guest_share(current_setting('test.share_la1')::uuid);
  IF s.secret = current_setting('test.secret_la1') THEN RAISE EXCEPTION 'FAILED 39: Geheimnis unverändert'; END IF;
  PERFORM set_config('test.secret_la1_neu', s.secret, true);
  PERFORM end_guest_share(current_setting('test.share_pa1')::uuid);
  IF (SELECT count(*) FROM guest_shares) <> 2 THEN RAISE EXCEPTION 'FAILED 39: Freigabe nicht beendet'; END IF;
  RAISE NOTICE 'ok 39: Mitglied erneuert und beendet';
END $$;

SELECT set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated","is_anonymous":true}', true);

DO $$
DECLARE n integer;
BEGIN
  SELECT (SELECT count(*) FROM shopping_lists) + (SELECT count(*) FROM shopping_items)
       + (SELECT count(*) FROM shopping_categories)
       + (SELECT count(*) FROM packing_lists) + (SELECT count(*) FROM packing_items) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 40: nach Erneuern/Beenden sieht der Gast noch % Zeilen', n; END IF;
  BEGIN
    INSERT INTO shopping_items (household_id, list_id, name)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-0000000000a1', 'Zu spät');
    RAISE EXCEPTION 'FAILED 40: Gast schreibt nach dem Erneuern';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM redeem_guest_link(current_setting('test.secret_la1'));
    RAISE EXCEPTION 'FAILED 40: alter Link nach Erneuern gültig';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_guest_link' THEN RAISE EXCEPTION 'FAILED 40: Meldung %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM redeem_guest_link(current_setting('test.secret_pa1'));
    RAISE EXCEPTION 'FAILED 40: beendeter Link gültig';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_guest_link' THEN RAISE EXCEPTION 'FAILED 40: Meldung %', SQLERRM; END IF;
  END;
  PERFORM redeem_guest_link(current_setting('test.secret_la1_neu'));
  IF (SELECT count(*) FROM shopping_items) <> 1 THEN RAISE EXCEPTION 'FAILED 40: neuer Link öffnet nichts'; END IF;
  RAISE NOTICE 'ok 40: erneuerter oder beendeter Link gewährt nichts mehr, der neue schon';
END $$;

-- Mitglieder lösen keine Gastlinks ein.
SELECT set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM redeem_guest_link(current_setting('test.secret_la1_neu'));
    RAISE EXCEPTION 'FAILED 41: Mitglied aus HB löst Gastlink ein';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'not_a_guest' THEN RAISE EXCEPTION 'FAILED 41: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 41: nur anonyme Sitzungen lösen Gastlinks ein';
END $$;

-- Eine gelöschte Liste nimmt ihre Freigabe mit.
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

DO $$
BEGIN
  DELETE FROM todo_lists WHERE list_id = '7a000000-0000-0000-0000-0000000000a1';
  IF EXISTS (SELECT 1 FROM guest_shares WHERE target_id = '7a000000-0000-0000-0000-0000000000a1') THEN
    RAISE EXCEPTION 'FAILED 42: Freigabe überlebt die gelöschte Liste';
  END IF;
  RAISE NOTICE 'ok 42: Liste gelöscht → Freigabe weg';
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
      RAISE EXCEPTION 'FAILED 43: anon darf: %', f;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RAISE NOTICE 'ok 43: anon erreicht weder Freigaben noch Gastlink-RPCs';
END $$;

RESET ROLE;

-- =================================================================
-- Verrechnen mit dem Haushaltstopf (CONTEXT.md § Ausgleich)
-- =================================================================
-- Eine Datenbank-Funktion legt den Ausgleich (Punkte, Art 'pot') und die
-- Rückzahlung im Haushaltstopf (Euro) an — beides oder nichts. Wer in der
-- Bilanz hinten liegt (from) und im Topf gut hat, bekommt die Rückzahlung:
-- sie läuft vom Ausgleichs-Empfänger (to) an ihn.
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

DO $$
DECLARE
  s settlements;
  r pot_repayments;
  n integer;
BEGIN
  s := settle_with_household_pot('a0000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-0000000000a2',
                                 4, 250, 'Kino', '2026-11-20 10:00+01');
  IF s.method <> 'pot' OR s.points_settled <> 4 OR s.paid_euros <> 2.50
     OR s.created_by <> 'a0000000-0000-0000-0000-00000000000a'
     OR s.household_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN
    RAISE EXCEPTION 'FAILED 60: Ausgleich falsch angelegt: %', s;
  END IF;
  SELECT count(*) INTO n FROM pot_repayments WHERE settlement_id = s.settlement_id;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 60: % Rückzahlungen zum Ausgleich (erwartet 1)', n; END IF;
  SELECT * INTO r FROM pot_repayments WHERE settlement_id = s.settlement_id;
  IF r.amount_cents <> 250 OR r.paid_on <> '2026-11-20' THEN
    RAISE EXCEPTION 'FAILED 60: Rückzahlung falsch: %', r;
  END IF;
  IF (SELECT kind FROM pots WHERE pot_id = r.pot_id) <> 'household'
     OR r.household_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN
    RAISE EXCEPTION 'FAILED 60: Rückzahlung nicht im Haushaltstopf';
  END IF;
  IF (SELECT user_id FROM pot_participants WHERE participant_id = r.from_participant_id)
       <> 'a2000000-0000-0000-0000-0000000000a2'
     OR (SELECT user_id FROM pot_participants WHERE participant_id = r.to_participant_id)
       <> 'a0000000-0000-0000-0000-00000000000a'
     OR (SELECT user_id FROM pot_participants WHERE participant_id = r.updated_by_participant_id)
       <> 'a0000000-0000-0000-0000-00000000000a' THEN
    RAISE EXCEPTION 'FAILED 60: Rückzahlung in falscher Richtung oder falscher Bearbeiter';
  END IF;
  SELECT count(*) INTO n FROM pot_repayments WHERE pot_id = '99999999-0000-0000-0000-00000000000a';
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 60: Ereignistopf verrechnet'; END IF;
  RAISE NOTICE 'ok 60: verrechnen legt Ausgleich und Rückzahlung im Haushaltstopf zusammen an';
END $$;

-- Beides oder nichts: die Rückzahlung scheitert (Betrag über ihrem Limit,
-- für den Ausgleich noch gültig) → auch kein Ausgleich.
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    PERFORM settle_with_household_pot('a0000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-0000000000a2',
                                      3, 100000000, 'Atomar', now());
    RAISE EXCEPTION 'FAILED 61: zu große Rückzahlung angenommen';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SELECT count(*) INTO n FROM settlements WHERE description = 'Atomar';
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 61: Ausgleich ohne Rückzahlung angelegt'; END IF;
  SELECT count(*) INTO n FROM pot_repayments WHERE amount_cents = 100000000;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 61: Rückzahlung ohne Ausgleich angelegt'; END IF;
  RAISE NOTICE 'ok 61: Ausgleich und Rückzahlung entstehen gemeinsam oder gar nicht';
END $$;

-- An der Funktion vorbei geht es nicht: kein Ausgleich der Art 'pot'
-- direkt, keine Rückzahlung, die sich an einen Ausgleich hängt, und eine
-- verknüpfte Rückzahlung lässt sich weder ändern noch allein löschen.
DO $$
DECLARE
  v_settlement uuid;
  v_repayment uuid;
  n integer;
BEGIN
  SELECT settlement_id INTO v_settlement FROM settlements WHERE description = 'Kino';
  SELECT repayment_id INTO v_repayment FROM pot_repayments WHERE settlement_id = v_settlement;
  BEGIN
    INSERT INTO settlements (household_id, from_user_id, to_user_id, points_settled, method, paid_euros, created_by)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-00000000000a',
            'a2000000-0000-0000-0000-0000000000a2', 2, 'pot', 1, 'a0000000-0000-0000-0000-00000000000a');
    RAISE EXCEPTION 'FAILED 62: Ausgleich der Art pot ohne Rückzahlung angelegt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO pot_repayments (pot_id, household_id, from_participant_id, to_participant_id, amount_cents, settlement_id)
    SELECT pot_id, household_id, to_participant_id, from_participant_id, 100,
           (SELECT settlement_id FROM settlements WHERE method = 'money' LIMIT 1)
    FROM pot_repayments WHERE repayment_id = v_repayment;
    RAISE EXCEPTION 'FAILED 62: Rückzahlung an einen Ausgleich gehängt';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'repayment_settlement_mismatch' THEN RAISE EXCEPTION 'FAILED 62: Meldung %', SQLERRM; END IF;
  END;
  -- Eine ganze Zeile mit settlement_id = null (Rückgängig legt sie so neu an) geht.
  INSERT INTO pot_repayments (pot_id, household_id, from_participant_id, to_participant_id, amount_cents, settlement_id)
  SELECT pot_id, household_id, to_participant_id, from_participant_id, 100, NULL
  FROM pot_repayments WHERE repayment_id = v_repayment;
  BEGIN
    UPDATE pot_repayments SET amount_cents = 1 WHERE repayment_id = v_repayment;
    RAISE EXCEPTION 'FAILED 62: verknüpfte Rückzahlung geändert';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM pot_repayments WHERE repayment_id = v_repayment;
    RAISE EXCEPTION 'FAILED 62: verknüpfte Rückzahlung allein gelöscht';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Löscht die Anlegerin den Ausgleich (5-Minuten-Fenster), geht die
  -- Rückzahlung mit.
  DELETE FROM settlements WHERE settlement_id = v_settlement;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED 62: eigener Ausgleich nicht löschbar'; END IF;
  SELECT count(*) INTO n FROM pot_repayments WHERE repayment_id = v_repayment;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED 62: Rückzahlung überlebt den gelöschten Ausgleich'; END IF;
  RAISE NOTICE 'ok 62: verrechnen nur über die Funktion, gelöschter Ausgleich nimmt die Rückzahlung mit';
END $$;

-- Nur Mitglieder, nur im eigenen Haushalt: B (HB) nicht für HA, kein Gast.
SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM settle_with_household_pot('a0000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-0000000000a2',
                                      1, 100, 'Fremd', now());
    RAISE EXCEPTION 'FAILED 63: B verrechnet in HA';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'settlement_party_not_in_household' THEN RAISE EXCEPTION 'FAILED 63: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 63: kein Verrechnen in einem fremden Haushalt';
END $$;

SELECT set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000e","role":"authenticated","is_anonymous":true}', true);

DO $$
BEGIN
  BEGIN
    PERFORM settle_with_household_pot('a0000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-0000000000a2',
                                      1, 100, 'Gast', now());
    RAISE EXCEPTION 'FAILED 64: Gast verrechnet';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'anonymous_not_allowed' THEN RAISE EXCEPTION 'FAILED 64: Meldung %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'ok 64: Gast verrechnet nicht';
END $$;

SELECT set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM settle_with_household_pot('a0000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-0000000000a2',
                                      1, 100, 'anon', now());
    RAISE EXCEPTION 'FAILED 65: anon verrechnet';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 65: anon erreicht das Verrechnen nicht';
END $$;

RESET ROLE;

ROLLBACK;
