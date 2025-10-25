-- =================================================================
-- RLS SECURITY TESTS
-- =================================================================
-- Tests cross-household data isolation
-- Run via: npx supabase test db --local
--
-- Tests:
-- 1. User A cannot see User B's tasks (cross-household blocked)
-- 2. User A can see own household tasks
-- 3. User A cannot create task for Household B
-- 4. User A cannot see User B's household members
-- 5. User A cannot delete User B's completions
-- =================================================================

BEGIN;

-- =================================================================
-- SETUP: Create test users and households
-- =================================================================

-- Create test users in auth schema
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'usera@test.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'userb@test.com', crypt('password', gen_salt('bf')), NOW(), NOW(), NOW());

-- Create two separate households
INSERT INTO households (household_id, name, invite_code)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Household A', 'CODE-AAA'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'Household B', 'CODE-BBB');

-- Add users to their respective households
INSERT INTO household_members (user_id, household_id, display_name)
VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'User A'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'User B');

-- Create tasks in each household
INSERT INTO tasks (task_id, household_id, title, effort, recurrence_days)
VALUES
  ('taska-11'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Task A1', 3, 0),
  ('taskb-11'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'Task B1', 2, 0);

-- Create completions
INSERT INTO task_completions (completion_id, task_id, user_id)
VALUES
  ('compa-11'::uuid, 'taska-11'::uuid, '11111111-1111-1111-1111-111111111111'::uuid),
  ('compb-11'::uuid, 'taskb-11'::uuid, '22222222-2222-2222-2222-222222222222'::uuid);

-- =================================================================
-- TEST 1: Cross-household task access blocked
-- =================================================================

-- Switch to User A
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111"}';

DO $$
DECLARE
  task_count INTEGER;
BEGIN
  -- User A tries to see User B's tasks
  SELECT COUNT(*) INTO task_count
  FROM tasks
  WHERE household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;

  IF task_count = 0 THEN
    RAISE NOTICE '✅ TEST 1 PASSED: Cross-household task access blocked';
  ELSE
    RAISE EXCEPTION '❌ TEST 1 FAILED: User A can see User B tasks! Count: %', task_count;
  END IF;
END $$;

-- =================================================================
-- TEST 2: Own household task access works
-- =================================================================

DO $$
DECLARE
  task_count INTEGER;
BEGIN
  -- User A sees own household tasks
  SELECT COUNT(*) INTO task_count
  FROM tasks
  WHERE household_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

  IF task_count = 1 THEN
    RAISE NOTICE '✅ TEST 2 PASSED: Own household task access works';
  ELSE
    RAISE EXCEPTION '❌ TEST 2 FAILED: Expected 1 task, got %', task_count;
  END IF;
END $$;

-- =================================================================
-- TEST 3: Cross-household task creation blocked
-- =================================================================

DO $$
BEGIN
  -- User A tries to create task in Household B
  INSERT INTO tasks (household_id, title, effort)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'Malicious Task', 1);

  RAISE EXCEPTION '❌ TEST 3 FAILED: User A created task in Household B!';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  RAISE NOTICE '✅ TEST 3 PASSED: Cross-household task creation blocked';
END $$;

-- =================================================================
-- TEST 4: Cross-household member visibility blocked
-- =================================================================

DO $$
DECLARE
  member_count INTEGER;
BEGIN
  -- User A tries to see User B (different household)
  SELECT COUNT(*) INTO member_count
  FROM household_members
  WHERE user_id = '22222222-2222-2222-2222-222222222222'::uuid;

  IF member_count = 0 THEN
    RAISE NOTICE '✅ TEST 4 PASSED: Cross-household member visibility blocked';
  ELSE
    RAISE EXCEPTION '❌ TEST 4 FAILED: User A can see User B member record! Count: %', member_count;
  END IF;
END $$;

-- =================================================================
-- TEST 5: Cross-household completion deletion blocked
-- =================================================================

DO $$
DECLARE
  rows_deleted INTEGER;
BEGIN
  -- User A tries to delete User B's completion
  DELETE FROM task_completions
  WHERE completion_id = 'compb-11'::uuid;

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  IF rows_deleted = 0 THEN
    RAISE NOTICE '✅ TEST 5 PASSED: Cross-household completion deletion blocked';
  ELSE
    RAISE EXCEPTION '❌ TEST 5 FAILED: User A deleted User B completion! Rows: %', rows_deleted;
  END IF;
END $$;

-- =================================================================
-- TEST 6: User can delete own completion
-- =================================================================

DO $$
DECLARE
  rows_deleted INTEGER;
BEGIN
  -- User A deletes own completion
  DELETE FROM task_completions
  WHERE completion_id = 'compa-11'::uuid;

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  IF rows_deleted = 1 THEN
    RAISE NOTICE '✅ TEST 6 PASSED: User can delete own completion';
  ELSE
    RAISE EXCEPTION '❌ TEST 6 FAILED: Expected 1 deleted, got %', rows_deleted;
  END IF;
END $$;

-- =================================================================
-- TEST 7: Public household SELECT (invite code lookup)
-- =================================================================

DO $$
DECLARE
  household_count INTEGER;
BEGIN
  -- User A can see ALL households (needed for invite code lookup)
  SELECT COUNT(*) INTO household_count
  FROM households;

  IF household_count >= 2 THEN
    RAISE NOTICE '✅ TEST 7 PASSED: Public household SELECT works (invite code lookup)';
  ELSE
    RAISE EXCEPTION '❌ TEST 7 FAILED: Expected >= 2 households, got %', household_count;
  END IF;
END $$;

ROLLBACK;

-- =================================================================
-- EXPECTED OUTPUT
-- =================================================================
-- NOTICE:  ✅ TEST 1 PASSED: Cross-household task access blocked
-- NOTICE:  ✅ TEST 2 PASSED: Own household task access works
-- NOTICE:  ✅ TEST 3 PASSED: Cross-household task creation blocked
-- NOTICE:  ✅ TEST 4 PASSED: Cross-household member visibility blocked
-- NOTICE:  ✅ TEST 5 PASSED: Cross-household completion deletion blocked
-- NOTICE:  ✅ TEST 6 PASSED: User can delete own completion
-- NOTICE:  ✅ TEST 7 PASSED: Public household SELECT works (invite code lookup)
-- ROLLBACK
