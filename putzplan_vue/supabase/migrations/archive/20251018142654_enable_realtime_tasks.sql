-- Enable Realtime for tasks table
-- This allows clients to subscribe to INSERT, UPDATE, DELETE events

ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
