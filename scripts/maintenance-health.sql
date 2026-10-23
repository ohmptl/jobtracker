-- One result supports CLI consumers that return only the final statement.
-- Operator-only monitoring; no job payloads or credentials in results.
select jsonb_build_object(
 'checked_at',now(),
 'alert_no_recent_success',not exists(select 1 from public.maintenance_runs
   where completed_at>now()-interval '26 hours' and failure is null),
 'alert_latest_failure',coalesce((select failure is not null from public.maintenance_runs order by started_at desc limit 1),false),
 'cron_active',exists(select 1 from cron.job where jobname='jobtracker-daily-maintenance' and active),
 'runs',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,started_at,completed_at,purged,expired_removed,failure
   from public.maintenance_runs order by started_at desc limit 10) r),'[]'::jsonb),
 'schedule',coalesce((select jsonb_agg(to_jsonb(c)) from (select jobid,jobname,schedule,active from cron.job
   where jobname='jobtracker-daily-maintenance') c),'[]'::jsonb),
 'scheduler_runs',coalesce((select jsonb_agg(to_jsonb(c)) from (select jobid,status,return_message,start_time,end_time from cron.job_run_details
   where jobid in (select jobid from cron.job where jobname='jobtracker-daily-maintenance')
   order by start_time desc limit 10) c),'[]'::jsonb)
) health;
