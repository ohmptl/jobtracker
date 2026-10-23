-- Literal, case-insensitive partial matches across user-facing job values.
-- No row updates/backfill: preserve existing jobs, timestamps, RLS and grants.
begin;
create function private.job_search_text(job jsonb) returns text
language sql immutable strict set search_path='' as $$
 select lower(replace(coalesce(string_agg(value,' '),''),'_',' '))
 from jsonb_each_text(job-array['id','user_id','search_document','revision',
   'removal_event_id','removed_by','removal_client','idempotency_key'])
$$;
revoke all on function private.job_search_text(jsonb) from public,anon,authenticated;
do $migration$
declare definition text;
 old_predicate text:='j.search_document @@ websearch_to_tsquery(''english'',args->>''q'')';
begin
 select pg_get_functiondef('public.tracker_list(jsonb)'::regprocedure) into definition;
 if strpos(definition,old_predicate)=0 then raise exception 'Unexpected search function; review before applying'; end if;
 execute replace(definition,old_predicate,
  $new$not exists(select 1 from regexp_split_to_table(lower(btrim(replace(args->>'q','_',' '))),'\s+') term
   where strpos(private.job_search_text(to_jsonb(j)),term)=0)$new$);
end
$migration$;
commit;
