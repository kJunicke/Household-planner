-- =================================================================
-- ADD TASK ASSIGNMENT FEATURE
-- =================================================================
-- Adds ability to assign tasks to specific household members
-- - assigned_to: Which user should do this task (optional)
-- - assignment_permanent: Whether assignment persists after completion
--
-- Business Logic:
-- - If assignment_permanent = false: Edge Function clears assigned_to on completion
-- - If assignment_permanent = true: Assignment stays after completion
-- =================================================================

-- Add columns to tasks table
ALTER TABLE tasks
ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN assignment_permanent BOOLEAN NOT NULL DEFAULT false;

-- Create index for assigned_to lookups
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to
  ON tasks(assigned_to);

-- =================================================================
-- RLS POLICY FOR TASK ASSIGNMENT
-- =================================================================
-- Users can only assign tasks within their own household
-- Note: This leverages existing RLS helper function get_user_household_id()

-- No separate policy needed - existing UPDATE policy covers assignment
-- Existing policy: "Users can update tasks in their household"
-- Already checks: tasks.household_id = get_user_household_id()

-- =================================================================
-- NOTES
-- =================================================================
-- Edge Function complete-task must be updated to handle assignment_permanent:
-- - If assignment_permanent = false: SET assigned_to = NULL after completion
-- - If assignment_permanent = true: Keep assigned_to unchanged
