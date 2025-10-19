-- Diagnostic Migration: Check task status and recurrence logic
-- This shows which tasks exist and which should be reset

DO $$
DECLARE
  task_record RECORD;
  should_reset BOOLEAN;
  days_since_completion NUMERIC;
BEGIN
  RAISE NOTICE '=== Task Status Report ===';
  RAISE NOTICE '';

  FOR task_record IN
    SELECT
      task_id,
      title,
      completed,
      recurrence_days,
      last_completed_at,
      CASE
        WHEN last_completed_at IS NULL THEN NULL
        ELSE EXTRACT(EPOCH FROM (NOW() - last_completed_at)) / 86400
      END AS days_since_completion
    FROM tasks
    ORDER BY task_id
  LOOP
    RAISE NOTICE 'Task: % (ID: %)', task_record.title, task_record.task_id;
    RAISE NOTICE '  Completed: %', task_record.completed;
    RAISE NOTICE '  Recurrence: % days', task_record.recurrence_days;
    RAISE NOTICE '  Last completed: %', task_record.last_completed_at;

    IF task_record.last_completed_at IS NOT NULL THEN
      days_since_completion := EXTRACT(EPOCH FROM (NOW() - task_record.last_completed_at)) / 86400;
      RAISE NOTICE '  Days since completion: %', ROUND(days_since_completion, 2);

      -- Check if task should be reset
      should_reset := task_record.recurrence_days > 0
                      AND task_record.completed = true
                      AND days_since_completion >= task_record.recurrence_days;

      IF should_reset THEN
        RAISE NOTICE '  >>> SHOULD BE RESET! <<<';
      ELSE
        RAISE NOTICE '  Status: OK (not yet due)';
      END IF;
    ELSE
      RAISE NOTICE '  Never completed';
    END IF;

    RAISE NOTICE '';
  END LOOP;

  -- Show the reset logic criteria
  RAISE NOTICE '=== Reset Logic Criteria ===';
  RAISE NOTICE 'A task is reset when ALL of these are true:';
  RAISE NOTICE '1. recurrence_days > 0';
  RAISE NOTICE '2. completed = true';
  RAISE NOTICE '3. last_completed_at IS NOT NULL';
  RAISE NOTICE '4. (NOW() - last_completed_at) >= recurrence_days';
END $$;
