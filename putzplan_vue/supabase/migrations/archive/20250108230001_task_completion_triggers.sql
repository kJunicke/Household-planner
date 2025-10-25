-- Auto-update tasks.completed when task_completions change
-- Triggers call is_task_completed() to recalculate completion status

-- Trigger function for INSERT events (task completed)
CREATE OR REPLACE FUNCTION update_task_completed_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tasks
  SET completed = is_task_completed(
    NEW.task_id,
    (SELECT recurrence_days FROM tasks WHERE task_id = NEW.task_id)
  )
  WHERE task_id = NEW.task_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to INSERT events
DROP TRIGGER IF EXISTS task_completion_insert_trigger ON task_completions;

CREATE TRIGGER task_completion_insert_trigger
AFTER INSERT ON task_completions
FOR EACH ROW
EXECUTE FUNCTION update_task_completed_on_insert();


-- Trigger function for DELETE events (mark task dirty)
CREATE OR REPLACE FUNCTION update_task_completed_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tasks
  SET completed = is_task_completed(
    OLD.task_id,
    (SELECT recurrence_days FROM tasks WHERE task_id = OLD.task_id)
  )
  WHERE task_id = OLD.task_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to DELETE events
DROP TRIGGER IF EXISTS task_completion_delete_trigger ON task_completions;

CREATE TRIGGER task_completion_delete_trigger
AFTER DELETE ON task_completions
FOR EACH ROW
EXECUTE FUNCTION update_task_completed_on_delete();
