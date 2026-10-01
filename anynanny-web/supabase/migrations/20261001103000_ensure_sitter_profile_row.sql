-- Create the sitter_profiles row whenever profiles.role becomes exactly 'sitter'.
-- handle_new_user only inserts profiles. The client insert needs a session, which
-- email confirmation often has not created yet, so the sitter row was missing.
-- This trigger does not allocate a public id. The existing BEFORE INSERT trigger
-- on sitter_profiles assigns one RAN value. Existing rows are not rewritten.
-- Historical profiles.nanny_serial values are left untouched. No backfill.

create or replace function public.ensure_sitter_profile_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from 'sitter' then
    return new;
  end if;

  begin
    insert into public.sitter_profiles (id, updated_at)
    select new.id, now()
    where not exists (
      select 1
      from public.sitter_profiles existing
      where existing.id = new.id
    );
  exception
    when unique_violation then
      null;
  end;

  return new;
end;
$$;

drop trigger if exists profiles_ensure_sitter_profile on public.profiles;
create trigger profiles_ensure_sitter_profile
  after insert or update of role
  on public.profiles
  for each row
  execute function public.ensure_sitter_profile_from_profile();

comment on function public.ensure_sitter_profile_from_profile() is
  'Inserts a missing sitter_profiles row when profiles.role is sitter. Does not allocate a public id and does not update an existing row.';

revoke all on function public.ensure_sitter_profile_from_profile() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.ensure_sitter_profile_from_profile() from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.ensure_sitter_profile_from_profile() from authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';
