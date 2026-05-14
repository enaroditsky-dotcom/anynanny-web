-- Auth flow: role selection + parent onboarding completion. Run in Supabase SQL Editor.
-- Prefer the bundled script: migrate_profiles_onboarding_columns.sql (same changes + trigger).

alter table public.profiles add column if not exists role_selected boolean not null default false;
alter table public.profiles add column if not exists parent_onboarding_completed_at timestamptz;

comment on column public.profiles.role_selected is 'False until user picks Parent vs Sitter on /auth/role-selection.';
comment on column public.profiles.parent_onboarding_completed_at is 'Set when parent finishes /parent/onboarding.';

-- Existing accounts: treat as already past role selection and parent onboarding.
update public.profiles
set role_selected = true
where role_selected is distinct from true;

update public.profiles
set parent_onboarding_completed_at = coalesce(parent_onboarding_completed_at, now())
where role = 'parent';

-- New signups: keep sitters from being blocked by parent onboarding gate.
update public.profiles
set parent_onboarding_completed_at = coalesce(parent_onboarding_completed_at, now())
where role = 'sitter';

-- Trigger: new users must choose role in the app (role_selected = false).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, balance, role_selected)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'parent'),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    0,
    false
  )
  on conflict (id) do update
    set role = excluded.role,
        full_name = coalesce(nullif(trim(excluded.full_name), ''), public.profiles.full_name),
        role_selected = public.profiles.role_selected,
        updated_at = now();
  return new;
end;
$$;
