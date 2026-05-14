-- PostgREST schema cache refresh (same effect as Dashboard -> API -> Reload schema).
-- Run once in Supabase SQL Editor; then the app can call rpc('reload_schema') from the browser.

create or replace function public.reload_schema()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;

comment on function public.reload_schema() is 'Signals PostgREST to reload schema cache (fixes stale column errors).';

revoke all on function public.reload_schema() from public;
grant execute on function public.reload_schema() to authenticated;
grant execute on function public.reload_schema() to service_role;
