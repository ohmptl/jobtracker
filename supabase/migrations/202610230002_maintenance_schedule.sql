-- Supabase supports pg_cron. Intentionally fail visibly if unavailable rather
-- than claim retention is scheduled. This migration does not run the job now.
begin;
create extension if not exists pg_cron;
select cron.schedule('jobtracker-daily-maintenance','15 2 * * *','select public.tracker_maintenance()');
commit;
