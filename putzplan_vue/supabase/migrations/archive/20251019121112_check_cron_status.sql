-- Diagnostic Migration: Check pg_cron status
-- This is a READ-ONLY diagnostic migration to check if pg_cron is working

DO $$
DECLARE
  ext_exists BOOLEAN;
  job_exists BOOLEAN;
  job_count INTEGER;
  run_count INTEGER;
BEGIN
  -- Check if pg_cron extension exists
  SELECT EXISTS(
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO ext_exists;

  IF ext_exists THEN
    RAISE NOTICE 'pg_cron extension is installed';

    -- Check if our cron job exists
    SELECT EXISTS(
      SELECT 1 FROM cron.job WHERE jobname = 'reset-recurring-tasks-daily'
    ) INTO job_exists;

    IF job_exists THEN
      RAISE NOTICE 'Cron job "reset-recurring-tasks-daily" is registered';

      -- Count total job runs
      SELECT COUNT(*)
      INTO run_count
      FROM cron.job_run_details
      WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'reset-recurring-tasks-daily');

      RAISE NOTICE 'Job has run % time(s)', run_count;

      IF run_count = 0 THEN
        RAISE NOTICE 'Job has never run yet (scheduled for 3:00 AM UTC daily)';
      END IF;
    ELSE
      RAISE WARNING 'Cron job "reset-recurring-tasks-daily" is NOT registered';

      -- List all existing jobs
      SELECT COUNT(*) INTO job_count FROM cron.job;
      RAISE NOTICE 'Total cron jobs registered: %', job_count;
    END IF;
  ELSE
    RAISE WARNING 'pg_cron extension is NOT installed';
    RAISE NOTICE 'pg_cron may not be available in Supabase Free Tier';
    RAISE NOTICE 'Consider using Supabase Edge Functions or Database Webhooks instead';
  END IF;
END $$;
