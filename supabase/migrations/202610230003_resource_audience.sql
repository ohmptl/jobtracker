begin;
-- Configure resource_url once using the deployment checklist, then enable this
-- hook in Authentication > Hooks. Configuration is server-owned, never editable
-- by browser/OAuth users. Tokens for registered/granted tracker clients receive
-- the MCP resource audience; the database audience remains for PostgREST.
create table public.tracker_resource_config (
 singleton boolean primary key default true check(singleton),resource_url text not null check(resource_url like 'https://%/mcp')
);
alter table public.tracker_resource_config enable row level security;
revoke all on public.tracker_resource_config from public,anon,authenticated;
create function public.tracker_access_token_hook(event jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=event->'claims';cid text:=coalesce(event->>'client_id',event->'claims'->>'client_id');resource text;
begin
 if cid is not null and exists(select 1 from public.tracker_clients where client_id=cid and user_id=(event->>'user_id')::uuid and revoked_at is null) then
  select resource_url into resource from public.tracker_resource_config where singleton;
  if resource is null then raise exception 'MCP resource audience is not configured'; end if;
  claims:=jsonb_set(claims,'{aud}',jsonb_build_array('authenticated',resource));
 end if;
 return jsonb_build_object('claims',claims);
end $$;
revoke all on function public.tracker_access_token_hook(jsonb) from public,anon,authenticated;
grant execute on function public.tracker_access_token_hook(jsonb) to supabase_auth_admin;
commit;
