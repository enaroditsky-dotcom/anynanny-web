-- =============================================================================
-- AnyNanny: profiles — onboarding columns (Supabase SQL Editor)
-- Run once on the project that still uses an older `profiles` definition.
-- Idempotent: safe to re-run.
-- =============================================================================

-- Role picker gate: false until user completes /auth/role-selection
alter table public.profiles
  add column if not exists role_selected boolean not null default false;

-- Parent flow: set when /parent/onboarding is finished
alter table public.profiles
  add column if not exists parent_onboarding_completed_at timestamptz;

comment on column public.profiles.role_selected is 'False until user picks Parent vs Sitter on /auth/role-selection.';
comment on column public.profiles.parent_onboarding_completed_at is 'Set when parent finishes /parent/onboarding.';

-- Legacy rows: already onboarded in practice
update public.profiles
set role_selected = true
where role_selected is distinct from true;

update public.profiles
set parent_onboarding_completed_at = coalesce(parent_onboarding_completed_at, now())
where role = 'parent';

update public.profiles
set parent_onboarding_completed_at = coalesce(parent_onboarding_completed_at, now())
where role = 'sitter';

-- New auth users: start with role_selected = false (must use in-app picker).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, first_name, last_name, balance, role_selected)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'parent'),
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
    0,
    false
  )
  on conflict (id) do update
    set role = excluded.role,
        first_name = coalesce(nullif(trim(excluded.first_name), ''), public.profiles.first_name),
        last_name = coalesce(nullif(trim(excluded.last_name), ''), public.profiles.last_name),
        role_selected = public.profiles.role_selected,
        updated_at = now();
  return new;
end;
$$;

-- Recreate trigger if your project uses the standard name from create_profiles_table.sql
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
s
  for each row execute function public.handle_new_user();

s
  for each row execute function public.handle_new_user();
;

s
  for each row execute function public.handle_new_user();
);
;

s
  for each row execute function public.handle_new_user();
();
);
;

s
  for each row execute function public.handle_new_user();
