-- Additive upgrade. Never run scripts/000_master_setup.sql on existing data.
begin;
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
create function private.canonical_url(raw text) returns text language plpgsql immutable set search_path='' as $$
declare v text:=split_part(raw,'#',1); origin text; path text; query text; clean_query text; cut integer;
begin
 if raw is null or raw!~* '^https?://[^/@[:space:]]+([/:?]|$)' then return null; end if;
 origin:=substring(v from '(?i)^https?://[^/?#]+');
 path:=substring(v from length(origin)+1);cut:=strpos(path,'?');
 if cut>0 then query:=substring(path from cut+1);path:=substring(path from 1 for cut-1); end if;
 path:=case when coalesce(path,'')='' then '/' when path<>'/' then regexp_replace(path,'/$','') else path end;
 select string_agg(part,'&' order by part collate "C") into clean_query from unnest(string_to_array(query,'&')) part
 where part<>'' and lower(split_part(part,'=',1))!~ '^(utm_|fbclid$|gclid$|msclkid$|ref$|referrer$|source$|trackingid$)';
 return lower(origin)||path||case when clean_query is null then '' else '?'||clean_query end;
end $$;

create table if not exists public.jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 company text not null, position text not null, status text not null default 'to_apply',
 url text, location text, role_type text not null default 'full_time', salary text, posted_date date,
 added_date timestamptz not null default now(), applied_date timestamptz, notes text,
 updated_at timestamptz not null default now()
);
alter table public.jobs drop constraint if exists jobs_status_check;
update public.jobs set status='jobs_deleted' where status='dismissed';
alter table public.jobs add constraint jobs_status_check check(status in
 ('jobs_found','jobs_snoozed','jobs_deleted','to_apply','applied','interviewing','offered','rejected','accepted'));
alter table public.jobs drop constraint if exists jobs_role_type_check;
alter table public.jobs add constraint jobs_role_type_check check(role_type in ('internship','co_op','full_time','new_grad','other'));
alter table public.jobs
 add column if not exists canonical_url text,
 add column if not exists idempotency_key text,
 add column if not exists requisition_id text,
 add column if not exists source text,
 add column if not exists source_confidence text,
 add column if not exists priority text not null default 'review' check(priority in ('strategic','relevant_full_time','review','low','expired','ineligible')),
 add column if not exists evaluation_reason text,
 add column if not exists protected boolean not null default false,
 add column if not exists review_flags text[] not null default '{}',
 add column if not exists availability text not null default 'not_checked' check(availability in ('open','closed','uncertain','not_checked')),
 add column if not exists last_verified_at timestamptz,
 add column if not exists verification jsonb,
 add column if not exists deleted_at timestamptz,
 add column if not exists purge_after timestamptz,
 add column if not exists previous_status text,
 add column if not exists removal_reason text,
 add column if not exists removal_context text,
 add column if not exists removed_by uuid,
 add column if not exists removal_client text,
 add column if not exists removal_event_id uuid,
 add column if not exists application_deadline date,
 add column if not exists next_action_at timestamptz,
 add column if not exists interview_at timestamptz,
 add column if not exists decision_at timestamptz,
 add column if not exists last_status_change_at timestamptz,
 add column if not exists revision bigint not null default 1,
 add column if not exists search_document tsvector generated always as
 (to_tsvector('english',coalesce(company,'') || ' ' || coalesce(position,'') || ' ' || coalesce(location,''))) stored;
-- Existing removed rows receive a full recovery window; their true removal date is unknown.
update public.jobs set deleted_at=now(), purge_after=now()+interval '720 hours', previous_status='jobs_found',
 removal_reason='Legacy removal; original removal date unknown' where status='jobs_deleted' and deleted_at is null;
update public.jobs set canonical_url=private.canonical_url(url) where canonical_url is null and url is not null;
create index if not exists jobs_v2_page on public.jobs(user_id,added_date desc,id desc);
create index if not exists jobs_v2_status on public.jobs(user_id,status,added_date desc,id desc);
create index if not exists jobs_v2_search on public.jobs using gin(search_document);
create index if not exists jobs_v2_purge on public.jobs(purge_after) where status='jobs_deleted';
create index if not exists jobs_v2_canonical on public.jobs(user_id,canonical_url);
create index if not exists jobs_v2_req on public.jobs(user_id,lower(company),requisition_id);
create index jobs_v2_company_sort on public.jobs(user_id,lower(company),added_date desc,id desc);
create index jobs_v2_position_sort on public.jobs(user_id,lower(position),added_date desc,id desc);
create unique index jobs_v2_ingestion_key on public.jobs(user_id,idempotency_key) where idempotency_key is not null;
-- A shared landing URL can represent distinct requisitions. Ingestion uses a
-- per-owner advisory lock and explicit identity matching instead of URL alone.
drop index if exists public.jobs_user_url_unique_idx;
create index if not exists jobs_user_url_idx on public.jobs(user_id,url);

create table public.tracker_clients (
 user_id uuid not null references auth.users on delete cascade, client_id text not null,
 label text not null default 'Unknown registered client', permissions text[] not null default '{read}',
 revoked_at timestamptz, created_at timestamptz not null default now(), primary key(user_id,client_id),
 check(permissions <@ array['read','write','remove','restore','purge','history','protect','policy'])
);
create table public.cleanup_policies (
 user_id uuid primary key references auth.users on delete cascade, version bigint not null default 1,
 ai_deletion boolean not null default true, automatic_expiration boolean not null default true,
 tombstone_days integer not null default 120 check(tombstone_days between 30 and 180),
 technical_domains text[] not null default array['ASIC','silicon validation','FPGA','embedded','firmware','robotics','avionics','power electronics'],
 internship_standard text not null default 'Require explicit low-priority evaluation and career-value explanation; preserve strategic hardware roles.',
 updated_at timestamptz not null default now()
);
create table public.protected_companies (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null, aliases text[] not null default '{}', protected boolean not null default true,
 unique(user_id,name)
);
create table public.job_tombstones (
 user_id uuid not null references auth.users on delete cascade, fingerprint text not null,
 expires_at timestamptz not null, primary key(user_id,fingerprint)
);
create index on public.job_tombstones(expires_at);
create table public.activity_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 occurred_at timestamptz not null default now(), actor_type text not null, client_id text, actor_label text not null,
 action text not null, job_id uuid, company text, position text, previous_status text, new_status text,
 reason text, batch_id uuid, request_id uuid, source text not null, policy_version bigint, metadata jsonb not null default '{}'
);
create index on public.activity_events(user_id,occurred_at desc,id desc);
create index on public.activity_events(user_id,batch_id);
create table public.cleanup_previews (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 client_id text, policy_version bigint not null, candidates jsonb not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '15 minutes',
 executed_at timestamptz, result jsonb
);
create table public.ingestion_runs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 client_id text,source text,completed_at timestamptz not null default now(),
 added integer not null,duplicates integer not null,rejected integer not null,skipped integer not null
);
create index on public.ingestion_runs(user_id,completed_at desc,id desc);
create table public.maintenance_runs (
 id uuid primary key default gen_random_uuid(), started_at timestamptz not null default now(),
 completed_at timestamptz, purged integer not null default 0, expired_removed integer not null default 0,
 failure text
);
alter table public.maintenance_runs enable row level security;
revoke all on public.maintenance_runs from anon,authenticated;
create table private.request_budgets (
 user_id uuid not null, client_id text not null, minute timestamptz not null, requests integer not null,
 primary key(user_id,client_id,minute)
);
revoke all on private.request_budgets from public,anon,authenticated;

create function private.client_id() returns text language sql stable set search_path='' as $$
 select nullif(auth.jwt()->>'client_id','')
$$;
create function private.allowed(permission text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (private.client_id() is null or exists (
  select 1 from public.tracker_clients c where c.user_id=auth.uid() and c.client_id=private.client_id()
   and c.revoked_at is null and permission=any(c.permissions)))
$$;
create function private.require(permission text) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not private.allowed(permission) then raise exception 'Permission denied: %',permission using errcode='42501'; end if;
end $$;
create function private.seed(owner_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.cleanup_policies where user_id=owner_id) then return; end if;
 insert into public.cleanup_policies(user_id) values(owner_id) on conflict do nothing;
 insert into public.protected_companies(user_id,name,aliases)
 select owner_id,n,a from (values
 ('Apple',array['Apple Inc.']),('NVIDIA',array['Nvidia Corporation']),('SpaceX',array['Space Exploration Technologies']),
 ('Microsoft',array['Microsoft Corporation']),('Google',array['Alphabet']),('Meta',array['Facebook']),
 ('Amazon',array['AWS','Amazon Web Services','Amazon Kuiper']),('Qualcomm',array['Qualcomm Technologies']),
 ('AMD',array['Advanced Micro Devices','Xilinx']),('Intel',array['Intel Corporation']),
 ('RTX',array['Raytheon','Raytheon Technologies','Collins Aerospace','Pratt & Whitney'])) t(n,a)
 on conflict do nothing;
end $$;
select private.seed(id) from auth.users;
create function private.company_protected(owner_id uuid, company_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.protected_companies c where c.user_id=owner_id and c.protected
 and (lower(btrim(c.name))=lower(btrim(company_name)) or lower(btrim(company_name))=any(select lower(unnest(c.aliases)))))
$$;

-- Every direct browser mutation and every RPC mutation gets the same guards/audit.
create function private.guard_job() returns trigger language plpgsql security definer set search_path='' as $$
declare ai boolean := private.client_id() is not null; p public.cleanup_policies; owner_override boolean := false;
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
 if tg_op='INSERT' and ai and (new.status<>'jobs_found' or new.applied_date is not null or new.interview_at is not null or new.decision_at is not null or new.protected) then
  raise exception 'AI ingestion must start in Jobs Found without protected flags or application history';
 end if;
 if tg_op='INSERT' and ai then new.added_date:=clock_timestamp(); end if;
 if length(new.company) not between 1 and 200 or length(new.position) not between 1 and 300 or length(coalesce(new.notes,''))>5000
  or length(coalesce(new.url,''))>2000 or (new.url is not null and new.url!~* '^https?://[^/@[:space:]]+([/:?]|$)') then raise exception 'Invalid job fields'; end if;
 if new.availability='closed' and (coalesce(new.verification->>'confidence','')<>'high'
  or coalesce(new.verification->>'method','') not in ('employer_explicit','ats_explicit')
  or length(coalesce(new.verification->>'evidence',''))<20
  or coalesce(new.verification->>'http_status','') in ('401','403','408','429','500','502','503','504')) then new.availability:='uncertain'; end if;
 if tg_op='UPDATE' then
  new.added_date:=old.added_date; new.revision:=old.revision+1;
  if ai and (new.protected is distinct from old.protected) then perform private.require('protect'); end if;
  if ai and new.company is distinct from old.company and private.company_protected(old.user_id,old.company) then perform private.require('protect'); end if;
  if ai and (old.status not in ('jobs_found','jobs_snoozed','jobs_deleted') or new.applied_date is distinct from old.applied_date or new.status not in ('jobs_found','jobs_snoozed','jobs_deleted')
   or new.interview_at is distinct from old.interview_at or new.decision_at is distinct from old.decision_at) then
   raise exception 'Application history and pipeline changes require the human owner';
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
  select * into p from public.cleanup_policies where user_id=new.user_id;
  owner_override:=not ai and current_setting('jobtracker.override',true)='yes';
  if tg_op='UPDATE' and old.status not in ('jobs_found','jobs_snoozed') and not coalesce(owner_override,false) then raise exception 'Application-stage record protected'; end if;
  if ai and not coalesce(p.ai_deletion,true) then raise exception 'AI deletion disabled'; end if;
  if (new.protected or private.company_protected(new.user_id,new.company)) and not coalesce(owner_override,false)
   and not(new.availability='closed' and new.verification->>'confidence'='high' and coalesce(p.automatic_expiration,true)) then
   raise exception 'Protected open opportunity';
  end if;
  new.previous_status:=case when tg_op='UPDATE' then old.status else 'jobs_found' end;
  new.deleted_at:=clock_timestamp(); new.purge_after:=new.deleted_at+interval '720 hours';
  new.removed_by:=auth.uid(); new.removal_client:=private.client_id(); new.removal_event_id:=gen_random_uuid();
  new.removal_reason:=coalesce(nullif(current_setting('jobtracker.reason',true),''),'Removed by owner');
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
create function private.audit_job() returns trigger language plpgsql security definer set search_path='' as $$
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
 nullif(current_setting('jobtracker.reason',true),''),nullif(current_setting('jobtracker.batch',true),'')::uuid,
 nullif(current_setting('jobtracker.request',true),'')::uuid,case when actor='automation' then 'scheduler' when cid is null then 'web' else 'mcp' end,
 (select version from public.cleanup_policies where user_id=j.user_id),jsonb_build_object('availability',j.availability,'priority',j.priority));
 return j;
end $$;
drop trigger if exists set_job_updated_at on public.jobs;
create trigger jobs_guard before insert or update or delete on public.jobs for each row execute function private.guard_job();
create trigger jobs_audit after insert or update or delete on public.jobs for each row execute function private.audit_job();

-- Replace old permissive policies, including DELETE. Functions remain the only purge path.
do $$ declare pol record; begin
 for pol in select policyname from pg_policies where schemaname='public' and tablename='jobs' loop
  execute format('drop policy %I on public.jobs',pol.policyname);
 end loop;
end $$;
alter table public.jobs enable row level security;
create policy jobs_read on public.jobs for select to authenticated using(user_id=(select auth.uid()) and private.allowed('read'));
create policy jobs_add on public.jobs for insert to authenticated with check(user_id=(select auth.uid()) and private.allowed('write'));
create policy jobs_edit on public.jobs for update to authenticated using(user_id=(select auth.uid()) and private.allowed('write')) with check(user_id=(select auth.uid()) and private.allowed('write'));
revoke all on public.jobs from anon,authenticated;
grant select,insert,update on public.jobs to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.allowed(text),private.client_id() to authenticated;

do $$ declare t text; begin
 foreach t in array array['tracker_clients','cleanup_policies','protected_companies','job_tombstones','activity_events','cleanup_previews','ingestion_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_read on public.%I for select to authenticated using (user_id=(select auth.uid()) and private.allowed(%L))',t,case when t='activity_events' then 'history' else 'read' end);
 end loop;
end $$;

-- Keyset pagination and count share exactly the same predicate; no row cap dependency.
create function public.tracker_list(args jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
 and (not(args ? 'protected') or (j.protected or private.company_protected(j.user_id,j.company))=(args->>'protected')::boolean)
 and (not(args ? 'availability') or j.availability=args->>'availability')
 and (not(args ? 'source') or j.source=args->>'source')
 and (not(args ? 'added_after') or j.added_date>=(args->>'added_after')::timestamptz)
 and (not(args ? 'added_before') or j.added_date<(args->>'added_before')::timestamptz)
 and (not(args ? 'posted_after') or j.posted_date>=(args->>'posted_after')::date)
 and (not(args ? 'posted_before') or j.posted_date<=(args->>'posted_before')::date)
 and (not(args ? 'verified_before') or j.last_verified_at is null or j.last_verified_at<(args->>'verified_before')::timestamptz)
 and (not(args ? 'q') or j.search_document @@ websearch_to_tsquery('english',args->>'q'))
 ), page as (
 select * from matches where not(args ? 'cursor') or
  sort_value>coalesce(args->'cursor'->>'sort_value','') or (sort_value=coalesce(args->'cursor'->>'sort_value','') and (added_date,id)<((args->'cursor'->>'added_date')::timestamptz,(args->'cursor'->>'id')::uuid))
 order by sort_value,added_date desc,id desc limit lim+1
 ), visible as (select * from page order by sort_value,added_date desc,id desc limit lim)
 select jsonb_build_object('jobs',coalesce((select jsonb_agg((to_jsonb(v)-'search_document'-'sort_value') || jsonb_build_object('company_protected',private.company_protected(v.user_id,v.company)) order by v.sort_value,v.added_date desc,v.id desc) from visible v),'[]'::jsonb),
 'total',(select count(*) from matches),'has_more',(select count(*)>lim from page),
 'next_cursor',case when (select count(*)>lim from page) then (select jsonb_build_object('added_date',added_date,'id',id,'sort_value',sort_value) from visible order by sort_value desc,added_date,id limit 1) else null end) into result;
 return result;
end $$;

create function private.company_key(owner_id uuid,company_name text) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select lower(name) from public.protected_companies where user_id=owner_id and
 lower(btrim(company_name))=any(select lower(unnest(array_append(aliases,name)))) order by name limit 1),lower(btrim(company_name)))
$$;
create function private.fingerprints(j jsonb) returns text[] language sql stable set search_path='' as $$
 select array_remove(array[
 case when nullif(j->>'canonical_url','') is not null then md5('url:'||(j->>'canonical_url')) end,
 case when nullif(j->>'requisition_id','') is not null then md5('req:'||private.company_key(coalesce((j->>'user_id')::uuid,auth.uid()),j->>'company')||':'||lower(btrim(j->>'requisition_id'))) end],null)
$$;
create function private.duplicates(args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare matches jsonb;company_names text[];
begin
 select array_agg(distinct lower(v)) into company_names from public.protected_companies c,
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

create function private.cleanup_candidates(owner_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'company',company,'position',position,'location',location,
 'protected',protected or private.company_protected(user_id,company),'reason',case when availability='closed' then 'Authoritatively verified closed' else evaluation_reason end,
 'confidence',case when availability='closed' then verification->>'confidence' else 'reviewed' end,
 'evidence',case when availability='closed' then verification->>'evidence' else evaluation_reason end)),'[]')
 from (select j.* from public.jobs j join public.cleanup_policies p using(user_id)
 where j.user_id=owner_id and p.ai_deletion and j.status in ('jobs_found','jobs_snoozed') and
 ((j.availability='closed' and j.verification->>'confidence'='high' and p.automatic_expiration)
 or (not j.protected and not private.company_protected(j.user_id,j.company) and j.priority='low'
 and j.role_type in ('internship','co_op') and length(coalesce(j.evaluation_reason,''))>=20
 and not exists(select 1 from unnest(p.technical_domains) domain where length(btrim(domain))>0
 and (' '||regexp_replace(lower(j.position),'[^a-z0-9]+',' ','g')||' ') like
 '% '||regexp_replace(lower(domain),'[^a-z0-9]+',' ','g')||' %')))
 order by added_date,id limit 100) candidates
$$;

-- One transactional dispatcher shared by MCP and same-origin browser requests.
create function public.tracker_api(operation text,args jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs; p public.cleanup_policies; item jsonb; results jsonb:='[]'; dup jsonb; out_json jsonb;
 preview public.cleanup_previews; candidate jsonb; ident uuid; budget integer; batch uuid:=gen_random_uuid();
begin
 perform private.require('read');
 if octet_length(args::text)>262144 then raise exception 'Request too large'; end if;
 if operation='bulk_add_jobs' and (jsonb_typeof(args->'jobs')<>'array' or jsonb_array_length(args->'jobs') not between 1 and 100) then raise exception 'Batch must contain 1 to 100 jobs'; end if;
 if operation='bulk_remove_jobs' and (jsonb_typeof(args->'ids')<>'array' or jsonb_array_length(args->'ids') not between 1 and 100) then raise exception 'Batch must contain 1 to 100 IDs'; end if;
 insert into private.request_budgets(user_id,client_id,minute,requests) values(auth.uid(),coalesce(private.client_id(),'human'),date_trunc('minute',now()),1)
 on conflict(user_id,client_id,minute) do update set requests=private.request_budgets.requests+1 returning requests into budget;
 if budget>120 then raise exception 'Rate limit exceeded; retry next minute'; end if;
 perform private.seed(auth.uid());
 perform set_config('jobtracker.request',gen_random_uuid()::text,true);
 if operation='list_jobs' then return public.tracker_list(args); end if;
 if operation='get_job' then
  select * into j from public.jobs where user_id=auth.uid() and id=(args->>'id')::uuid;
  if j.id is null then raise exception 'Job not found'; end if;
  return jsonb_build_object('job',(to_jsonb(j)-'search_document')||jsonb_build_object('company_protected',private.company_protected(j.user_id,j.company)));
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
     out_json:=jsonb_build_object('outcome','added','job',to_jsonb(j)-'search_document');
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
  perform set_config('jobtracker.reason',left(coalesce(args->>'reason','Owner or authorized client action'),1000),true);
  perform set_config('jobtracker.context',left(coalesce(args->>'context',''),1000),true);
  if private.client_id() is null and args->>'override_protection'='true' then perform set_config('jobtracker.override','yes',true); end if;
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
      protected=coalesce((args->>'protected')::boolean,protected),evaluation_reason=coalesce(args->>'evaluation_reason',evaluation_reason),
      review_flags=case when args ? 'review_flags' then array(select jsonb_array_elements_text(args->'review_flags')) else review_flags end,
      applied_date=case when args ? 'applied_date' then (args->>'applied_date')::timestamptz when args->>'status'='applied' then coalesce(applied_date,now()) else applied_date end,
      application_deadline=case when args ? 'application_deadline' then (args->>'application_deadline')::date else application_deadline end,
      next_action_at=case when args ? 'next_action_at' then (args->>'next_action_at')::timestamptz else next_action_at end,
      interview_at=case when args ? 'interview_at' then (args->>'interview_at')::timestamptz else interview_at end,
      decision_at=case when args ? 'decision_at' then (args->>'decision_at')::timestamptz else decision_at end
     where id=ident returning * into j;
    end if;
    out_json:=jsonb_build_object('id',ident,'outcome','ok','job',to_jsonb(j)-'search_document');
   exception when others then
    if operation<>'bulk_remove_jobs' then raise; end if;
    out_json:=jsonb_build_object('id',ident,'outcome','rejected','reason',sqlerrm);
   end;
   results:=results||jsonb_build_array(out_json);
  end loop;
  return jsonb_build_object('results',results,'batch_id',batch);
 elsif operation='preview_cleanup' then
  perform private.require('remove');
  select * into p from public.cleanup_policies where user_id=auth.uid();
  out_json:=private.cleanup_candidates(auth.uid());
  insert into public.cleanup_previews(user_id,client_id,policy_version,candidates) values(auth.uid(),private.client_id(),p.version,out_json) returning * into preview;
  return jsonb_build_object('preview_id',preview.id,'expires_at',preview.expires_at,'policy_version',p.version,'candidates',out_json,'expected_count',jsonb_array_length(out_json));
 elsif operation='execute_cleanup' then
  perform private.require('remove');
  select * into preview from public.cleanup_previews where id=(args->>'preview_id')::uuid and user_id=auth.uid() for update;
  if preview.id is null or preview.client_id is distinct from private.client_id() then raise exception 'Preview not found for this actor'; end if;
  if preview.executed_at is not null then return preview.result; end if;
  select * into p from public.cleanup_policies where user_id=auth.uid() for update;
  if preview.expires_at<=clock_timestamp() or preview.policy_version<>p.version or not p.ai_deletion then raise exception 'Preview expired or policy changed'; end if;
  -- Lock all rows before checking revisions; any failure rolls back the whole cleanup.
  perform 1 from public.jobs where user_id=auth.uid() and id in (select (value->>'id')::uuid from jsonb_array_elements(preview.candidates)) order by id for update;
  for candidate in select value from jsonb_array_elements(preview.candidates) loop
   select * into j from public.jobs where user_id=auth.uid() and id=(candidate->>'id')::uuid;
   if j.id is null or j.revision<>(candidate->>'revision')::bigint then raise exception 'Preview data changed; preview again'; end if;
  end loop;
  perform set_config('jobtracker.batch',batch::text,true);
  for candidate in select value from jsonb_array_elements(preview.candidates) loop
   perform set_config('jobtracker.reason',candidate->>'reason',true);
   update public.jobs set status='jobs_deleted' where id=(candidate->>'id')::uuid and user_id=auth.uid();
  end loop;
  out_json:=jsonb_build_object('batch_id',batch,'removed',jsonb_array_length(preview.candidates));
  update public.cleanup_previews set executed_at=now(),result=out_json where id=preview.id;
  return out_json;
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
  return jsonb_build_object('policy',(select to_jsonb(c) from public.cleanup_policies c where user_id=auth.uid()),
   'companies',(select coalesce(jsonb_agg(c),'[]') from public.protected_companies c where user_id=auth.uid()),
   'clients',(select coalesce(jsonb_agg(c),'[]') from public.tracker_clients c where user_id=auth.uid()),'deleted_retention_days',30);
 elsif operation='get_ingestion_runs' then
  return (select jsonb_build_object('runs',coalesce(jsonb_agg(r order by completed_at desc,id desc),'[]')) from
   (select * from public.ingestion_runs where user_id=auth.uid() and (not(args ? 'source') or source=args->>'source')
    and (not(args ? 'before') or completed_at<(args->>'before')::timestamptz) order by completed_at desc,id desc limit 50) r);
 elsif operation in ('save_policy','save_company','delete_company','grant_client','revoke_client','clear_history') then
  if private.client_id() is not null then raise exception 'Human owner required' using errcode='42501'; end if;
  if operation='save_policy' then
   update public.cleanup_policies set version=version+1,ai_deletion=coalesce((args->>'ai_deletion')::boolean,ai_deletion),
    automatic_expiration=coalesce((args->>'automatic_expiration')::boolean,automatic_expiration),
    tombstone_days=coalesce((args->>'tombstone_days')::integer,tombstone_days),
    technical_domains=case when args ? 'technical_domains' then array(select jsonb_array_elements_text(args->'technical_domains')) else technical_domains end,
    internship_standard=coalesce(args->>'internship_standard',internship_standard),updated_at=now() where user_id=auth.uid();
  elsif operation='save_company' then
   insert into public.protected_companies(user_id,name,aliases,protected) values(auth.uid(),args->>'name',array(select jsonb_array_elements_text(coalesce(args->'aliases','[]'))),coalesce((args->>'protected')::boolean,true))
   on conflict(user_id,name) do update set aliases=excluded.aliases,protected=excluded.protected;
   update public.cleanup_policies set version=version+1 where user_id=auth.uid();
  elsif operation='delete_company' then
   delete from public.protected_companies where id=(args->>'id')::uuid and user_id=auth.uid();
   update public.cleanup_policies set version=version+1 where user_id=auth.uid();
  elsif operation='grant_client' then
   insert into public.tracker_clients(user_id,client_id,label,permissions) values(auth.uid(),args->>'client_id',coalesce(args->>'label','Unknown registered client'),array(select jsonb_array_elements_text(args->'permissions')))
   on conflict(user_id,client_id) do update set permissions=excluded.permissions,label=excluded.label,revoked_at=null;
  elsif operation='revoke_client' then update public.tracker_clients set revoked_at=now() where user_id=auth.uid() and client_id=args->>'client_id';
  elsif operation='clear_history' then delete from public.activity_events where user_id=auth.uid() and occurred_at<(args->>'before')::timestamptz;
  end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unknown operation';
end $$;

create function private.purge_one(j public.jobs) returns void language plpgsql security definer set search_path='' as $$
declare days integer;
begin
 select tombstone_days into days from public.cleanup_policies where user_id=j.user_id;
 insert into public.job_tombstones(user_id,fingerprint,expires_at)
 select j.user_id,f,now()+make_interval(hours=>coalesce(days,120)*24) from unnest(private.fingerprints(to_jsonb(j))) f
 on conflict(user_id,fingerprint) do update set expires_at=excluded.expires_at;
 perform set_config('jobtracker.purge','yes',true);
 delete from public.jobs where id=j.id and status='jobs_deleted';
 perform set_config('jobtracker.purge','',true);
end $$;

create function public.tracker_maintenance() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs; n integer:=0; removed integer:=0; run_id uuid;
begin
 insert into public.maintenance_runs default values returning id into run_id;
 begin
  perform set_config('jobtracker.maintenance','yes',true);
  perform set_config('jobtracker.batch',run_id::text,true);
  perform set_config('jobtracker.reason','Scheduled retention / verified closure policy',true);
  -- SKIP LOCKED avoids racing restoration; eligibility is rechecked while holding each row lock.
  for j in select * from public.jobs where status='jobs_deleted' and purge_after<=now() and deleted_at<=now()-interval '720 hours'
    order by id for update skip locked limit 1000 loop
   perform private.purge_one(j); n:=n+1;
  end loop;
  for j in select jobs.* from public.jobs jobs join public.cleanup_policies p using(user_id)
    where status in ('jobs_found','jobs_snoozed') and p.automatic_expiration and p.ai_deletion
    and availability='closed' and verification->>'confidence'='high' order by id for update of jobs skip locked limit 100 loop
   update public.jobs set status='jobs_deleted' where id=j.id; removed:=removed+1;
  end loop;
  delete from public.job_tombstones where expires_at<=now();
  delete from public.cleanup_previews where expires_at<now()-interval '1 day';
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

-- Temporary trusted bridge. Never exposed to authenticated or anonymous clients.
create function public.tracker_legacy(owner_id uuid,operation text,args jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','client_id','legacy-url-token')::text,true);
 insert into public.tracker_clients(user_id,client_id,label,permissions) values(owner_id,'legacy-url-token','Legacy connection (unknown agent)',array['read','write','remove','restore','history']) on conflict do nothing;
 return public.tracker_api(operation,args);
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.allowed(text),private.client_id() to authenticated;
revoke all on function public.tracker_list(jsonb),public.tracker_api(text,jsonb),public.tracker_maintenance(),public.tracker_legacy(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tracker_list(jsonb),public.tracker_api(text,jsonb) to authenticated;
grant execute on function public.tracker_maintenance(),public.tracker_legacy(uuid,text,jsonb) to service_role;
commit;

