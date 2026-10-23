-- Preserve the deployed dispatcher while removing the implicit text-to-jsonb
-- assignment flagged by plpgsql_check. Existing grants and behavior stay intact.
begin;
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.tracker_api(text,jsonb)'::regprocedure) into definition;
 if strpos(definition,'results jsonb:=''[]'';')=0 then
  raise exception 'Unexpected tracker_api definition; review before applying';
 end if;
 execute replace(definition,'results jsonb:=''[]'';','results jsonb:=''[]''::jsonb;');
end
$migration$;
commit;
