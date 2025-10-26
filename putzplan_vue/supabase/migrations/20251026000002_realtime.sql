-- =================================================================
-- REALTIME CONFIGURATION
-- =================================================================
-- Enables Supabase Realtime subscriptions for live updates
-- Source: archive/20251018142654_enable_realtime_tasks.sql
--         archive/20251019154849_enable_realtime_completions.sql
--
-- Tables with Realtime:
-- - tasks (CREATE, UPDATE, DELETE events)
-- - task_completions (INSERT events for live stats)
-- =================================================================

-- Enable realtime for tasks table (idempotent)
-- Allows multi-user sync: when one user creates/updates/deletes a task,
-- all other users in the household see the change immediately
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;
END $$;

-- Enable realtime for task_completions table (idempotent)
-- Allows live stats updates: when one user completes a task,
-- others see the stats (pie chart, history) update in real-time
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_completions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_completions;
  END IF;
END $$;

-- =================================================================
-- USAGE IN FRONTEND
-- =================================================================
-- Frontend subscribes via:
-- supabase.channel('tasks-changes')
--   .on('postgres_changes', {
--     table: 'tasks',
--     filter: 'household_id=eq.XXX'
--   })
--   .subscribe()
--
-- Events received: INSERT, UPDATE, DELETE
-- Payload: { old: {...}, new: {...}, eventType: 'INSERT' }
