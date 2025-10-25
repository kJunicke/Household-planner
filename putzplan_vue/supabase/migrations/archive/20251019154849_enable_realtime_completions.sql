-- Enable Realtime for task_completions table
-- This allows clients to subscribe to INSERT, UPDATE, DELETE events for completions

ALTER PUBLICATION supabase_realtime ADD TABLE task_completions;