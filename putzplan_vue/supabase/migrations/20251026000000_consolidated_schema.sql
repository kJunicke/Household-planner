-- =================================================================
-- CONSOLIDATED SCHEMA - Putzplan Database
-- =================================================================
-- Consolidated from 29 migrations on 2025-10-26
-- Source migrations in: archive/
--
-- Contains:
-- - Core tables (households, household_members, tasks, task_completions)
-- - Indexes for performance
-- - Triggers for automation
-- - Column additions from feature migrations
--
-- Does NOT contain:
-- - RLS Policies (see: 20251026000001_rls_policies.sql)
-- - Realtime config (see: 20251026000002_realtime.sql)
-- - Cron jobs (see: 20251026000003_cron_jobs.sql)
-- =================================================================

-- =================================================================
-- TABLES
-- =================================================================

-- Households - WG/Household groups
CREATE TABLE IF NOT EXISTS households (
  household_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL DEFAULT UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 8)),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Household Members - Users in a household (1 user = 1 household)
-- Note: user_id is PRIMARY KEY (not member_id!) - refactored in archive/20251024204719
CREATE TABLE IF NOT EXISTS household_members (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Unbekannt',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  -- Constraint: User can only be in one household
  UNIQUE(user_id)
);

-- Tasks - Cleaning tasks (recurring or one-time)
CREATE TABLE IF NOT EXISTS tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  effort INTEGER NOT NULL CHECK (effort BETWEEN 1 AND 5),
  recurrence_days INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  last_completed_at TIMESTAMPTZ, -- Auto-updated via trigger (see below)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task Completions - History of who completed what when (append-only)
CREATE TABLE IF NOT EXISTS task_completions (
  completion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  effort_override INTEGER CHECK (effort_override BETWEEN 1 AND 5),
  override_reason TEXT,
  -- Constraint: If effort_override set, reason must be provided
  CHECK (
    (effort_override IS NULL AND override_reason IS NULL)
    OR
    (effort_override IS NOT NULL AND override_reason IS NOT NULL)
  )
);

-- =================================================================
-- INDEXES
-- =================================================================

-- Household Members
CREATE INDEX IF NOT EXISTS idx_household_members_household_id
  ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_user_id
  ON household_members(user_id);
-- Composite index for RLS performance (2-column lookups)
CREATE INDEX IF NOT EXISTS idx_household_members_user_household
  ON household_members(user_id, household_id);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_household_id
  ON tasks(household_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed
  ON tasks(completed) WHERE completed = false; -- Partial index for active tasks
CREATE INDEX IF NOT EXISTS idx_tasks_last_completed_at
  ON tasks(last_completed_at);

-- Task Completions
CREATE INDEX IF NOT EXISTS idx_task_completions_task_id
  ON task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_user_id
  ON task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_completed_at
  ON task_completions(completed_at DESC); -- For history views

-- =================================================================
-- TRIGGERS & FUNCTIONS
-- =================================================================

-- Function: Update tasks.last_completed_at from task_completions
-- Source: archive/20251018131353_add_last_completed_at_with_trigger.sql
-- Purpose: Keep tasks.last_completed_at in sync with latest completion
-- Note: SECURITY DEFINER + search_path for security (prevents search_path attacks)
CREATE OR REPLACE FUNCTION update_last_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE tasks
  SET last_completed_at = NEW.completed_at
  WHERE task_id = NEW.task_id;
  RETURN NEW;
END;
$$;

-- Trigger: On task_completions INSERT → update tasks.last_completed_at
DROP TRIGGER IF EXISTS trigger_update_last_completed_at ON task_completions;
CREATE TRIGGER trigger_update_last_completed_at
  AFTER INSERT ON task_completions
  FOR EACH ROW
  EXECUTE FUNCTION update_last_completed_at();

-- =================================================================
-- NOTES
-- =================================================================
-- Invite codes are generated as uppercase 8-char UUID prefix (e.g. "ABC12345")
-- last_completed_at is auto-maintained via trigger (don't UPDATE manually)
-- effort_override allows users to adjust task effort during completion
-- user_id is PK in household_members (NOT member_id!) - simplifies JOINs
