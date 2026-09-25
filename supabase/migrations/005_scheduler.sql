-- ==============================================================================
-- 005_scheduler.sql: pg_cron Automated Interest Generation
-- Runs fully autonomously in PostgreSQL - independent of mobile app state
-- ==============================================================================

-- Enable pg_cron extension (available in Supabase PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing job if present to avoid duplicates
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily_generate_interest_dues') THEN
        PERFORM cron.unschedule('daily_generate_interest_dues');
    END IF;
END $$;

-- Schedule the automated interest generation to run daily at 00:05 AM (UTC)
-- (which is 05:35 AM IST, ensuring all loans due today have their records generated at the start of day)
SELECT cron.schedule(
    'daily_generate_interest_dues',
    '5 0 * * *',
    $$SELECT public.generate_due_interest_records(CURRENT_DATE);$$
);

-- Optional secondary check at 18:30 UTC (00:00 midnight IST)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'midnight_ist_generate_interest_dues') THEN
        PERFORM cron.unschedule('midnight_ist_generate_interest_dues');
    END IF;
END $$;

SELECT cron.schedule(
    'midnight_ist_generate_interest_dues',
    '30 18 * * *',
    $$SELECT public.generate_due_interest_records(CURRENT_DATE);$$
);
