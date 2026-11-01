-- Emergency rollback for 20261101125000_profiles_private_select.sql.
-- This restores public SELECT on public.profiles, which re-opens phone,
-- address, identity, and child medical data to anon. Do not run it unless a
-- release must be reverted. It does not drop profiles_select_own, and it does
-- not restore a world-readable parent_profiles policy.
-- Not for Production use from the agent.

begin;

drop function if exists public.booking_partner_display(uuid[]);
drop function if exists public.booking_parent_service_addresses(uuid[]);

drop policy if exists "Allow public read" on public.profiles;
create policy "Allow public read"
  on public.profiles
  for select
  to public
  using (true);

grant select on table public.profiles to anon;

notify pgrst, 'reload schema';

commit;
