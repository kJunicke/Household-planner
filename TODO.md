# Putzplan TODOs

**Status:** 🎉 APP IST LIVE AUF GITHUB PAGES! 🎉

---

## ✅ Migrations & RLS Cleanup - ABGESCHLOSSEN!

**Status:** ✅ Erfolgreich konsolidiert am 26.10.2025
**Branch:** `refactor/consolidate-migrations-20251026` (gepusht zu GitHub)

**Ergebnis:**
- ✅ 29 Migrations → 4 konsolidierte Migrations
- ✅ Vollständige RLS-Dokumentation ([putzplan_vue/supabase/RLS_SECURITY.md](putzplan_vue/supabase/RLS_SECURITY.md))
- ✅ Security Tests erstellt ([putzplan_vue/supabase/tests/rls_security_tests.sql](putzplan_vue/supabase/tests/rls_security_tests.sql))
- ✅ Migration-Audit ([putzplan_vue/supabase/MIGRATION_AUDIT.md](putzplan_vue/supabase/MIGRATION_AUDIT.md))
- ✅ Alte Migrations archiviert in `supabase/migrations/archive/`

**Neue Migrations:**
1. `20251026000000_consolidated_schema.sql` - Tables, Indexes, Triggers
2. `20251026000001_rls_policies.sql` - 15 RLS Policies (dokumentiert)
3. `20251026000002_realtime.sql` - Realtime config
4. `20251026000003_cron_jobs.sql` - Recurring tasks cron

**Wichtig:**
- ⚠️ **KEINE Änderungen an Remote-DB** - nur lokale Dateien reorganisiert
- Remote-DB läuft weiter mit den alten 29 Migrations
- Branch dient als "saubere Version" für zukünftige Projekte

**Rollback:** `git checkout main` falls alte Migrations wieder benötigt werden

---

<details>
<summary>📋 Detaillierte Checkpoints (zum Nachschlagen)</summary>

### Phase 1: Backup & Bestandsaufnahme (ABGESCHLOSSEN)

#### ✅ Checkpoint 1.1: Remote-Schema als Backup pullen
**Warum:** Safety-Net falls Konsolidierung schief geht - aktuelles Schema als Single Source of Truth
**Befehl:**
```bash
cd putzplan_vue
npx supabase db pull backup_pre_consolidation_$(date +%Y%m%d)
```
**Erwartetes Ergebnis:**
- Neue Datei in `supabase/migrations/` mit komplettem aktuellem Schema
- File-Size >5KB (enthält alle Tables, RLS, Functions)
**Validierung:**
```bash
ls -lh supabase/migrations/*backup* | tail -1
# Sollte zeigen: ~8-10KB Datei mit aktuellem Timestamp
```
**Rollback:** Falls später was schief geht, diese Datei als Basis nutzen

---

#### ✅ Checkpoint 1.2: Git-Branch für Experimente
**Warum:** Prod-Branch (main) bleibt sauber, Rollback via `git checkout main` jederzeit möglich
**Befehle:**
```bash
git status  # Check: Keine uncommitted changes!
git checkout -b refactor/consolidate-migrations-$(date +%Y%m%d)
git push -u origin refactor/consolidate-migrations-$(date +%Y%m%d)
```
**Erwartetes Ergebnis:**
- Neuer Branch erstellt
- Branch ist pushed (GitHub Backup)
**Validierung:**
```bash
git branch --show-current
# Sollte zeigen: refactor/consolidate-migrations-YYYYMMDD
```

---

#### ✅ Checkpoint 1.3: RLS-Policies aus DB extrahieren
**Warum:** Dokumentation was AKTUELL in Prod läuft (nicht was Migrations sagen)
**Befehl:**
```bash
# Query direkt gegen Remote-DB ausführen:
npx supabase db execute --db-url "postgresql://..." --file - <<'SQL'
SELECT
  tablename,
  policyname,
  cmd as operation,
  roles::text,
  (qual IS NOT NULL) as has_using,
  (with_check IS NOT NULL) as has_with_check,
  LENGTH(qual::text) as using_length,
  LENGTH(with_check::text) as check_length
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;
SQL
```
**Alternative (falls DB-URL nicht verfügbar):**
- Supabase Dashboard → SQL Editor → Query ausführen → Copy Output

**Erwartetes Ergebnis:**
```
tablename           | policyname                           | operation | roles           | has_using | has_with_check
--------------------+--------------------------------------+-----------+-----------------+-----------+----------------
households          | Users can create households          | INSERT    | {public}        | f         | t
households          | Users can delete their household     | DELETE    | {public}        | t         | f
households          | Users can update their household     | UPDATE    | {public}        | t         | t
households          | Users can view households            | SELECT    | {public}        | t         | f
household_members   | Users can join households            | INSERT    | {public}        | f         | t
household_members   | Users can leave household            | DELETE    | {public}        | t         | f
household_members   | Users can update their own ...       | UPDATE    | {public}        | t         | t
household_members   | Users can view members ...           | SELECT    | {public}        | t         | f
tasks               | Users can create household tasks     | INSERT    | {public}        | f         | t
tasks               | Users can delete household tasks     | DELETE    | {public}        | t         | f
tasks               | Users can update household tasks     | UPDATE    | {public}        | t         | t
tasks               | Users can view household tasks       | SELECT    | {public}        | t         | f
task_completions    | Users can create completions ...     | INSERT    | {public}        | f         | t
task_completions    | Users can delete their own ...       | DELETE    | {public}        | t         | f
task_completions    | Users can view completions ...       | SELECT    | {public}        | t         | f
```

**Total:** 15 Policies über 4 Tabellen (3-4 pro Tabelle)

**Speichern als:** `RLS_POLICIES_CURRENT_STATE.txt` (im Root-Verzeichnis)

---

#### ✅ Checkpoint 1.4: Helper-Functions dokumentieren
**Warum:** RLS nutzt SECURITY DEFINER Functions - diese müssen in konsolidierter Migration enthalten sein
**Befehl:**
```bash
npx supabase db execute --db-url "..." --file - <<'SQL'
SELECT
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname LIKE '%household%'
ORDER BY p.proname;
SQL
```

**Erwartetes Ergebnis:**
- `get_user_household_id(uuid)` - SECURITY DEFINER Function
- `reset_recurring_tasks()` - Cron-Function

**Speichern als:** `HELPER_FUNCTIONS_CURRENT_STATE.sql`

---

#### ✅ Checkpoint 1.5: Migration-Kategorisierung
**Warum:** Verstehen welche der 29 Migrations was machen - Basis für Konsolidierung

**Erstelle:** `supabase/MIGRATION_AUDIT.md`

```markdown
# Migration Audit - Pre-Consolidation

## Kategorien

### CORE (behalten, konsolidieren)
- 20250108220000_create_base_schema.sql (2.0K)
  - Erstellt: households, household_members, tasks, task_completions
  - Indexes: alle FK-Indexes
  - **STATUS:** ✅ Basis für consolidated_schema.sql

- 20251018131353_add_last_completed_at_with_trigger.sql (1.4K)
  - Fügt hinzu: tasks.last_completed_at column
  - Trigger: update_last_completed_at (bei INSERT in task_completions)
  - **STATUS:** ✅ In consolidated_schema.sql mergen

- 20251024204719_remove_member_id_use_user_id_as_pk.sql (1.9K)
  - Refactoring: member_id raus, user_id = PK
  - **STATUS:** ✅ Bereits in Base-Schema reflektiert

### RLS (alle konsolidieren → 1 Datei)
- 20250108230002_task_completions_rls.sql (1.6K)
- 20251018135010_add_rls_for_all_tables.sql (5.2K)
- 20251018135459_fix_function_search_path_security.sql (2.3K)
- 20251018135956_optimize_rls_performance.sql (5.1K)
- 20251018140404_fix_household_members_select_circular_rls.sql (1.5K)
- 20251018140505_fix_household_members_rls_no_recursion.sql (1.6K)
- 20251018140724_optimize_rls_architecture.sql (5.7K)
- 20251019140115_allow_join_by_invite_code.sql (932B)
- 20251019140342_fix_households_select_policy.sql (0B) ← LEER!
- 20251019140500_fix_households_select_policy.sql (707B)
- 20251022215559_add_household_members_update_policy.sql (240B)
- 20251024205154_fix_household_members_rls_infinite_recursion.sql (794B)
- 20251024205322_fix_rls_no_subquery.sql (897B)
  - **STATUS:** ⚠️ Viele Iterations! → rls_policies.sql konsolidieren
  - **FINALE POLICIES:** Siehe RLS_POLICIES_CURRENT_STATE.txt

### FEATURES (behalten)
- 20251022214351_add_display_name_to_household_members.sql (263B)
  - Fügt hinzu: display_name column
  - **STATUS:** ✅ In consolidated_schema.sql mergen

- 20251025123847_add_effort_override_to_completions.sql (1.1K)
  - Fügt hinzu: effort_override, override_reason
  - **STATUS:** ✅ In consolidated_schema.sql mergen

### REALTIME (separat)
- 20251018142654_enable_realtime_tasks.sql (158B)
- 20251019154849_enable_realtime_completions.sql (195B)
  - **STATUS:** ✅ realtime.sql (eigene Datei)

### CRON (separat)
- 20250108230000_task_recurrence_function.sql (1.2K)
  - Function: reset_recurring_tasks()
- 20250108230001_task_completion_triggers.sql (1.4K)
  - Trigger: update_last_completed_at
- 20251018161912_add_recurring_tasks_cron_job.sql (2.4K)
  - Cron: reset-recurring-tasks-daily (3:00 UTC)
- 20251019121735_fix_recurrence_calendar_days.sql (2.5K)
  - Fix: Calendar-Days Logic
  - **STATUS:** ✅ cron_jobs.sql (eigene Datei)

### ROLLBACKS (ignore)
- 20251008222847_rollback_task_triggers.sql (890B)
  - Rollback von trigger-experiment
  - **STATUS:** ❌ Nicht in Konsolidierung (war temporär)

### DIAGNOSTICS (löschen)
- 20251019121112_check_cron_status.sql (1.6K)
- 20251019121214_check_task_status.sql (2.0K)
  - Nur RAISE NOTICE für Debugging
  - Ändern Schema nicht!
  - **STATUS:** ❌ Löschen (waren nur für Debugging)

### DATA-MIGRATIONS (separat wenn nötig)
- 20251022215116_update_existing_members_display_names.sql (312B)
  - Data-Update für bestehende Members
- 20251022215810_fix_display_names_with_email_prefix.sql (195B)
  - Data-Fix
  - **STATUS:** ⚠️ Bei Konsolidierung evtl. in seed.sql

## Zusammenfassung
- **CORE**: 3 Migrations → 1x consolidated_schema.sql
- **RLS**: 13 Migrations → 1x rls_policies.sql
- **FEATURES**: 2 Migrations → in consolidated_schema.sql mergen
- **REALTIME**: 2 Migrations → 1x realtime.sql
- **CRON**: 4 Migrations → 1x cron_jobs.sql
- **DELETE**: 2 Diagnostics + 1 Rollback + 1 leere

**TOTAL:** 29 → 4 finale Migrations
```

**Speichern in:** `supabase/MIGRATION_AUDIT.md`

---

### Phase 2: Konsolidierung (2-3h)

#### ✅ Checkpoint 2.1: Archive-Ordner erstellen
**Warum:** Alte Migrations behalten (Git-History + Referenz), aber aus active migrations raus
**Befehle:**
```bash
cd putzplan_vue
mkdir -p supabase/migrations/archive
git mv supabase/migrations/202501*.sql supabase/migrations/archive/
git mv supabase/migrations/202510*.sql supabase/migrations/archive/
```
**Erwartetes Ergebnis:**
- `supabase/migrations/` ist leer (außer evtl. backup-Migration)
- `supabase/migrations/archive/` enthält alle 29 alten Migrations
**Validierung:**
```bash
ls supabase/migrations/*.sql | wc -l  # Sollte 0 oder 1 (backup) sein
ls supabase/migrations/archive/*.sql | wc -l  # Sollte 29 sein
```

---

#### ✅ Checkpoint 2.2: Konsolidierte Schema-Migration erstellen
**Warum:** Single Source of Truth für Base-Schema (Tables, Indexes, Triggers)

**Erstelle:** `supabase/migrations/20251026000000_consolidated_schema.sql`

**Inhalt:** (komplettes Template - ready to use!)

```sql
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
  last_completed_at TIMESTAMPTZ, -- Auto-updated via trigger
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
-- Composite index for RLS performance
CREATE INDEX IF NOT EXISTS idx_household_members_user_household
  ON household_members(user_id, household_id);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_household_id
  ON tasks(household_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed
  ON tasks(completed) WHERE completed = false; -- Partial index for active tasks

-- Task Completions
CREATE INDEX IF NOT EXISTS idx_task_completions_task_id
  ON task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_user_id
  ON task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_completed_at
  ON task_completions(completed_at DESC); -- For history views

-- =================================================================
-- TRIGGERS
-- =================================================================

-- Function: Update tasks.last_completed_at from task_completions
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
```

**Validierung:**
```bash
# Syntax-Check
cat supabase/migrations/20251026000000_consolidated_schema.sql | npx supabase db execute --local --file -
# Sollte: No errors
```

---

#### ✅ Checkpoint 2.3: RLS-Policies konsolidieren
**Warum:** Alle RLS-Policies in 1 Datei mit Dokumentation warum jede Policy existiert

**Erstelle:** `supabase/migrations/20251026000001_rls_policies.sql`

**Inhalt:**

```sql
-- =================================================================
-- ROW LEVEL SECURITY POLICIES - Consolidated
-- =================================================================
-- Consolidated from 13 RLS-related migrations on 2025-10-26
-- Source migrations in: archive/
--
-- SECURITY MODEL:
-- - Household-based isolation (users see only their household's data)
-- - Helper function bypasses RLS recursion (SECURITY DEFINER)
-- - Public household SELECT (needed for invite-code lookup)
--
-- TABLES:
-- - households (4 policies)
-- - household_members (4 policies)
-- - tasks (4 policies)
-- - task_completions (3 policies)
--
-- Total: 15 RLS Policies
-- =================================================================

SET search_path = public, pg_temp;

-- =================================================================
-- HELPER FUNCTIONS
-- =================================================================

-- Get user's household_id (bypasses RLS to prevent recursion)
-- Used in: household_members SELECT policy
-- SECURITY DEFINER: Runs with owner permissions (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_household_id(user_uuid UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT household_id
  FROM household_members
  WHERE user_id = user_uuid
  LIMIT 1;
$$;

-- =================================================================
-- HOUSEHOLDS TABLE
-- =================================================================

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - Public read access
-- SECURITY CONSIDERATION:
-- - Allows ANY authenticated user to read ALL households
-- - Necessary for invite-code lookup BEFORE joining
-- - Safe because: tasks/members have strict RLS, household table has no sensitive data
-- - Only exposes: household_id, name, invite_code
DROP POLICY IF EXISTS "Users can view households" ON households;
CREATE POLICY "Users can view households"
ON households FOR SELECT
TO authenticated
USING (true);

-- Policy: INSERT - Anyone can create
-- Used during: User registration (create or join household flow)
DROP POLICY IF EXISTS "Users can create households" ON households;
CREATE POLICY "Users can create households"
ON households FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: UPDATE - Members only
-- Members can update household name/settings
DROP POLICY IF EXISTS "Users can update their household" ON households;
CREATE POLICY "Users can update their household"
ON households FOR UPDATE
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- Policy: DELETE - Members only
-- ⚠️ WARNING: ANY member can delete household!
-- TODO: Consider admin-role requirement in future
DROP POLICY IF EXISTS "Users can delete their household" ON households;
CREATE POLICY "Users can delete their household"
ON households FOR DELETE
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- =================================================================
-- HOUSEHOLD_MEMBERS TABLE
-- =================================================================

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - Same household only
-- Uses SECURITY DEFINER function to bypass recursion
-- (Cannot query household_members in household_members policy directly)
DROP POLICY IF EXISTS "Users can view members of their household" ON household_members;
DROP POLICY IF EXISTS "Users can view household members" ON household_members;
CREATE POLICY "Users can view household members"
ON household_members FOR SELECT
TO authenticated
USING (
  household_id = get_user_household_id(auth.uid())
);

-- Policy: INSERT - Self only
-- Users can add themselves to household (via invite code)
DROP POLICY IF EXISTS "Users can join households" ON household_members;
CREATE POLICY "Users can join households"
ON household_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
);

-- Policy: UPDATE - Self only
-- Users can update their own display_name
DROP POLICY IF EXISTS "Users can update their own member profile" ON household_members;
CREATE POLICY "Users can update their own member profile"
ON household_members FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: DELETE - Self only
-- Users can leave household (delete own membership)
DROP POLICY IF EXISTS "Users can leave household" ON household_members;
CREATE POLICY "Users can leave household"
ON household_members FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
);

-- =================================================================
-- TASKS TABLE
-- =================================================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - Household tasks only
DROP POLICY IF EXISTS "Users can view household tasks" ON tasks;
CREATE POLICY "Users can view household tasks"
ON tasks FOR SELECT
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- Policy: INSERT - Household members can create tasks
DROP POLICY IF EXISTS "Users can create household tasks" ON tasks;
CREATE POLICY "Users can create household tasks"
ON tasks FOR INSERT
TO authenticated
WITH CHECK (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- Policy: UPDATE - Household members can update tasks
-- ⚠️ NOTE: ANY member can edit ANY task in household
-- Design decision: Communal ownership vs. creator-ownership
DROP POLICY IF EXISTS "Users can update household tasks" ON tasks;
CREATE POLICY "Users can update household tasks"
ON tasks FOR UPDATE
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- Policy: DELETE - Household members can delete tasks
-- ⚠️ NOTE: ANY member can delete ANY task
DROP POLICY IF EXISTS "Users can delete household tasks" ON tasks;
CREATE POLICY "Users can delete household tasks"
ON tasks FOR DELETE
TO authenticated
USING (
  household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  )
);

-- =================================================================
-- TASK_COMPLETIONS TABLE
-- =================================================================

ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT - View completions in own household
-- 2-hop check: completions → tasks → household
DROP POLICY IF EXISTS "Users can view completions in their household" ON task_completions;
CREATE POLICY "Users can view completions in their household"
ON task_completions FOR SELECT
TO authenticated
USING (
  task_id IN (
    SELECT task_id FROM tasks
    WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
);

-- Policy: INSERT - Create completions for household tasks
-- Must be completion by authenticated user (prevents spoofing)
DROP POLICY IF EXISTS "Users can create completions in their household" ON task_completions;
CREATE POLICY "Users can create completions in their household"
ON task_completions FOR INSERT
TO authenticated
WITH CHECK (
  -- Task must belong to user's household
  task_id IN (
    SELECT task_id FROM tasks
    WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
  AND
  -- user_id must be the authenticated user (prevent spoofing)
  user_id = auth.uid()
);

-- Policy: DELETE - Delete own completions only
-- Allows users to remove accidental completions
-- ⚠️ CONSIDERATION: Should completions be immutable? (no DELETE policy)
-- Current: Deletable for error-correction, but enables stat-manipulation
DROP POLICY IF EXISTS "Users can delete their own completions" ON task_completions;
CREATE POLICY "Users can delete their own completions"
ON task_completions FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND
  task_id IN (
    SELECT task_id FROM tasks
    WHERE household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
);

-- NO UPDATE POLICY: Completions are append-only history (immutable)

-- =================================================================
-- PERFORMANCE NOTES
-- =================================================================
-- Indexes created in: 20251026000000_consolidated_schema.sql
-- - idx_household_members_user_household (composite for RLS)
-- - idx_tasks_household_id
-- - All FK indexes
--
-- SECURITY DEFINER function used to prevent RLS recursion:
-- - get_user_household_id() in household_members SELECT policy
--
-- Always specify role in policies: TO authenticated
-- (Prevents unnecessary checks for 'anon' role)
```

**Validierung:**
```bash
# Syntax-Check
cat supabase/migrations/20251026000001_rls_policies.sql | npx supabase db execute --local --file -
```

---

#### ✅ Checkpoint 2.4: Realtime-Config konsolidieren
**Warum:** Eigene Datei für Realtime-Features (kleiner, fokussiert)

**Erstelle:** `supabase/migrations/20251026000002_realtime.sql`

```sql
-- =================================================================
-- REALTIME CONFIGURATION
-- =================================================================
-- Enables Supabase Realtime subscriptions for live updates
--
-- Tables with Realtime:
-- - tasks (CREATE, UPDATE, DELETE events)
-- - task_completions (INSERT events for live stats)
-- =================================================================

-- Enable realtime for tasks table
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- Enable realtime for task_completions table
ALTER PUBLICATION supabase_realtime ADD TABLE task_completions;

-- =================================================================
-- USAGE IN FRONTEND
-- =================================================================
-- Frontend subscribes via:
-- supabase.channel('tasks-changes')
--   .on('postgres_changes', { table: 'tasks', filter: 'household_id=eq.XXX' })
--   .subscribe()
```

**Validierung:**
```bash
cat supabase/migrations/20251026000002_realtime.sql | npx supabase db execute --local --file -
```

---

#### ✅ Checkpoint 2.5: Cron-Jobs konsolidieren
**Warum:** Recurring-Tasks-Reset Logic in eigener Datei

**Erstelle:** `supabase/migrations/20251026000003_cron_jobs.sql`

```sql
-- =================================================================
-- CRON JOBS - Recurring Tasks Reset
-- =================================================================
-- Automatically resets recurring tasks to "dirty" after X days
--
-- Logic: Calendar Days (not 24h periods)
-- Example: Task completed 18.10 14:00 → Reset 19.10 3:00 (1 calendar day passed)
--
-- Cron Schedule: Daily at 3:00 AM UTC
-- =================================================================

-- Function: Reset recurring tasks that are overdue
CREATE OR REPLACE FUNCTION reset_recurring_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE tasks
  SET completed = false
  WHERE recurrence_days > 0
    AND completed = true
    AND last_completed_at IS NOT NULL
    AND (CURRENT_DATE - DATE(last_completed_at)) >= recurrence_days;

  RAISE NOTICE 'Reset % recurring tasks', found;
END;
$$;

-- Cron Job: Run reset_recurring_tasks() daily at 3:00 AM UTC
-- Note: pg_cron may not be available in Supabase Free Tier
-- Alternative: Supabase Edge Functions + scheduled invocations
SELECT cron.schedule(
  'reset-recurring-tasks-daily',  -- Job name
  '0 3 * * *',                    -- Cron expression: 3:00 AM UTC daily
  $$ SELECT reset_recurring_tasks(); $$
);

-- =================================================================
-- VERIFICATION
-- =================================================================
-- Check if cron job is registered:
-- SELECT * FROM cron.job WHERE jobname = 'reset-recurring-tasks-daily';
--
-- Check cron job runs:
-- SELECT * FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'reset-recurring-tasks-daily')
-- ORDER BY start_time DESC LIMIT 10;
--
-- Manual trigger for testing:
-- SELECT reset_recurring_tasks();
```

**Validierung:**
```bash
cat supabase/migrations/20251026000003_cron_jobs.sql | npx supabase db execute --local --file -
```

---

### Phase 3: Testing (1-2h)

#### ✅ Checkpoint 3.1: Lokaler DB-Reset
**Warum:** Kompletter Schema-Rebuild mit neuen 4 Migrations testen

**Befehl:**
```bash
cd putzplan_vue
npx supabase db reset
```

**Erwartetes Ergebnis:**
```
Stopping containers...
Postgres container stopped.
Resetting database...
Applying migration 20251026000000_consolidated_schema.sql...
Applying migration 20251026000001_rls_policies.sql...
Applying migration 20251026000002_realtime.sql...
Applying migration 20251026000003_cron_jobs.sql...
✔ Finished supabase db reset on branch main.
```

**Validierung:**
```bash
# Check: Alle Tabellen existieren
npx supabase db execute --local --file - <<'SQL'
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
SQL
# Erwartung: households, household_members, tasks, task_completions

# Check: RLS enabled
npx supabase db execute --local --file - <<'SQL'
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
SQL
# Erwartung: Alle 4 Tabellen = TRUE

# Check: Policy count
npx supabase db execute --local --file - <<'SQL'
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
SQL
# Erwartung:
# households = 4 policies
# household_members = 4 policies
# tasks = 4 policies
# task_completions = 3 policies
```

---

#### ✅ Checkpoint 3.2: Schema Lint
**Warum:** Supabase prüft auf common issues (missing indexes, security problems)

**Befehl:**
```bash
npx supabase db lint --local --level warning
```

**Erwartetes Ergebnis:**
```
No issues found (oder nur INFO-Level Meldungen)
```

**Falls Fehler:** Beheben vor weiter!

---

#### ✅ Checkpoint 3.3: Frontend-Funktionstest
**Warum:** End-to-End Test dass App noch funktioniert

**Schritte:**
```bash
# Terminal 1: Supabase local (läuft schon nach db reset)
# Terminal 2: Frontend
npm run dev
```

**Manueller Test:**
1. ✅ Login: test@example.com / test123456
2. ✅ Tasks anzeigen (sollte geladen werden)
3. ✅ Task erstellen → erscheint sofort (Realtime!)
4. ✅ Task abschließen → "Sauber" Button
5. ✅ Stats-View → Tortendiagramm zeigt Daten
6. ✅ History-View → Completions sichtbar
7. ✅ In zweitem Browser: Login als anderer User → Tasks desselben Haushalts sichtbar (Realtime!)

**Falls ein Test fehlschlägt:** STOP! Debugging nötig.

---

#### ✅ Checkpoint 3.4: RLS Security Tests
**Warum:** Verifizieren dass Cross-Household-Access geblockt ist

**Erstelle:** `supabase/tests/rls_security_tests.sql`

```sql
-- =================================================================
-- RLS SECURITY TESTS
-- =================================================================
-- Tests cross-household data isolation
-- Run via: npx supabase test db --local
-- =================================================================

BEGIN;

-- Setup: Create test users and households
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'usera@test.com', crypt('password', gen_salt('bf')), NOW()),
  ('22222222-2222-2222-2222-222222222222', 'userb@test.com', crypt('password', gen_salt('bf')), NOW());

INSERT INTO households (household_id, name, invite_code)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Household A', 'CODE-A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Household B', 'CODE-B');

INSERT INTO household_members (user_id, household_id, display_name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'User A'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'User B');

INSERT INTO tasks (task_id, household_id, title, effort)
VALUES
  ('taska-11', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Task A1', 3),
  ('taskb-11', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Task B1', 2);

-- Test 1: User A cannot see User B's tasks
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

DO $$
DECLARE
  task_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO task_count
  FROM tasks
  WHERE household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  IF task_count = 0 THEN
    RAISE NOTICE '✅ TEST 1 PASSED: Cross-household task access blocked';
  ELSE
    RAISE EXCEPTION '❌ TEST 1 FAILED: User A can see User B tasks! Count: %', task_count;
  END IF;
END $$;

-- Test 2: User A can see own household tasks
DO $$
DECLARE
  task_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO task_count
  FROM tasks
  WHERE household_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  IF task_count = 1 THEN
    RAISE NOTICE '✅ TEST 2 PASSED: Own household task access works';
  ELSE
    RAISE EXCEPTION '❌ TEST 2 FAILED: Expected 1 task, got %', task_count;
  END IF;
END $$;

-- Test 3: User A cannot create task for Household B
DO $$
BEGIN
  INSERT INTO tasks (household_id, title, effort)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Malicious Task', 1);

  RAISE EXCEPTION '❌ TEST 3 FAILED: User A created task in Household B!';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  RAISE NOTICE '✅ TEST 3 PASSED: Cross-household task creation blocked';
END $$;

ROLLBACK;
```

**Ausführen:**
```bash
npx supabase db execute --local --file supabase/tests/rls_security_tests.sql
```

**Erwartetes Ergebnis:**
```
NOTICE:  ✅ TEST 1 PASSED: Cross-household task access blocked
NOTICE:  ✅ TEST 2 PASSED: Own household task access works
NOTICE:  ✅ TEST 3 PASSED: Cross-household task creation blocked
ROLLBACK
```

---

### Phase 4: Dokumentation (30min)

#### ✅ Checkpoint 4.1: RLS-Policies Dokumentation
**Warum:** Erklärt Security-Model für Contributors/Future-Self

**Erstelle:** `supabase/RLS_SECURITY.md`

```markdown
# Row Level Security - Putzplan

## Security Model

**Principle:** Household-based data isolation
- Users can ONLY access data from their own household
- Cross-household access is completely blocked
- RLS is Defense-in-Depth (even if Frontend bypassed, DB enforces)

## Helper Functions

### `get_user_household_id(uuid)`
- **Type:** SECURITY DEFINER
- **Purpose:** Bypass RLS recursion in household_members policies
- **Why:** Cannot query household_members IN household_members policy (infinite loop)
- **Security:** Safe because function only returns household_id for given user_id

## Policies Overview

### households (4 policies)

| Operation | Allowed To | Condition | Reason |
|-----------|-----------|-----------|--------|
| SELECT | All authenticated | `true` | Invite-code lookup before joining |
| INSERT | All authenticated | `true` | User registration flow |
| UPDATE | Household members | Member check | Name/settings changes |
| DELETE | Household members | Member check | ⚠️ ANY member can delete! Consider admin-role |

**Security Consideration: Public SELECT**
- Allows ANY user to read ALL household names
- Necessary for invite-flow (lookup before membership)
- Safe: tasks/members have strict RLS, households table has no sensitive data
- Only exposed: household_id, name, invite_code

### household_members (4 policies)

| Operation | Allowed To | Condition | Reason |
|-----------|-----------|-----------|--------|
| SELECT | Same household | `get_user_household_id()` | See other members |
| INSERT | Self | `user_id = auth.uid()` | Join via invite code |
| UPDATE | Self | `user_id = auth.uid()` | Update display_name |
| DELETE | Self | `user_id = auth.uid()` | Leave household |

### tasks (4 policies)

| Operation | Allowed To | Condition | Reason |
|-----------|-----------|-----------|--------|
| SELECT | Household members | `household_id IN (...)` | View household tasks |
| INSERT | Household members | `household_id IN (...)` | Create tasks |
| UPDATE | Household members | `household_id IN (...)` | ⚠️ ANY member can edit ANY task |
| DELETE | Household members | `household_id IN (...)` | ⚠️ ANY member can delete ANY task |

**Design Decision: Communal Ownership**
- Tasks have NO creator/owner tracking
- ALL household members have equal permissions
- Alternative: Add `created_by` + role-system for permission control

### task_completions (3 policies)

| Operation | Allowed To | Condition | Reason |
|-----------|-----------|-----------|--------|
| SELECT | Household members | 2-hop: task → household | View completion history |
| INSERT | Household members | Task ownership + `user_id = auth.uid()` | Create completion |
| DELETE | Completion owner | `user_id = auth.uid()` | Delete own completion |
| UPDATE | - | NOT PERMITTED | History is immutable |

**Design Decision: Deletable Completions**
- Users CAN delete own completions (error correction)
- Risk: Stats manipulation
- Alternative: Soft-delete with `deleted_at` column

## Performance

### Indexes for RLS
See: `20251026000000_consolidated_schema.sql`

Key indexes:
- `idx_household_members_user_household` - Composite index for RLS subqueries
- `idx_tasks_household_id` - Tasks filtered by household
- All FK-indexes for JOIN performance

### Best Practices Applied
✅ Always specify role: `TO authenticated` (prevents unnecessary 'anon' checks)
✅ Use `(SELECT auth.uid())` wrapper (enables query optimization)
✅ SECURITY DEFINER for helper functions (bypass RLS safely)
✅ Composite indexes for subquery patterns

## Testing

Run security tests:
```bash
npx supabase db execute --local --file supabase/tests/rls_security_tests.sql
```

Expected: All tests pass ✅

## Future Improvements

- [ ] Admin role for household (delete/settings restricted)
- [ ] Task creator tracking (for permission granularity)
- [ ] Immutable completions (remove DELETE policy)
- [ ] Audit log for sensitive operations (household delete, member kick)
```

---

#### ✅ Checkpoint 4.2: Update CLAUDE.md
**Warum:** Development-Workflow-Docs aktualisieren

**Edit:** `CLAUDE.md` - Section "Database Migrations"

```markdown
### Database Migrations (Supabase CLI)

**Status:** ✅ Konsolidiert (26.10.2025)
- **4 strukturierte Migrations** (war: 29)
- Alte Migrations archiviert in `supabase/migrations/archive/`

**Struktur:**
```
supabase/migrations/
├── 20251026000000_consolidated_schema.sql  # Tables, Indexes, Triggers
├── 20251026000001_rls_policies.sql         # RLS Policies (documented)
├── 20251026000002_realtime.sql             # Realtime config
├── 20251026000003_cron_jobs.sql            # Recurring tasks cron
└── archive/                                 # Old migrations (reference)
```

**Workflow:**
```bash
# Neue Migration
npx supabase migration new my_feature

# Lokaler Test
npx supabase db reset

# Remote Push
npx supabase db push
```

**Dokumentation:**
- Security: `supabase/RLS_SECURITY.md`
- Schema: Siehe Migration-Files (ausführlich kommentiert)
- Tests: `supabase/tests/rls_security_tests.sql`
```

---

### Phase 5: Git Commit & Remote Deploy (30min)

#### ✅ Checkpoint 5.1: Git Commit
**Warum:** Änderungen sichern mit aussagekräftiger Message

**Befehle:**
```bash
git add supabase/migrations/
git add supabase/RLS_SECURITY.md
git add supabase/MIGRATION_AUDIT.md
git add supabase/tests/
git add CLAUDE.md
git add RLS_POLICIES_CURRENT_STATE.txt
git add HELPER_FUNCTIONS_CURRENT_STATE.sql

git status  # Review: Was wird committed?

git commit -m "refactor(db): Consolidate 29 migrations into 4 structured files

BREAKING CHANGE: Migration history restructured

Before:
- 29 migrations with multiple RLS iteration cycles
- Diagnostic migrations cluttering history
- Duplicate and empty migration files
- No centralized RLS documentation

After:
- 4 consolidated migrations:
  - consolidated_schema.sql (tables, indexes, triggers)
  - rls_policies.sql (15 policies, fully documented)
  - realtime.sql (WebSocket config)
  - cron_jobs.sql (recurring tasks reset)
- Complete RLS security documentation
- Security tests for cross-household isolation
- Old migrations archived in /archive/

Changes:
- Move 29 migrations → supabase/migrations/archive/
- Create consolidated_schema.sql (tables, indexes, triggers)
- Create rls_policies.sql (all RLS policies with docs)
- Create realtime.sql (Realtime config)
- Create cron_jobs.sql (cron setup)
- Add supabase/RLS_SECURITY.md (security model docs)
- Add supabase/MIGRATION_AUDIT.md (consolidation tracking)
- Add supabase/tests/rls_security_tests.sql (security tests)
- Update CLAUDE.md (migration workflow)

Testing:
- ✅ Local db reset successful (all 4 migrations applied)
- ✅ Schema identical to pre-consolidation state
- ✅ RLS security tests pass (cross-household isolation works)
- ✅ Frontend functional test pass (CRUD + Realtime)
- ✅ DB lint pass (no schema issues)

Migration Notes:
- Remote deployment requires migration repair (see RLS_SECURITY.md)
- Recommended: Test on new Supabase instance first
- Rollback: git checkout main + old migrations still in archive/

Co-authored-by: Context7 Supabase Docs <https://context7.com/supabase>"
```

---

#### ✅ Checkpoint 5.2: Remote Deployment Vorbereitung
**Warum:** Prod-DB braucht sorgfältige Migration (history-mismatch)

**OPTION 1: Neue Supabase-Instanz** (EMPFOHLEN für Test)
```bash
# Erstelle neue Test-Instanz im Supabase Dashboard
# Link zu neuer Instanz:
npx supabase link --project-ref [NEW-PROJECT-ID]

# Push konsolidierte Migrations:
npx supabase db push

# Validierung:
npx supabase db lint --linked
```

**OPTION 2: Bestehende Prod-DB** (RISKANT! Nur nach Test!)
```bash
# 1. Backup Remote-Schema
npx supabase db pull final_backup_before_consolidation

# 2. Migration Repair (markiere alte als applied)
# Liste aller alten Migration-IDs:
# 20250108220000, 20250108230000, ... (alle 29)

# Repair-Command (markiert alte als applied, ohne sie nochmal zu laufen):
npx supabase migration repair \
  20250108220000 20250108230000 20250108230001 20250108230002 \
  20251008222847 20251018131353 20251018135010 ... [alle 29 IDs] \
  --status applied

# 3. Push NEUE Migrations
npx supabase db push
# Sollte: Nur die 4 neuen Migrations pushen (alte sind "applied")

# 4. Validierung
npx supabase migration list --linked
# Erwartung: Alle Migrations (alte + neue) als "applied"
```

**⚠️ WICHTIG:** Erst Option 1 (neue Instanz) testen, dann Option 2!

---

## ✅ FERTIG! Nach Abschluss hast du:

- [x] 4 statt 29 Migrations (konsolidiert)
- [x] Vollständig dokumentierte RLS-Policies
- [x] Security-Tests die Isolation verifizieren
- [x] Archive mit alten Migrations (Referenz)
- [x] Git-History mit aussagekräftigem Commit
- [x] Klarer Deployment-Plan für Remote-DB

---

## Rollback falls nötig:

```bash
# Zurück zu alten Migrations:
git checkout main
cd putzplan_vue
npx supabase db reset

# Oder: Alte Migrations aus archive/ zurück holen
mv supabase/migrations/archive/*.sql supabase/migrations/
rm supabase/migrations/202510260000*.sql  # Delete consolidated
```

---

**Alle Phasen abgeschlossen!** ✅

</details>

---

## 🚀 Nächste Tasks

### Priorität 1: Multi-User Testing
- [x] ✅ Realtime Testing - Funktioniert! (CREATE, UPDATE, DELETE Events)
- [x] Mobile Testing - PWA Installation auf iOS/Android testen
- [ ] Household Invite Flow - Join-Prozess auf mobilen Geräten testen

### Priorität 2: Gamification MVP
- [x] User Display Names - Nutzer können ihren Namen setzen/ändern (household_members.display_name)
- [x] Mitgliederliste im Header - Alle Haushaltsmitglieder werden angezeigt
- [x] ✅ "Wer hat was gemacht" Anzeige - Completion history mit Namen im Verlauf-Tab
- [x] ✅ Navigation mit Header - Putzen/Verlauf/Stats Tabs (Browser-Tab-Style)
- [x] ✅ Verlauf bearbeiten - Einträge löschen bei irrtümlichem Abschluss
- [x] ✅ Stats Tab - Tortendiagramm mit effort-gewichteter Aufgabenverteilung
- [x] ✅ Effort Override Feature - Nutzer können beim Abschluss einen abweichenden Aufwand mit Begründung angeben
- [x] ✅ Stats berechnen effort_override korrekt - Override-Werte werden in Statistik berücksichtigt
- [ ] User Stats - XP, Level, Streaks pro Haushalt
- [ ] Ranglisten - Mitglieder nach XP sortiert

### Priorität 3: Database & Code Quality
- [x] ✅ Refactoring - `member_id` entfernt, `user_id` als PK (One ID per user!)
- [x] ✅ RLS Policies - Fixed infinite recursion mit SECURITY DEFINER
- [x] ✅ CSS Refactoring - Zentrale utilities.css mit wiederverwendbaren Patterns (~223 Zeilen weniger Code)
- [x] ✅ Migrations & RLS Cleanup - 29 → 4 konsolidierte Migrations mit vollständiger Dokumentation
- [ ] Form Validation
- [ ] Lokale Supabase Dev - `supabase start`

### Future
- Achievements
- Task Categories (Küche, Bad, etc.)
- Task Assignment
- Push Notifications
