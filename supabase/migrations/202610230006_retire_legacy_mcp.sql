-- OAuth is the only MCP authentication path. Preserve jobs and historical audit
-- events; remove the URL-token RPC, grant records and temporary write identity.
begin;
drop function if exists public.tracker_legacy(uuid,text,jsonb);
do $migration$
declare definition text; first_pos integer; last_pos integer;
begin
 select pg_get_functiondef('private.guard_job()'::regprocedure) into definition;
 first_pos:=strpos(definition,' -- During the staged deployment');
 last_pos:=strpos(definition,' if tg_op=''DELETE'' then');
 if first_pos=0 or last_pos<=first_pos then
  raise exception 'Unexpected guard definition; review legacy retirement migration';
 end if;
 execute substr(definition,1,first_pos-1)||substr(definition,last_pos);
end
$migration$;
delete from public.tracker_clients where client_id='legacy-url-token';
commit;
