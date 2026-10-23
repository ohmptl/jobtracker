begin;
create function public.tracker_verification_queue(hosts text[]) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(j),'[]') from (select id,url,revision from public.jobs
 where status in ('jobs_found','jobs_snoozed') and (last_verified_at is null or last_verified_at<now()-interval '14 days')
 and lower(substring(url from '^https://([^/:?#]+)'))=any(hosts)
 order by last_verified_at nulls first,added_date,id limit 10) j
$$;
create function public.tracker_record_verification(job_id uuid,expected_revision bigint,evidence jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.jobs;
begin
 select * into j from public.jobs where id=job_id and revision=expected_revision and status in ('jobs_found','jobs_snoozed') for update;
 if j.id is null then return false; end if;
 perform set_config('jobtracker.maintenance','yes',true);
 perform set_config('jobtracker.reason','Scheduled authoritative-host verification',true);
 update public.jobs set availability=evidence->>'availability',verification=evidence,last_verified_at=now() where id=j.id;
 return true;
end $$;
revoke all on function public.tracker_verification_queue(text[]),public.tracker_record_verification(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.tracker_verification_queue(text[]),public.tracker_record_verification(uuid,bigint,jsonb) to service_role;
commit;
