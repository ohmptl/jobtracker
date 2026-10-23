-- No job or activity rows are rewritten. Preserve legacy flags and audit
-- policy_version as deprecated historical data, without any active behavior.
begin;
comment on column public.jobs.protected is 'Deprecated: ignored by lifecycle rules; retained only to preserve existing row data.';
comment on column public.activity_events.policy_version is 'Historical cleanup version only; new events do not use a cleanup policy.';

-- Alias matching remains mechanical deduplication, never employer protection.
alter table public.protected_companies rename to company_aliases;
alter table public.company_aliases drop column protected;
comment on table public.company_aliases is 'Existing employer spelling aliases for duplicate identity matching only; no seeded prestige or protection rules.';
update public.tracker_clients set permissions=array_remove(array_remove(permissions,'protect'),'policy')
 where permissions && array['protect','policy'];
alter table public.tracker_clients drop constraint tracker_clients_permissions_check;
alter table public.tracker_clients add constraint tracker_clients_permissions_check
 check(permissions <@ array['read','write','remove','restore','purge','history']);

create function private.confirmed_closed(state text,evidence jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(state='closed' and evidence->>'confidence'='high'
  and evidence->>'method' in ('employer_explicit','ats_explicit')
  and length(btrim(evidence->>'evidence'))>=20
  and evidence->>'source' ~* '^https?://[^/@[:space:]]+([/:?]|$)'
  and (evidence->>'http_status' is null or
   ((evidence->>'http_status') ~ '^[0-9]{3}$' and
    ((evidence->>'http_status') between '200' and '299' or evidence->>'http_status' in ('404','410')))),false)
$$;
revoke all on function private.confirmed_closed(text,jsonb) from public,anon,authenticated;

-- The single guard covers RPC, generic status updates and direct RLS writes.
create or replace function private.guard_job() returns trigger language plpgsql security definer set search_path='' as $$
declare ai boolean:=private.client_id() is not null; reason text;
begin
 if tg_op='DELETE' then
  if current_setting('jobtracker.purge',true) is distinct from 'yes' then raise exception 'Use purge_job; direct deletion is disabled'; end if;
  return old;
 end if;
 if new.user_id is distinct from auth.uid() and current_setting('jobtracker.maintenance',true) is distinct from 'yes' then
  raise exception 'Owner identity mismatch' using errcode='42501';
 end if;
 if tg_op='UPDATE' and new.user_id is distinct from old.user_id then raise exception 'Owner is immutable'; end if;
 if tg_op='INSERT' then new.canonical_url:=private.canonical_url(coalesce(new.canonical_url,new.url));
 elsif new.canonical_url is distinct from old.canonical_url then new.canonical_url:=private.canonical_url(new.canonical_url);
 elsif new.url is distinct from old.url then new.canonical_url:=private.canonical_url(new.url); end if;
 if current_setting('jobtracker.maintenance',true) is distinct from 'yes' then perform private.require('write'); end if;
 if tg_op='INSERT' and ai and (new.status<>'jobs_found' or new.applied_date is not null or new.interview_at is not null or new.decision_at is not null) then
  raise exception 'AI ingestion must start in Jobs Found without application history';
 end if;
 if tg_op='INSERT' and ai then new.added_date:=clock_timestamp(); end if;
 if length(new.company) not between 1 and 200 or length(new.position) not between 1 and 300 or length(coalesce(new.notes,''))>5000
  or length(coalesce(new.url,''))>2000 or (new.url is not null and new.url!~* '^https?://[^/@[:space:]]+([/:?]|$)') then raise exception 'Invalid job fields'; end if;
 if new.availability='closed' and not private.confirmed_closed(new.availability,new.verification) then new.availability:='uncertain'; end if;
 if tg_op='UPDATE' then
  new.added_date:=old.added_date; new.revision:=old.revision+1;
  -- Legacy flags cannot be changed and never confer protection.
  new.protected:=old.protected;
  if ai and (new.applied_date is distinct from old.applied_date or new.interview_at is distinct from old.interview_at or new.decision_at is distinct from old.decision_at) then
   raise exception 'Application history is owner-managed';
  end if;
  if ai and new.status is distinct from old.status then
   if old.status='jobs_deleted' then
    if new.status is distinct from old.previous_status then raise exception 'Restore must return to the previous status'; end if;
   elsif new.status<>'jobs_deleted' and not(old.status in ('jobs_found','jobs_snoozed') and new.status in ('jobs_found','jobs_snoozed')) then
    raise exception 'Application pipeline changes require the human owner';
   end if;
  end if;
  if old.status='jobs_deleted' and new.status<>'jobs_deleted' then
   perform private.require('restore');
   if clock_timestamp()>=old.purge_after then raise exception 'Recovery window expired'; end if;
   new.deleted_at:=null; new.purge_after:=null; new.previous_status:=null; new.removal_reason:=null; new.removal_context:=null; new.removed_by:=null; new.removal_client:=null; new.removal_event_id:=null;
  elsif old.status='jobs_deleted' then
   raise exception 'Restore before editing a deleted job';
  end if;
 end if;
 if new.status='jobs_deleted' and (tg_op='INSERT' or old.status<>'jobs_deleted') then
  if current_setting('jobtracker.maintenance',true) is distinct from 'yes' then perform private.require('remove'); end if;
  if tg_op='UPDATE' and ai and old.status not in ('jobs_found','jobs_snoozed')
   and not(private.confirmed_closed(old.availability,old.verification) and new.availability='closed' and new.verification is not distinct from old.verification) then
   raise exception 'Application-stage record protected; submit confirmed closure evidence before removal';
  end if;
  reason:=coalesce(nullif(btrim(current_setting('jobtracker.reason',true)),''),nullif(btrim(new.removal_reason),''));
  if ai and reason is null then raise exception 'Removal reason required'; end if;
  new.previous_status:=case when tg_op='UPDATE' then old.status else 'jobs_found' end;
  new.deleted_at:=clock_timestamp(); new.purge_after:=new.deleted_at+interval '720 hours';
  new.removed_by:=auth.uid(); new.removal_client:=private.client_id(); new.removal_event_id:=gen_random_uuid();
  new.removal_reason:=coalesce(reason,'Removed by owner');
  new.removal_context:=nullif(current_setting('jobtracker.context',true),'');
 else
  if tg_op='INSERT' then
   new.deleted_at:=null; new.purge_after:=null; new.previous_status:=null; new.removal_reason:=null; new.removal_context:=null; new.removed_by:=null; new.removal_client:=null; new.removal_event_id:=null;
  elsif old.status<>'jobs_deleted' then
   new.deleted_at:=old.deleted_at; new.purge_after:=old.purge_after; new.previous_status:=old.previous_status;
   new.removal_reason:=old.removal_reason; new.removed_by:=old.removed_by; new.removal_client:=old.removal_client; new.removal_event_id:=old.removal_event_id;
   new.removal_context:=old.removal_context;
  end if;
 end if;
 if tg_op='INSERT' then new.revision:=1; end if;
 if tg_op='INSERT' or new.status is distinct from old.status then new.last_status_change_at:=now();
 elsif tg_op='UPDATE' then new.last_status_change_at:=old.last_status_change_at; end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;

create or replace function private.audit_job() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs; action_name text; label text; actor text; cid text:=private.client_id();
begin
 j:=case when tg_op='DELETE' then old else new end;
 actor:=case when current_setting('jobtracker.maintenance',true)='yes' then 'automation' when cid is null then 'human' else 'ai_agent' end;
 select c.label into label from public.tracker_clients c where c.user_id=j.user_id and c.client_id=cid;
 label:=case when actor='automation' then 'Scheduled maintenance' when actor='human' then 'You' else coalesce(label,'Unknown registered client') end;
 action_name:=case when tg_op='DELETE' then 'purged' when tg_op='INSERT' then 'added'
 when new.status='jobs_deleted' and old.status<>'jobs_deleted' then 'removed'
 when old.status='jobs_deleted' and new.status<>'jobs_deleted' then 'restored'
 when new.status<>old.status then 'status_changed'
 when new.verification is distinct from old.verification then case when new.availability='closed' then 'verified_closed' else 'verified' end else 'edited' end;
 insert into public.activity_events(id,user_id,actor_type,client_id,actor_label,action,job_id,company,position,previous_status,new_status,reason,batch_id,request_id,source,policy_version,metadata)
 values(case when action_name='removed' then j.removal_event_id else gen_random_uuid() end,j.user_id,actor,cid,label,action_name,j.id,j.company,j.position,
 case when tg_op<>'INSERT' then old.status end,case when tg_op<>'DELETE' then new.status end,
 case when action_name='removed' then j.removal_reason else nullif(current_setting('jobtracker.reason',true),'') end,nullif(current_setting('jobtracker.batch',true),'')::uuid,
 nullif(current_setting('jobtracker.request',true),'')::uuid,case when actor='automation' then 'scheduler' when cid is null then 'web' else 'mcp' end,
 null,jsonb_build_object('availability',j.availability,'priority',j.priority));
 return j;
end $$;

create or replace function public.tracker_list(args jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; lim integer:=least(greatest(coalesce((args->>'page_size')::integer,50),1),100);
begin
 perform private.require('read');
 with matches as materialized (
 select j.*,case args->>'sort' when 'company' then lower(j.company) when 'position' then lower(j.position) else '' end sort_value from public.jobs j where j.user_id=auth.uid()
 and (not(args ? 'statuses') or j.status in (select jsonb_array_elements_text(args->'statuses')))
 and (not(args ? 'company') or j.company ilike '%'||(args->>'company')||'%')
 and (not(args ? 'title') or j.position ilike '%'||(args->>'title')||'%')
 and (not(args ? 'location') or j.location ilike '%'||(args->>'location')||'%')
 and (not(args ? 'role_type') or j.role_type=args->>'role_type')
 and (not(args ? 'priority') or j.priority=args->>'priority')
 and (not(args ? 'availability') or j.availability=args->>'availability')
 and (not(args ? 'source') or j.source=args->>'source')
 and (not(args ? 'added_after') or j.added_date>=(args->>'added_after')::timestamptz)
 and (not(args ? 'added_before') or j.added_date<(args->>'added_before')::timestamptz)
 and (not(args ? 'posted_after') or j.posted_date>=(args->>'posted_after')::date)
 and (not(args ? 'posted_before') or j.posted_date<=(args->>'posted_before')::date)
 and (not(args ? 'verified_before') or j.last_verified_at is null or j.last_verified_at<(args->>'verified_before')::timestamptz)
 and (not(args ? 'q') or not exists(select 1 from regexp_split_to_table(lower(btrim(replace(args->>'q','_',' '))),'\s+') term where strpos(private.job_search_text(to_jsonb(j)-'protected'),term)=0))
 ), page as (
 select * from matches where not(args ? 'cursor') or
  sort_value>coalesce(args->'cursor'->>'sort_value','') or (sort_value=coalesce(args->'cursor'->>'sort_value','') and (added_date,id)<((args->'cursor'->>'added_date')::timestamptz,(args->'cursor'->>'id')::uuid))
 order by sort_value,added_date desc,id desc limit lim+1
 ), visible as (select * from page order by sort_value,added_date desc,id desc limit lim)
 select jsonb_build_object('jobs',coalesce((select jsonb_agg((to_jsonb(v)-array['search_document','sort_value','protected']) order by v.sort_value,v.added_date desc,v.id desc) from visible v),'[]'::jsonb),
 'total',(select count(*) from matches),'has_more',(select count(*)>lim from page),
 'next_cursor',case when (select count(*)>lim from page) then (select jsonb_build_object('added_date',added_date,'id',id,'sort_value',sort_value) from visible order by sort_value desc,added_date,id limit 1) else null end) into result;
 return result;
end $$;

create or replace function private.company_key(owner_id uuid,company_name text) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select lower(name) from public.company_aliases where user_id=owner_id and
 lower(btrim(company_name))=any(select lower(unnest(array_append(aliases,name)))) order by name limit 1),lower(btrim(company_name)))
$$;

create or replace function private.duplicates(args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare matches jsonb;company_names text[];
begin
 select array_agg(distinct lower(v)) into company_names from public.company_aliases c,
 unnest(array_append(c.aliases,c.name)) v where c.user_id=auth.uid()
 and lower(args->>'company')=any(select lower(unnest(array_append(c.aliases,c.name))));
 company_names:=array_append(coalesce(company_names,'{}'),lower(args->>'company'));
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'company',company,'position',position,'location',location,'status',status,'requisition_id',requisition_id,'match',
 case when idempotency_key=args->>'idempotency_key' then 'idempotency_key' when coalesce(canonical_url,url)=args->>'canonical_url' then 'canonical_url' when lower(requisition_id)=lower(args->>'requisition_id') then 'requisition_id' else 'possible_title_location' end)),'[]') into matches
 from (select j.* from public.jobs j where j.user_id=auth.uid() and (
  (nullif(args->>'idempotency_key','') is not null and j.idempotency_key=args->>'idempotency_key')
  or (nullif(args->>'canonical_url','') is not null and coalesce(j.canonical_url,j.url)=args->>'canonical_url'
    and (nullif(args->>'requisition_id','') is null or j.requisition_id is null or lower(j.requisition_id)=lower(args->>'requisition_id')))
  or (lower(j.company)=any(company_names) and nullif(args->>'requisition_id','') is not null and lower(j.requisition_id)=lower(args->>'requisition_id'))
  or (lower(j.company)=any(company_names)
   and (regexp_replace(lower(j.position),'[^a-z0-9]+','','g')=regexp_replace(lower(args->>'position'),'[^a-z0-9]+','','g')
    or (select count(*)::numeric/greatest(cardinality(regexp_split_to_array(lower(j.position),'[^a-z0-9]+')),cardinality(regexp_split_to_array(lower(args->>'position'),'[^a-z0-9]+')),1)
    from (select unnest(regexp_split_to_array(lower(j.position),'[^a-z0-9]+')) intersect select unnest(regexp_split_to_array(lower(args->>'position'),'[^a-z0-9]+'))) overlap)>=0.75)
   and (j.location is null or args->>'location' is null or lower(j.location)=lower(args->>'location'))
   and (j.requisition_id is null or nullif(args->>'requisition_id','') is null or lower(j.requisition_id)=lower(args->>'requisition_id')))
 ) order by added_date desc limit 20) d;
 return jsonb_build_object('matches',matches,'suppressed',exists(select 1 from public.job_tombstones t where t.user_id=auth.uid() and t.expires_at>now() and t.fingerprint=any(private.fingerprints(args))));
end $$;

create or replace function public.tracker_api(operation text,args jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs; item jsonb; results jsonb:='[]'::jsonb; dup jsonb; out_json jsonb;
 ident uuid; budget integer; batch uuid:=gen_random_uuid();
begin
 perform private.require('read');
 if args ? 'protected' then raise exception 'Manual protection is retired'; end if;
 if octet_length(args::text)>262144 then raise exception 'Request too large'; end if;
 if operation='bulk_add_jobs' and (jsonb_typeof(args->'jobs')<>'array' or jsonb_array_length(args->'jobs') not between 1 and 100) then raise exception 'Batch must contain 1 to 100 jobs'; end if;
 if operation='bulk_remove_jobs' and (jsonb_typeof(args->'ids')<>'array' or jsonb_array_length(args->'ids') not between 1 and 100) then raise exception 'Batch must contain 1 to 100 IDs'; end if;
 insert into private.request_budgets(user_id,client_id,minute,requests) values(auth.uid(),coalesce(private.client_id(),'human'),date_trunc('minute',now()),1)
 on conflict(user_id,client_id,minute) do update set requests=private.request_budgets.requests+1 returning requests into budget;
 if budget>120 then raise exception 'Rate limit exceeded; retry next minute'; end if;

 perform set_config('jobtracker.request',gen_random_uuid()::text,true);
 if operation='list_jobs' then return public.tracker_list(args); end if;
 if operation='get_job' then
  select * into j from public.jobs where user_id=auth.uid() and id=(args->>'id')::uuid;
  if j.id is null then raise exception 'Job not found'; end if;
  return jsonb_build_object('job',(to_jsonb(j)-array['search_document','protected']));
 elsif operation='get_job_stats' then
  return (select jsonb_build_object('total',count(*),'companies',count(distinct lower(company)),
  'internship',count(*) filter(where role_type in ('internship','co_op')),'full_time',count(*) filter(where role_type in ('full_time','new_grad')),
  'high_priority',count(*) filter(where priority='strategic' and status<>'jobs_deleted'),'stale',count(*) filter(where status in ('jobs_found','jobs_snoozed') and (last_verified_at is null or last_verified_at<now()-interval '14 days')),
  'next_actions_due',count(*) filter(where next_action_at<=now() and status<>'jobs_deleted'),
  'applications_submitted',count(*) filter(where applied_date is not null),'interviews',count(*) filter(where status='interviewing'),'offers',count(*) filter(where status in ('offered','accepted')),
  'statuses',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.jobs where user_id=auth.uid()
   and (not(args ? 'after') or added_date>=(args->>'after')::timestamptz) and (not(args ? 'before') or added_date<(args->>'before')::timestamptz) group by status) s),
  'activity',(select coalesce(jsonb_object_agg(action,n),'{}') from (select action,count(*) n from public.activity_events where user_id=auth.uid()
   and (not(args ? 'after') or occurred_at>=(args->>'after')::timestamptz) and (not(args ? 'before') or occurred_at<(args->>'before')::timestamptz) group by action) a),
  'actors',(select coalesce(jsonb_agg(a),'[]') from (select client_id,actor_label,count(*) actions from public.activity_events where user_id=auth.uid() and occurred_at>=now()-interval '30 days' group by client_id,actor_label order by count(*) desc limit 20) a),
  'top_companies',(select coalesce(jsonb_agg(c),'[]') from (select company,count(*) opportunities from public.jobs where user_id=auth.uid() and status<>'jobs_deleted' group by company order by count(*) desc,company limit 10) c))
  from public.jobs where user_id=auth.uid() and (not(args ? 'after') or added_date>=(args->>'after')::timestamptz) and (not(args ? 'before') or added_date<(args->>'before')::timestamptz));
 elsif operation='find_existing_job' then return private.duplicates(args);
 elsif operation in ('add_job_found','bulk_add_jobs') then
  perform private.require('write');
  -- Serializes per-owner ingestion, including submissions without URLs.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  perform set_config('jobtracker.batch',batch::text,true);
  for item in select value from jsonb_array_elements(case when operation='add_job_found' then jsonb_build_array(args) else args->'jobs' end) loop
   begin
    if length(btrim(coalesce(item->>'company','')))=0 or length(btrim(coalesce(item->>'position','')))=0
     or coalesce(item->>'role_type','full_time') not in ('internship','co_op','full_time','new_grad','other') then raise exception 'Invalid company, position or role type'; end if;
    if operation='bulk_add_jobs' and coalesce(nullif(item->>'canonical_url',''),nullif(item->>'url',''),nullif(item->>'requisition_id',''),nullif(item->>'idempotency_key','')) is null then raise exception 'Bulk ingestion requires a stable posting identifier or idempotency key'; end if;
    dup:=private.duplicates(item);
    if dup->>'suppressed'='true' then out_json:=jsonb_build_object('outcome','skipped','reason','Recently purged posting suppression');
    elsif exists(select 1 from jsonb_array_elements(dup->'matches') m where m->>'match'<>'possible_title_location') then out_json:=jsonb_build_object('outcome','duplicate','matches',dup->'matches');
    else
     insert into public.jobs(user_id,company,position,status,url,canonical_url,requisition_id,idempotency_key,location,role_type,salary,posted_date,notes,source,source_confidence,review_flags)
     values(auth.uid(),item->>'company',item->>'position','jobs_found',item->>'url',item->>'canonical_url',item->>'requisition_id',item->>'idempotency_key',item->>'location',coalesce(item->>'role_type','full_time'),item->>'salary',(item->>'posted_date')::date,item->>'notes',item->>'source',item->>'source_confidence',case when jsonb_array_length(dup->'matches')>0 then array['possible_duplicate'] else '{}' end) returning * into j;
     out_json:=jsonb_build_object('outcome','added','job',to_jsonb(j)-array['search_document','protected']);
    end if;
   exception when others then out_json:=jsonb_build_object('outcome','rejected','reason',sqlerrm); end;
   results:=results||jsonb_build_array(out_json);
  end loop;
  insert into public.ingestion_runs(id,user_id,client_id,source,added,duplicates,rejected,skipped)
  select batch,auth.uid(),private.client_id(),coalesce(args->>'source',args->'jobs'->0->>'source'),
   count(*) filter(where value->>'outcome'='added'),count(*) filter(where value->>'outcome'='duplicate'),
   count(*) filter(where value->>'outcome'='rejected'),count(*) filter(where value->>'outcome'='skipped') from jsonb_array_elements(results);
  return jsonb_build_object('results',results,'batch_id',batch);
 elsif operation in ('remove_job','bulk_remove_jobs','restore_job','purge_job','update_job','submit_verification') then
  perform private.require('write');
  perform set_config('jobtracker.batch',batch::text,true);
  perform set_config('jobtracker.reason',left(coalesce(args->>'reason',''),1000),true);
  perform set_config('jobtracker.context',left(coalesce(args->>'context',''),1000),true);
  for ident in select value::text::uuid from jsonb_array_elements_text(case when operation='bulk_remove_jobs' then args->'ids' else jsonb_build_array(args->>'id') end) loop
   begin
    select * into j from public.jobs where user_id=auth.uid() and id=ident for update;
    if j.id is null then raise exception 'Job not found'; end if;
    if operation in ('remove_job','bulk_remove_jobs') or (operation='update_job' and args->>'status' in ('dismissed','jobs_deleted')) then
     perform private.require('remove');
     if j.status<>'jobs_deleted' then update public.jobs set status='jobs_deleted' where id=ident returning * into j; end if;
    elsif operation='restore_job' then
     perform private.require('restore');
     if j.status='jobs_deleted' then update public.jobs set status=case when j.previous_status in ('jobs_found','jobs_snoozed','to_apply','applied','interviewing','offered','rejected','accepted') then j.previous_status else 'jobs_found' end where id=ident returning * into j; end if;
    elsif operation='purge_job' then
     perform private.require('purge');
     if args->>'confirmation' is distinct from 'PURGE:'||ident::text then raise exception 'Confirmation must be PURGE:<job ID>'; end if;
     if j.status<>'jobs_deleted' then raise exception 'Only Deleted jobs can be purged'; end if;
     perform private.purge_one(j); return jsonb_build_object('purged',ident);
    elsif operation='submit_verification' then
     if args->>'availability'='closed' and (args->>'confidence'<>'high' or args->>'method' not in ('employer_explicit','ats_explicit') or length(coalesce(args->>'evidence',''))<20) then
      args:=jsonb_set(args,'{availability}','"uncertain"');
     end if;
     if (args->>'http_status')::integer in (401,403,408,429,500,502,503,504) or args->>'method' in ('timeout','blocked','login_required') then
      args:=jsonb_set(args,'{availability}','"uncertain"');
     end if;
     update public.jobs set availability=args->>'availability',last_verified_at=now(),verification=jsonb_build_object(
      'source',args->>'source','method',args->>'method','confidence',args->>'confidence','evidence',left(args->>'evidence',2000),'http_status',args->'http_status') where id=ident returning * into j;
    else
     if private.client_id() is not null and (args ? 'applied_date' or args ? 'interview_at' or args ? 'decision_at') then raise exception 'Application history is owner-managed'; end if;
     update public.jobs set
      company=coalesce(args->>'company',company),position=coalesce(args->>'position',position),status=coalesce(args->>'status',status),
      url=case when args ? 'url' then args->>'url' else url end,canonical_url=case when args ? 'canonical_url' then args->>'canonical_url' else canonical_url end,
      requisition_id=case when args ? 'requisition_id' then args->>'requisition_id' else requisition_id end,
      location=case when args ? 'location' then args->>'location' else location end,role_type=coalesce(args->>'role_type',role_type),
      salary=case when args ? 'salary' then args->>'salary' else salary end,posted_date=case when args ? 'posted_date' then (args->>'posted_date')::date else posted_date end,
      source=case when args ? 'source' then args->>'source' else source end,source_confidence=case when args ? 'source_confidence' then args->>'source_confidence' else source_confidence end,
      notes=case when args ? 'notes' then args->>'notes' else notes end,priority=coalesce(args->>'priority',priority),
      evaluation_reason=coalesce(args->>'evaluation_reason',evaluation_reason),
      review_flags=case when args ? 'review_flags' then array(select jsonb_array_elements_text(args->'review_flags')) else review_flags end,
      applied_date=case when args ? 'applied_date' then (args->>'applied_date')::timestamptz when args->>'status'='applied' then coalesce(applied_date,now()) else applied_date end,
      application_deadline=case when args ? 'application_deadline' then (args->>'application_deadline')::date else application_deadline end,
      next_action_at=case when args ? 'next_action_at' then (args->>'next_action_at')::timestamptz else next_action_at end,
      interview_at=case when args ? 'interview_at' then (args->>'interview_at')::timestamptz else interview_at end,
      decision_at=case when args ? 'decision_at' then (args->>'decision_at')::timestamptz else decision_at end
     where id=ident returning * into j;
    end if;
    out_json:=jsonb_build_object('id',ident,'outcome','ok','job',to_jsonb(j)-array['search_document','protected']);
   exception when others then
    if operation<>'bulk_remove_jobs' then raise; end if;
    out_json:=jsonb_build_object('id',ident,'outcome','rejected','reason',sqlerrm);
   end;
   results:=results||jsonb_build_array(out_json);
  end loop;
  return jsonb_build_object('results',results,'batch_id',batch);
 elsif operation='list_activity' then
  perform private.require('history');
  return (select jsonb_build_object('events',coalesce(jsonb_agg(to_jsonb(e) order by occurred_at desc,id desc),'[]')) from
   (select * from public.activity_events where user_id=auth.uid()
    and (not(args ? 'action') or action=args->>'action') and (not(args ? 'client_id') or client_id=args->>'client_id')
    and (not(args ? 'actor_type') or actor_type=args->>'actor_type')
    and (not(args ? 'q') or concat_ws(' ',company,position,reason,actor_label) ilike '%'||(args->>'q')||'%')
    and (not(args ? 'cursor') or (occurred_at,id)<((args->'cursor'->>'occurred_at')::timestamptz,(args->'cursor'->>'id')::uuid))
    order by occurred_at desc,id desc limit least(coalesce((args->>'page_size')::integer,50),100)+1) e);
 elsif operation='get_settings' then
  return jsonb_build_object('clients',(select coalesce(jsonb_agg(c),'[]') from public.tracker_clients c where user_id=auth.uid()),'deleted_retention_days',30);
 elsif operation='get_ingestion_runs' then
  return (select jsonb_build_object('runs',coalesce(jsonb_agg(r order by completed_at desc,id desc),'[]')) from
   (select * from public.ingestion_runs where user_id=auth.uid() and (not(args ? 'source') or source=args->>'source')
    and (not(args ? 'before') or completed_at<(args->>'before')::timestamptz) order by completed_at desc,id desc limit 50) r);
 elsif operation in ('grant_client','revoke_client','clear_history') then
  if private.client_id() is not null then raise exception 'Human owner required' using errcode='42501'; end if;
  if operation='grant_client' then
   insert into public.tracker_clients(user_id,client_id,label,permissions) values(auth.uid(),args->>'client_id',coalesce(args->>'label','Unknown registered client'),array(select value from jsonb_array_elements_text(args->'permissions') where value in ('read','write','remove','restore','purge','history')))
   on conflict(user_id,client_id) do update set permissions=excluded.permissions,label=excluded.label,revoked_at=null;
  elsif operation='revoke_client' then update public.tracker_clients set revoked_at=now() where user_id=auth.uid() and client_id=args->>'client_id';
  elsif operation='clear_history' then delete from public.activity_events where user_id=auth.uid() and occurred_at<(args->>'before')::timestamptz;
  end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unknown operation';
end $$;

create or replace function private.purge_one(j public.jobs) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.job_tombstones(user_id,fingerprint,expires_at)
 select j.user_id,f,now()+interval '2880 hours' from unnest(private.fingerprints(to_jsonb(j))) f
 on conflict(user_id,fingerprint) do update set expires_at=excluded.expires_at;
 perform set_config('jobtracker.purge','yes',true);
 delete from public.jobs where id=j.id and status='jobs_deleted';
 perform set_config('jobtracker.purge','',true);
end $$;

create or replace function public.tracker_maintenance() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs; n integer:=0; removed integer:=0; run_id uuid;
begin
 insert into public.maintenance_runs default values returning id into run_id;
 begin
  perform set_config('jobtracker.maintenance','yes',true);
  perform set_config('jobtracker.batch',run_id::text,true);
  perform set_config('jobtracker.reason','Scheduled 30-day Deleted retention',true);
  -- SKIP LOCKED avoids racing restoration; eligibility is rechecked while holding each row lock.
  for j in select * from public.jobs where status='jobs_deleted' and purge_after<=now() and deleted_at<=now()-interval '720 hours'
    order by id for update skip locked limit 1000 loop
   perform private.purge_one(j); n:=n+1;
  end loop;
  delete from public.job_tombstones where expires_at<=now();
  delete from public.activity_events where occurred_at<now()-interval '180 days';
  delete from public.maintenance_runs where started_at<now()-interval '90 days';
  delete from private.request_budgets where minute<now()-interval '1 day';
  delete from public.ingestion_runs where completed_at<now()-interval '180 days';
  update public.maintenance_runs set completed_at=now(),purged=n,expired_removed=removed where id=run_id;
 exception when others then
  update public.maintenance_runs set completed_at=now(),failure=sqlerrm where id=run_id;
  return jsonb_build_object('run_id',run_id,'ok',false,'failure',sqlerrm);
 end;
 return jsonb_build_object('run_id',run_id,'ok',true,'purged',n,'expired_removed',removed);
end $$;

-- Drop only the retired engine; keep historical Feed events and counters.
drop function private.cleanup_candidates(uuid);
drop function private.company_protected(uuid,text);
drop function private.seed(uuid);
drop table public.cleanup_previews;
drop table public.cleanup_policies;
notify pgrst, 'reload schema';
commit;
