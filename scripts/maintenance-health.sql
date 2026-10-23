-- Operator-only monitoring. No job payloads or credentials in results.
select id,started_at,completed_at,purged,expired_removed,failure
from public.maintenance_runs order by started_at desc limit 10;
select not exists(select 1 from public.maintenance_runs
 where completed_at>now()-interval '26 hours' and failure is null) as alert_no_recent_success;
select jobid,jobname,schedule,active from cron.job where jobname='jobtracker-daily-maintenance';
select jobid,status,return_message,start_time,end_time from cron.job_run_details
 where jobid in (select jobid from cron.job where jobname='jobtracker-daily-maintenance')
 order by start_time desc limit 10;
